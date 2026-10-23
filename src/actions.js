// -----------------------------------------------------------------------------
// The fields of the scene actions that write to the inverter, made into the
// bodies of updateChargeConfigInfo / updateDisChargeConfigInfo.
//
// Both endpoints replace the WHOLE setting (seven fields): the current one is
// read first, and every field the scene leaves empty keeps its value. Rules of
// the API (portal, checked live by the reference library alphaess-openAPI):
//   - times "HH:mm" from 00:00 to 23:45, on the 15-minute grid (a time off the
//     grid is accepted by the API and ignored by the inverter: refused here);
//   - a period whose start equals its end is off ("00:00-00:00");
//   - gridCharge / ctrDis are 0 or 1; batHighCap / batUseCap in %, bounded
//     here to 10..100 like the Home Assistant integration does;
//   - Alpha ESS documents these two writes as allowed about once a day per
//     system: a write that changes nothing is never sent.
// -----------------------------------------------------------------------------

import { readSlot } from './parse.js';

const SOC_MIN = 10;
const SOC_MAX = 100;
const SWITCH_VALUES = ['keep', 'on', 'off'];
const EV_COMMANDS = { start: 1, stop: 0 };
const OFF_PERIOD = ['00:00', '00:00'];

/**
 * @description A refusal of a scene action, written for the user by app.js.
 */
class ActionError extends Error {
  /**
   * @param {string} key - The i18n key of the message.
   * @param {object} [values] - Its values.
   */
  constructor(key, values = {}) {
    super(key);
    this.name = 'ActionError';
    this.key = key;
    this.values = values;
  }
}

/**
 * @description Read a SOC field: empty keeps the current value.
 * @param {unknown} raw - 90, "90", "90 %", "".
 * @param {string} field - The field key (for the message).
 * @returns {number|null} The SOC, null to keep.
 */
function readSoc(raw, field) {
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return null;
  }
  const value = Number(String(raw).replace('%', '').replace(',', '.').trim());
  if (!Number.isFinite(value) || value < SOC_MIN || value > SOC_MAX) {
    throw new ActionError('errSoc', { field, value: String(raw).slice(0, 20) });
  }
  return Math.round(value);
}

/**
 * @description Read a period field: empty keeps it, "off" turns it off.
 * @param {unknown} raw - "01:00-05:00", "1:00 - 5:00", "off", "".
 * @param {string} field - The field key (for the message).
 * @returns {string[]|null} `[from, to]`, null to keep.
 */
function readPeriod(raw, field) {
  const text = String(raw ?? '').trim();
  if (!text) {
    return null;
  }
  if (/^(off|none|no|0|-|aus|non|nein|desactivado|désactivé|apagado)$/i.test(text)) {
    return [...OFF_PERIOD];
  }
  const match = /^(\d{1,2}:\d{2})\s*(?:-|–|—|to|à|a|bis|\s)\s*(\d{1,2}:\d{2})$/i.exec(text);
  const times = match ? [readSlot(match[1]), readSlot(match[2])] : [null, null];
  const onGrid = (time) => time && Number(time.slice(3)) % 15 === 0;
  if (!onGrid(times[0]) || !onGrid(times[1])) {
    throw new ActionError('errPeriod', { field, value: text.slice(0, 30) });
  }
  return times;
}

/**
 * @description Read an on / off / keep select.
 * @param {unknown} raw - The value.
 * @returns {string} `keep`, `on` or `off`.
 */
const readSwitch = (raw) => (SWITCH_VALUES.includes(raw) ? raw : 'keep');

/**
 * @description "01:00-05:00", or "off" for a period that does nothing.
 * @param {string[]} period - `[from, to]`.
 * @returns {string} The text.
 */
function formatPeriod(period) {
  const [from, to] = period ?? [];
  if (!from || !to || from === to) {
    return 'off';
  }
  return `${from}-${to}`;
}

/**
 * @description Merge the fields of a scene into a current setting.
 * @param {object} current - `{ enabled, soc, periods }`.
 * @param {object} fields - `{ enabled, period_1, period_2, soc }` (raw).
 * @param {string} socField - The key of the SOC field.
 * @returns {{ next: object, changed: boolean }} The new setting.
 */
function merge(current, fields, socField) {
  const toggle = readSwitch(fields.enabled);
  const periods = [
    readPeriod(fields.period_1, 'period_1'),
    readPeriod(fields.period_2, 'period_2'),
  ];
  const soc = readSoc(fields[socField], socField);
  const currentPeriods = [0, 1].map((i) =>
    current.periods?.[i]?.[0] && current.periods?.[i]?.[1] ? current.periods[i] : OFF_PERIOD,
  );
  const next = {
    enabled: toggle === 'keep' ? Boolean(current.enabled) : toggle === 'on',
    periods: [0, 1].map((i) => periods[i] ?? currentPeriods[i]),
    soc: soc ?? current.soc,
  };
  if (!Number.isFinite(next.soc)) {
    throw new ActionError('errSocUnknown', { field: socField });
  }
  const changed =
    next.enabled !== Boolean(current.enabled) ||
    next.soc !== current.soc ||
    [0, 1].some((i) => formatPeriod(next.periods[i]) !== formatPeriod(currentPeriods[i]));
  return { next, changed };
}

/**
 * @description The charge from the grid request of a scene.
 * @param {string} sysSn - The system.
 * @param {object} current - parseChargeConfig() of the system.
 * @param {object} fields - The fields of set_grid_charge.
 * @returns {{ body: object, next: object, changed: boolean }} The request.
 */
function gridChargeRequest(sysSn, current, fields) {
  const { next, changed } = merge(
    { enabled: current.enabled, soc: current.maxSoc, periods: current.periods },
    fields,
    'max_soc',
  );
  return {
    changed,
    next: { enabled: next.enabled, maxSoc: next.soc, periods: next.periods },
    body: {
      sysSn,
      batHighCap: next.soc,
      gridCharge: next.enabled ? 1 : 0,
      timeChaf1: next.periods[0][0],
      timeChae1: next.periods[0][1],
      timeChaf2: next.periods[1][0],
      timeChae2: next.periods[1][1],
    },
  };
}

/**
 * @description The discharge time control request of a scene.
 * @param {string} sysSn - The system.
 * @param {object} current - parseDischargeConfig() of the system.
 * @param {object} fields - The fields of set_discharge.
 * @returns {{ body: object, next: object, changed: boolean }} The request.
 */
function dischargeRequest(sysSn, current, fields) {
  const { next, changed } = merge(
    { enabled: current.enabled, soc: current.cutoffSoc, periods: current.periods },
    fields,
    'cutoff_soc',
  );
  return {
    changed,
    next: { enabled: next.enabled, cutoffSoc: next.soc, periods: next.periods },
    body: {
      sysSn,
      batUseCap: next.soc,
      ctrDis: next.enabled ? 1 : 0,
      timeDisf1: next.periods[0][0],
      timeDise1: next.periods[0][1],
      timeDisf2: next.periods[1][0],
      timeDise2: next.periods[1][1],
    },
  };
}

/**
 * @description The controlMode of an EV charger command.
 * @param {unknown} raw - `start` or `stop`.
 * @returns {number} 1 or 0.
 */
function evCommand(raw) {
  if (!Object.hasOwn(EV_COMMANDS, raw)) {
    throw new ActionError('errCommand', { value: String(raw ?? '').slice(0, 20) });
  }
  return EV_COMMANDS[raw];
}

export {
  SOC_MIN,
  SOC_MAX,
  SWITCH_VALUES,
  EV_COMMANDS,
  ActionError,
  readSoc,
  readPeriod,
  readSwitch,
  formatPeriod,
  gridChargeRequest,
  dischargeRequest,
  evCommand,
};

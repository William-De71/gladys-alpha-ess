// -----------------------------------------------------------------------------
// Scene triggers and the keys of the scene actions.
//
// Triggers, once per transition, never at the first reading, never because of
// a scene action:
//   - `battery_full`         the SOC reaches 100 % (99.5 rounded); again once it
//                            went back under 95 %;
//   - `battery_low`          the SOC reaches the discharge cut-off SOC of the
//                            system (batUseCap, 10 % when unknown) + 1 point:
//                            the battery stops covering the house; again once
//                            it went 5 points above;
//   - `grid_export_started`  the house starts sending power to the grid
//                            (200 W at least, two readings in a row);
//   - `grid_import_started`  the house starts drawing power from the grid
//                            (same rule). Under 50 W either way is "neither";
//   - `system_offline`       Alpha ESS answers "system offline" (6042) for 10
//                            minutes;
//   - `system_online`        it answers again after that;
//   - `ev_charger_status`    the state of an EV charger changed (plugged,
//                            charging, finished, fault…);
//   - `access_refused`       Alpha ESS refuses the AppID (signature, IP
//                            allow-list, clock) or a system is not bound to it.
// A value to compare (>, <) is a feature of the device, not a trigger.
// -----------------------------------------------------------------------------

import { EV_STATES } from './parse.js';

const TRIGGERS = {
  BATTERY_FULL: 'battery_full',
  BATTERY_LOW: 'battery_low',
  EXPORT_STARTED: 'grid_export_started',
  IMPORT_STARTED: 'grid_import_started',
  SYSTEM_OFFLINE: 'system_offline',
  SYSTEM_ONLINE: 'system_online',
  EV_CHARGER_STATUS: 'ev_charger_status',
  ACCESS_REFUSED: 'access_refused',
};

const SCENE_ACTIONS = {
  SET_GRID_CHARGE: 'set_grid_charge',
  SET_DISCHARGE: 'set_discharge',
  EV_CHARGER_CONTROL: 'ev_charger_control',
  GET_TODAY: 'get_today',
};

const GRID_CHARGE_OUTPUTS = ['result', 'enabled', 'period_1', 'period_2', 'max_soc'];
const DISCHARGE_OUTPUTS = ['result', 'enabled', 'period_1', 'period_2', 'cutoff_soc'];
const EV_OUTPUTS = ['result'];
const TODAY_OUTPUTS = [
  'pv_kwh',
  'load_kwh',
  'import_kwh',
  'export_kwh',
  'charge_kwh',
  'discharge_kwh',
  'self_sufficiency',
  'battery_level',
  'summary',
];
const EV_STATUS_VALUES = Object.values(EV_STATES);
const ACCESS_REASONS = ['auth', 'clock', 'whitelist', 'not_bound'];

const FULL_SOC = 99.5;
const FULL_REARM_SOC = 95;
const DEFAULT_CUTOFF_SOC = 10;
const LOW_MARGIN = 1;
const LOW_REARM = 5;
const GRID_ENTER_W = 200;
const GRID_LEAVE_W = 50;
const GRID_CONFIRM = 2;
const OFFLINE_AFTER_MS = 10 * 60 * 1000;

/**
 * @description Keep only the declared keys of an output object.
 * @param {object} values - The values.
 * @param {string[]} keys - The declared keys.
 * @returns {object} The outputs (null / undefined left out).
 */
function pick(values, keys) {
  return Object.fromEntries(
    keys
      .filter((key) => values[key] !== null && values[key] !== undefined)
      .map((key) => [key, values[key]]),
  );
}

/**
 * @description The direction of a grid power, with hysteresis.
 * @param {number} grid - Watts, import > 0.
 * @param {string} current - The direction now.
 * @returns {string} `import`, `export` or `idle`.
 */
function classifyGrid(grid, current) {
  if (grid <= -GRID_ENTER_W) return 'export';
  if (grid >= GRID_ENTER_W) return 'import';
  if (Math.abs(grid) <= GRID_LEAVE_W) return 'idle';
  return current ?? 'idle';
}

/**
 * @description The transitions of a fresh power reading.
 * @param {object} seen - What the triggers knew (never changed).
 * @param {object} power - parsePower().
 * @param {object} [options] - `{ cutoffSoc, battery }`.
 * @returns {{ events: string[], next: object }} The trigger keys, the new knowledge.
 */
function detectPower(seen, power, { cutoffSoc = null, battery = true } = {}) {
  const next = { ...seen };
  const events = [];
  const first = !seen.initialized;
  next.initialized = true;
  if (battery && Number.isFinite(power.soc)) {
    const soc = power.soc;
    const cutoff = Number.isFinite(cutoffSoc) ? cutoffSoc : DEFAULT_CUTOFF_SOC;
    if (soc >= FULL_SOC) {
      if (!seen.full && !first) events.push(TRIGGERS.BATTERY_FULL);
      next.full = true;
    } else if (soc < FULL_REARM_SOC || first) {
      next.full = false;
    }
    if (soc <= cutoff + LOW_MARGIN) {
      if (!seen.low && !first) events.push(TRIGGERS.BATTERY_LOW);
      next.low = true;
    } else if (soc >= cutoff + LOW_REARM || first) {
      next.low = false;
    }
  }
  if (Number.isFinite(power.grid)) {
    const reading = classifyGrid(power.grid, seen.grid);
    if (first || !seen.grid) {
      next.grid = reading;
      next.gridCandidate = null;
      next.gridCount = 0;
    } else if (reading === seen.grid) {
      next.gridCandidate = null;
      next.gridCount = 0;
    } else {
      const count = seen.gridCandidate === reading ? (seen.gridCount ?? 0) + 1 : 1;
      if (count >= GRID_CONFIRM) {
        next.grid = reading;
        next.gridCandidate = null;
        next.gridCount = 0;
        if (reading === 'export') events.push(TRIGGERS.EXPORT_STARTED);
        if (reading === 'import') events.push(TRIGGERS.IMPORT_STARTED);
      } else {
        next.gridCandidate = reading;
        next.gridCount = count;
      }
    }
  }
  return { events, next };
}

/**
 * @description The offline / online transitions of a system.
 * @param {object} seen - What the triggers knew (never changed).
 * @param {object} reading - `{ offline: boolean, ok: boolean, now: number }`:
 * Alpha ESS said 6042, or the power was read.
 * @returns {{ events: string[], next: object, minutes: number|null }} The
 * triggers, the new knowledge, how long it was offline.
 */
function detectOffline(seen, { offline, ok, now }) {
  const next = { ...seen };
  const events = [];
  let minutes = null;
  if (offline) {
    next.offlineSince = seen.offlineSince ?? now;
    if (!seen.offline && now - next.offlineSince >= OFFLINE_AFTER_MS) {
      events.push(TRIGGERS.SYSTEM_OFFLINE);
      next.offline = true;
    }
    minutes = Math.round((now - next.offlineSince) / 60000);
  } else if (ok) {
    if (seen.offline) {
      events.push(TRIGGERS.SYSTEM_ONLINE);
      minutes = Number.isFinite(seen.offlineSince)
        ? Math.round((now - seen.offlineSince) / 60000)
        : null;
    }
    next.offline = false;
    next.offlineSince = null;
  }
  return { events, next, minutes };
}

/**
 * @description The data of an event about a system.
 * @param {object} view - `{ deviceId, name, sn }`.
 * @param {object} [extra] - More scalar values.
 * @returns {object} Flat data.
 */
function systemData(view, extra = {}) {
  return { system: view.deviceId, system_name: view.name, sn: view.sn, ...extra };
}

/**
 * @description Round to a number of decimals, null when unknown.
 * @param {number|null} value - The value.
 * @param {number} [decimals] - Decimals.
 * @returns {number|null} The rounded value.
 */
function rounded(value, decimals = 0) {
  if (!Number.isFinite(value)) {
    return null;
  }
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export {
  TRIGGERS,
  SCENE_ACTIONS,
  GRID_CHARGE_OUTPUTS,
  DISCHARGE_OUTPUTS,
  EV_OUTPUTS,
  TODAY_OUTPUTS,
  EV_STATUS_VALUES,
  ACCESS_REASONS,
  FULL_SOC,
  DEFAULT_CUTOFF_SOC,
  GRID_ENTER_W,
  GRID_LEAVE_W,
  OFFLINE_AFTER_MS,
  pick,
  classifyGrid,
  detectPower,
  detectOffline,
  systemData,
  rounded,
};

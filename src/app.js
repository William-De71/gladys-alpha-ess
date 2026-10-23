// -----------------------------------------------------------------------------
// The Alpha ESS integration: every handler, registered on a Gladys client.
//
// Brings the hybrid inverters and batteries of an Alpha ESS developer account
// (AppID + AppSecret of open.alphaess.com) into Gladys, through the official
// Open API:
//   - devices (device.js): one per system bound to the AppID — solar power,
//     battery level and charge / discharge power, signed grid power, house
//     load, energies of the day and energy indexes built from them — and one
//     per Alpha ESS EV charger (connector status, charging state, power);
//   - scene triggers (events.js): battery full / low, grid export / import
//     started, system offline / back, EV charger state, access refused;
//   - scene actions: charge from the grid and discharge time control settings,
//     start / stop an EV charger (all refused unless the configuration allows
//     control), the energies of today;
//   - dashboard widgets (widgets.js): energy flow now, today, battery schedule;
//   - configuration buttons: test the connection, bind a system to the AppID
//     (code e-mailed to the owner, then the code), diagnostic.
//
// The integration reads the cloud on its own timer, one request at a time,
// 10 seconds apart (alphaess-api.js): the power now at the interval of the
// configuration (60 s by default, stretched with the number of systems), the
// energies of the day every 5 minutes, the totals every 15 minutes, the
// battery settings every hour, the list of the systems and of the EV chargers
// every 6 hours, the curve of the day only while a "today" widget is shown.
// Never on a Gladys poll, never from a widget, never twice at startup (the
// times are kept in /data).
//
// index.js only creates the SDK client; the tests drive this module with the
// fake Gladys of the SDK and a fake Alpha ESS (test/helpers/fake-alphaess.js).
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';
import { logger as sdkLogger } from '@gladysassistant/integration-sdk';
import {
  normalizeConfig,
  readLanguage,
  guessLanguage,
  INTERNAL_KEYS,
  AUTO_LANGUAGE,
} from './config.js';
import { createAlphaEssClient, ACCOUNT_KINDS } from './alphaess-api.js';
import { createStore } from './store.js';
import {
  parseEssList,
  parsePower,
  parseDayEnergy,
  parseSummary,
  parseChargeConfig,
  parseDischargeConfig,
  parseDayPower,
  parseEvChargers,
  parseEvStatus,
} from './parse.js';
import { normalizeEnergy, addDayEnergy, pendingDay, dropPending, indexesOf } from './energy.js';
import {
  systemIds,
  evIds,
  snOfExternalId,
  buildSystemDevice,
  buildEvDevice,
  buildSystemStates,
  buildEvStates,
  powerValues,
  SYSTEM_TYPE,
  EV_TYPE,
} from './device.js';
import {
  TRIGGERS,
  SCENE_ACTIONS,
  GRID_CHARGE_OUTPUTS,
  DISCHARGE_OUTPUTS,
  EV_OUTPUTS,
  TODAY_OUTPUTS,
  pick,
  detectPower,
  detectOffline,
  systemData,
  rounded,
} from './events.js';
import {
  ActionError,
  gridChargeRequest,
  dischargeRequest,
  evCommand,
  formatPeriod,
} from './actions.js';
import {
  WIDGETS,
  messageContent,
  todayEnergies,
  buildLiveWidget,
  buildTodayWidget,
  buildScheduleWidget,
} from './widgets.js';
import {
  MINUTE_MS,
  HOUR_MS,
  defaultTimeZone,
  usableTimeZone,
  localParts,
  toInstant,
} from './time.js';
import { t, all, formatNumber, LANGUAGES } from './i18n.js';

const ACTIONS = {
  TEST_CONNECTION: 'test_connection',
  REQUEST_BIND_CODE: 'request_bind_code',
  BIND_SYSTEM: 'bind_system',
  DIAGNOSTIC: 'diagnostic',
};
const TICK_MS = 15 * 1000;
// No burst at startup: the first readings wait a little, even when due.
const STARTUP_DELAY_MS = 10 * 1000;
const LIST_EVERY_MS = 6 * HOUR_MS;
const LIST_RETRY_MS = 5 * MINUTE_MS;
const ENERGY_EVERY_MS = 5 * MINUTE_MS;
const SUMMARY_EVERY_MS = 15 * MINUTE_MS;
const CONFIG_EVERY_MS = HOUR_MS;
const CONFIG_REFUSED_RETRY_MS = 24 * HOUR_MS;
const CURVE_EVERY_MS = 10 * MINUTE_MS;
const EV_STATUS_EVERY_MS = 2 * MINUTE_MS;
const PENDING_EVERY_MS = 15 * MINUTE_MS;
const ACCESS_RETRY_MS = 15 * MINUTE_MS;
const NOT_BOUND_RETRY_MS = HOUR_MS;
// Each system costs this much of the reading pace: with several systems, the
// power is read less often.
const POWER_PER_SYSTEM_MS = 30 * 1000;
// The curve of the day is read while a "today" widget was shown lately.
const WIDGET_SEEN_MS = 30 * MINUTE_MS;
const DIAGNOSTIC_CHUNK = 3000;
const { version: VERSION } = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
);
const USER_AGENT = `gladys-alpha-ess/${VERSION} (+https://github.com/William-De71/gladys-alpha-ess)`;

/**
 * @description Register every handler of the integration on a Gladys client.
 * @param {object} gladys - A GladysIntegration (or the fake Gladys of the SDK).
 * @param {object} [options] - Options.
 * @param {Function} [options.fetch] - HTTP transport of Alpha ESS (tests).
 * @param {string} [options.baseUrl] - The API root (tests).
 * @param {string} [options.dataDir] - The writable folder (/data).
 * @param {Function} [options.now] - `() => number` in ms (tests).
 * @param {string} [options.timeZone] - IANA timezone of Gladys (TZ by default).
 * @param {boolean} [options.timers] - Arm the reading timer (false in tests).
 * @param {number} [options.spacingMs] - Time between two requests (0 in tests).
 * @param {object} [options.logger] - Logger.
 * @returns {object} Handles for the tests.
 */
function createApp(
  gladys,
  {
    fetch: fetchFn,
    baseUrl,
    dataDir,
    now = () => Date.now(),
    timeZone: zone = defaultTimeZone(),
    timers = true,
    spacingMs,
    logger = sdkLogger,
  } = {},
) {
  const timeZone = usableTimeZone(zone);
  let config = normalizeConfig();
  let language = guessLanguage(timeZone);
  let createdDevices = new Set();
  let lastStatus = null;
  let lastDiscovery = null;
  let lastAccessTry = 0;
  let timer = null;
  let startTimer = null;
  let running = null;
  let stopped = false;
  // When a "today" widget of a system was last asked for (memory only).
  const widgetSeen = new Map();

  const store = createStore({ ...(dataDir ? { dir: dataDir } : {}), logger });
  const api = createAlphaEssClient({
    getCredentials: () => ({ appId: config.appId, appSecret: config.appSecret }),
    userAgent: USER_AGENT,
    now,
    ...(fetchFn ? { fetch: fetchFn } : {}),
    ...(baseUrl ? { baseUrl } : {}),
    ...(Number.isFinite(spacingMs) ? { spacingMs } : {}),
  });

  /**
   * @description Remember the language of a widget request, and store it when it changed.
   * @param {string} next - The language.
   */
  function rememberLanguage(next) {
    if (!LANGUAGES.includes(next) || next === language) {
      return;
    }
    language = next;
    gladys
      .setConfig({ [INTERNAL_KEYS.language]: next })
      .catch((err) => logger.warn(`Unable to store the language: ${err.message}`));
  }

  /**
   * @description Language of the texts Gladys does not ask for in a language.
   * @returns {string} The language.
   */
  const textLanguage = () => (config.language === AUTO_LANGUAGE ? language : config.language);

  /**
   * @description Today in the timezone of Gladys.
   * @returns {string} "2026-10-23".
   */
  const today = () => localParts(now(), timeZone).date;

  // --- What is known of a system ---------------------------------------------------

  /**
   * @description The systems known (getEssList).
   * @returns {object[]} The systems.
   */
  const systems = () => store.data.systems;

  /**
   * @description What is kept of a system.
   * @param {string} sn - The sysSn.
   * @returns {object} The state (store.js).
   */
  function stateOf(sn) {
    store.data.states[sn] ??= {};
    const state = store.data.states[sn];
    state.power ??= null;
    state.dayEnergy ??= null;
    state.summary ??= null;
    state.chargeConfig ??= null;
    state.dischargeConfig ??= null;
    state.curve ??= null;
    state.energy = normalizeEnergy(state.energy);
    state.chargers ??= [];
    state.evStatus ??= {};
    state.evSeen ??= {};
    state.at ??= {};
    state.seen ??= {};
    return state;
  }

  /**
   * @description The power reading interval now.
   * @returns {number} Milliseconds.
   */
  const powerEvery = () =>
    Math.max(config.pollSeconds * 1000, systems().length * POWER_PER_SYSTEM_MS);

  /**
   * @description Whether the last power reading is recent enough to be "now".
   * @param {string} sn - The sysSn.
   * @returns {boolean} True when fresh.
   */
  function powerFresh(sn) {
    const at = stateOf(sn).power?.at;
    return Number.isFinite(at) && now() - at <= Math.max(3 * powerEvery(), 5 * MINUTE_MS);
  }

  /**
   * @description The view of a system the widgets, the scenes and the states use.
   * @param {string} sn - The sysSn.
   * @returns {object} The view.
   */
  function viewOf(sn) {
    const state = stateOf(sn);
    const system = systems().find((item) => item.sn === sn) ?? { sn };
    const date = today();
    return {
      sn,
      deviceId: systemIds(gladys, sn).device,
      name: buildSystemDevice(gladys, system).name,
      model: system.inverterModel ?? null,
      battery: Boolean(system.battery),
      batteryCapacity: system.batteryCapacity ?? null,
      date,
      power: state.power,
      powerAt: state.power?.at ?? null,
      fresh: powerFresh(sn),
      offline: state.seen.offline === true,
      offlineSince: state.seen.offlineSince ?? null,
      dayEnergy: state.dayEnergy?.date === date ? state.dayEnergy : null,
      summary: state.summary?.date === date ? state.summary : null,
      chargeConfig: state.chargeConfig,
      dischargeConfig: state.dischargeConfig,
      cutoffSoc: state.dischargeConfig?.cutoffSoc ?? null,
      configAt: state.at.configRead ?? null,
      configRefused: state.configRefused === true,
      curve: state.curve,
      chargers: state.chargers,
      evStatus: state.evStatus,
      indexes: indexesOf(state.energy),
    };
  }

  /**
   * @description The values of the features of a system now.
   * @param {string} sn - The sysSn.
   * @returns {object} `{ pv_power, … }`, null when unknown.
   */
  function valuesOf(sn) {
    const view = viewOf(sn);
    const indexes = view.indexes ?? {};
    return {
      ...powerValues(view.fresh ? view.power : null),
      pv_today: view.dayEnergy?.pv ?? null,
      load_today: view.summary?.load ?? null,
      pv_index: indexes.pv ?? null,
      grid_import_index: indexes.input ?? null,
      grid_export_index: indexes.output ?? null,
      battery_charge_index: indexes.charge ?? null,
      battery_discharge_index: indexes.discharge ?? null,
    };
  }

  /**
   * @description The power of an EV charger now, W.
   * @param {string} sn - The sysSn.
   * @param {number} index - The position of the charger in the list.
   * @returns {number|null} The power.
   */
  function evPower(sn, index) {
    const state = stateOf(sn);
    if (!powerFresh(sn)) {
      return null;
    }
    const detail = state.power.evDetail?.[index];
    if (Number.isFinite(detail)) {
      return detail;
    }
    return state.chargers.length === 1 ? state.power.ev : null;
  }

  // --- Errors and status -------------------------------------------------------------

  /**
   * @description An error with the system it is about (an Error spread loses its message).
   * @param {Error} err - The error.
   * @param {string} sn - The sysSn.
   * @returns {object} `{ kind, code, message, sn }`.
   */
  const about = (err, sn) => ({ kind: err?.kind, code: err?.code, message: err?.message, sn });

  /**
   * @description The message of an error, for a user.
   * @param {Error} err - The error.
   * @param {string} lang - The language.
   * @returns {string} The message.
   */
  function errorText(err, lang) {
    if (err instanceof ActionError) {
      return t(err.key, lang, {
        ...err.values,
        field: err.values?.field ? t(`field_${err.values.field}`, lang) : '',
      });
    }
    const code = err?.code ? ` (${err.code})` : '';
    const key = {
      auth: 'errAuth',
      clock: 'errClock',
      whitelist: 'errWhitelist',
      not_bound: 'errNotBound',
      rate_limit: 'errRateLimit',
      offline: 'errOffline',
      forbidden: 'errForbidden',
      invalid: 'errInvalid',
      set_failed: 'errSetFailed',
      server: 'errServer',
      unreachable: 'errUnreachable',
      bad_check_code: 'errCheckCode',
      bad_code: 'errBindCode',
    }[err?.kind];
    if (key) {
      return `${t(key, lang, { sn: err?.sn ?? '' })}${code}`;
    }
    return t('errFailed', lang, { detail: String(err?.message ?? '').slice(0, 120) });
  }

  /**
   * @description Report the connection status, only when it changed.
   * @param {boolean} connected - Connected or not.
   * @param {object} message - The multi-language message.
   * @returns {Promise<void>}
   */
  async function reportStatus(connected, message) {
    const clipped = Object.fromEntries(
      Object.entries(message).map(([lang, text]) => [lang, text.slice(0, 200)]),
    );
    const signature = JSON.stringify([connected, clipped]);
    if (signature === lastStatus) {
      return;
    }
    lastStatus = signature;
    try {
      await gladys.setConnectionStatus(connected, clipped);
    } catch (err) {
      lastStatus = null;
      logger.error('Unable to report the connection status', err);
    }
  }

  /**
   * @description Work out the connection status.
   * @returns {Promise<void>}
   */
  async function refreshStatus() {
    if (!config.appId || !config.appSecret) {
      await reportStatus(false, all('statusNoCredentials'));
      return;
    }
    if (store.data.accessRefused) {
      await reportStatus(
        false,
        all((lang) => errorText(store.data.accessRefused, lang)),
      );
      return;
    }
    if (!store.data.listAt) {
      await reportStatus(true, all('statusWaiting'));
      return;
    }
    if (systems().length === 0) {
      await reportStatus(false, all('statusNoSystem'));
      return;
    }
    const unbound = systems().filter((system) => stateOf(system.sn).error?.kind === 'not_bound');
    if (unbound.length === systems().length) {
      await reportStatus(false, all('errNotBound', { sn: unbound.map((s) => s.sn).join(', ') }));
      return;
    }
    const paused = api.pausedUntil();
    await reportStatus(
      true,
      all((lang) => {
        const lines = systems().map((system) => {
          const view = viewOf(system.sn);
          if (view.offline) return t('systemLineOffline', lang, { sn: system.sn });
          let value = '–';
          if (view.fresh && view.battery && Number.isFinite(view.power?.soc)) {
            value = `${formatNumber(view.power.soc, lang, 0)} %`;
          } else if (view.fresh && Number.isFinite(view.power?.pv)) {
            value = `${formatNumber(Math.max(0, view.power.pv), lang, 0)} W`;
          }
          return t('systemLine', lang, { sn: system.sn, value });
        });
        const parts = [t('statusOk', lang, { count: systems().length, systems: lines.join(', ') })];
        if (unbound.length) {
          parts.push(t('errNotBound', lang, { sn: unbound.map((s) => s.sn).join(', ') }));
        }
        if (paused) parts.push(t('statusPaused', lang));
        return parts.join(' ');
      }),
    );
  }

  /**
   * @description Refresh the list of the devices the user created.
   * @returns {Promise<void>}
   */
  async function refreshCreatedDevices() {
    try {
      const devices = await gladys.getDevices();
      createdDevices = new Set(devices.map((device) => device.external_id));
    } catch (err) {
      logger.warn(`Unable to read the devices: ${err.message}`);
    }
  }

  /**
   * @description Ask the open widgets to pull their content again.
   */
  function refreshWidgets() {
    for (const key of Object.values(WIDGETS)) {
      Promise.resolve(gladys.requestWidgetRefresh(key)).catch(() => {});
    }
  }

  /**
   * @description Publish scene events, one by one.
   * @param {Array<{ key: string, data: object }>} events - The events.
   * @returns {Promise<void>}
   */
  async function publishEvents(events) {
    for (const { key, data } of events) {
      logger.info(`Alpha ESS: ${key}${data.sn ? ` (${data.sn})` : ''}`);
      try {
        await gladys.publishSceneEvent(key, data);
      } catch (err) {
        logger.warn(`Unable to fire ${key}: ${err.message}`);
      }
    }
  }

  // --- Devices -----------------------------------------------------------------------

  /**
   * @description Offer the devices of the known systems and EV chargers, when they changed.
   * @param {boolean} [force] - Publish even when unchanged.
   * @returns {Promise<number>} How many devices were offered.
   */
  async function publishDiscoveredDevices(force = false) {
    const lang = textLanguage();
    const devices = [];
    for (const system of systems()) {
      devices.push(buildSystemDevice(gladys, system, lang));
      for (const charger of stateOf(system.sn).chargers) {
        devices.push(buildEvDevice(gladys, { ...charger, systemSn: system.sn }, lang));
      }
    }
    const signature = JSON.stringify(devices);
    if (force || signature !== lastDiscovery) {
      await gladys.publishDiscoveredDevices(devices);
      lastDiscovery = signature;
    }
    return devices.length;
  }

  /**
   * @description Publish the states of a system and of its EV chargers, when they exist.
   * @param {string} sn - The sysSn.
   * @returns {Promise<void>}
   */
  async function publishStates(sn) {
    const system = systems().find((item) => item.sn === sn);
    if (!system) {
      return;
    }
    const states = [];
    if (createdDevices.has(systemIds(gladys, sn).device)) {
      states.push(...buildSystemStates(gladys, system, valuesOf(sn)));
    }
    const state = stateOf(sn);
    state.chargers.forEach((charger, index) => {
      if (createdDevices.has(evIds(gladys, charger.sn).device)) {
        states.push(
          ...buildEvStates(gladys, charger.sn, {
            status: state.evStatus[charger.sn] ?? null,
            power: evPower(sn, index),
          }),
        );
      }
    });
    if (states.length) {
      await gladys
        .publishChangedStates(states)
        .catch((err) => logger.warn(`Unable to publish the states of ${sn}: ${err.message}`));
    }
  }

  // --- Reading -----------------------------------------------------------------------

  /**
   * @description The readings due for a system, in order.
   * @param {string} sn - The sysSn.
   * @returns {string[]} The tasks.
   */
  function dueOf(sn) {
    const state = stateOf(sn);
    const system = systems().find((item) => item.sn === sn);
    const at = state.at;
    const since = (task) => now() - (at[task] ?? 0);
    if (state.error?.kind === 'not_bound' && since('power') < NOT_BOUND_RETRY_MS) {
      return [];
    }
    const date = today();
    const due = [];
    if (since('power') >= powerEvery()) due.push('power');
    if (
      since('energy') >= ENERGY_EVERY_MS ||
      (state.dayEnergy?.date !== date && since('energy') >= MINUTE_MS)
    ) {
      due.push('energy');
    }
    if (since('summary') >= SUMMARY_EVERY_MS) due.push('summary');
    if (
      system?.battery &&
      since('config') >= (state.configRefused ? CONFIG_REFUSED_RETRY_MS : CONFIG_EVERY_MS)
    ) {
      due.push('config');
    }
    if (since('evList') >= LIST_EVERY_MS) due.push('evList');
    if (state.chargers.length && since('evStatus') >= EV_STATUS_EVERY_MS) due.push('evStatus');
    if (pendingDay(state.energy) && since('pending') >= PENDING_EVERY_MS) due.push('pending');
    const wanted = now() - (widgetSeen.get(sn) ?? 0) < WIDGET_SEEN_MS;
    if (wanted && (state.curve?.date !== date || since('curve') >= CURVE_EVERY_MS)) {
      due.push('curve');
    }
    return due;
  }

  /**
   * @description Read the list of the systems bound to the AppID.
   * @returns {Promise<boolean>} True when the list changed.
   */
  async function readList() {
    store.data.listTriedAt = now();
    return applyList(parseEssList(await api.getEssList()));
  }

  /**
   * @description Keep a list of systems read from Alpha ESS.
   * @param {object[]} list - parseEssList().
   * @returns {boolean} True when the list changed.
   */
  function applyList(list) {
    const before = JSON.stringify(systems());
    store.data.systems = list.map((system) => {
      const known = systems().find((item) => item.sn === system.sn);
      // A battery once seen stays: its features never disappear.
      const battery =
        known?.battery === true ||
        (Number.isFinite(system.batteryCapacity) && system.batteryCapacity > 0) ||
        Boolean(system.batteryModel);
      return { ...system, battery };
    });
    store.data.listAt = now();
    for (const sn of Object.keys(store.data.states)) {
      if (!list.some((system) => system.sn === sn)) {
        delete store.data.states[sn];
      }
    }
    return JSON.stringify(systems()) !== before;
  }

  /**
   * @description Run one reading of a system.
   * @param {string} sn - The sysSn.
   * @param {string} task - The reading.
   * @param {Array} events - The scene events found (filled in).
   * @returns {Promise<boolean>} True when the devices offered changed.
   */
  async function read(sn, task, events) {
    const state = stateOf(sn);
    const system = systems().find((item) => item.sn === sn);
    const date = today();
    state.at[task] = now();
    let discovery = false;
    if (task === 'power') {
      let power;
      try {
        power = parsePower(await api.getLastPowerData(sn));
      } catch (err) {
        if (err.kind === 'offline') {
          const {
            events: fired,
            next,
            minutes,
          } = detectOffline(state.seen, {
            offline: true,
            now: now(),
          });
          state.seen = next;
          for (const key of fired) {
            events.push({ key, data: systemData(viewOf(sn), { minutes_offline: minutes }) });
          }
        }
        throw err;
      }
      const offline = detectOffline(state.seen, { ok: true, now: now() });
      state.seen = offline.next;
      for (const key of offline.events) {
        events.push({
          key,
          data: systemData(viewOf(sn), { minutes_offline: offline.minutes }),
        });
      }
      if (power) {
        state.power = { ...power, at: now() };
        const { events: fired, next } = detectPower(state.seen, power, {
          cutoffSoc: state.dischargeConfig?.cutoffSoc ?? null,
          battery: Boolean(system?.battery),
        });
        state.seen = next;
        for (const key of fired) {
          events.push({
            key,
            data: systemData(viewOf(sn), {
              battery_level: rounded(power.soc, 1),
              grid_power_w: rounded(power.grid),
              pv_power_w: rounded(power.pv),
              load_power_w: rounded(power.load),
              battery_power_w: rounded(power.battery),
              ...(key === TRIGGERS.BATTERY_LOW
                ? { cutoff_soc: state.dischargeConfig?.cutoffSoc ?? null }
                : {}),
            }),
          });
        }
      }
    } else if (task === 'energy') {
      const energy = parseDayEnergy(await api.getOneDateEnergyBySn(sn, date));
      if (energy) {
        const newDay = state.energy.date !== null && state.energy.date < date;
        state.dayEnergy = { ...energy, date };
        addDayEnergy(state.energy, date, energy);
        if (newDay) state.at.pending = now();
      }
    } else if (task === 'pending') {
      const day = pendingDay(state.energy);
      try {
        addDayEnergy(state.energy, day, parseDayEnergy(await api.getOneDateEnergyBySn(sn, day)));
      } finally {
        // Read once more at most: a day the cloud no longer gives is dropped.
        dropPending(state.energy, day);
      }
    } else if (task === 'summary') {
      const summary = parseSummary(await api.getSumDataForCustomer(sn));
      state.summary = summary ? { ...summary, date } : state.summary;
    } else if (task === 'config') {
      let refused = 0;
      for (const [endpoint, parse, key] of [
        ['getChargeConfigInfo', parseChargeConfig, 'chargeConfig'],
        ['getDisChargeConfigInfo', parseDischargeConfig, 'dischargeConfig'],
      ]) {
        try {
          const parsed = parse(await api[endpoint](sn));
          if (parsed) state[key] = parsed;
        } catch (err) {
          if (err.kind !== 'forbidden') throw err;
          refused += 1;
        }
      }
      state.configRefused = refused === 2;
      state.at.configRead = now();
    } else if (task === 'evList') {
      const chargers = parseEvChargers(await api.getEvChargerConfigList(sn));
      discovery = JSON.stringify(chargers) !== JSON.stringify(state.chargers);
      state.chargers = chargers;
      if (chargers.length) state.at.evStatus = 0;
    } else if (task === 'evStatus') {
      for (const charger of state.chargers) {
        const status = parseEvStatus(await api.getEvChargerStatusBySn(sn, charger.sn));
        const previous = state.evStatus[charger.sn] ?? null;
        if (status && previous && status !== previous) {
          events.push({
            key: TRIGGERS.EV_CHARGER_STATUS,
            data: {
              charger: evIds(gladys, charger.sn).device,
              charger_sn: charger.sn,
              status,
              previous_status: previous,
              ...systemData(viewOf(sn)),
            },
          });
        }
        if (status) state.evStatus[charger.sn] = status;
      }
    } else if (task === 'curve') {
      const points = parseDayPower(await api.getOneDayPowerBySn(sn, date), (day, time) =>
        toInstant(day, time, timeZone),
      ).filter((point) => localParts(point.at, timeZone).date === date);
      state.curve = { date, points: points.slice(-300) };
    }
    if (state.error) {
      state.error = null;
    }
    return discovery;
  }

  /**
   * @description Remember a refusal of the AppID, and fire the trigger once.
   * @param {Error} err - The error.
   * @param {Array} events - The scene events (filled in).
   * @param {string} [sn] - The system, for a system not bound.
   */
  function refused(err, events, sn = '') {
    const signature = `${err.kind}:${sn}`;
    const known = sn ? stateOf(sn).seen.refused : store.data.accessRefused?.signature;
    if (known !== signature) {
      events.push({
        key: TRIGGERS.ACCESS_REFUSED,
        data: {
          reason: err.kind,
          code: Number.isFinite(err.code) ? err.code : null,
          sn,
          message: errorText(about(err, sn), textLanguage()).slice(0, 1000),
        },
      });
    }
    if (sn) {
      stateOf(sn).seen.refused = signature;
    }
    return signature;
  }

  /**
   * @description Read what is due, then publish what changed.
   * @returns {Promise<void>}
   */
  async function runReadings() {
    if (!config.appId || !config.appSecret) {
      await refreshStatus();
      return;
    }
    if (store.data.accessRefused && now() - lastAccessTry < ACCESS_RETRY_MS) {
      await refreshStatus();
      return;
    }
    if (api.pausedUntil()) {
      await refreshStatus();
      return;
    }
    const events = [];
    let changed = false;
    let discovery = false;
    const listDue =
      now() - (store.data.listAt ?? 0) >= LIST_EVERY_MS &&
      now() - (store.data.listTriedAt ?? 0) >= LIST_RETRY_MS;
    if (listDue || store.data.accessRefused) {
      lastAccessTry = now();
      try {
        discovery = (await readList()) || discovery;
        changed = true;
        if (store.data.accessRefused) {
          logger.info('Alpha ESS accepts the AppID again');
          store.data.accessRefused = null;
        }
      } catch (err) {
        logger.warn(`Alpha ESS getEssList (${err.kind ?? 'error'}): ${err.message}`);
        store.data.lastError = {
          kind: err.kind,
          message: String(err.message).slice(0, 200),
          at: now(),
        };
        if (ACCOUNT_KINDS.includes(err.kind)) {
          const signature = refused(err, events);
          store.data.accessRefused = { kind: err.kind, code: err.code ?? null, signature };
        }
      }
    }
    if (!store.data.accessRefused) {
      let stop = false;
      for (const system of systems()) {
        if (stop) break;
        const queue = dueOf(system.sn);
        for (const task of queue) {
          try {
            discovery = (await read(system.sn, task, events)) || discovery;
            changed = true;
          } catch (err) {
            const kind = err.kind ?? 'failed';
            logger.warn(`Alpha ESS ${task} of ${system.sn} (${kind}): ${err.message}`);
            store.data.lastError = {
              kind,
              message: String(err.message).slice(0, 200),
              at: now(),
            };
            if (kind === 'rate_limit' || ACCOUNT_KINDS.includes(kind)) {
              if (ACCOUNT_KINDS.includes(kind)) {
                const signature = refused(err, events);
                store.data.accessRefused = { kind, code: err.code ?? null, signature };
                lastAccessTry = now();
              }
              stop = true;
              break;
            }
            if (kind === 'not_bound') {
              stateOf(system.sn).error = { kind, message: String(err.message).slice(0, 200) };
              refused(err, events, system.sn);
              changed = true;
              break;
            }
            if (kind === 'offline' || kind === 'unreachable') {
              changed = true;
              break;
            }
          }
        }
      }
    }
    await store.save();
    await publishEvents(events);
    if (changed || discovery) {
      await publishDiscoveredDevices().catch((err) =>
        logger.warn(`Unable to offer the devices: ${err.message}`),
      );
      for (const system of systems()) {
        await publishStates(system.sn);
      }
      refreshWidgets();
    }
    await refreshStatus();
  }

  /**
   * @description Run the readings (one round at a time).
   * @returns {Promise<void>}
   */
  function tick() {
    if (!running) {
      running = runReadings()
        .catch((err) => logger.error('Readings', err))
        .finally(() => {
          running = null;
        });
    }
    return running;
  }

  /**
   * @description (Re)arm the reading timer.
   */
  function schedule() {
    clearInterval(timer);
    clearTimeout(startTimer);
    if (!timers || stopped) {
      return;
    }
    startTimer = setTimeout(tick, STARTUP_DELAY_MS);
    startTimer.unref?.();
    timer = setInterval(tick, TICK_MS);
    timer.unref?.();
  }

  /**
   * @description Offer the devices, publish what is known, arm the timer.
   * @returns {Promise<void>}
   */
  async function applyConfig() {
    await store.save();
    await publishDiscoveredDevices().catch((err) =>
      logger.warn(`Unable to offer the devices: ${err.message}`),
    );
    for (const system of systems()) {
      await publishStates(system.sn);
    }
    await refreshStatus();
    schedule();
  }

  /**
   * @description The system a widget or a scene action targets.
   * @param {unknown} externalId - The `source: "devices"` value (a system or an EV charger).
   * @returns {string|null} The sysSn, the first one by default.
   */
  function target(externalId) {
    const sn = snOfExternalId(externalId, SYSTEM_TYPE);
    if (sn && systems().some((system) => system.sn === sn)) {
      return sn;
    }
    const charger = snOfExternalId(externalId, EV_TYPE);
    const owner = charger
      ? systems().find((system) => stateOf(system.sn).chargers.some((c) => c.sn === charger))
      : null;
    return owner?.sn ?? systems()[0]?.sn ?? null;
  }

  // --- Dashboard widgets -------------------------------------------------------------

  /**
   * @description The common start of a widget: the system, or a message.
   * @param {object} settings - The widget settings.
   * @param {string} lang - The language.
   * @returns {{ sn?: string, content?: object }} The system, or the content to show.
   */
  function widgetSystem(settings, lang) {
    if (!config.appId || !config.appSecret) {
      return { content: messageContent(t('statusNoCredentials', lang)) };
    }
    if (store.data.accessRefused) {
      return { content: messageContent(errorText(store.data.accessRefused, lang)) };
    }
    const sn = target(settings.system);
    if (!sn) {
      return {
        content: messageContent(t(store.data.listAt ? 'statusNoSystem' : 'statusWaiting', lang)),
      };
    }
    return { sn };
  }

  gladys.onWidgetGet(WIDGETS.LIVE, async ({ settings = {}, language: lang }) => {
    rememberLanguage(lang);
    const { sn, content } = widgetSystem(settings, lang);
    return content ?? buildLiveWidget({ view: viewOf(sn), language: lang, now: now(), timeZone });
  });

  gladys.onWidgetGet(WIDGETS.TODAY, async ({ settings = {}, language: lang }) => {
    rememberLanguage(lang);
    const { sn, content } = widgetSystem(settings, lang);
    if (content) {
      return content;
    }
    const before = widgetSeen.get(sn) ?? 0;
    widgetSeen.set(sn, now());
    // The curve of the day is read by the timer from now on; the first time, soon.
    if (now() - before >= WIDGET_SEEN_MS && timers) {
      setTimeout(() => tick(), 1000).unref?.();
    }
    return buildTodayWidget({ view: viewOf(sn), language: lang, now: now(), timeZone });
  });

  gladys.onWidgetGet(WIDGETS.SCHEDULE, async ({ settings = {}, language: lang }) => {
    rememberLanguage(lang);
    const { sn, content } = widgetSystem(settings, lang);
    return (
      content ??
      buildScheduleWidget({
        view: viewOf(sn),
        language: lang,
        now: now(),
        timeZone,
        allowControl: config.allowControl,
      })
    );
  });

  // --- Scene actions -----------------------------------------------------------------

  /**
   * @description The system of a scene action that writes, checked.
   * @param {unknown} externalId - The `system` field.
   * @param {string} lang - The language.
   * @param {object} [options] - `{ battery }`: the system must have a battery.
   * @returns {string} The sysSn.
   */
  function writeTarget(externalId, lang, { battery = true } = {}) {
    if (!config.appId || !config.appSecret) {
      throw new Error(t('statusNoCredentials', lang));
    }
    if (!config.allowControl) {
      throw new Error(t('errControlDisabled', lang));
    }
    const sn = target(externalId);
    if (!sn) {
      throw new Error(t('statusNoSystem', lang));
    }
    if (battery && !systems().find((system) => system.sn === sn)?.battery) {
      throw new Error(t('errNoBattery', lang, { sn }));
    }
    return sn;
  }

  /**
   * @description Run a request of a scene action, its refusal written for the user.
   * @param {Function} task - `() => Promise`.
   * @param {string} lang - The language.
   * @param {string} [sn] - The system.
   * @returns {Promise<unknown>} The answer.
   */
  async function send(task, lang, sn = '') {
    try {
      return await task();
    } catch (err) {
      logger.warn(`Alpha ESS refused a scene action (${err.kind ?? 'error'}): ${err.message}`);
      throw new Error(errorText(about(err, sn), lang).slice(0, 500), {
        cause: err,
      });
    }
  }

  /**
   * @description The outputs of a battery setting.
   * @param {object} setting - `{ enabled, periods }`.
   * @param {string} result - The result text.
   * @param {object} extra - The SOC output.
   * @param {string[]} keys - The declared outputs.
   * @returns {object} The outputs.
   */
  const settingOutputs = (setting, result, extra, keys) =>
    pick(
      {
        result,
        enabled: Boolean(setting.enabled),
        period_1: formatPeriod(setting.periods?.[0]),
        period_2: formatPeriod(setting.periods?.[1]),
        ...extra,
      },
      keys,
    );

  /**
   * @description A scene action that changes a battery setting: read, merge, write.
   * @param {object} fields - The fields.
   * @param {object} kind - `{ read, write, parse, request, stateKey, socKey, outputs, sent }`.
   * @returns {Promise<object>} The outputs.
   */
  async function changeSetting(fields, kind) {
    const lang = textLanguage();
    const sn = writeTarget(fields.system, lang);
    const current = kind.parse(await send(() => api.readNow(kind.read, { sysSn: sn }), lang, sn));
    if (!current) {
      throw new Error(t('errNoSettings', lang));
    }
    let request;
    try {
      request = kind.request(sn, current, fields);
    } catch (err) {
      throw new Error(errorText(err, lang), { cause: err });
    }
    const state = stateOf(sn);
    const soc = { [kind.socOutput]: request.next[kind.socKey] };
    if (!request.changed) {
      state[kind.stateKey] = current;
      return settingOutputs(request.next, t('resultUnchanged', lang), soc, kind.outputs);
    }
    await send(() => api[kind.write](request.body), lang, sn);
    logger.info(`Alpha ESS: ${kind.write} of ${sn} sent`);
    state[kind.stateKey] = request.next;
    state.at.configRead = now();
    // Read back by the timer in a few minutes (what the cloud kept).
    state.at.config = now() - CONFIG_EVERY_MS + 5 * MINUTE_MS;
    refreshWidgets();
    return settingOutputs(
      request.next,
      t(kind.sent, lang, {
        sn,
        state: t(request.next.enabled ? 'valueOn' : 'valueOff', lang),
        periods:
          [0, 1]
            .map((i) => formatPeriod(request.next.periods[i]))
            .filter((text) => text !== 'off')
            .join(', ') || t('periodsNone', lang),
        soc: request.next[kind.socKey],
      }),
      soc,
      kind.outputs,
    );
  }

  gladys.onSceneAction(SCENE_ACTIONS.SET_GRID_CHARGE, async (fields = {}) =>
    changeSetting(fields, {
      read: 'getChargeConfigInfo',
      write: 'updateChargeConfigInfo',
      parse: parseChargeConfig,
      request: gridChargeRequest,
      stateKey: 'chargeConfig',
      socKey: 'maxSoc',
      socOutput: 'max_soc',
      outputs: GRID_CHARGE_OUTPUTS,
      sent: 'resultGridCharge',
    }),
  );

  gladys.onSceneAction(SCENE_ACTIONS.SET_DISCHARGE, async (fields = {}) =>
    changeSetting(fields, {
      read: 'getDisChargeConfigInfo',
      write: 'updateDisChargeConfigInfo',
      parse: parseDischargeConfig,
      request: dischargeRequest,
      stateKey: 'dischargeConfig',
      socKey: 'cutoffSoc',
      socOutput: 'cutoff_soc',
      outputs: DISCHARGE_OUTPUTS,
      sent: 'resultDischarge',
    }),
  );

  gladys.onSceneAction(SCENE_ACTIONS.EV_CHARGER_CONTROL, async (fields = {}) => {
    const lang = textLanguage();
    let mode;
    try {
      mode = evCommand(fields.command);
    } catch (err) {
      throw new Error(errorText(err, lang), { cause: err });
    }
    const sn = writeTarget(fields.charger, lang, { battery: false });
    const chargers = stateOf(sn).chargers;
    const wanted = snOfExternalId(fields.charger, EV_TYPE);
    const charger = wanted ? chargers.find((item) => item.sn === wanted) : chargers[0];
    if (!charger) {
      throw new Error(t('errNoCharger', lang));
    }
    await send(() => api.remoteControlEvCharger(sn, charger.sn, mode), lang, sn);
    logger.info(`Alpha ESS: EV charger ${charger.sn} ${mode ? 'start' : 'stop'} sent`);
    // The new state is read soon by the timer.
    stateOf(sn).at.evStatus = now() - EV_STATUS_EVERY_MS + 30 * 1000;
    return pick(
      { result: t(mode ? 'resultEvStart' : 'resultEvStop', lang, { sn: charger.sn }) },
      EV_OUTPUTS,
    );
  });

  // Answers from what the timer read: the action never sends a request.
  gladys.onSceneAction(SCENE_ACTIONS.GET_TODAY, async (fields = {}) => {
    const lang = textLanguage();
    if (!config.appId || !config.appSecret) {
      throw new Error(t('statusNoCredentials', lang));
    }
    const sn = target(fields.system);
    if (!sn) {
      throw new Error(t('statusNoSystem', lang));
    }
    const view = viewOf(sn);
    const energy = todayEnergies(view);
    const soc = view.fresh && view.battery ? rounded(view.power?.soc, 1) : null;
    const kwh = (value) => rounded(value, 2);
    const text = (value) => (Number.isFinite(value) ? formatNumber(value, lang, 1) : '–');
    return pick(
      {
        pv_kwh: kwh(energy.pv),
        load_kwh: kwh(energy.load),
        import_kwh: kwh(energy.input),
        export_kwh: kwh(energy.output),
        charge_kwh: kwh(energy.charge),
        discharge_kwh: kwh(energy.discharge),
        self_sufficiency: rounded(energy.selfSufficiency),
        battery_level: soc,
        summary: t('todaySummary', lang, {
          pv: text(energy.pv),
          load: text(energy.load),
          import: text(energy.input),
          export: text(energy.output),
          soc: Number.isFinite(soc) ? `${formatNumber(soc, lang, 0)} %` : '–',
        }).slice(0, 1000),
      },
      TODAY_OUTPUTS,
    );
  });

  // --- Configuration screen actions --------------------------------------------------

  gladys.onAction(ACTIONS.TEST_CONNECTION, async () => {
    if (!config.appId || !config.appSecret) {
      return all('statusNoCredentials');
    }
    try {
      store.data.listTriedAt = now();
      const list = parseEssList(await api.readNow('getEssList'));
      store.data.accessRefused = null;
      const changed = applyList(list);
      await store.save();
      if (changed) {
        await publishDiscoveredDevices().catch(() => {});
      }
      lastStatus = null;
      await refreshStatus();
      schedule();
      if (list.length === 0) {
        return all('testNoSystem');
      }
      return all((lang) =>
        [
          t('testOk', lang, { count: list.length }),
          ...systems().map((system) =>
            t(system.battery ? 'testLineBattery' : 'testLine', lang, {
              sn: system.sn,
              model: system.inverterModel ?? '?',
              capacity: formatNumber(system.batteryCapacity ?? 0, lang, 1),
              pv: formatNumber(system.pvPower ?? 0, lang, 1),
            }),
          ),
        ]
          .join(' · ')
          .slice(0, 1000),
      );
    } catch (err) {
      return all((lang) => errorText(err, lang));
    }
  });

  /**
   * @description Read a serial number typed by the user.
   * @param {unknown} raw - The value.
   * @returns {string|null} The serial number.
   */
  const readSn = (raw) => {
    const text = String(raw ?? '')
      .trim()
      .toUpperCase();
    return /^[A-Z0-9_-]{6,40}$/.test(text) ? text : null;
  };

  gladys.onAction(ACTIONS.REQUEST_BIND_CODE, async (fields = {}) => {
    if (!config.appId || !config.appSecret) {
      return all('statusNoCredentials');
    }
    const sn = readSn(fields.sys_sn);
    const checkCode = String(fields.check_code ?? '').trim();
    if (!sn || !/^[A-Za-z0-9]{1,40}$/.test(checkCode)) {
      return all('bindFieldsMissing');
    }
    try {
      await api.getVerificationCode(sn, checkCode);
      logger.info(`Alpha ESS: verification code requested for ${sn}`);
      return all('bindCodeSent', { sn });
    } catch (err) {
      return all((lang) => errorText(about(err, sn), lang));
    }
  });

  gladys.onAction(ACTIONS.BIND_SYSTEM, async (fields = {}) => {
    if (!config.appId || !config.appSecret) {
      return all('statusNoCredentials');
    }
    const sn = readSn(fields.sys_sn);
    const code = String(fields.code ?? '').trim();
    if (!sn || !/^[A-Za-z0-9]{1,40}$/.test(code)) {
      return all('bindFieldsMissing');
    }
    try {
      await api.bindSn(sn, code);
      logger.info(`Alpha ESS: ${sn} bound to the AppID`);
    } catch (err) {
      if (err.kind !== 'already_bound') {
        return all((lang) => errorText(about(err, sn), lang));
      }
    }
    // The list is read again at the next tick.
    store.data.listAt = 0;
    store.data.listTriedAt = 0;
    await store.save();
    schedule();
    return all('bindDone', { sn });
  });

  gladys.onAction(ACTIONS.DIAGNOSTIC, async () => {
    const iso = (value) => (value ? new Date(value).toISOString() : null);
    const report = {
      version: VERSION,
      timeZone,
      appId: config.appId ? `${config.appId.slice(0, 5)}…` : 'missing',
      secret: config.appSecret ? 'set' : 'missing',
      allowControl: config.allowControl,
      pollSeconds: config.pollSeconds,
      powerEverySeconds: powerEvery() / 1000,
      language: config.language,
      accessRefused: store.data.accessRefused,
      lastError: store.data.lastError,
      listAt: iso(store.data.listAt),
      api: {
        requests: api.requests(),
        spacingSeconds: api.spacing() / 1000,
        pausedUntil: iso(api.pausedUntil()),
        backlog: api.backlog(),
      },
      systems: systems().map((system) => {
        const state = stateOf(system.sn);
        return {
          ...system,
          created: createdDevices.has(systemIds(gladys, system.sn).device),
          power: state.power,
          fresh: powerFresh(system.sn),
          dayEnergy: state.dayEnergy,
          summary: state.summary,
          chargeConfig: state.chargeConfig,
          dischargeConfig: state.dischargeConfig,
          configRefused: state.configRefused ?? false,
          energy: state.energy,
          indexes: indexesOf(state.energy),
          curve: state.curve ? { date: state.curve.date, points: state.curve.points.length } : null,
          chargers: state.chargers,
          evStatus: state.evStatus,
          at: Object.fromEntries(Object.entries(state.at).map(([key, value]) => [key, iso(value)])),
          due: dueOf(system.sn),
          seen: state.seen,
          error: state.error ?? null,
        };
      }),
    };
    const json = JSON.stringify(report);
    const count = Math.max(1, Math.ceil(json.length / DIAGNOSTIC_CHUNK));
    for (let chunk = 0; chunk < count; chunk += 1) {
      logger.info(
        `Alpha ESS diagnostic ${chunk + 1}/${count}: ${json.slice(chunk * DIAGNOSTIC_CHUNK, (chunk + 1) * DIAGNOSTIC_CHUNK)}`,
      );
    }
    return all('diagnosticDone', { count });
  });

  // --- Devices -----------------------------------------------------------------------
  gladys.onScanRequest(async () => {
    const count = await publishDiscoveredDevices(true);
    logger.info(`Scan: ${count} device(s) offered`);
    if (!count) {
      store.data.listAt = 0;
      store.data.listTriedAt = 0;
      tick();
    }
  });

  gladys.onDeviceCreated(async () => {
    await refreshCreatedDevices();
    // States sent before the device existed were dropped by Gladys, and the SDK
    // forgot what it sent for this device: send everything known again.
    for (const system of systems()) {
      await publishStates(system.sn);
    }
    refreshWidgets();
  });

  gladys.onDeviceDeleted(refreshCreatedDevices);

  // --- Configuration -----------------------------------------------------------------

  /**
   * @description Reload the whole config (internal keys included).
   * @param {object} [fallback] - Raw values to use when the read fails.
   * @returns {Promise<void>}
   */
  async function loadConfig(fallback) {
    try {
      const raw = await gladys.getConfig();
      config = normalizeConfig(raw);
      language = readLanguage(raw, language);
    } catch (err) {
      if (fallback) {
        config = normalizeConfig(fallback);
      }
      logger.error('Unable to read the configuration', err);
    }
  }

  gladys.onConfigUpdated(async (rawConfig) => {
    const previous = `${config.appId}:${config.appSecret}`;
    await loadConfig(rawConfig);
    logger.info('Configuration updated');
    lastStatus = null;
    lastDiscovery = null;
    if (`${config.appId}:${config.appSecret}` !== previous) {
      // New credentials: tried at the next tick, the list read again.
      store.data.accessRefused = null;
      store.data.listAt = 0;
      store.data.listTriedAt = 0;
      lastAccessTry = 0;
    }
    await applyConfig();
  });

  // --- Connection lifecycle ----------------------------------------------------------
  // Each (re)connection resynchronizes; the promise lets the tests wait for it.
  let startup = Promise.resolve();
  gladys.on('connected', () => {
    startup = (async () => {
      await store.load();
      await loadConfig();
      await refreshCreatedDevices();
      lastStatus = null;
      lastDiscovery = null;
      await applyConfig();
    })().catch((err) => logger.error('Startup', err));
  });

  // --- Graceful shutdown -------------------------------------------------------------
  gladys.handleShutdown(async (signal) => {
    logger.info(`Received ${signal} -> graceful shutdown`);
    stopped = true;
    clearInterval(timer);
    clearTimeout(startTimer);
    await store.save();
  });

  return {
    store,
    api,
    tick,
    dueOf,
    viewOf,
    valuesOf,
    powerEvery,
    seeWidget: (sn) => widgetSeen.set(sn, now()),
    getConfig: () => config,
    whenReady: () => startup,
  };
}

export { createApp, ACTIONS, USER_AGENT, ACCESS_RETRY_MS };

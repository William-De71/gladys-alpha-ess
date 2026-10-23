// -----------------------------------------------------------------------------
// The devices of the integration, offered on the Discovery screen.
//
// One device per Alpha ESS system (its serial number, sysSn), read-only, in a
// stable order. The categories follow the contracts of the Gladys core
// (server/utils/constants.js, the same in 5.1.0 and on master):
//   - `pv_power`                energy-production-sensor / power (W);
//   - `battery_level`           battery-storage / battery-level (%);
//   - `battery_charge_power`    battery-storage / charge-power (W, >= 0) and
//   - `battery_discharge_power` battery-storage / discharge-power (W, >= 0):
//                               the core splits the two directions, so the
//                               signed `pbat` of Alpha ESS becomes two features;
//   - `grid_power`              grid-sensor / power (W, signed: import > 0,
//                               export < 0, as `pgrid` natively is);
//   - `load_power`              energy-sensor / power (W): the house load the
//                               inverter measures ("goes to energy-sensor");
//   - `pv_today`                energy-production-sensor / daily-production (kWh);
//   - `load_today`              energy-sensor / index-today (kWh): not
//                               `daily-consumption`, that Gladys would price
//                               and count twice with the meter of the house;
//   - `pv_index`                energy-production-sensor / index (kWh): a
//                               production index, history only;
//   - `grid_import_index`       grid-sensor / input-index (kWh) and
//   - `grid_export_index`       grid-sensor / output-index (kWh);
//   - `battery_charge_index`    battery-storage / charge-index (kWh) and
//   - `battery_discharge_index` battery-storage / discharge-index (kWh).
// The indexes are built from the energies of each day (energy.js). No
// energy-sensor / index: it would feed the consumption and the cost of Gladys
// and count the house twice next to a Linky. The battery features exist only
// when the system has a battery (getEssList gives its capacity or model); a
// system once seen with a battery keeps them.
//
// One device per Alpha ESS EV charger (its serial number): its connector
// status and its charging state (charging-station, the OCPP 1.6 split the core
// documents) and its power (energy-sensor / power, W).
//
// External ids: `ext:alpha-ess:system:<sysSn>`, `…:evcharger:<evchargerSn>`,
// features `…:<key>`. `should_poll` stays false: the integration reads the
// cloud on its own timer.
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES as C,
  DEVICE_FEATURE_TYPES as T,
  DEVICE_FEATURE_UNITS as U,
} from '@gladysassistant/integration-sdk';
import { t } from './i18n.js';

const SYSTEM_TYPE = 'system';
const EV_TYPE = 'evcharger';
const MAX_POWER = 100000;
const MAX_DAY_KWH = 1000;
const MAX_INDEX_KWH = 100000000;

const SYSTEM_FEATURES = [
  {
    key: 'pv_power',
    category: C.ENERGY_PRODUCTION_SENSOR,
    type: T.ENERGY_PRODUCTION_SENSOR.POWER,
    unit: U.WATT,
    min: 0,
    max: MAX_POWER,
  },
  {
    key: 'battery_level',
    category: C.BATTERY_STORAGE,
    type: T.BATTERY_STORAGE.BATTERY_LEVEL,
    unit: U.PERCENT,
    min: 0,
    max: 100,
    battery: true,
  },
  {
    key: 'battery_charge_power',
    category: C.BATTERY_STORAGE,
    type: T.BATTERY_STORAGE.CHARGE_POWER,
    unit: U.WATT,
    min: 0,
    max: MAX_POWER,
    battery: true,
  },
  {
    key: 'battery_discharge_power',
    category: C.BATTERY_STORAGE,
    type: T.BATTERY_STORAGE.DISCHARGE_POWER,
    unit: U.WATT,
    min: 0,
    max: MAX_POWER,
    battery: true,
  },
  {
    key: 'grid_power',
    category: C.GRID_SENSOR,
    type: T.GRID_SENSOR.POWER,
    unit: U.WATT,
    min: -MAX_POWER,
    max: MAX_POWER,
  },
  {
    key: 'load_power',
    category: C.ENERGY_SENSOR,
    type: T.ENERGY_SENSOR.POWER,
    unit: U.WATT,
    min: 0,
    max: MAX_POWER,
  },
  {
    key: 'pv_today',
    category: C.ENERGY_PRODUCTION_SENSOR,
    type: T.ENERGY_PRODUCTION_SENSOR.DAILY_PRODUCTION,
    unit: U.KILOWATT_HOUR,
    min: 0,
    max: MAX_DAY_KWH,
  },
  {
    key: 'load_today',
    category: C.ENERGY_SENSOR,
    type: T.ENERGY_SENSOR.INDEX_TODAY,
    unit: U.KILOWATT_HOUR,
    min: 0,
    max: MAX_DAY_KWH,
  },
  {
    key: 'pv_index',
    category: C.ENERGY_PRODUCTION_SENSOR,
    type: T.ENERGY_PRODUCTION_SENSOR.INDEX,
    unit: U.KILOWATT_HOUR,
    min: 0,
    max: MAX_INDEX_KWH,
  },
  {
    key: 'grid_import_index',
    category: C.GRID_SENSOR,
    type: T.GRID_SENSOR.INPUT_INDEX,
    unit: U.KILOWATT_HOUR,
    min: 0,
    max: MAX_INDEX_KWH,
  },
  {
    key: 'grid_export_index',
    category: C.GRID_SENSOR,
    type: T.GRID_SENSOR.OUTPUT_INDEX,
    unit: U.KILOWATT_HOUR,
    min: 0,
    max: MAX_INDEX_KWH,
  },
  {
    key: 'battery_charge_index',
    category: C.BATTERY_STORAGE,
    type: T.BATTERY_STORAGE.CHARGE_INDEX,
    unit: U.KILOWATT_HOUR,
    min: 0,
    max: MAX_INDEX_KWH,
    battery: true,
  },
  {
    key: 'battery_discharge_index',
    category: C.BATTERY_STORAGE,
    type: T.BATTERY_STORAGE.DISCHARGE_INDEX,
    unit: U.KILOWATT_HOUR,
    min: 0,
    max: MAX_INDEX_KWH,
    battery: true,
  },
];

// The core values of a charging station (CHARGING_STATION_CONNECTOR_STATUS
// and CHARGING_STATION_CHARGING_STATE of server/utils/constants.js), and the
// split of the OCPP 1.6 states it documents.
const CONNECTOR_STATUS = { AVAILABLE: 0, OCCUPIED: 1, RESERVED: 2, UNAVAILABLE: 3, FAULTED: 4 };
const CHARGING_STATE = {
  CHARGING: 0,
  EV_CONNECTED: 1,
  PAUSED_BY_VEHICLE: 2,
  PAUSED_BY_CHARGER: 3,
  IDLE: 4,
  DISCHARGING: 5,
};
const EV_SPLIT = {
  available: [CONNECTOR_STATUS.AVAILABLE, null],
  preparing: [CONNECTOR_STATUS.OCCUPIED, CHARGING_STATE.EV_CONNECTED],
  charging: [CONNECTOR_STATUS.OCCUPIED, CHARGING_STATE.CHARGING],
  suspended_evse: [CONNECTOR_STATUS.OCCUPIED, CHARGING_STATE.PAUSED_BY_CHARGER],
  suspended_ev: [CONNECTOR_STATUS.OCCUPIED, CHARGING_STATE.PAUSED_BY_VEHICLE],
  finishing: [CONNECTOR_STATUS.OCCUPIED, CHARGING_STATE.IDLE],
  faulted: [CONNECTOR_STATUS.FAULTED, null],
};

const EV_FEATURES = [
  {
    key: 'connector_status',
    category: C.CHARGING_STATION,
    type: T.CHARGING_STATION.CONNECTOR_STATUS,
    min: 0,
    max: 4,
  },
  {
    key: 'charging_state',
    category: C.CHARGING_STATION,
    type: T.CHARGING_STATION.CHARGING_STATE,
    min: 0,
    max: 5,
  },
  {
    key: 'power',
    category: C.ENERGY_SENSOR,
    type: T.ENERGY_SENSOR.POWER,
    unit: U.WATT,
    min: 0,
    max: MAX_POWER,
  },
];

const DECIMALS = { battery_level: 1 };
const KWH_DECIMALS = 3;

/**
 * @description Round a value to the decimals of its feature.
 * @param {object} feature - The feature description.
 * @param {number} value - The value.
 * @returns {number} The rounded value.
 */
function round(feature, value) {
  const decimals = DECIMALS[feature.key] ?? (feature.unit === U.KILOWATT_HOUR ? KWH_DECIMALS : 0);
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/**
 * @description The external ids of a system.
 * @param {object} gladys - The GladysIntegration instance.
 * @param {string} sn - The sysSn.
 * @returns {{ device: string, feature: Function }} The ids.
 */
const systemIds = (gladys, sn) => gladys.externalIds(SYSTEM_TYPE, String(sn));

/**
 * @description The external ids of an EV charger.
 * @param {object} gladys - The GladysIntegration instance.
 * @param {string} sn - The evchargerSn.
 * @returns {{ device: string, feature: Function }} The ids.
 */
const evIds = (gladys, sn) => gladys.externalIds(EV_TYPE, String(sn));

/**
 * @description The serial number of a device (or feature) external id.
 * @param {unknown} externalId - The id.
 * @param {string} [type] - `system` or `evcharger`.
 * @returns {string|null} The serial number.
 * @example
 * snOfExternalId('ext:alpha-ess:system:AL7011023030623:pv_power'); // -> 'AL7011023030623'
 */
function snOfExternalId(externalId, type = SYSTEM_TYPE) {
  const match = new RegExp(`:${type}:([A-Za-z0-9_-]+)(?::[a-z_]+)?$`).exec(
    String(externalId ?? ''),
  );
  return match ? match[1] : null;
}

/**
 * @description The feature keys of a system, in a stable order.
 * @param {boolean} battery - Whether it has a battery.
 * @returns {string[]} The keys.
 */
const systemFeatureKeys = (battery) =>
  SYSTEM_FEATURES.filter((feature) => battery || !feature.battery).map((feature) => feature.key);

/**
 * @description A feature of a discovered device.
 * @param {object} ids - The external ids of the device.
 * @param {object} feature - The feature description.
 * @param {string} language - Language of its name.
 * @returns {object} The feature.
 */
function buildFeature(ids, feature, language) {
  return {
    name: t(`feature_${feature.key}`, language),
    external_id: ids.feature(feature.key),
    category: feature.category,
    type: feature.type,
    ...(feature.unit ? { unit: feature.unit } : {}),
    min: feature.min,
    max: feature.max,
    read_only: true,
    has_feedback: false,
    keep_history: true,
  };
}

/**
 * @description The device name of a system: "Alpha ESS SMILE5-INV (AL70…23)".
 * @param {object} system - `{ sn, inverterModel }`.
 * @returns {string} The name.
 */
const systemName = (system) =>
  `Alpha ESS ${system.inverterModel ? `${system.inverterModel} ` : ''}${system.sn}`.slice(0, 100);

/**
 * @description Build the device of a system.
 * @param {object} gladys - The GladysIntegration instance.
 * @param {object} system - `{ sn, inverterModel, battery }`.
 * @param {string} [language] - Language of the feature names.
 * @returns {object} The discovered device.
 */
function buildSystemDevice(gladys, system, language = 'en') {
  const ids = systemIds(gladys, system.sn);
  return {
    name: systemName(system),
    external_id: ids.device,
    model: String(system.inverterModel || 'Alpha ESS').slice(0, 100),
    should_poll: false,
    params: [{ name: 'ALPHA_ESS_SYS_SN', value: String(system.sn) }],
    features: systemFeatureKeys(Boolean(system.battery)).map((key) =>
      buildFeature(
        ids,
        SYSTEM_FEATURES.find((feature) => feature.key === key),
        language,
      ),
    ),
  };
}

/**
 * @description Build the device of an EV charger.
 * @param {object} gladys - The GladysIntegration instance.
 * @param {object} charger - `{ sn, model, systemSn }`.
 * @param {string} [language] - Language of the feature names.
 * @returns {object} The discovered device.
 */
function buildEvDevice(gladys, charger, language = 'en') {
  const ids = evIds(gladys, charger.sn);
  return {
    name: `Alpha ESS ${charger.model ? `${charger.model} ` : ''}${charger.sn}`.slice(0, 100),
    external_id: ids.device,
    model: String(charger.model || 'Alpha ESS EV charger').slice(0, 100),
    should_poll: false,
    params: [
      { name: 'ALPHA_ESS_EVCHARGER_SN', value: String(charger.sn) },
      { name: 'ALPHA_ESS_SYS_SN', value: String(charger.systemSn) },
    ],
    features: EV_FEATURES.map((feature) => buildFeature(ids, feature, language)),
  };
}

/**
 * @description States from values: a value left out (null) is left untouched.
 * @param {object} ids - The external ids.
 * @param {object[]} features - The feature descriptions.
 * @param {object} values - `{ key: number|null }`.
 * @returns {object[]} `{ device_feature_external_id, state }`.
 */
function statesOf(ids, features, values) {
  return features
    .filter((feature) => Number.isFinite(values?.[feature.key]))
    .map((feature) => ({
      device_feature_external_id: ids.feature(feature.key),
      state: Math.min(feature.max, Math.max(feature.min, round(feature, values[feature.key]))),
    }));
}

/**
 * @description The states of a system.
 * @param {object} gladys - The GladysIntegration instance.
 * @param {object} system - `{ sn, battery }`.
 * @param {object} values - `{ pv_power, … }` in W, %, kWh; null = unknown.
 * @returns {object[]} The states.
 */
function buildSystemStates(gladys, system, values) {
  const keys = systemFeatureKeys(Boolean(system.battery));
  return statesOf(
    systemIds(gladys, system.sn),
    SYSTEM_FEATURES.filter((feature) => keys.includes(feature.key)),
    values,
  );
}

/**
 * @description The values of the features of a system from its power now.
 * @param {object|null} power - parsePower() (fresh), or null.
 * @returns {object} `{ pv_power, battery_level, … }`, null when unknown.
 */
function powerValues(power) {
  if (!power) {
    return {};
  }
  const battery = power.battery;
  return {
    pv_power: power.pv === null ? null : Math.max(0, power.pv),
    battery_level: power.soc,
    // pbat > 0: the battery discharges; < 0: it charges.
    battery_charge_power: battery === null ? null : Math.max(0, -battery),
    battery_discharge_power: battery === null ? null : Math.max(0, battery),
    grid_power: power.grid,
    load_power: power.load === null ? null : Math.max(0, power.load),
  };
}

/**
 * @description The states of an EV charger.
 * @param {object} gladys - The GladysIntegration instance.
 * @param {string} sn - The evchargerSn.
 * @param {object} values - `{ status, power }`: a value of EV_STATES, W.
 * @returns {object[]} The states.
 */
function buildEvStates(gladys, sn, { status, power }) {
  const [connector, charging] = EV_SPLIT[status] ?? [null, null];
  return statesOf(evIds(gladys, sn), EV_FEATURES, {
    connector_status: connector,
    charging_state: charging,
    power: Number.isFinite(power) ? Math.max(0, power) : null,
  });
}

export {
  SYSTEM_TYPE,
  EV_TYPE,
  SYSTEM_FEATURES,
  EV_FEATURES,
  CONNECTOR_STATUS,
  CHARGING_STATE,
  EV_SPLIT,
  systemIds,
  evIds,
  snOfExternalId,
  systemFeatureKeys,
  systemName,
  buildSystemDevice,
  buildEvDevice,
  buildSystemStates,
  buildEvStates,
  powerValues,
};

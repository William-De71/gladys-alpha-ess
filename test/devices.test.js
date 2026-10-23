// The traps of the Gladys core that the fake Gladys does not catch
// (community feedback, thread 11005): should_poll with poll_frequency, min /
// max / read_only / has_feedback on every feature, category / type / unit
// pairs the core knows (DEVICE_FEATURE_UNITS_BY_CATEGORY of
// server/utils/constants.js, the same in 5.1.0 and on master), a signed grid
// power with symmetric bounds, and a single invalid field rejecting the whole
// discovery batch.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import {
  DEVICE_FEATURE_CATEGORIES as C,
  DEVICE_FEATURE_TYPES as T,
  DEVICE_FEATURE_UNITS as U,
} from '@gladysassistant/integration-sdk';
import {
  systemIds,
  evIds,
  snOfExternalId,
  buildSystemDevice,
  buildEvDevice,
  buildSystemStates,
  buildEvStates,
  powerValues,
  systemFeatureKeys,
  SYSTEM_FEATURES,
  CONNECTOR_STATUS,
  CHARGING_STATE,
} from '../src/device.js';
import { LANGUAGES } from '../src/i18n.js';

const fakeGladys = {
  externalIds: (type, id) => ({
    device: `ext:alpha-ess:${type}:${id}`,
    feature: (key) => `ext:alpha-ess:${type}:${id}:${key}`,
  }),
};
const HYBRID = { sn: 'AL7011023030601', inverterModel: 'SMILE5-INV', battery: true };
const PV_ONLY = { sn: 'AL7011023030602', inverterModel: null, battery: false };
const CHARGER = { sn: 'EVCT110000001', model: 'SMILE-EVCT11', systemSn: HYBRID.sn };

// The units the core accepts per category (server/utils/constants.js,
// DEVICE_FEATURE_UNITS_BY_CATEGORY, read on v5.1.0 and upstream/master on 2026-10-23).
const UNITS_BY_CATEGORY = {
  [C.ENERGY_PRODUCTION_SENSOR]: [U.WATT, U.KILOWATT, U.WATT_HOUR, U.KILOWATT_HOUR],
  [C.BATTERY_STORAGE]: [U.PERCENT, U.WATT, U.KILOWATT, U.WATT_HOUR, U.KILOWATT_HOUR],
  [C.GRID_SENSOR]: [U.WATT, U.KILOWATT, U.WATT_HOUR, U.KILOWATT_HOUR],
  [C.ENERGY_SENSOR]: [U.VOLT, U.WATT, U.KILOWATT, U.WATT_HOUR, U.KILOWATT_HOUR],
};
const PAIRS = {
  pv_power: [C.ENERGY_PRODUCTION_SENSOR, T.ENERGY_PRODUCTION_SENSOR.POWER, U.WATT],
  battery_level: [C.BATTERY_STORAGE, T.BATTERY_STORAGE.BATTERY_LEVEL, U.PERCENT],
  battery_charge_power: [C.BATTERY_STORAGE, T.BATTERY_STORAGE.CHARGE_POWER, U.WATT],
  battery_discharge_power: [C.BATTERY_STORAGE, T.BATTERY_STORAGE.DISCHARGE_POWER, U.WATT],
  grid_power: [C.GRID_SENSOR, T.GRID_SENSOR.POWER, U.WATT],
  load_power: [C.ENERGY_SENSOR, T.ENERGY_SENSOR.POWER, U.WATT],
  pv_today: [
    C.ENERGY_PRODUCTION_SENSOR,
    T.ENERGY_PRODUCTION_SENSOR.DAILY_PRODUCTION,
    U.KILOWATT_HOUR,
  ],
  load_today: [C.ENERGY_SENSOR, T.ENERGY_SENSOR.INDEX_TODAY, U.KILOWATT_HOUR],
  pv_index: [C.ENERGY_PRODUCTION_SENSOR, T.ENERGY_PRODUCTION_SENSOR.INDEX, U.KILOWATT_HOUR],
  grid_import_index: [C.GRID_SENSOR, T.GRID_SENSOR.INPUT_INDEX, U.KILOWATT_HOUR],
  grid_export_index: [C.GRID_SENSOR, T.GRID_SENSOR.OUTPUT_INDEX, U.KILOWATT_HOUR],
  battery_charge_index: [C.BATTERY_STORAGE, T.BATTERY_STORAGE.CHARGE_INDEX, U.KILOWATT_HOUR],
  battery_discharge_index: [C.BATTERY_STORAGE, T.BATTERY_STORAGE.DISCHARGE_INDEX, U.KILOWATT_HOUR],
};
const keyOf = (feature) => feature.external_id.split(':').pop();

test('devices are never polled by Gladys: the integration has its own timer', () => {
  for (const device of [
    buildSystemDevice(fakeGladys, HYBRID),
    buildEvDevice(fakeGladys, CHARGER),
  ]) {
    assert.equal(device.should_poll, false);
    assert.equal(device.poll_frequency, undefined);
  }
});

test('every feature carries min, max, read_only and has_feedback, in every language', () => {
  for (const language of LANGUAGES) {
    for (const device of [
      buildSystemDevice(fakeGladys, HYBRID, language),
      buildSystemDevice(fakeGladys, PV_ONLY, language),
      buildEvDevice(fakeGladys, CHARGER, language),
    ]) {
      for (const feature of device.features) {
        assert.equal(typeof feature.min, 'number', feature.external_id);
        assert.equal(typeof feature.max, 'number', feature.external_id);
        assert.ok(feature.min < feature.max);
        assert.equal(feature.read_only, true);
        assert.equal(feature.has_feedback, false);
        assert.ok(feature.name.length > 0 && feature.name.length <= 100);
      }
      assert.equal(new Set(device.features.map((f) => f.name)).size, device.features.length);
    }
  }
});

test('category / type / unit pairs of the core contracts; no energy-sensor index, no daily consumption', () => {
  const device = buildSystemDevice(fakeGladys, HYBRID);
  assert.deepEqual(device.features.map(keyOf), Object.keys(PAIRS));
  for (const feature of device.features) {
    const key = keyOf(feature);
    assert.deepEqual([feature.category, feature.type, feature.unit], PAIRS[key], key);
    assert.ok(UNITS_BY_CATEGORY[feature.category].includes(feature.unit), key);
    if (feature.category === C.ENERGY_SENSOR) {
      assert.notEqual(feature.type, T.ENERGY_SENSOR.DAILY_CONSUMPTION, 'Gladys would price it');
      assert.notEqual(feature.type, T.ENERGY_SENSOR.INDEX, 'it would count as a meter');
      assert.notEqual(feature.type, T.ENERGY_SENSOR.ENERGY, 'it would count as a meter');
    }
  }
  const grid = device.features.find((feature) => keyOf(feature) === 'grid_power');
  assert.equal(grid.min, -grid.max, 'a signed power has symmetric bounds');
  const level = device.features.find((feature) => keyOf(feature) === 'battery_level');
  assert.deepEqual([level.min, level.max], [0, 100]);
});

test('a system without battery has no battery feature; the order stays stable', () => {
  const device = buildSystemDevice(fakeGladys, PV_ONLY, 'fr');
  assert.deepEqual(device.features.map(keyOf), [
    'pv_power',
    'grid_power',
    'load_power',
    'pv_today',
    'load_today',
    'pv_index',
    'grid_import_index',
    'grid_export_index',
  ]);
  assert.equal(device.name, 'Alpha ESS AL7011023030602');
  assert.equal(device.features[0].name, 'Production solaire');
  assert.deepEqual(device.params, [{ name: 'ALPHA_ESS_SYS_SN', value: 'AL7011023030602' }]);
  assert.deepEqual(
    systemFeatureKeys(true),
    SYSTEM_FEATURES.map((feature) => feature.key),
  );
});

test('the EV charger: connector status and charging state of the core, its power', () => {
  const device = buildEvDevice(fakeGladys, CHARGER);
  assert.deepEqual(
    device.features.map((feature) => [
      keyOf(feature),
      feature.category,
      feature.type,
      feature.unit,
    ]),
    [
      ['connector_status', C.CHARGING_STATION, T.CHARGING_STATION.CONNECTOR_STATUS, undefined],
      ['charging_state', C.CHARGING_STATION, T.CHARGING_STATION.CHARGING_STATE, undefined],
      ['power', C.ENERGY_SENSOR, T.ENERGY_SENSOR.POWER, U.WATT],
    ],
  );
  assert.equal(device.name, 'Alpha ESS SMILE-EVCT11 EVCT110000001');
  const states = (status) =>
    buildEvStates(fakeGladys, CHARGER.sn, { status, power: 7200 }).map((s) => s.state);
  assert.deepEqual(states('charging'), [CONNECTOR_STATUS.OCCUPIED, CHARGING_STATE.CHARGING, 7200]);
  assert.deepEqual(states('preparing'), [
    CONNECTOR_STATUS.OCCUPIED,
    CHARGING_STATE.EV_CONNECTED,
    7200,
  ]);
  // Not occupied: no charging state (the core says it has no value then).
  assert.deepEqual(states('available'), [CONNECTOR_STATUS.AVAILABLE, 7200]);
  assert.deepEqual(states('faulted'), [CONNECTOR_STATUS.FAULTED, 7200]);
});

test('ids from the serial numbers', () => {
  assert.equal(snOfExternalId('ext:alpha-ess:system:AL7011023030601:pv_power'), HYBRID.sn);
  assert.equal(snOfExternalId('ext:alpha-ess:system:AL7011023030601'), HYBRID.sn);
  assert.equal(snOfExternalId('ext:alpha-ess:evcharger:EVCT110000001', 'evcharger'), CHARGER.sn);
  assert.equal(snOfExternalId('ext:alpha-ess:evcharger:EVCT110000001'), null);
  assert.equal(snOfExternalId('nothing'), null);
});

test('the signed battery power becomes charge and discharge, both >= 0', () => {
  assert.deepEqual(powerValues({ pv: -3, load: 1275, grid: 11, battery: 1264, soc: 56 }), {
    pv_power: 0,
    battery_level: 56,
    battery_charge_power: 0,
    battery_discharge_power: 1264,
    grid_power: 11,
    load_power: 1275,
  });
  const charging = powerValues({ pv: 3000, load: 1200, grid: -1800, battery: -500, soc: 88 });
  assert.deepEqual([charging.battery_charge_power, charging.battery_discharge_power], [500, 0]);
  assert.deepEqual(powerValues(null), {});
});

test('states: rounded, clamped to the bounds, an unknown value left untouched', () => {
  const states = buildSystemStates(fakeGladys, PV_ONLY, {
    pv_power: 1234.6,
    grid_power: -250000,
    pv_today: 7.89912,
    battery_level: 50,
    load_power: null,
  });
  assert.deepEqual(states, [
    { device_feature_external_id: `ext:alpha-ess:system:${PV_ONLY.sn}:pv_power`, state: 1235 },
    { device_feature_external_id: `ext:alpha-ess:system:${PV_ONLY.sn}:grid_power`, state: -100000 },
    { device_feature_external_id: `ext:alpha-ess:system:${PV_ONLY.sn}:pv_today`, state: 7.899 },
  ]);
});

test('the discovery batch and the states pass the checks of the fake host API', async (t) => {
  const gladys = createFakeGladys({});
  t.after(() => gladys.fake.shutdown());
  await gladys.connect();
  for (const language of LANGUAGES) {
    await gladys.publishDiscoveredDevices([
      buildSystemDevice(gladys, HYBRID, language),
      buildSystemDevice(gladys, PV_ONLY, language),
      buildEvDevice(gladys, CHARGER, language),
    ]);
  }
  for (const device of gladys.fake.discoveredDevices) {
    await gladys.fake.deviceCreated(device);
  }
  const values = Object.fromEntries(
    SYSTEM_FEATURES.map((feature, index) => [feature.key, index + 1]),
  );
  await gladys.publishStates(buildSystemStates(gladys, HYBRID, values));
  await gladys.publishStates(
    buildEvStates(gladys, CHARGER.sn, { status: 'charging', power: 11000 }),
  );
  assert.equal(gladys.fake.lastState(systemIds(gladys, HYBRID.sn).feature('grid_power')), 5);
  assert.equal(gladys.fake.lastState(evIds(gladys, CHARGER.sn).feature('power')), 11000);
});

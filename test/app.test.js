// The whole integration against the fake Gladys of the SDK
// (`@gladysassistant/integration-sdk/testing`), which checks the discovered
// devices, the states and the scene events like the host API does, and a fake
// Alpha ESS (test/helpers/fake-alphaess.js), a real HTTP server on 127.0.0.1.
// No test touches the network.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';

import { createApp, ACTIONS, USER_AGENT, ACCESS_RETRY_MS } from '../src/app.js';
import { WIDGETS } from '../src/widgets.js';
import { TRIGGERS, SCENE_ACTIONS, TODAY_OUTPUTS } from '../src/events.js';
import { FILE } from '../src/store.js';
import {
  startFakeAlphaEss,
  dataDir,
  silent,
  NOW,
  TZ,
  APP_ID,
  SECRET,
  MINUTE,
  HOUR,
  SN_A,
  SN_B,
  SN_UNBOUND,
  EV_SN,
  CHECK_CODE,
  BIND_CODE,
} from './helpers/fake-alphaess.js';

const CONFIG = { app_id: APP_ID, app_secret: SECRET, language: 'en' };
const PREFIX = 'ext:test-integration';
const HOME = `${PREFIX}:system:${SN_A}`;
const GARAGE = `${PREFIX}:system:${SN_B}`;
const CHARGER = `${PREFIX}:evcharger:${EV_SN}`;

/**
 * @description The integration, connected to a fake Gladys and a fake Alpha ESS.
 * @param {object} t - The test context (closes everything after).
 * @param {object} [options] - `{ config, dir, clock, fake }`.
 * @returns {Promise<object>} `{ gladys, app, fake, clock, dir }`.
 */
async function startApp(t, { config = CONFIG, dir = dataDir(), clock = { now: NOW }, fake } = {}) {
  fake ??= await startFakeAlphaEss({ now: () => clock.now });
  const gladys = createFakeGladys({ config });
  const app = createApp(gladys, {
    baseUrl: fake.url,
    dataDir: dir,
    now: () => clock.now,
    timeZone: TZ,
    timers: false,
    spacingMs: 0,
    logger: silent,
  });
  await gladys.connect();
  await app.whenReady();
  t.after(async () => {
    await gladys.fake.shutdown().catch(() => {});
    await fake.close();
  });
  return { gladys, app, fake, clock, dir };
}

/**
 * @description Create every offered device, like the user would.
 * @param {object} gladys - The fake Gladys.
 */
async function createAll(gladys) {
  for (const device of gladys.fake.discoveredDevices) {
    await gladys.fake.deviceCreated(structuredClone(device));
  }
}
const endpoints = (fake) => fake.calls.map((call) => `${call.endpoint}:${call.params.sysSn ?? ''}`);
const events = (gladys, key) => gladys.fake.sceneEvents.filter((event) => event.key === key);

test('startup: the list, then each system, its devices offered, signed requests only', async (t) => {
  const { gladys, app, fake } = await startApp(t);
  assert.deepEqual(fake.calls, [], 'no request before the timer');
  await app.tick();
  assert.deepEqual(endpoints(fake), [
    'getEssList:',
    `getLastPowerData:${SN_A}`,
    `getOneDateEnergyBySn:${SN_A}`,
    `getSumDataForCustomer:${SN_A}`,
    `getChargeConfigInfo:${SN_A}`,
    `getDisChargeConfigInfo:${SN_A}`,
    `getEvChargerConfigList:${SN_A}`,
    `getLastPowerData:${SN_B}`,
    `getOneDateEnergyBySn:${SN_B}`,
    `getSumDataForCustomer:${SN_B}`,
    `getEvChargerConfigList:${SN_B}`,
  ]);
  for (const call of fake.calls) {
    assert.equal(call.appId, APP_ID);
    assert.equal(call.userAgent, USER_AGENT);
    assert.ok(!call.url.includes(SECRET));
  }
  assert.deepEqual(
    gladys.fake.discoveredDevices.map((device) => [device.external_id, device.features.length]),
    [
      [HOME, 13],
      [CHARGER, 3],
      [GARAGE, 8],
    ],
  );
  assert.equal(gladys.fake.connectionStatus.connected, true);
  assert.equal(
    gladys.fake.connectionStatus.message.en,
    `2 system(s): ${SN_A} 72 %, ${SN_B} 2,100 W.`,
  );
  // Right after: only the EV charger state is due (its list just came).
  await app.tick();
  assert.deepEqual(endpoints(fake).slice(11), [`getEvChargerStatusBySn:${SN_A}`]);
  await app.tick();
  assert.equal(fake.calls.length, 12, 'nothing more is due');
});

test('a restart reads nothing before its time, and the secret is never in /data', async (t) => {
  const dir = dataDir();
  const clock = { now: NOW };
  const first = await startApp(t, { dir, clock });
  await first.app.tick();
  await first.gladys.fake.shutdown();
  const saved = readFileSync(join(dir, FILE), 'utf8');
  assert.ok(!saved.includes(SECRET), 'the secret never in /data');
  clock.now += 20 * 1000;
  const second = await startApp(t, { dir, clock });
  await second.app.tick();
  assert.deepEqual(endpoints(second.fake), [`getEvChargerStatusBySn:${SN_A}`]);
  // A minute later: the power of both systems.
  clock.now += 2 * MINUTE;
  await second.app.tick();
  assert.deepEqual(endpoints(second.fake).slice(1), [
    `getLastPowerData:${SN_A}`,
    `getEvChargerStatusBySn:${SN_A}`,
    `getLastPowerData:${SN_B}`,
  ]);
});

test('states: published once the device exists, all again on creation, the signs split', async (t) => {
  const { gladys, app, fake, clock } = await startApp(t);
  await app.tick();
  assert.equal(gladys.fake.states.length, 0, 'no state before the devices exist');
  await createAll(gladys);
  const state = (key, device = HOME) => gladys.fake.lastState(`${device}:${key}`);
  assert.equal(state('pv_power'), 4200);
  assert.equal(state('grid_power'), -1900, 'export is negative');
  assert.equal(state('battery_level'), 72);
  assert.equal(state('battery_charge_power'), 1000, 'pbat < 0: charging');
  assert.equal(state('battery_discharge_power'), 0);
  assert.equal(state('load_power'), 1300);
  assert.equal(state('load_today'), 9.8);
  assert.ok(state('pv_today') > 0);
  assert.equal(state('pv_index'), state('pv_today'), 'the first day: the index is the day');
  assert.equal(state('battery_level', GARAGE), undefined, 'no battery feature');
  // The EV charger, once its state is read.
  await app.tick();
  assert.equal(state('connector_status', CHARGER), 0);
  // Only what changed is published again.
  const before = gladys.fake.states.length;
  clock.now += MINUTE;
  await app.tick();
  assert.equal(gladys.fake.states.length, before, 'same values: nothing published');
  fake.power[SN_A] = { ...fake.power[SN_A], pgrid: 2500, pbat: 900, ppv: 0 };
  clock.now += MINUTE;
  await app.tick();
  assert.equal(state('grid_power'), 2500);
  assert.equal(state('battery_discharge_power'), 900);
  assert.equal(state('battery_charge_power'), 0);
});

test('energy indexes keep counting across midnight', async (t) => {
  const { gladys, app, fake, clock } = await startApp(t);
  fake.energy[SN_A] = {
    '2026-10-23': { epv: 10, eInput: 2, eOutput: 3, eCharge: 4, eDischarge: 1 },
  };
  await app.tick();
  await createAll(gladys);
  const state = (key) => gladys.fake.lastState(`${HOME}:${key}`);
  assert.deepEqual(
    ['pv_index', 'grid_import_index', 'grid_export_index', 'battery_charge_index'].map(state),
    [10, 2, 3, 4],
  );
  // 00:05 the next day: the end of the 23rd was 12 kWh of PV.
  fake.energy[SN_A]['2026-10-23'] = {
    epv: 12,
    eInput: 2.5,
    eOutput: 3,
    eCharge: 4,
    eDischarge: 1.5,
  };
  fake.energy[SN_A]['2026-10-24'] = {
    epv: 0,
    eInput: 0.2,
    eOutput: 0,
    eCharge: 0,
    eDischarge: 0.1,
  };
  clock.now = Date.parse('2026-10-23T22:05:00Z');
  await app.tick();
  assert.equal(state('pv_index'), 10, 'the last value seen is counted at once');
  assert.equal(state('grid_import_index'), 2.2);
  // The 23rd read again a quarter of an hour later.
  clock.now += 16 * MINUTE;
  await app.tick();
  assert.ok(
    fake.calls.some((call) => call.params.queryDate === '2026-10-23' && call.params.sysSn === SN_A),
  );
  assert.equal(state('pv_index'), 12);
  assert.equal(state('grid_import_index'), 2.7);
  assert.equal(state('battery_discharge_index'), 1.6);
});

test('triggers: export → import, battery full, never at the first reading', async (t) => {
  const { gladys, app, fake, clock } = await startApp(t);
  await app.tick();
  assert.equal(gladys.fake.sceneEvents.length, 0);
  const step = async (power) => {
    fake.power[SN_A] = { ...fake.power[SN_A], ...power };
    clock.now += MINUTE;
    await app.tick();
  };
  await step({ pgrid: 1500, soc: 99 });
  await step({ pgrid: 1600, soc: 100 });
  assert.equal(events(gladys, TRIGGERS.IMPORT_STARTED).length, 1);
  const full = events(gladys, TRIGGERS.BATTERY_FULL);
  assert.equal(full.length, 1);
  assert.deepEqual(full[0].data, {
    system: HOME,
    system_name: `Alpha ESS SMILE5-INV ${SN_A}`,
    sn: SN_A,
    battery_level: 100,
    grid_power_w: 1600,
    pv_power_w: 4200,
    load_power_w: 1300,
    battery_power_w: -1000,
  });
  await step({ pgrid: -900, soc: 100 });
  await step({ pgrid: -950, soc: 100 });
  assert.equal(events(gladys, TRIGGERS.EXPORT_STARTED).length, 1);
  assert.equal(events(gladys, TRIGGERS.BATTERY_FULL).length, 1, 'once per transition');
  // Battery low at the cut-off SOC of the discharge settings (10 %).
  await step({ soc: 11 });
  const low = events(gladys, TRIGGERS.BATTERY_LOW);
  assert.equal(low.length, 1);
  assert.equal(low[0].data.cutoff_soc, 10);
});

test('system offline after 10 minutes of 6042, back when it answers', async (t) => {
  const { gladys, app, fake, clock } = await startApp(t);
  await app.tick();
  fake.refuse('getLastPowerData', 6042, { sn: SN_A });
  for (let i = 0; i < 12; i += 1) {
    clock.now += MINUTE;
    await app.tick();
  }
  const offline = events(gladys, TRIGGERS.SYSTEM_OFFLINE);
  assert.equal(offline.length, 1);
  assert.equal(offline[0].data.sn, SN_A);
  assert.ok(offline[0].data.minutes_offline >= 10);
  assert.match(gladys.fake.connectionStatus.message.en, new RegExp(`${SN_A} offline`));
  const live = await gladys.fake.widgetGet(WIDGETS.LIVE, { settings: { system: HOME } });
  assert.match(JSON.stringify(live.data.content), /offline since/);
  fake.accept();
  clock.now += MINUTE;
  await app.tick();
  assert.equal(events(gladys, TRIGGERS.SYSTEM_ONLINE).length, 1);
});

test('the EV charger: its state changes fire the trigger with the charger device', async (t) => {
  const { gladys, app, fake, clock } = await startApp(t);
  await app.tick();
  await app.tick();
  fake.evStatus[EV_SN] = 2;
  clock.now += 3 * MINUTE;
  await app.tick();
  const changed = events(gladys, TRIGGERS.EV_CHARGER_STATUS);
  assert.equal(changed.length, 1);
  assert.equal(changed[0].data.charger, CHARGER);
  assert.equal(changed[0].data.status, 'preparing');
  assert.equal(changed[0].data.previous_status, 'available');
});

test('access refused: a wrong secret fires once, the status says it, tried again later', async (t) => {
  const { gladys, app, fake, clock } = await startApp(t, {
    config: { ...CONFIG, app_secret: 'wrong' },
  });
  await app.tick();
  const refused = events(gladys, TRIGGERS.ACCESS_REFUSED);
  assert.equal(refused.length, 1);
  assert.equal(refused[0].data.reason, 'auth');
  assert.equal(refused[0].data.code, 6007);
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.match(gladys.fake.connectionStatus.message.en, /refuses the AppID/);
  clock.now += MINUTE;
  await app.tick();
  assert.equal(fake.calls.length, 1, 'not tried again at once');
  clock.now += ACCESS_RETRY_MS;
  await app.tick();
  assert.equal(fake.calls.length, 2);
  assert.equal(events(gladys, TRIGGERS.ACCESS_REFUSED).length, 1, 'once per refusal');
  // The right secret: read at once.
  await gladys.fake.configUpdated(CONFIG);
  await app.tick();
  assert.equal(gladys.fake.connectionStatus.connected, true);
});

test('missing credentials: no request, the status asks for them', async (t) => {
  const { gladys, app, fake } = await startApp(t, { config: { app_id: APP_ID } });
  await app.tick();
  assert.equal(fake.calls.length, 0);
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.match(gladys.fake.connectionStatus.message.fr, /AppID et l’AppSecret/);
  const widget = await gladys.fake.widgetGet(WIDGETS.LIVE, { language: 'de' });
  assert.match(JSON.stringify(widget.data.content), /AppSecret/);
});

test('6053: the readings stop and wait, the status says it', async (t) => {
  const { gladys, app, fake, clock } = await startApp(t);
  fake.refuse('getOneDateEnergyBySn', 6053, { times: 1 });
  await app.tick();
  assert.deepEqual(endpoints(fake), [
    'getEssList:',
    `getLastPowerData:${SN_A}`,
    `getOneDateEnergyBySn:${SN_A}`,
  ]);
  assert.match(gladys.fake.connectionStatus.message.en, /slow down/);
  clock.now += 30 * 1000;
  await app.tick();
  assert.equal(fake.calls.length, 3, 'paused');
  clock.now += MINUTE;
  await app.tick();
  assert.ok(fake.calls.length > 3);
});

test('the curve of the day is read only while a "today" widget is shown', async (t) => {
  const { gladys, app, fake, clock } = await startApp(t);
  await app.tick();
  assert.ok(!endpoints(fake).some((call) => call.startsWith('getOneDayPowerBySn')));
  const settings = { system: HOME };
  await gladys.fake.widgetGet(WIDGETS.TODAY, { settings });
  clock.now += 20 * 1000;
  await app.tick();
  assert.ok(endpoints(fake).includes(`getOneDayPowerBySn:${SN_A}`));
  const content = (await gladys.fake.widgetGet(WIDGETS.TODAY, { settings, language: 'es' })).data
    .content;
  assert.deepEqual(validateWidgetContent(content), []);
  assert.ok(content.components.some((c) => c.type === 'chart'));
  for (const key of Object.values(WIDGETS)) {
    for (const system of [HOME, GARAGE, CHARGER, undefined]) {
      const result = await gladys.fake.widgetGet(key, { settings: { system }, language: 'fr' });
      assert.deepEqual(validateWidgetContent(result.data.content), [], `${key} ${system}`);
    }
  }
});

test('scene actions that write are refused until control is allowed', async (t) => {
  const { gladys, app, fake } = await startApp(t);
  await app.tick();
  for (const [key, fields] of [
    [SCENE_ACTIONS.SET_GRID_CHARGE, { enabled: 'on' }],
    [SCENE_ACTIONS.SET_DISCHARGE, { enabled: 'on' }],
    [SCENE_ACTIONS.EV_CHARGER_CONTROL, { command: 'start' }],
  ]) {
    const result = await gladys.fake.sceneAction(key, fields);
    assert.equal(result.success, false, key);
    assert.match(result.error, /Allow the scenes to control the inverter/);
  }
  assert.ok(!fake.calls.some((call) => call.method === 'POST'), 'nothing written');
});

test('charge from the grid: read, merge, write once; unchanged is never sent', async (t) => {
  const { gladys, app, fake } = await startApp(t, { config: { ...CONFIG, allow_control: true } });
  await app.tick();
  const result = await gladys.fake.sceneAction(SCENE_ACTIONS.SET_GRID_CHARGE, {
    system: HOME,
    enabled: 'on',
    period_2: '13:00-14:00',
    max_soc: 95,
  });
  assert.equal(result.success, true, result.error);
  assert.deepEqual(result.data.outputs, {
    result: `Charge from the grid of ${SN_A}: on, 01:00-05:00, 13:00-14:00, up to 95 %.`,
    enabled: true,
    period_1: '01:00-05:00',
    period_2: '13:00-14:00',
    max_soc: 95,
  });
  assert.deepEqual(fake.charge[SN_A], {
    batHighCap: 95,
    gridCharge: 1,
    timeChaf1: '01:00',
    timeChae1: '05:00',
    timeChaf2: '13:00',
    timeChae2: '14:00',
  });
  const writes = () => fake.calls.filter((call) => call.method === 'POST').length;
  assert.equal(writes(), 1);
  const again = await gladys.fake.sceneAction(SCENE_ACTIONS.SET_GRID_CHARGE, { enabled: 'on' });
  assert.equal(again.data.outputs.result, 'Already set this way: nothing sent.');
  assert.equal(writes(), 1);
  // A wrong period: refused before any request.
  const bad = await gladys.fake.sceneAction(SCENE_ACTIONS.SET_GRID_CHARGE, { period_1: '1h-5h' });
  assert.equal(bad.success, false);
  assert.match(bad.error, /Period 1: "1h-5h" is not a period/);
  // Alpha ESS refuses a second change the same day (6053).
  fake.refuse('updateChargeConfigInfo', 6053, { times: 1 });
  const refused = await gladys.fake.sceneAction(SCENE_ACTIONS.SET_GRID_CHARGE, { enabled: 'off' });
  assert.equal(refused.success, false);
  assert.match(refused.error, /about once a day/);
  // A system without battery.
  const none = await gladys.fake.sceneAction(SCENE_ACTIONS.SET_DISCHARGE, {
    system: GARAGE,
    enabled: 'on',
  });
  assert.match(none.error, /has no battery/);
});

test('discharge time control and the EV charger, when allowed', async (t) => {
  const { gladys, app, fake } = await startApp(t, { config: { ...CONFIG, allow_control: true } });
  await app.tick();
  const discharge = await gladys.fake.sceneAction(SCENE_ACTIONS.SET_DISCHARGE, {
    enabled: 'on',
    period_1: '17:00-21:00',
    cutoff_soc: 20,
  });
  assert.equal(discharge.success, true, discharge.error);
  assert.equal(fake.discharge[SN_A].ctrDis, 1);
  assert.equal(fake.discharge[SN_A].batUseCap, 20);
  assert.equal(discharge.data.outputs.cutoff_soc, 20);
  const start = await gladys.fake.sceneAction(SCENE_ACTIONS.EV_CHARGER_CONTROL, {
    charger: CHARGER,
    command: 'start',
  });
  assert.equal(start.success, true, start.error);
  assert.equal(fake.evStatus[EV_SN], 3);
  const call = fake.calls.find((c) => c.endpoint === 'remoteControlEvCharger');
  assert.deepEqual(call.params, { sysSn: SN_A, evchargerSn: EV_SN, controlMode: 1 });
  const none = await gladys.fake.sceneAction(SCENE_ACTIONS.EV_CHARGER_CONTROL, {
    charger: GARAGE,
    command: 'stop',
  });
  assert.match(none.error, /No Alpha ESS EV charger/);
});

test('get_today answers from what was read, with its declared outputs only', async (t) => {
  const { gladys, app, fake } = await startApp(t);
  await app.tick();
  const count = fake.calls.length;
  const result = await gladys.fake.sceneAction(SCENE_ACTIONS.GET_TODAY, { system: HOME });
  assert.equal(result.success, true);
  assert.equal(fake.calls.length, count, 'no request');
  for (const key of Object.keys(result.data.outputs)) {
    assert.ok(TODAY_OUTPUTS.includes(key), key);
  }
  assert.equal(result.data.outputs.load_kwh, 9.8);
  assert.equal(result.data.outputs.self_sufficiency, 86);
  assert.equal(result.data.outputs.battery_level, 72);
  assert.match(result.data.outputs.summary, /^Today: solar /);
});

test('configuration buttons: test, bind a system with the e-mailed code, diagnostic', async (t) => {
  const { gladys, app, fake } = await startApp(t);
  const tested = await gladys.fake.action(ACTIONS.TEST_CONNECTION);
  assert.match(tested.data.message.en, /accepts the AppID: 2 system\(s\)/);
  assert.match(tested.data.message.fr, /batterie 13,3 kWh/);
  const wrong = await gladys.fake.action(ACTIONS.REQUEST_BIND_CODE, {
    sys_sn: SN_UNBOUND,
    check_code: 'NOPE',
  });
  assert.match(wrong.data.message.en, /refuses the CheckCode/);
  const sent = await gladys.fake.action(ACTIONS.REQUEST_BIND_CODE, {
    sys_sn: SN_UNBOUND.toLowerCase(),
    check_code: CHECK_CODE,
  });
  assert.match(sent.data.message.en, /e-mailed a verification code/);
  const badCode = await gladys.fake.action(ACTIONS.BIND_SYSTEM, { sys_sn: SN_UNBOUND, code: '1' });
  assert.match(badCode.data.message.en, /wrong or expired/);
  const bound = await gladys.fake.action(ACTIONS.BIND_SYSTEM, {
    sys_sn: SN_UNBOUND,
    code: BIND_CODE,
  });
  assert.match(bound.data.message.en, /is bound to the AppID/);
  await app.tick();
  assert.ok(
    gladys.fake.discoveredDevices.some((d) => d.external_id === `${PREFIX}:system:${SN_UNBOUND}`),
  );
  const again = await gladys.fake.action(ACTIONS.BIND_SYSTEM, { sys_sn: SN_A, code: BIND_CODE });
  assert.match(again.data.message.en, /is bound/, '6003: already bound is a success');
  const missing = await gladys.fake.action(ACTIONS.BIND_SYSTEM, { sys_sn: '', code: '' });
  assert.match(missing.data.message.en, /Enter the serial number/);
  const diagnostic = await gladys.fake.action(ACTIONS.DIAGNOSTIC);
  assert.match(diagnostic.data.message.en, /line\(s\) "Alpha ESS diagnostic"/);
  for (const call of fake.calls.filter((c) => c.endpoint === 'getVerificationCode')) {
    assert.equal(call.method, 'GET', 'GET only, the portal is wrong');
  }
  assert.equal(fake.calls.find((c) => c.endpoint === 'bindSn').method, 'POST');
});

test('a system no longer bound (6005): reported, the others go on', async (t) => {
  const { gladys, app, fake, clock } = await startApp(t);
  await app.tick();
  fake.bound.delete(SN_B);
  clock.now += 2 * MINUTE;
  // The list still names it until it is read again: its readings fail.
  await app.tick();
  const refused = events(gladys, TRIGGERS.ACCESS_REFUSED);
  assert.equal(refused.length, 1);
  assert.equal(refused[0].data.reason, 'not_bound');
  assert.equal(refused[0].data.sn, SN_B);
  assert.match(gladys.fake.connectionStatus.message.en, new RegExp(`System ${SN_B} is not bound`));
  const count = fake.calls.length;
  clock.now += 2 * MINUTE;
  await app.tick();
  assert.equal(events(gladys, TRIGGERS.ACCESS_REFUSED).length, 1, 'once');
  assert.ok(
    fake.calls.slice(count).every((call) => call.params.sysSn !== SN_B),
    'not tried again before an hour',
  );
  clock.now += HOUR;
  await app.tick();
  assert.ok(fake.calls.slice(count).some((call) => call.params.sysSn === SN_B));
});

test('a scan offers the devices again', async (t) => {
  const { gladys, app } = await startApp(t);
  await app.tick();
  const offered = gladys.fake.bodies('POST', '/discovered_device').length;
  await gladys.fake.scanRequest();
  assert.equal(gladys.fake.bodies('POST', '/discovered_device').length, offered + 1);
  assert.equal(gladys.fake.discoveredDevices.length, 3);
});

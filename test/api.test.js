// The HTTP client against the fake Alpha ESS (a real local server) and a fake
// transport: signature, envelope, return codes, spacing, priorities. No test
// touches the network.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createAlphaEssClient,
  sign,
  kindOfCode,
  AlphaEssError,
  KINDS,
} from '../src/alphaess-api.js';
import { startFakeAlphaEss, NOW, APP_ID, SECRET, SN_A } from './helpers/fake-alphaess.js';

test('the signature of the portal example: SHA-512(appId + appSecret + timeStamp), hex', () => {
  assert.equal(
    sign('alphaef7900ee81dbbce9', 'c2d2ef6c047c49678e2c332fb2d74c3c', '1676353875'),
    '0f023c2287b8f6b21b0994947465f8e9de0e1542567b1735bdc6c427336b9b64' +
      '06285cd94f9215c3e9af958df37fb11c2c9fe792713d8afbdb8c463359a1add8',
  );
});

test('every published return code has a kind; unknown ones are failures', () => {
  for (const code of [6001, 6002, 6003, 6004, 6005, 6006, 6007, 6008, 6009, 6010]) {
    assert.ok(KINDS[code], code);
  }
  for (const code of [6011, 6012, 6016, 6026, 6029, 6038, 6042, 6046, 6053, 6017, 10001]) {
    assert.ok(KINDS[code], code);
  }
  assert.equal(kindOfCode(6053), 'rate_limit');
  assert.equal(kindOfCode(6042), 'offline');
  assert.equal(kindOfCode(6005), 'not_bound');
  assert.equal(kindOfCode(6007), 'auth');
  assert.equal(kindOfCode(1234), 'failed');
});

/**
 * @description A client of the fake Alpha ESS.
 * @param {object} t - The test context.
 * @param {object} [credentials] - `{ appId, appSecret }`.
 * @returns {Promise<object>} `{ api, fake }`.
 */
async function client(t, credentials = { appId: APP_ID, appSecret: SECRET }) {
  const fake = await startFakeAlphaEss();
  t.after(() => fake.close());
  const api = createAlphaEssClient({
    getCredentials: () => credentials,
    userAgent: 'test/1',
    baseUrl: fake.url,
    spacingMs: 0,
    now: () => NOW,
  });
  return { api, fake };
}

test('signed headers on every request, the verb the API enforces, the secret never sent', async (t) => {
  const { api, fake } = await client(t);
  const list = await api.getEssList();
  assert.equal(list.length, 2);
  await api.getOneDateEnergyBySn(SN_A, '2026-10-23');
  await api.updateChargeConfigInfo({
    sysSn: SN_A,
    batHighCap: 90,
    gridCharge: 1,
    timeChaf1: '01:00',
    timeChae1: '05:00',
    timeChaf2: '00:00',
    timeChae2: '00:00',
  });
  assert.deepEqual(
    fake.calls.map((call) => `${call.method} ${call.endpoint}`),
    ['GET getEssList', 'GET getOneDateEnergyBySn', 'POST updateChargeConfigInfo'],
  );
  for (const call of fake.calls) {
    assert.equal(call.appId, APP_ID);
    assert.equal(call.timeStamp, String(Math.floor(NOW / 1000)));
    assert.equal(call.sign, sign(APP_ID, SECRET, call.timeStamp));
    assert.equal(call.userAgent, 'test/1');
    assert.ok(!call.url.includes(SECRET) && !JSON.stringify(call.params).includes(SECRET));
  }
  assert.equal(fake.calls[1].url, `/api/getOneDateEnergyBySn?sysSn=${SN_A}&queryDate=2026-10-23`);
  assert.equal(fake.calls[2].contentType, 'application/json');
});

test('a wrong AppID: 6007 without data (the live answer), an auth error', async (t) => {
  const { api } = await client(t, { appId: 'alphaWrong', appSecret: 'nope' });
  await assert.rejects(api.getEssList(), (err) => {
    assert.ok(err instanceof AlphaEssError);
    assert.equal(err.kind, 'auth');
    assert.equal(err.code, 6007);
    assert.doesNotMatch(err.message, /nope/);
    return true;
  });
});

test('missing credentials never reach the network', async (t) => {
  const { api, fake } = await client(t, { appId: '', appSecret: '' });
  await assert.rejects(api.getEssList(), { kind: 'auth' });
  assert.equal(fake.calls.length, 0);
});

test('return codes become kinds: not bound, offline, no permission, too fast', async (t) => {
  const { api, fake } = await client(t);
  await assert.rejects(api.getLastPowerData('AL7011023030699'), { kind: 'not_bound', code: 6005 });
  fake.refuse('getLastPowerData', 6042, { times: 1 });
  await assert.rejects(api.getLastPowerData(SN_A), { kind: 'offline', code: 6042 });
  fake.refuse('getTimeChargeBySn', 6017);
  fake.refuse('getChargeConfigInfo', 6017, { times: 1 });
  await assert.rejects(api.getChargeConfigInfo(SN_A), { kind: 'forbidden' });
  fake.refuse('getEssList', 6053, { times: 1 });
  await assert.rejects(api.getEssList(), { kind: 'rate_limit' });
  assert.ok(api.pausedUntil() > NOW, 'the readings pause after a 6053');
  assert.ok(api.spacing() >= 0);
});

test('an HTTP error, a non-JSON body, a network failure', async () => {
  const make = (fetch) =>
    createAlphaEssClient({
      getCredentials: () => ({ appId: APP_ID, appSecret: SECRET }),
      userAgent: 'test/1',
      fetch,
      spacingMs: 0,
    });
  const response = (status, text) => ({ ok: status < 400, status, text: async () => text });
  await assert.rejects(make(async () => response(405, '{}')).getEssList(), {
    kind: 'http',
    status: 405,
  });
  await assert.rejects(make(async () => response(502, 'Bad gateway')).getEssList(), {
    kind: 'server',
  });
  await assert.rejects(make(async () => response(200, '<html>')).getEssList(), { kind: 'failed' });
  await assert.rejects(
    make(async () => {
      throw new Error('ECONNREFUSED');
    }).getEssList(),
    { kind: 'unreachable' },
  );
  // A success without data: null, not an error.
  assert.equal(
    await make(async () => response(200, '{"code":200,"msg":"Success"}')).getEssList(),
    null,
  );
});

test('one request at a time, 10 seconds apart, the writes before the waiting readings', async () => {
  let clock = 1_000_000;
  const order = [];
  const api = createAlphaEssClient({
    getCredentials: () => ({ appId: APP_ID, appSecret: SECRET }),
    userAgent: 'test/1',
    now: () => clock,
    sleep: async (ms) => {
      clock += ms;
    },
    fetch: async (url, init) => {
      order.push([url.split('/api/')[1].split('?')[0], clock, init.method]);
      return { ok: true, status: 200, text: async () => '{"code":200,"data":null}' };
    },
  });
  const reads = [api.getLastPowerData(SN_A), api.getSumDataForCustomer(SN_A)];
  const write = api.remoteControlEvCharger(SN_A, 'EV1', 1);
  await Promise.all([...reads, write]);
  assert.deepEqual(
    order.map(([endpoint]) => endpoint),
    ['getLastPowerData', 'remoteControlEvCharger', 'getSumDataForCustomer'],
  );
  assert.deepEqual(
    order.map(([, at]) => at - order[0][1]),
    [0, 10000, 20000],
  );
});

test('after a 6053: the readings wait a minute and the spacing doubles, a write does not wait', async () => {
  let clock = 1_000_000;
  const seen = [];
  let refuse = true;
  const api = createAlphaEssClient({
    getCredentials: () => ({ appId: APP_ID, appSecret: SECRET }),
    userAgent: 'test/1',
    now: () => clock,
    sleep: async (ms) => {
      clock += ms;
    },
    fetch: async (url) => {
      seen.push([url.split('/api/')[1].split('?')[0], clock]);
      const code = refuse ? 6053 : 200;
      refuse = false;
      return { ok: true, status: 200, text: async () => JSON.stringify({ code, data: null }) };
    },
  });
  await assert.rejects(api.getEssList(), { kind: 'rate_limit' });
  assert.equal(api.spacing(), 20000);
  const start = clock;
  await api.bindSn(SN_A, '123456');
  assert.equal(seen[1][1] - start, 20000, 'the write waits for the spacing only');
  await api.getEssList();
  assert.ok(seen[2][1] >= start + 60000, 'the reading waits for the end of the pause');
});

// A fake Alpha ESS Open API for the tests: a real HTTP server on 127.0.0.1,
// with the endpoints, the envelope and the refusals the portal documents (as
// checked live by the reference library alphaess-openAPI, docs/API.md and
// docs/RETURN_CODES.md). Tests never touch the network. Nothing starts on
// import (`node --test` also runs this file).
//
//   - authentication: the headers `appId`, `timeStamp` (seconds, 300 s at most
//     from the clock of the test: else 6006) and `sign` = SHA-512(appId +
//     appSecret + timeStamp) (else HTTP 200 `{"code":6007,"msg":"Sign check
//     error"}`, without `data`: the live answer to an unknown AppID, checked on
//     2026-10-23); APP_ID / SECRET below are the only valid pair;
//   - the verb is enforced: the other one answers HTTP 405 with a Spring body;
//   - answers `{ code, msg, expMsg, data, extra }`, code 200 for a success;
//   - two systems bound to the AppID: AL7011023030601 (SMILE5-INV, 13.34 kWh
//     battery, 9 kW of panels, an EV charger SMILE-EVCT11) and AL7011023030602
//     (an inverter without battery); a third one, AL7011023030699, exists but
//     is not bound (6005), and can be bound with the code e-mailed for the
//     CheckCode `CHK123`;
//   - `fake.refuse(endpoint, code, { times })` answers a return code instead
//     (6042 offline, 6053 too fast, 6017 no permission…).
// Never real data.

import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const NOW = Date.parse('2026-10-23T12:00:00Z'); // 14:00 in Paris, a Friday
const TZ = 'Europe/Paris';
const APP_ID = 'alphaTest0123456789';
const SECRET = 'secret0123456789abcdef0123456789';
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const SN_A = 'AL7011023030601';
const SN_B = 'AL7011023030602';
const SN_UNBOUND = 'AL7011023030699';
const EV_SN = 'EVCT110000001';
const CHECK_CODE = 'CHK123';
const BIND_CODE = '654321';
const silent = { info() {}, warn() {}, error() {}, debug() {} };

/**
 * @description A temporary folder standing for /data.
 * @returns {string} The path.
 */
const dataDir = () => mkdtempSync(join(tmpdir(), 'alpha-ess-'));

const METHODS = {
  getEssList: 'GET',
  getLastPowerData: 'GET',
  getOneDayPowerBySn: 'GET',
  getOneDateEnergyBySn: 'GET',
  getSumDataForCustomer: 'GET',
  getChargeConfigInfo: 'GET',
  updateChargeConfigInfo: 'POST',
  getDisChargeConfigInfo: 'GET',
  updateDisChargeConfigInfo: 'POST',
  getVerificationCode: 'GET',
  bindSn: 'POST',
  unBindSn: 'POST',
  getEvChargerConfigList: 'GET',
  getEvChargerCurrentsBySn: 'GET',
  setEvChargerCurrentsBySn: 'POST',
  getEvChargerStatusBySn: 'GET',
  remoteControlEvCharger: 'POST',
};

const SYSTEMS = {
  [SN_A]: {
    sysSn: SN_A,
    popv: 9.0,
    minv: 'SMILE5-INV',
    poinv: 5.0,
    cobat: 13.34,
    mbat: 'SMILE-BAT-13.3P',
    surplusCobat: 13.34,
    usCapacity: 100.0,
    emsStatus: 'Normal',
  },
  [SN_B]: {
    sysSn: SN_B,
    popv: 4.5,
    minv: 'SMILE-G3-S5-INV',
    poinv: 5.0,
    cobat: 0,
    mbat: '',
    surplusCobat: 0,
    usCapacity: 0,
    emsStatus: 'Normal',
  },
};

/**
 * @description The local date and minutes of an instant in Paris.
 * @param {number} instant - ms.
 * @returns {{ date: string, minutes: number }} "2026-10-23", minutes since midnight.
 */
function paris(instant) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: TZ,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
      .formatToParts(new Date(instant))
      .map((part) => [part.type, part.value]),
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

/**
 * @description The solar power of a made-up autumn day at a minute of the day.
 * @param {number} minutes - Minutes since midnight.
 * @param {number} peak - Watts at noon-ish.
 * @returns {number} Watts.
 */
function solarAt(minutes, peak) {
  const start = 8 * 60;
  const end = 18 * 60 + 30;
  if (minutes <= start || minutes >= end) return 0;
  return Math.round(peak * Math.sin((Math.PI * (minutes - start)) / (end - start)));
}

/**
 * @description Start the fake Alpha ESS.
 * @param {object} [options] - `{ now }`: `() => number`, the clock of the test.
 * @returns {Promise<object>} `{ url, calls, power, energy, refuse, close, … }`.
 */
async function startFakeAlphaEss({ now = () => NOW } = {}) {
  const calls = [];
  const refusals = new Map();
  const bound = new Set([SN_A, SN_B]);
  const fake = {
    calls,
    bound,
    // The power now of each system, as getLastPowerData gives it (W, %).
    power: {
      [SN_A]: { ppv: 4200, pload: 1300, pgrid: -1900, pbat: -1000, soc: 72.0, pev: 0 },
      [SN_B]: { ppv: 2100, pload: 900, pgrid: -1200, pbat: 0, soc: 0, pev: 0 },
    },
    // The energies of a day: `[sn][date]`, else made up from the date.
    energy: {},
    summary: {
      [SN_A]: {
        epvtoday: 14.6,
        epvtotal: null,
        eload: 9.8,
        eoutput: 6.1,
        einput: 1.4,
        echarge: 5.2,
        edischarge: 2.3,
        todayIncome: null,
        totalIncome: null,
        eselfConsumption: 0.58,
        eselfSufficiency: 0.857,
        treeNum: null,
        carbonNum: null,
        moneyType: null,
      },
      [SN_B]: { epvtoday: 7.1, eload: 6.0, eoutput: 3.2, einput: 2.1 },
    },
    charge: {
      [SN_A]: {
        gridCharge: 0,
        timeChaf1: '01:00',
        timeChae1: '05:00',
        timeChaf2: '00:00',
        timeChae2: '00:00',
        batHighCap: 90,
      },
    },
    discharge: {
      [SN_A]: {
        ctrDis: 0,
        timeDisf1: '00:00',
        timeDise1: '00:00',
        timeDisf2: '00:00',
        timeDise2: '00:00',
        batUseCap: 10,
      },
    },
    evChargers: { [SN_A]: [{ evchargerSn: EV_SN, evchargerModel: 'SMILE-EVCT11' }], [SN_B]: [] },
    evStatus: { [EV_SN]: 1 },
    codesSent: [],
    /**
     * @description Answer a return code instead of the data.
     * @param {string} endpoint - The endpoint, or '*' for all.
     * @param {number} code - The return code.
     * @param {object} [options] - `{ times, sn }`: how many answers (Infinity), one system only.
     */
    refuse(endpoint, code, { times = Infinity, sn } = {}) {
      refusals.set(endpoint, { code, times, sn });
    },
    /**
     * @description Answer normally again.
     * @param {string} [endpoint] - The endpoint (all when absent).
     */
    accept(endpoint) {
      if (endpoint) refusals.delete(endpoint);
      else refusals.clear();
    },
  };

  /**
   * @description The energies of a day of a system.
   * @param {string} sn - The system.
   * @param {string} date - "2026-10-23".
   * @returns {object} The data.
   */
  function energyOf(sn, date) {
    const given = fake.energy[sn]?.[date];
    if (given) return { sysSn: sn, theDate: date, ...given };
    const today = paris(now()).date;
    const share = date < today ? 1 : Math.min(1, paris(now()).minutes / (24 * 60));
    const day = Number(date.slice(8, 10));
    const round = (value) => Math.round(value * share * 100) / 100;
    return {
      sysSn: sn,
      theDate: date,
      epv: round(12 + (day % 5)),
      eCharge: sn === SN_A ? round(5) : 0,
      eDischarge: sn === SN_A ? round(4) : 0,
      eGridCharge: 0,
      eInput: round(3 + (day % 3)),
      eOutput: round(4),
      eChargingPile: 0,
    };
  }

  /**
   * @description The answer of an endpoint.
   * @param {string} endpoint - The endpoint.
   * @param {object} params - Query or body.
   * @returns {{ code: number, data?: unknown, msg?: string, expMsg?: string }} The answer.
   */
  function answer(endpoint, params) {
    const sn = params.sysSn;
    const needsSystem = endpoint !== 'getEssList' && endpoint !== 'getVerificationCode';
    if (endpoint !== 'bindSn' && needsSystem && !bound.has(sn)) {
      return SYSTEMS[sn] || sn === SN_UNBOUND
        ? { code: 6005, msg: 'This appId is not bound to the SN' }
        : { code: 6038, msg: 'system sn does not exist' };
    }
    switch (endpoint) {
      case 'getEssList':
        return { code: 200, data: [...bound].filter((s) => SYSTEMS[s]).map((s) => SYSTEMS[s]) };
      case 'getLastPowerData': {
        const p = fake.power[sn];
        return {
          code: 200,
          data: {
            ppv: p.ppv,
            ppvDetail: { ppv1: p.ppv / 2, ppv2: p.ppv / 2, ppv3: 0, ppv4: 0, pmeterDc: 0 },
            soc: p.soc,
            pev: p.pev,
            pevDetail: {
              ev1Power: sn === SN_A ? p.pev : null,
              ev2Power: null,
              ev3Power: null,
              ev4Power: null,
            },
            prealL1: p.pload,
            prealL2: 0,
            prealL3: 0,
            pgrid: p.pgrid,
            pgridDetail: { pmeterL1: p.pgrid, pmeterL2: 0, pmeterL3: 0 },
            pload: p.pload,
            pbat: p.pbat,
          },
        };
      }
      case 'getOneDateEnergyBySn':
        if (!/^\d{4}-\d{2}-\d{2}$/.test(params.queryDate ?? '')) {
          return { code: 6001, msg: 'Parameter error' };
        }
        return { code: 200, data: energyOf(sn, params.queryDate) };
      case 'getSumDataForCustomer':
        return { code: 200, data: fake.summary[sn] ?? null };
      case 'getOneDayPowerBySn': {
        const { date, minutes } = paris(now());
        if (params.queryDate !== date) return { code: 200, data: [] };
        const data = [];
        for (let m = 0; m <= minutes; m += 5) {
          const hh = String(Math.floor(m / 60)).padStart(2, '0');
          const mm = String(m % 60).padStart(2, '0');
          const pv = solarAt(m, sn === SN_A ? 5200 : 2600);
          // A quiet night, breakfast at 7:30, lunch at 12:30.
          const meal = (at) => 1400 * Math.exp(-(((m - at) / 25) ** 2));
          const load = Math.round(380 + 60 * Math.sin(m / 37) + meal(7.5 * 60) + meal(12.5 * 60));
          const soc = Math.min(100, Math.max(12, m < 9 * 60 ? 30 - m / 20 : 12 + (m - 540) / 4));
          data.push({
            sysSn: sn,
            uploadTime: `${date} ${hh}:${mm}:04`,
            ppv: pv,
            load,
            cbat: Math.round(soc * 10) / 10,
            // The battery covers the night until 12 %, then the grid.
            feedIn: Math.max(0, pv - load - 1500),
            gridCharge: soc <= 12 && pv < load ? load - pv : 0,
            pchargingPile: 0,
          });
        }
        return { code: 200, data };
      }
      case 'getChargeConfigInfo':
        return fake.charge[sn]
          ? { code: 200, data: fake.charge[sn] }
          : { code: 6017, msg: 'No operation permissions' };
      case 'getDisChargeConfigInfo':
        return fake.discharge[sn]
          ? { code: 200, data: fake.discharge[sn] }
          : { code: 6017, msg: 'No operation permissions' };
      case 'updateChargeConfigInfo':
      case 'updateDisChargeConfigInfo': {
        const charge = endpoint === 'updateChargeConfigInfo';
        const keys = charge
          ? ['batHighCap', 'gridCharge', 'timeChaf1', 'timeChae1', 'timeChaf2', 'timeChae2']
          : ['batUseCap', 'ctrDis', 'timeDisf1', 'timeDise1', 'timeDisf2', 'timeDise2'];
        if (keys.some((key) => params[key] === undefined || params[key] === null)) {
          return { code: 6001, msg: 'Parameter error' };
        }
        const stored = Object.fromEntries(keys.map((key) => [key, params[key]]));
        if (charge) fake.charge[sn] = stored;
        else fake.discharge[sn] = stored;
        return { code: 200, data: null };
      }
      case 'getEvChargerConfigList':
        return { code: 200, data: fake.evChargers[sn] ?? [] };
      case 'getEvChargerStatusBySn':
        return { code: 200, data: { evchargerStatus: fake.evStatus[params.evchargerSn] } };
      case 'remoteControlEvCharger':
        if (![0, 1].includes(params.controlMode)) return { code: 6001, msg: 'Parameter error' };
        fake.evStatus[params.evchargerSn] = params.controlMode === 1 ? 3 : 6;
        return { code: 200, data: null };
      case 'getVerificationCode':
        if (!SYSTEMS[sn] && sn !== SN_UNBOUND)
          return { code: 6038, msg: 'system sn does not exist' };
        if (params.checkCode !== CHECK_CODE) return { code: 6004, msg: 'CheckCode error' };
        fake.codesSent.push(sn);
        return { code: 200, data: null };
      case 'bindSn':
        if (bound.has(sn)) return { code: 6003, msg: 'You have bound this SN' };
        if (params.code !== BIND_CODE || !fake.codesSent.includes(sn)) {
          return { code: 6046, msg: 'The verification code is incorrect or expired' };
        }
        bound.add(sn);
        SYSTEMS[sn] ??= { ...SYSTEMS[SN_B], sysSn: sn };
        fake.power[sn] ??= { ...fake.power[SN_B] };
        return { code: 200, data: null };
      default:
        return { code: 6001, msg: 'Parameter error' };
    }
  }

  const server = createServer((request, response) => {
    const chunks = [];
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => {
      const url = new URL(request.url, 'http://localhost');
      const endpoint = url.pathname.replace(/^\/api\//, '');
      const headers = request.headers;
      let body = {};
      if (chunks.length) {
        try {
          body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        } catch {
          body = {};
        }
      }
      const query = Object.fromEntries(url.searchParams);
      const params = request.method === 'GET' ? query : body;
      calls.push({
        endpoint,
        method: request.method,
        url: request.url,
        params,
        appId: headers.appid,
        timeStamp: headers.timestamp,
        sign: headers.sign,
        userAgent: headers['user-agent'],
        contentType: headers['content-type'],
      });
      const send = (status, value) => {
        response.writeHead(status, { 'content-type': 'application/json' });
        response.end(JSON.stringify(value));
      };
      if (!METHODS[endpoint]) {
        send(404, { status: 404, error: 'Not Found', path: url.pathname });
        return;
      }
      if (METHODS[endpoint] !== request.method) {
        send(405, {
          timestamp: new Date(now()).toISOString(),
          status: 405,
          error: 'Method Not Allowed',
          path: url.pathname,
        });
        return;
      }
      if (!headers.appid) return send(200, { code: 6012, msg: 'AppId is empty' });
      if (!headers.timestamp) return send(200, { code: 6011, msg: 'timestamp is empty' });
      if (!headers.sign) return send(200, { code: 6010, msg: 'Sign is empty' });
      const expected = createHash('sha512')
        .update(`${headers.appid}${SECRET}${headers.timestamp}`)
        .digest('hex');
      if (headers.appid !== APP_ID || headers.sign !== expected) {
        // The live answer to an unknown AppID: no data, no expMsg.
        return send(200, { code: 6007, msg: 'Sign check error' });
      }
      if (Math.abs(Number(headers.timestamp) * 1000 - now()) > 300 * 1000) {
        return send(200, { code: 6006, msg: 'Timestamp error' });
      }
      const refusal = refusals.get(endpoint) ?? refusals.get('*');
      if (refusal && refusal.times > 0 && (!refusal.sn || refusal.sn === params.sysSn)) {
        refusal.times -= 1;
        return send(200, {
          code: refusal.code,
          msg: 'refused by the test',
          expMsg: null,
          data: null,
          extra: null,
        });
      }
      const result = answer(endpoint, params);
      send(200, {
        code: result.code,
        msg: result.code === 200 ? 'Success' : result.msg,
        expMsg: null,
        data: result.data ?? null,
        extra: null,
      });
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  fake.url = `http://127.0.0.1:${server.address().port}/api`;
  fake.close = () => new Promise((resolve) => server.close(resolve));
  return fake;
}

export {
  startFakeAlphaEss,
  dataDir,
  silent,
  paris,
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
};

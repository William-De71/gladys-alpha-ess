// -----------------------------------------------------------------------------
// HTTP client of the Alpha ESS Open API (https://open.alphaess.com, base
// https://openapi.alphaess.com/api). The endpoints used, with the verb the live
// API enforces (another verb answers HTTP 405):
//
//   GET  getEssList                                   the systems bound to the AppID
//   GET  getLastPowerData          sysSn              the power now (W), the SOC (%)
//   GET  getOneDateEnergyBySn      sysSn, queryDate   the energies of a day (kWh)
//   GET  getSumDataForCustomer     sysSn              the totals of today (kWh)
//   GET  getOneDayPowerBySn        sysSn, queryDate   the powers of a day (~5 min)
//   GET  getChargeConfigInfo       sysSn              charge from the grid settings
//   GET  getDisChargeConfigInfo    sysSn              discharge time control settings
//   POST updateChargeConfigInfo    7 fields           full replacement, data null
//   POST updateDisChargeConfigInfo 7 fields           full replacement, data null
//   GET  getEvChargerConfigList    sysSn              the EV chargers of a system
//   GET  getEvChargerStatusBySn    sysSn, evchargerSn the state of a charger (1..9)
//   POST remoteControlEvCharger    sysSn, evchargerSn, controlMode (1 start, 0 stop)
//   GET  getVerificationCode       sysSn, checkCode   e-mails a code to the owner
//   POST bindSn                    sysSn, code        binds a system to the AppID
//
// Every request carries the headers `appId`, `timeStamp` (Unix seconds, within
// 300 s of the server clock) and `sign` = SHA-512(appId + appSecret +
// timeStamp) in lower-case hexadecimal: the secret itself never travels.
// Answers are `{ code, msg, expMsg, data, extra }`; success is `code: 200`
// (`data` may be null or []), anything else a return code of the portal. A
// wrong AppID answers HTTP 200 `{"code":6007,"msg":"Sign check error"}` with no
// `data` at all (checked live on 2026-10-23). `msg` is localized by the portal:
// only `code` is read.
//
// Alpha ESS advises 10 seconds at least between two calls and answers 6053
// ("The request was too fast") past it: one request at a time, spaced, the
// writes of the scenes before the readings; after a 6053 the spacing doubles
// (one minute at most) and comes back slowly.
// -----------------------------------------------------------------------------

import { createHash } from 'node:crypto';

const BASE_URL = 'https://openapi.alphaess.com/api';
const TIMEOUT_MS = 20000;
const SPACING_MS = 10000;
const MAX_SPACING_MS = 60000;
// After a 6053, the spacing goes back to normal after this much calm.
const CALM_MS = 30 * 60 * 1000;
const PRIORITY = { READ: 0, WRITE: 1 };

// The return codes of the portal (Development Management → Return Code
// Description), plus 6017 and 10001 the live API returns without publishing
// them (documented by the reference library alphaess-openAPI, MIT).
const KINDS = {
  6001: 'invalid',
  6002: 'not_bound',
  6003: 'already_bound',
  6004: 'bad_check_code',
  6005: 'not_bound',
  6006: 'clock',
  6007: 'auth',
  6008: 'set_failed',
  6009: 'whitelist',
  6010: 'auth',
  6011: 'clock',
  6012: 'auth',
  6016: 'not_found',
  6017: 'forbidden',
  6026: 'server',
  6029: 'set_failed',
  6038: 'not_bound',
  6042: 'offline',
  6046: 'bad_code',
  6053: 'rate_limit',
  10001: 'invalid',
};
// The kinds that are about the AppID itself, not one system.
const ACCOUNT_KINDS = ['auth', 'clock', 'whitelist'];

/**
 * @description An error of the Alpha ESS API.
 */
class AlphaEssError extends Error {
  /**
   * @param {string} kind - See KINDS, or `http`, `unreachable`, `failed`.
   * @param {string} message - What went wrong (never the secret).
   * @param {object} [extra] - `{ code, endpoint, status, detail }`.
   */
  constructor(kind, message, extra = {}) {
    super(message);
    this.name = 'AlphaEssError';
    this.kind = kind;
    Object.assign(this, extra);
  }
}

/**
 * @description The kind of a return code.
 * @param {number} code - The `code` of an answer.
 * @returns {string} The kind (`failed` for an unknown code).
 */
const kindOfCode = (code) => KINDS[code] ?? 'failed';

/**
 * @description The signature of a request.
 * @param {string} appId - The AppID.
 * @param {string} appSecret - The AppSecret.
 * @param {string} timeStamp - Unix seconds.
 * @returns {string} SHA-512, lower-case hexadecimal.
 * @example
 * sign('alphaef7900ee81dbbce9', 'c2d2ef6c047c49678e2c332fb2d74c3c', '1676353875'); // '0f023c22…'
 */
function sign(appId, appSecret, timeStamp) {
  return createHash('sha512').update(`${appId}${appSecret}${timeStamp}`, 'utf8').digest('hex');
}

/**
 * @description The Alpha ESS client.
 * @param {object} options - Options.
 * @param {Function} options.getCredentials - `() => ({ appId, appSecret })`.
 * @param {string} options.userAgent - The User-Agent of every request.
 * @param {Function} [options.fetch] - The fetch implementation (tests).
 * @param {string} [options.baseUrl] - The API root (tests).
 * @param {number} [options.spacingMs] - Minimum time between two requests.
 * @param {Function} [options.now] - `() => number` in ms.
 * @param {Function} [options.sleep] - `(ms) => Promise` (tests).
 * @returns {object} The client.
 */
function createAlphaEssClient({
  getCredentials,
  userAgent,
  fetch: fetchFn = globalThis.fetch,
  baseUrl = BASE_URL,
  spacingMs = SPACING_MS,
  now = () => Date.now(),
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}) {
  const waiting = [];
  let sequence = 0;
  let running = false;
  let lastEnd = 0;
  let slowFactor = 1;
  let slowSince = 0;
  let pausedUntil = 0;
  let requests = 0;

  /**
   * @description The spacing between two requests now.
   * @returns {number} Milliseconds.
   */
  function spacing() {
    if (slowFactor > 1 && now() - slowSince >= CALM_MS) {
      slowFactor = Math.max(1, slowFactor / 2);
      slowSince = now();
    }
    return Math.min(spacingMs * slowFactor, Math.max(spacingMs, MAX_SPACING_MS));
  }

  /**
   * @description Run the waiting requests one by one, writes first.
   * @returns {Promise<void>}
   */
  async function pump() {
    if (running) {
      return;
    }
    running = true;
    try {
      while (waiting.length) {
        waiting.sort((a, b) => b.priority - a.priority || a.sequence - b.sequence);
        const job = waiting.shift();
        // The pause after a 6053 holds the readings, not what a user asked for.
        const floor = job.priority === PRIORITY.READ ? pausedUntil : 0;
        const wait = Math.max(lastEnd + spacing(), floor) - now();
        if (wait > 0) {
          await sleep(wait);
        }
        try {
          job.resolve(await job.run());
        } catch (err) {
          job.reject(err);
        } finally {
          lastEnd = now();
        }
      }
    } finally {
      running = false;
    }
  }

  /**
   * @description Queue a request.
   * @param {Function} run - `() => Promise`.
   * @param {number} priority - PRIORITY.READ or PRIORITY.WRITE.
   * @returns {Promise<unknown>} Its result.
   */
  function enqueue(run, priority) {
    return new Promise((resolve, reject) => {
      waiting.push({ run, priority, resolve, reject, sequence: (sequence += 1) });
      pump();
    });
  }

  /**
   * @description Send one request now.
   * @param {string} method - GET or POST.
   * @param {string} endpoint - The endpoint name.
   * @param {object} [params] - Query (GET) or JSON body (POST).
   * @returns {Promise<unknown>} The `data` of the answer (null when absent).
   */
  async function send(method, endpoint, params = {}) {
    const { appId, appSecret } = getCredentials();
    if (!appId || !appSecret) {
      throw new AlphaEssError('auth', 'AppID or AppSecret missing', { endpoint });
    }
    const timeStamp = String(Math.floor(now() / 1000));
    const headers = {
      appId,
      timeStamp,
      sign: sign(appId, appSecret, timeStamp),
      accept: 'application/json',
      'user-agent': userAgent,
    };
    let url = `${baseUrl}/${endpoint}`;
    const init = { method, headers, signal: AbortSignal.timeout(TIMEOUT_MS) };
    if (method === 'GET') {
      const query = new URLSearchParams(
        Object.entries(params).filter(([, value]) => value !== undefined && value !== null),
      ).toString();
      if (query) url += `?${query}`;
    } else {
      headers['content-type'] = 'application/json';
      init.body = JSON.stringify(params);
    }
    requests += 1;
    let response;
    try {
      response = await fetchFn(url, init);
    } catch (err) {
      throw new AlphaEssError('unreachable', `Alpha ESS unreachable: ${err.message}`, {
        endpoint,
      });
    }
    const text = await response.text().catch(() => '');
    if (!response.ok) {
      throw new AlphaEssError(
        response.status >= 500 ? 'server' : 'http',
        `HTTP ${response.status} on ${endpoint}`,
        { endpoint, status: response.status },
      );
    }
    let answer;
    try {
      answer = JSON.parse(text);
    } catch {
      throw new AlphaEssError('failed', `Unexpected answer of ${endpoint}`, { endpoint });
    }
    const code = Number(answer?.code);
    if (code === 200) {
      return answer.data ?? null;
    }
    const kind = kindOfCode(code);
    if (kind === 'rate_limit') {
      slowFactor = Math.min(slowFactor * 2, MAX_SPACING_MS / Math.max(spacingMs, 1));
      slowSince = now();
      pausedUntil = now() + Math.max(spacingMs, 60 * 1000);
    }
    const detail = String(answer?.expMsg ?? answer?.msg ?? '').slice(0, 200);
    throw new AlphaEssError(
      kind,
      `Alpha ESS ${code} on ${endpoint}${detail ? `: ${detail}` : ''}`,
      {
        code,
        endpoint,
        detail,
      },
    );
  }

  const read = (endpoint, params) => enqueue(() => send('GET', endpoint, params), PRIORITY.READ);
  const write = (endpoint, body) => enqueue(() => send('POST', endpoint, body), PRIORITY.WRITE);

  return {
    getEssList: () => read('getEssList'),
    getLastPowerData: (sysSn) => read('getLastPowerData', { sysSn }),
    getOneDateEnergyBySn: (sysSn, queryDate) => read('getOneDateEnergyBySn', { sysSn, queryDate }),
    getSumDataForCustomer: (sysSn) => read('getSumDataForCustomer', { sysSn }),
    getOneDayPowerBySn: (sysSn, queryDate) => read('getOneDayPowerBySn', { sysSn, queryDate }),
    getChargeConfigInfo: (sysSn) => read('getChargeConfigInfo', { sysSn }),
    getDisChargeConfigInfo: (sysSn) => read('getDisChargeConfigInfo', { sysSn }),
    getEvChargerConfigList: (sysSn) => read('getEvChargerConfigList', { sysSn }),
    getEvChargerStatusBySn: (sysSn, evchargerSn) =>
      read('getEvChargerStatusBySn', { sysSn, evchargerSn }),
    // The configuration screen and the scenes: before the readings.
    readNow: (endpoint, params) => enqueue(() => send('GET', endpoint, params), PRIORITY.WRITE),
    updateChargeConfigInfo: (body) => write('updateChargeConfigInfo', body),
    updateDisChargeConfigInfo: (body) => write('updateDisChargeConfigInfo', body),
    remoteControlEvCharger: (sysSn, evchargerSn, controlMode) =>
      write('remoteControlEvCharger', { sysSn, evchargerSn, controlMode }),
    getVerificationCode: (sysSn, checkCode) =>
      enqueue(() => send('GET', 'getVerificationCode', { sysSn, checkCode }), PRIORITY.WRITE),
    bindSn: (sysSn, code) => write('bindSn', { sysSn, code }),
    /**
     * @description Until when Alpha ESS asked to slow down (0: not paused).
     * @returns {number} The instant (ms).
     */
    pausedUntil: () => (pausedUntil > now() ? pausedUntil : 0),
    /**
     * @description The spacing between two requests now.
     * @returns {number} Milliseconds.
     */
    spacing,
    /**
     * @description How many requests were sent since the start.
     * @returns {number} The count.
     */
    requests: () => requests,
    /**
     * @description How many requests wait.
     * @returns {number} The count.
     */
    backlog: () => waiting.length,
  };
}

export {
  BASE_URL,
  SPACING_MS,
  KINDS,
  ACCOUNT_KINDS,
  AlphaEssError,
  kindOfCode,
  sign,
  createAlphaEssClient,
};

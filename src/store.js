// -----------------------------------------------------------------------------
// What the integration keeps across restarts, under /data (the only writable
// place of the container), in /data/alpha-ess.json:
//
//   - `systems`       the systems of getEssList (model, battery, capacity) and
//                     when the list was read (`listAt`);
//   - `states`        per sysSn: the last power, the energies of today, the
//                     totals, the battery settings, the curve of the day, the
//                     energy indexes being built (energy.js), the EV chargers,
//                     when each reading ran, what the triggers know (`seen`);
//   - `accessRefused` why Alpha ESS refuses the AppID, or null (the trigger
//                     fires once per refusal);
//   - `lastError`     the last error of a reading (diagnostic).
// Neither the AppID secret nor a signature is ever written there.
// -----------------------------------------------------------------------------

import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const DEFAULT_DIR = '/data';
const FILE = 'alpha-ess.json';
const EMPTY = () => ({
  systems: [],
  listAt: 0,
  states: {},
  accessRefused: null,
  lastError: null,
});

/**
 * @description Read a JSON file; an absent or broken file is null.
 * @param {string} path - The file.
 * @param {object} [logger] - Logger.
 * @returns {Promise<object|null>} The value.
 */
async function readJson(path, logger) {
  try {
    const value = JSON.parse(await readFile(path, 'utf8'));
    return value && typeof value === 'object' ? value : null;
  } catch (err) {
    if (err.code !== 'ENOENT') {
      logger?.warn(`Unable to read ${path}: ${err.message}`);
    }
    return null;
  }
}

/**
 * @description Write a JSON file atomically (a temporary file, then a rename).
 * @param {string} path - The file.
 * @param {object} value - The value.
 * @param {object} [logger] - Logger.
 * @returns {Promise<void>}
 */
async function writeJson(path, value, logger) {
  try {
    await mkdir(dirname(path), { recursive: true });
    const temporary = `${path}.tmp`;
    await writeFile(temporary, JSON.stringify(value));
    await rename(temporary, path);
  } catch (err) {
    logger?.warn(`Unable to write ${path}: ${err.message}`);
  }
}

/**
 * @description The store.
 * @param {object} [options] - `{ dir, logger }`.
 * @returns {object} `{ data, load, save }`.
 */
function createStore({ dir = DEFAULT_DIR, logger } = {}) {
  const path = join(dir, FILE);
  let writing = Promise.resolve();
  const store = {
    data: EMPTY(),
    /**
     * @description Read the file.
     * @returns {Promise<void>}
     */
    async load() {
      const raw = (await readJson(path, logger)) ?? {};
      const part = (value) => (value && typeof value === 'object' ? value : {});
      store.data.systems = Array.isArray(raw.systems) ? raw.systems : [];
      store.data.listAt = Number.isFinite(raw.listAt) ? raw.listAt : 0;
      store.data.states = { ...part(raw.states) };
      store.data.accessRefused =
        raw.accessRefused && typeof raw.accessRefused === 'object' ? raw.accessRefused : null;
      store.data.lastError =
        raw.lastError && typeof raw.lastError === 'object' ? raw.lastError : null;
    },
    /**
     * @description Write the state (one write at a time).
     * @returns {Promise<void>}
     */
    save() {
      writing = writing.then(() => writeJson(path, store.data, logger));
      return writing;
    },
  };
  return store;
}

export { DEFAULT_DIR, FILE, createStore };

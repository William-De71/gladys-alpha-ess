// -----------------------------------------------------------------------------
// Energy indexes built from the energies of each day.
//
// The Open API gives no lifetime meter that can be trusted: getOneDateEnergyBySn
// gives the energies of one day (PV, grid import, grid export, battery charge,
// battery discharge, kWh), and the lifetime production of getSumDataForCustomer
// is often null. Gladys wants cumulative indexes (grid-sensor input-index and
// output-index, battery-storage charge-index and discharge-index,
// energy-production-sensor index), so the integration adds the days up itself:
//
//   index = the finished days counted so far + the value of today.
//
// The index starts at 0 on the first day the integration runs (it is not the
// meter of the inverter) and never goes down: a value of today lower than one
// already seen is ignored (the cloud sometimes answers 0 for a moment). When the
// date changes, the last value seen of the day before is counted at once, and
// the day before is read again later to add what came after it (and so are the
// days the integration missed, a week at most).
// -----------------------------------------------------------------------------

import { addDays } from './time.js';

const INDEX_KEYS = ['pv', 'input', 'output', 'charge', 'discharge'];
const CATCH_UP_DAYS = 7;

/**
 * @description An empty energy state.
 * @returns {object} `{ date, today, base, pending }`.
 */
const emptyEnergy = () => ({
  date: null,
  today: {},
  base: Object.fromEntries(INDEX_KEYS.map((key) => [key, 0])),
  pending: [],
});

/**
 * @description Make a stored energy state safe to use.
 * @param {unknown} raw - What /data held.
 * @returns {object} The state.
 */
function normalizeEnergy(raw) {
  const state = emptyEnergy();
  if (!raw || typeof raw !== 'object') {
    return state;
  }
  state.date = typeof raw.date === 'string' ? raw.date : null;
  for (const key of INDEX_KEYS) {
    const base = Number(raw.base?.[key]);
    state.base[key] = Number.isFinite(base) && base > 0 ? base : 0;
    const today = Number(raw.today?.[key]);
    if (Number.isFinite(today) && today >= 0) state.today[key] = today;
  }
  state.pending = Array.isArray(raw.pending)
    ? raw.pending.filter((entry) => typeof entry?.date === 'string').slice(-CATCH_UP_DAYS)
    : [];
  return state;
}

/**
 * @description Count the energies read for a day.
 * @param {object} state - The energy state (changed in place).
 * @param {string} date - The day read ("2026-10-23").
 * @param {object} values - parseDayEnergy() of that day.
 * @returns {boolean} True when an index moved.
 */
function addDayEnergy(state, date, values) {
  if (!values || !date) {
    return false;
  }
  const read = (key) => (Number.isFinite(values[key]) && values[key] >= 0 ? values[key] : null);
  if (state.date === null || date === state.date) {
    state.date = date;
    let moved = false;
    for (const key of INDEX_KEYS) {
      const value = read(key);
      if (value !== null && value > (state.today[key] ?? 0)) {
        state.today[key] = value;
        moved = true;
      } else if (value !== null && state.today[key] === undefined) {
        state.today[key] = value;
      }
    }
    return moved;
  }
  if (date > state.date) {
    // A new day: the last values of the old one are counted now, the rest later.
    const pending = [{ date: state.date, counted: { ...state.today } }];
    for (const key of INDEX_KEYS) {
      state.base[key] += state.today[key] ?? 0;
    }
    for (let day = addDays(state.date, 1); day < date; day = addDays(day, 1)) {
      pending.push({ date: day, counted: {} });
    }
    const oldest = addDays(date, -CATCH_UP_DAYS);
    state.pending = [...state.pending, ...pending].filter((entry) => entry.date >= oldest);
    state.date = date;
    state.today = {};
    addDayEnergy(state, date, values);
    return true;
  }
  // A day already over, read again: add what came after the last value seen.
  const index = state.pending.findIndex((entry) => entry.date === date);
  if (index < 0) {
    return false;
  }
  const { counted } = state.pending[index];
  let moved = false;
  for (const key of INDEX_KEYS) {
    const value = read(key);
    const extra = value === null ? 0 : value - (counted[key] ?? 0);
    if (extra > 0) {
      state.base[key] += extra;
      moved = true;
    }
  }
  state.pending.splice(index, 1);
  return moved;
}

/**
 * @description The day to read again, if any.
 * @param {object} state - The energy state.
 * @returns {string|null} The oldest pending day.
 */
const pendingDay = (state) => state.pending[0]?.date ?? null;

/**
 * @description Forget a day that cannot be read again (refused for good).
 * @param {object} state - The energy state (changed in place).
 * @param {string} date - The day.
 */
function dropPending(state, date) {
  state.pending = state.pending.filter((entry) => entry.date !== date);
}

/**
 * @description The indexes now, kWh.
 * @param {object} state - The energy state.
 * @returns {object|null} `{ pv, input, output, charge, discharge }`, null
 * before the first reading.
 */
function indexesOf(state) {
  if (state.date === null) {
    return null;
  }
  return Object.fromEntries(
    INDEX_KEYS.map((key) => [
      key,
      Math.round((state.base[key] + (state.today[key] ?? 0)) * 1000) / 1000,
    ]),
  );
}

export {
  INDEX_KEYS,
  CATCH_UP_DAYS,
  emptyEnergy,
  normalizeEnergy,
  addDayEnergy,
  pendingDay,
  dropPending,
  indexesOf,
};

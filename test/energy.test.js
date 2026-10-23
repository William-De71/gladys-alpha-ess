import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  emptyEnergy,
  normalizeEnergy,
  addDayEnergy,
  pendingDay,
  dropPending,
  indexesOf,
} from '../src/energy.js';

const day = (pv, input = 0, output = 0, charge = 0, discharge = 0) => ({
  pv,
  input,
  output,
  charge,
  discharge,
});

test('the first day: the index is the value of today, and never goes down', () => {
  const state = emptyEnergy();
  assert.equal(indexesOf(state), null);
  addDayEnergy(state, '2026-10-23', day(3, 1, 0.5, 2, 1));
  addDayEnergy(state, '2026-10-23', day(5, 1.2, 0.5, 2, 1));
  // A 0 for a moment (the cloud does that): ignored.
  addDayEnergy(state, '2026-10-23', day(0, 0, 0, 0, 0));
  assert.deepEqual(indexesOf(state), { pv: 5, input: 1.2, output: 0.5, charge: 2, discharge: 1 });
});

test('a new day: the last value of the day before is counted, the rest when read again', () => {
  const state = emptyEnergy();
  addDayEnergy(state, '2026-10-23', day(10, 2));
  addDayEnergy(state, '2026-10-24', day(0.1, 0.3));
  assert.deepEqual(indexesOf(state), { pv: 10.1, input: 2.3, output: 0, charge: 0, discharge: 0 });
  assert.equal(pendingDay(state), '2026-10-23');
  // The end of the 23rd, read after midnight: 0.4 kWh more of PV.
  addDayEnergy(state, '2026-10-23', day(10.4, 2));
  assert.deepEqual(indexesOf(state).pv, 10.5);
  assert.equal(pendingDay(state), null);
  // Read again once more: nothing counted twice.
  assert.equal(addDayEnergy(state, '2026-10-23', day(10.4, 2)), false);
  assert.equal(indexesOf(state).pv, 10.5);
});

test('days missed while stopped are read again (a week at most)', () => {
  const state = emptyEnergy();
  addDayEnergy(state, '2026-10-01', day(10));
  addDayEnergy(state, '2026-10-12', day(1));
  assert.deepEqual(
    state.pending.map((entry) => entry.date),
    [
      '2026-10-05',
      '2026-10-06',
      '2026-10-07',
      '2026-10-08',
      '2026-10-09',
      '2026-10-10',
      '2026-10-11',
    ],
  );
  // The 1st was counted at the change of day even though too old to read again.
  assert.equal(indexesOf(state).pv, 11);
  addDayEnergy(state, '2026-10-05', day(8));
  dropPending(state, '2026-10-06');
  assert.equal(indexesOf(state).pv, 19);
  assert.equal(pendingDay(state), '2026-10-07');
});

test('a stored state is made safe: negative or broken values dropped', () => {
  const state = normalizeEnergy({
    date: '2026-10-23',
    base: { pv: 120.5, input: -3, output: 'x' },
    today: { pv: 2 },
    pending: [{ date: '2026-10-22', counted: { pv: 1 } }, { nope: true }],
  });
  assert.deepEqual(indexesOf(state), { pv: 122.5, input: 0, output: 0, charge: 0, discharge: 0 });
  assert.equal(state.pending.length, 1);
  assert.deepEqual(indexesOf(normalizeEnergy(null)), null);
});

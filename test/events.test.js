import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TRIGGERS,
  detectPower,
  detectOffline,
  classifyGrid,
  OFFLINE_AFTER_MS,
} from '../src/events.js';

/**
 * @description Feed readings one by one, collect the triggers.
 * @param {object[]} readings - parsePower() values.
 * @param {object} [options] - detectPower options.
 * @returns {string[][]} The triggers of each reading.
 */
function run(readings, options) {
  let seen = {};
  return readings.map((power) => {
    const { events, next } = detectPower(seen, power, options);
    seen = next;
    return events;
  });
}

test('never a trigger at the first reading', () => {
  assert.deepEqual(run([{ soc: 100, grid: -3000 }]), [[]]);
  assert.deepEqual(run([{ soc: 5, grid: 3000 }]), [[]]);
});

test('battery full once at 100 %, again after going under 95 %', () => {
  const events = run([90, 99, 100, 99.6, 97, 100, 94, 100].map((soc) => ({ soc })));
  assert.deepEqual(events, [
    [],
    [],
    [TRIGGERS.BATTERY_FULL],
    [],
    [],
    [],
    [],
    [TRIGGERS.BATTERY_FULL],
  ]);
});

test('battery low at the cut-off SOC (+1), rearmed 5 points above; 10 % when unknown', () => {
  const events = run(
    [30, 21, 20, 20, 23, 26, 21].map((soc) => ({ soc })),
    { cutoffSoc: 20 },
  );
  assert.deepEqual(events, [[], [TRIGGERS.BATTERY_LOW], [], [], [], [], [TRIGGERS.BATTERY_LOW]]);
  assert.deepEqual(run([{ soc: 50 }, { soc: 11 }]), [[], [TRIGGERS.BATTERY_LOW]]);
  assert.deepEqual(run([{ soc: 50 }, { soc: 0 }], { battery: false }), [[], []]);
});

test('grid: export / import started after two readings, a band between, no flapping', () => {
  assert.equal(classifyGrid(-250, 'idle'), 'export');
  assert.equal(classifyGrid(120, 'export'), 'export', 'in the band: unchanged');
  assert.equal(classifyGrid(30, 'export'), 'idle');
  const events = run(
    [10, -900, -1200, -1500, 150, -300, -100, 40, 30, 600, 700, 800].map((grid) => ({ grid })),
  );
  assert.deepEqual(events, [
    [],
    [],
    [TRIGGERS.EXPORT_STARTED],
    [],
    [],
    [],
    [],
    [],
    [],
    [],
    [TRIGGERS.IMPORT_STARTED],
    [],
  ]);
});

test('offline after 10 minutes of 6042, online when it answers again', () => {
  const start = 1_000_000;
  let seen = {};
  const step = (reading) => {
    const result = detectOffline(seen, reading);
    seen = result.next;
    return result;
  };
  assert.deepEqual(step({ offline: true, now: start }).events, []);
  assert.deepEqual(step({ offline: true, now: start + OFFLINE_AFTER_MS - 1 }).events, []);
  const offline = step({ offline: true, now: start + OFFLINE_AFTER_MS });
  assert.deepEqual(offline.events, [TRIGGERS.SYSTEM_OFFLINE]);
  assert.equal(offline.minutes, 10);
  assert.deepEqual(step({ offline: true, now: start + 2 * OFFLINE_AFTER_MS }).events, []);
  const back = step({ ok: true, now: start + 3 * OFFLINE_AFTER_MS });
  assert.deepEqual(back.events, [TRIGGERS.SYSTEM_ONLINE]);
  assert.equal(back.minutes, 30);
  // A short blip (under 10 minutes) fires nothing at all.
  step({ offline: true, now: start + 4 * OFFLINE_AFTER_MS });
  assert.deepEqual(step({ ok: true, now: start + 4 * OFFLINE_AFTER_MS + 60000 }).events, []);
});

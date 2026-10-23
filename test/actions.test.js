import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  readSoc,
  readPeriod,
  formatPeriod,
  gridChargeRequest,
  dischargeRequest,
  evCommand,
  ActionError,
} from '../src/actions.js';

const CHARGE = {
  enabled: false,
  maxSoc: 90,
  periods: [
    ['01:00', '05:00'],
    ['00:00', '00:00'],
  ],
};
const DISCHARGE = {
  enabled: false,
  cutoffSoc: 5,
  periods: [
    ['00:00', '00:00'],
    ['00:00', '00:00'],
  ],
};

test('periods on quarter hours, "off", empty keeps; anything else refused', () => {
  assert.deepEqual(readPeriod('01:00-05:00', 'period_1'), ['01:00', '05:00']);
  assert.deepEqual(readPeriod(' 1:15 – 23:45 ', 'period_1'), ['01:15', '23:45']);
  assert.deepEqual(readPeriod('22:30 to 06:00', 'period_1'), ['22:30', '06:00']);
  assert.deepEqual(readPeriod('off', 'period_2'), ['00:00', '00:00']);
  assert.equal(readPeriod('', 'period_1'), null);
  assert.equal(readPeriod(undefined, 'period_1'), null);
  for (const bad of ['01:10-05:00', '24:00-01:00', '01:00', 'tonight', '01:00-05:07']) {
    assert.throws(() => readPeriod(bad, 'period_1'), ActionError, bad);
  }
  assert.equal(formatPeriod(['00:00', '00:00']), 'off');
  assert.equal(formatPeriod(['22:30', '06:00']), '22:30-06:00');
});

test('SOC 10 to 100, empty keeps', () => {
  assert.equal(readSoc('', 'max_soc'), null);
  assert.equal(readSoc(95, 'max_soc'), 95);
  assert.equal(readSoc('80 %', 'max_soc'), 80);
  assert.throws(() => readSoc(5, 'cutoff_soc'), { key: 'errSoc' });
  assert.throws(() => readSoc('101', 'max_soc'), { key: 'errSoc' });
  assert.throws(() => readSoc('lots', 'max_soc'), { key: 'errSoc' });
});

test('charge from the grid: the whole setting is sent, the fields left empty keep their value', () => {
  const request = gridChargeRequest('SN1', CHARGE, { enabled: 'on', period_2: '13:00-14:00' });
  assert.equal(request.changed, true);
  assert.deepEqual(request.body, {
    sysSn: 'SN1',
    batHighCap: 90,
    gridCharge: 1,
    timeChaf1: '01:00',
    timeChae1: '05:00',
    timeChaf2: '13:00',
    timeChae2: '14:00',
  });
  assert.deepEqual(request.next.periods[1], ['13:00', '14:00']);
});

test('a request that changes nothing is marked unchanged (never sent)', () => {
  assert.equal(gridChargeRequest('SN1', CHARGE, { enabled: 'keep' }).changed, false);
  assert.equal(gridChargeRequest('SN1', CHARGE, { enabled: 'off', max_soc: 90 }).changed, false);
  assert.equal(
    gridChargeRequest('SN1', CHARGE, { period_1: '01:00-05:00', period_2: 'off' }).changed,
    false,
  );
});

test('discharge: cut-off SOC kept as read (5 %) unless a new one is given', () => {
  const kept = dischargeRequest('SN1', DISCHARGE, { enabled: 'on', period_1: '17:00-21:00' });
  assert.deepEqual(kept.body, {
    sysSn: 'SN1',
    batUseCap: 5,
    ctrDis: 1,
    timeDisf1: '17:00',
    timeDise1: '21:00',
    timeDisf2: '00:00',
    timeDise2: '00:00',
  });
  assert.equal(dischargeRequest('SN1', DISCHARGE, { cutoff_soc: 20 }).body.batUseCap, 20);
  assert.throws(
    () => dischargeRequest('SN1', { ...DISCHARGE, cutoffSoc: null }, { enabled: 'on' }),
    { key: 'errSocUnknown' },
  );
});

test('EV charger commands', () => {
  assert.equal(evCommand('start'), 1);
  assert.equal(evCommand('stop'), 0);
  assert.throws(() => evCommand('reboot'), { key: 'errCommand' });
});

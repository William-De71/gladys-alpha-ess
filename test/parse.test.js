import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  num,
  readSlot,
  parseEssList,
  parsePower,
  parseDayEnergy,
  parseSummary,
  parseChargeConfig,
  parseDischargeConfig,
  parseDayPower,
  parseEvChargers,
  parseEvStatus,
} from '../src/parse.js';
import { toInstant } from '../src/time.js';

test('numbers: null, empty or not a number is null, never 0', () => {
  assert.deepEqual(
    [num(null), num(undefined), num(''), num('x'), num(NaN)],
    [null, null, null, null, null],
  );
  assert.deepEqual([num(0), num('12.5'), num(-3)], [0, 12.5, -3]);
});

test('getEssList: the documented sample, duplicates and odd serial numbers left out', () => {
  const list = parseEssList([
    {
      sysSn: 'AL70110230306xx',
      popv: 9.0,
      minv: 'SMILE5-INV',
      poinv: 5.0,
      cobat: 13.34,
      mbat: 'SMILE-BAT-13.3P',
      surplusCobat: 13.34,
      usCapacity: 100.0,
      emsStatus: 'Normal',
    },
    { sysSn: 'AL70110230306xx' },
    { sysSn: '../etc' },
    { popv: 1 },
  ]);
  assert.deepEqual(list, [
    {
      sn: 'AL70110230306xx',
      inverterModel: 'SMILE5-INV',
      batteryModel: 'SMILE-BAT-13.3P',
      batteryCapacity: 13.34,
      usableCapacity: 13.34,
      inverterPower: 5,
      pvPower: 9,
      emsStatus: 'Normal',
    },
  ]);
  assert.deepEqual(parseEssList(null), []);
});

test('getLastPowerData: the documented evening sample (battery discharging)', () => {
  const power = parsePower({
    ppv: 0.0,
    ppvDetail: { ppv1: 0.0, ppv2: 0.0, ppv3: 0.0, ppv4: 0.0, pmeterDc: 0.0 },
    soc: 56.0,
    pev: 0,
    pevDetail: { ev1Power: null, ev2Power: null, ev3Power: null, ev4Power: null },
    prealL1: 1159.0,
    prealL2: 0.0,
    prealL3: 0.0,
    pgrid: 11.0,
    pgridDetail: { pmeterL1: 11.0, pmeterL2: 0.0, pmeterL3: 0.0 },
    pload: 1275.0,
    pbat: 1264.0,
  });
  assert.deepEqual(power, {
    pv: 0,
    load: 1275,
    grid: 11,
    battery: 1264,
    soc: 56,
    ev: 0,
    evDetail: [null, null, null, null],
  });
  // The load is the sum of the sources: pbat > 0 is a discharge.
  assert.equal(power.pv + power.grid + power.battery, 1275);
  assert.equal(parsePower({ soc: 120 }).soc, 100);
  assert.equal(parsePower({}), null, 'nothing usable');
  assert.equal(parsePower([]), null);
});

test('getOneDateEnergyBySn: the documented sample, negative values clamped', () => {
  assert.deepEqual(
    parseDayEnergy({
      sysSn: 'AL70110230306xx',
      theDate: '2026-08-04',
      eCharge: 12.2,
      epv: 10.6,
      eOutput: 0.42,
      eInput: 14.41,
      eGridCharge: 9.1,
      eDischarge: 7.1,
      eChargingPile: 0.0,
    }),
    {
      date: '2026-08-04',
      pv: 10.6,
      input: 14.41,
      output: 0.42,
      charge: 12.2,
      discharge: 7.1,
      gridCharge: 9.1,
      ev: 0,
    },
  );
  assert.equal(parseDayEnergy({ epv: -1 }).pv, 0);
  assert.equal(parseDayEnergy({ theDate: '2026-08-04' }), null);
});

test('getSumDataForCustomer: ratios as percentages, the many null fields', () => {
  const summary = parseSummary({
    epvtoday: 10.6,
    epvtotal: null,
    eload: 19.49,
    eoutput: 0.42,
    einput: 14.41,
    echarge: 12.2,
    edischarge: 7.1,
    todayIncome: null,
    totalIncome: null,
    eselfConsumption: null,
    eselfSufficiency: 0.857,
    treeNum: null,
    carbonNum: null,
    moneyType: null,
  });
  assert.equal(summary.load, 19.49);
  assert.equal(summary.pvTotal, null);
  assert.equal(summary.selfConsumption, null);
  assert.ok(Math.abs(summary.selfSufficiency - 85.7) < 1e-9);
  assert.equal(parseSummary({ eselfSufficiency: 92 }).selfSufficiency, 92);
  assert.equal(parseSummary({}), null);
});

test('charge and discharge settings: f = from, e = end', () => {
  assert.deepEqual(
    parseChargeConfig({
      gridCharge: 0,
      timeChaf1: '11:00',
      timeChae1: '14:00',
      timeChaf2: '00:00',
      timeChae2: '00:00',
      batHighCap: 100,
    }),
    {
      enabled: false,
      maxSoc: 100,
      periods: [
        ['11:00', '14:00'],
        ['00:00', '00:00'],
      ],
    },
  );
  assert.deepEqual(
    parseDischargeConfig({
      ctrDis: 1,
      timeDisf1: '17:00',
      timeDise1: '21:00',
      timeDisf2: '7:00',
      timeDise2: 'x',
      batUseCap: 5,
    }),
    {
      enabled: true,
      cutoffSoc: 5,
      periods: [
        ['17:00', '21:00'],
        ['07:00', null],
      ],
    },
  );
  assert.equal(readSlot('24:00'), null);
});

test('getOneDayPowerBySn: live names (cbat, pchargingPile) and the portal ones, in order', () => {
  const points = parseDayPower(
    [
      {
        uploadTime: '2026-10-23 14:05:04',
        ppv: 3000,
        load: 800,
        cbat: 56.8,
        feedIn: 1000,
        gridCharge: 2,
        pchargingPile: 0,
      },
      { uploadTime: '2026-10-23 14:00:04', ppv: 2900, load: 700, cobat: 56, pChargingPile: 7 },
      { uploadTime: 'never' },
    ],
    (date, time) => toInstant(date, time, 'Europe/Paris'),
  );
  assert.deepEqual(
    points.map((point) => [new Date(point.at).toISOString(), point.pv, point.soc, point.ev]),
    [
      ['2026-10-23T12:00:00.000Z', 2900, 56, 7],
      ['2026-10-23T12:05:00.000Z', 3000, 56.8, 0],
    ],
  );
});

test('EV chargers: the list (empty without one), the status as an object or a list', () => {
  assert.deepEqual(parseEvChargers([]), []);
  assert.deepEqual(parseEvChargers([{ evchargerSn: 'EV1', evchargerModel: 'SMILE-EVCT11' }]), [
    { sn: 'EV1', model: 'SMILE-EVCT11' },
  ]);
  assert.equal(parseEvStatus({ evchargerStatus: 3 }), 'charging');
  assert.equal(parseEvStatus([{ evchargerStatus: 2 }]), 'preparing');
  assert.equal(parseEvStatus({ evchargerStatus: 7 }), null, '7 and 8 are not documented');
});

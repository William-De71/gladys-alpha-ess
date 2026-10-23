import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import {
  buildLiveWidget,
  buildTodayWidget,
  buildScheduleWidget,
  messageContent,
  powerTile,
  periodsText,
} from '../src/widgets.js';
import { LANGUAGES } from '../src/i18n.js';
import { toInstant } from '../src/time.js';

const NOW = Date.parse('2026-10-23T12:00:00Z'); // 14:00 in Paris
const MINUTE = 60 * 1000;
const ZONE = 'Europe/Paris';
const points = Array.from({ length: 168 }, (_, i) => {
  const at = toInstant('2026-10-23', '00:00', ZONE) + i * 5 * MINUTE;
  const pv = Math.max(0, Math.round(5200 * Math.sin((Math.PI * (i - 96)) / 126)));
  return {
    at,
    pv,
    load: 400 + (i % 9) * 40,
    soc: 40,
    feedIn: pv > 1800 ? pv - 1800 : 0,
    gridCharge: pv ? 0 : 300,
  };
});
const VIEW = {
  sn: 'AL7011023030601',
  deviceId: 'ext:alpha-ess:system:AL7011023030601',
  name: 'Alpha ESS SMILE5-INV AL7011023030601',
  model: 'SMILE5-INV',
  battery: true,
  batteryCapacity: 13.34,
  date: '2026-10-23',
  power: { pv: 4200, load: 1300, grid: -1900, battery: -1000, soc: 72, ev: 0, at: NOW - MINUTE },
  powerAt: NOW - MINUTE,
  fresh: true,
  offline: false,
  offlineSince: null,
  dayEnergy: { date: '2026-10-23', pv: 8.86, input: 2.9, output: 2.4, charge: 3, discharge: 2.3 },
  summary: { date: '2026-10-23', load: 9.8, selfSufficiency: 85.7 },
  chargeConfig: {
    enabled: true,
    maxSoc: 90,
    periods: [
      ['01:00', '05:00'],
      ['00:00', '00:00'],
    ],
  },
  dischargeConfig: {
    enabled: false,
    cutoffSoc: 10,
    periods: [
      ['00:00', '00:00'],
      ['00:00', '00:00'],
    ],
  },
  cutoffSoc: 10,
  configAt: NOW - 20 * MINUTE,
  configRefused: false,
  curve: { date: '2026-10-23', points },
};
const views = () => [
  VIEW,
  { ...VIEW, battery: false, batteryCapacity: 0 },
  { ...VIEW, power: { ...VIEW.power, grid: 3000, battery: 2400, soc: 9 } },
  { ...VIEW, power: { ...VIEW.power, grid: 10, battery: 0, pv: 0 } },
  { ...VIEW, fresh: false },
  { ...VIEW, fresh: false, offline: true, offlineSince: NOW - 30 * MINUTE },
  { ...VIEW, power: null, powerAt: null, fresh: false },
  { ...VIEW, curve: null, summary: null },
  { ...VIEW, curve: { date: '2026-10-23', points: points.slice(0, 1) } },
  { ...VIEW, dayEnergy: null, summary: null, curve: null },
  { ...VIEW, chargeConfig: null, dischargeConfig: null },
  { ...VIEW, chargeConfig: null, dischargeConfig: null, configRefused: true },
  { ...VIEW, dischargeConfig: { ...VIEW.dischargeConfig, cutoffSoc: null }, configAt: null },
];

/**
 * @description The budget of a card the core enforces.
 * @param {object} content - The content.
 */
function assertBudget(content) {
  const count = (types) => content.components.filter((c) => types.includes(c.type)).length;
  assert.ok(content.components.length <= 8, `${content.components.length} components`);
  assert.ok(count(['chart', 'card-list', 'image']) <= 1);
  assert.ok(count(['value', 'gauge']) <= 6);
  assert.ok(count(['text']) <= 2);
  assert.ok(
    content.components.filter((c) => c.type === 'text' && c.variant === 'body').length <= 1,
  );
  assert.ok(count(['status']) <= 1);
  assert.ok(content.ttl_seconds >= 10 && content.ttl_seconds <= 3600);
}

test('every widget passes the checks of the core, in the four languages', () => {
  for (const language of LANGUAGES) {
    for (const view of views()) {
      for (const allowControl of [true, false]) {
        const options = { view, language, now: NOW, timeZone: ZONE, allowControl };
        for (const content of [
          buildLiveWidget(options),
          buildTodayWidget(options),
          buildScheduleWidget(options),
        ]) {
          assert.deepEqual(validateWidgetContent(content), [], JSON.stringify(content));
          assertBudget(content);
        }
      }
    }
    assert.deepEqual(validateWidgetContent(messageContent('x'.repeat(400), { heading: 'y' })), []);
  }
});

test('live: battery gauge, solar, house, grid to / from, battery charging / discharging', () => {
  const content = buildLiveWidget({ view: VIEW, language: 'fr', now: NOW, timeZone: ZONE });
  const tiles = content.components.filter((c) => c.type === 'value' || c.type === 'gauge');
  assert.deepEqual(
    tiles.map((c) => [c.label, c.value, c.unit ?? null]),
    [
      ['Batterie', 72, '%'],
      ['Solaire', 4.2, 'kW'],
      ['Maison', 1.3, 'kW'],
      ['Vers le réseau', 1.9, 'kW'],
      ['En charge', 1, 'kW'],
    ],
  );
  const status = content.components.find((c) => c.type === 'status');
  assert.deepEqual(
    status.items.map((item) => item.label),
    ['Dernière lecture', 'Autonomie du jour'],
  );
  const night = buildLiveWidget({
    view: { ...VIEW, power: { ...VIEW.power, grid: 3000, battery: 2400, pv: 0 } },
    language: 'en',
    now: NOW,
    timeZone: ZONE,
  });
  assert.deepEqual(
    night.components.filter((c) => c.type === 'value').map((c) => c.label),
    ['Solar', 'House', 'From the grid', 'Discharging'],
  );
});

test('live: an offline system says so, in red', () => {
  const content = buildLiveWidget({
    view: { ...VIEW, fresh: false, offline: true, offlineSince: NOW - 30 * MINUTE },
    language: 'en',
    now: NOW,
    timeZone: ZONE,
  });
  const row = content.components.find((c) => c.type === 'status').items[0];
  assert.equal(row.color, 'danger');
  assert.match(row.value, /offline since 13:30/);
});

test('today: the energies of the day and the curve (series with data only)', () => {
  const content = buildTodayWidget({ view: VIEW, language: 'en', now: NOW, timeZone: ZONE });
  const chart = content.components.find((c) => c.type === 'chart');
  assert.deepEqual(
    chart.series.map((s) => s.name),
    ['Solar', 'House', 'Grid import', 'Grid export'],
  );
  assert.ok(chart.series.every((s) => s.points.length <= 300));
  assert.deepEqual(
    content.components.filter((c) => c.type === 'value').map((c) => [c.label, c.value]),
    [
      ['Solar today', 8.9],
      ['House today', 9.8],
      ['Grid import', 2.9],
      ['Grid export', 2.4],
      ['Self-sufficiency', 86],
    ],
  );
});

test('schedule: the settings of the cloud, and whether the scenes may change them', () => {
  const content = buildScheduleWidget({
    view: VIEW,
    language: 'en',
    now: NOW,
    timeZone: ZONE,
    allowControl: false,
  });
  const rows = content.components.find((c) => c.type === 'status').items;
  assert.deepEqual(
    rows.map((row) => [row.label, row.value]),
    [
      ['Charge from the grid', 'on'],
      ['Charge periods', '01:00-05:00'],
      ['Discharge time control', 'off'],
      ['Discharge periods', 'none'],
      ['Control from scenes', 'not allowed'],
      ['Settings read at', '13:40'],
    ],
  );
  const noBattery = buildScheduleWidget({
    view: { ...VIEW, battery: false },
    language: 'en',
    now: NOW,
    timeZone: ZONE,
  });
  assert.match(noBattery.components.at(-1).text, /no battery/);
});

test('helpers: kW above 1 kW, periods listed or none', () => {
  assert.deepEqual(powerTile(-1900), { value: 1.9, unit: 'kW' });
  assert.deepEqual(powerTile(640.4), { value: 640, unit: 'W' });
  assert.equal(
    periodsText(
      [
        ['01:00', '05:00'],
        ['13:00', '14:00'],
      ],
      'fr',
    ),
    '01:00-05:00 · 13:00-14:00',
  );
  assert.equal(periodsText([], 'de'), 'keiner');
});

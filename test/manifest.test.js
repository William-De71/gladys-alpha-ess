import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import {
  TRIGGERS,
  SCENE_ACTIONS,
  GRID_CHARGE_OUTPUTS,
  DISCHARGE_OUTPUTS,
  EV_OUTPUTS,
  TODAY_OUTPUTS,
  EV_STATUS_VALUES,
  ACCESS_REASONS,
} from '../src/events.js';
import { ACTIONS } from '../src/app.js';
import { WIDGETS } from '../src/widgets.js';
import { SWITCH_VALUES, EV_COMMANDS, SOC_MIN, SOC_MAX } from '../src/actions.js';
import { AUTO_LANGUAGE, POLL_INTERVALS, DEFAULT_POLL_SECONDS } from '../src/config.js';
import { LANGUAGES } from '../src/i18n.js';

const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const manifest = read('../gladys-assistant-integration.json');
const pkg = read('../package.json');
const byKey = (list) => new Map(list.map((entry) => [entry.key, entry]));
const values = (field) => field.options.map((option) => option.value);
const source = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const REPO = 'William-De71/gladys-alpha-ess';

test('a device integration, in lockstep with package.json, at 0.x until 1.0.0 is decided', () => {
  assert.equal(manifest.type, 'device');
  assert.equal(manifest.name, 'Alpha ESS');
  assert.equal(manifest.version, pkg.version);
  assert.match(pkg.version, /^0\./);
  assert.equal(manifest.docker_image, `ghcr.io/william-de71/gladys-alpha-ess:${pkg.version}`);
  assert.equal(manifest.cover_image, `https://raw.githubusercontent.com/${REPO}/main/cover.jpg`);
  assert.equal(pkg.license, 'Apache-2.0');
  assert.equal(pkg.name, 'gladys-alpha-ess');
});

test('declares the cloud transport: openapi.alphaess.com only, never a local device', () => {
  assert.deepEqual(manifest.transports, ['cloud']);
  assert.match(source('../src/alphaess-api.js'), /https:\/\/openapi\.alphaess\.com\/api/);
  for (const file of [
    'app',
    'parse',
    'energy',
    'events',
    'widgets',
    'device',
    'actions',
    'store',
    'time',
    'config',
  ]) {
    assert.doesNotMatch(
      source(`../src/${file}.js`),
      /fetch\(|node:https?|node:net|node:dgram/,
      file,
    );
  }
  // A single channel: no transport to publish per device.
  assert.doesNotMatch(source('../src/app.js'), /publishTransports|GLADYS_PREFER_LOCAL/);
});

test('requires Gladys 5.3.0 (catalog keywords; widgets and scenes since 5.1.0); no permission', () => {
  assert.equal(manifest.gladys_version, '>=5.3.0');
  assert.deepEqual(manifest.categories, ['energy']);
  const text = JSON.stringify(manifest);
  assert.doesNotMatch(text, /"source":"houses"/, 'houses need 5.2.0');
  for (const key of [
    'location',
    'network_wake',
    'containers',
    'network_discovery',
    'webhooks',
    'messaging',
    'energy_contracts',
  ]) {
    assert.equal(manifest[key], undefined, `${key} (permission, or a newer Gladys)`);
  }
  // No widget button with a form (5.2.0): no button at all.
  for (const widget of manifest.widgets) {
    assert.equal(widget.action_timeout_seconds, undefined, widget.key);
  }
  const config = byKey(manifest.config_schema);
  assert.deepEqual([config.get('app_id').type, config.get('app_id').required], ['string', true]);
  assert.deepEqual(
    [config.get('app_secret').type, config.get('app_secret').required],
    ['secret', true],
  );
  assert.deepEqual(
    [config.get('allow_control').type, config.get('allow_control').default],
    ['boolean', false],
    'writing to the inverter is off by default',
  );
  assert.deepEqual(values(config.get('poll_interval')), POLL_INTERVALS);
  assert.equal(config.get('poll_interval').default, String(DEFAULT_POLL_SECONDS));
});

test('declares exactly the scene triggers, actions and widgets the code handles', () => {
  const app = source('../src/app.js');
  assert.deepEqual(
    manifest.scene_triggers.map((t) => t.key),
    Object.values(TRIGGERS),
  );
  assert.deepEqual(
    manifest.scene_actions.map((a) => a.key),
    Object.values(SCENE_ACTIONS),
  );
  assert.deepEqual(
    manifest.widgets.map((w) => w.key),
    Object.values(WIDGETS),
  );
  for (const key of Object.keys(WIDGETS)) {
    assert.match(app, new RegExp(`onWidgetGet\\(WIDGETS\\.${key}`), key);
  }
  assert.doesNotMatch(app, /onWidgetAction/, 'no widget button: writes go through scenes');
  for (const key of Object.keys(SCENE_ACTIONS)) {
    assert.match(app, new RegExp(`onSceneAction\\(SCENE_ACTIONS\\.${key}`), key);
  }
  assert.deepEqual(
    manifest.actions.map((a) => a.key),
    Object.values(ACTIONS),
  );
  for (const key of Object.keys(ACTIONS)) {
    assert.match(app, new RegExp(`onAction\\(ACTIONS\\.${key}`), key);
  }
  const outputs = (key) =>
    byKey(manifest.scene_actions)
      .get(key)
      .outputs.map((output) => output.key);
  assert.deepEqual(outputs('set_grid_charge'), GRID_CHARGE_OUTPUTS);
  assert.deepEqual(outputs('set_discharge'), DISCHARGE_OUTPUTS);
  assert.deepEqual(outputs('ev_charger_control'), EV_OUTPUTS);
  assert.deepEqual(outputs('get_today'), TODAY_OUTPUTS);
  // Every trigger field is a key of the event data (the core compares them),
  // and a variable too.
  for (const trigger of manifest.scene_triggers) {
    for (const field of trigger.fields ?? []) {
      assert.ok(
        trigger.variables.some((variable) => variable.key === field.key),
        `${trigger.key}.${field.key}`,
      );
      if (field.source) assert.equal(field.source, 'devices');
    }
  }
  const triggers = byKey(manifest.scene_triggers);
  assert.deepEqual(
    values(byKey(triggers.get('ev_charger_status').fields).get('status')),
    EV_STATUS_VALUES,
  );
  assert.deepEqual(
    values(byKey(triggers.get('access_refused').fields).get('reason')),
    ACCESS_REASONS,
  );
});

test('the fields of the scene actions mirror the code', () => {
  const actions = byKey(manifest.scene_actions);
  for (const [key, soc] of [
    ['set_grid_charge', 'max_soc'],
    ['set_discharge', 'cutoff_soc'],
  ]) {
    const fields = byKey(actions.get(key).fields);
    assert.deepEqual([...fields.keys()], ['system', 'enabled', 'period_1', 'period_2', soc]);
    assert.deepEqual(values(fields.get('enabled')), SWITCH_VALUES);
    assert.equal(fields.get('enabled').default, 'keep', 'never changed by default');
    assert.deepEqual([fields.get(soc).min, fields.get(soc).max], [SOC_MIN, SOC_MAX]);
    assert.equal(fields.get('period_1').type, 'string');
    for (const field of fields.values()) {
      assert.notEqual(field.required, true, `${key}.${field.key}: empty keeps the value`);
    }
  }
  const ev = byKey(actions.get('ev_charger_control').fields);
  assert.deepEqual(values(ev.get('command')), Object.keys(EV_COMMANDS));
  assert.equal(ev.get('charger').source, 'devices');
  const bind = byKey(manifest.actions);
  assert.deepEqual(
    bind.get('request_bind_code').fields.map((field) => field.key),
    ['sys_sn', 'check_code'],
  );
  assert.deepEqual(
    bind.get('bind_system').fields.map((field) => field.key),
    ['sys_sn', 'code'],
  );
});

test('limits of the store: counts, timeouts, sizes, no secret in widget settings', () => {
  assert.ok(manifest.actions.length <= 10);
  assert.ok(manifest.widgets.length >= 1 && manifest.widgets.length <= 5);
  assert.ok(manifest.scene_triggers.length <= 20 && manifest.scene_actions.length <= 20);
  for (const trigger of manifest.scene_triggers) {
    assert.ok((trigger.fields ?? []).length <= 10 && trigger.variables.length <= 20, trigger.key);
    assert.ok(trigger.key.length <= 40);
  }
  for (const action of manifest.scene_actions) {
    assert.ok(action.fields.length <= 10, `${action.key}: ${action.fields.length} fields`);
    assert.ok(action.outputs.length <= 20, action.key);
  }
  for (const action of [...manifest.scene_actions, ...manifest.actions]) {
    assert.ok(action.timeout_seconds >= 5 && action.timeout_seconds <= 120, action.key);
  }
  for (const widget of manifest.widgets) {
    for (const setting of widget.settings ?? []) {
      assert.ok(!['secret', 'oauth2', 'account_link'].includes(setting.type));
    }
  }
  const size = statSync(new URL('../gladys-assistant-integration.json', import.meta.url)).size;
  assert.ok(size < 100 * 1024, `${size} bytes`);
  const cover = readFileSync(new URL('../cover.jpg', import.meta.url));
  assert.ok(cover.length < 150 * 1024, `cover.jpg: ${cover.length} bytes`);
  assert.equal(cover.readUInt16BE(0), 0xffd8, 'cover.jpg is a JPEG');
});

test('offers the languages of the code, automatic by default', () => {
  const field = byKey(manifest.config_schema).get('language');
  assert.deepEqual(values(field), [AUTO_LANGUAGE, ...LANGUAGES]);
  assert.equal(field.default, AUTO_LANGUAGE);
});

test('catalog of Gladys 5.3.0: search keywords within the store bounds, countries', () => {
  const { keywords } = manifest;
  assert.ok(Array.isArray(keywords) && keywords.length >= 1 && keywords.length <= 10);
  const normalized = keywords.map((keyword) => keyword.trim().toLowerCase());
  for (const keyword of normalized) {
    assert.ok(keyword.length >= 2 && keyword.length <= 30, keyword);
  }
  assert.equal(new Set(normalized).size, normalized.length, 'unique once trimmed and lowercased');
  assert.ok(!normalized.includes(manifest.name.toLowerCase()), 'never the name itself');
  assert.equal(manifest.countries, undefined, 'usable worldwide: no country list');
});

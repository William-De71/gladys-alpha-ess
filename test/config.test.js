import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeConfig, readBoolean, readLanguage, DEFAULT_POLL_SECONDS } from '../src/config.js';

test('the configuration: trimmed credentials, control off unless ticked, a known interval', () => {
  assert.deepEqual(
    normalizeConfig({
      app_id: ' alpha123 ',
      app_secret: 'abc def\n',
      allow_control: 'true',
      poll_interval: '120',
      language: 'de',
    }),
    { appId: 'alpha123', appSecret: 'abc', allowControl: true, pollSeconds: 120, language: 'de' },
  );
  assert.deepEqual(normalizeConfig(undefined), {
    appId: '',
    appSecret: '',
    allowControl: false,
    pollSeconds: DEFAULT_POLL_SECONDS,
    language: 'auto',
  });
  assert.equal(
    normalizeConfig({ poll_interval: '5' }).pollSeconds,
    60,
    'never faster than offered',
  );
  assert.equal(normalizeConfig({ language: 'it' }).language, 'auto');
});

test('booleans and the stored language', () => {
  assert.deepEqual([true, 1, 'true', 'on', 'yes'].map(readBoolean), [true, true, true, true, true]);
  assert.deepEqual([false, 0, 'false', '', null].map(readBoolean), [
    false,
    false,
    false,
    false,
    false,
  ]);
  assert.equal(readLanguage({ last_language: 'es' }, 'en'), 'es');
  assert.equal(readLanguage({ last_language: 'xx' }, 'fr'), 'fr');
});

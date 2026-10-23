// -----------------------------------------------------------------------------
// Configuration of the Alpha ESS integration.
//
// Fields of the config_schema:
//   - `app_id`        the Developer ID (AppID) of the Alpha ESS developer
//                     portal (open.alphaess.com);
//   - `app_secret`    its Developer Secret (AppSecret): a `secret`, never sent
//                     back to the UI, never logged, never sent to Alpha ESS
//                     either (only a SHA-512 signature of it travels);
//   - `allow_control` let the scene actions write to the inverter and the EV
//                     charger (charge from the grid, discharge, start / stop):
//                     off by default;
//   - `poll_interval` seconds between two readings of the power now (30 to
//                     300; stretched with the number of systems);
//   - `language`      language of the texts Gladys does not ask for in a
//                     language (feature names, scene texts): `auto` follows the
//                     language of the last widget, or the timezone.
//
// Internal key, outside the config_schema (never shown in the UI):
//   - `last_language` language of the last widget request.
// -----------------------------------------------------------------------------

import { isLanguage } from './i18n.js';

const AUTO_LANGUAGE = 'auto';
const INTERNAL_KEYS = { language: 'last_language' };
const POLL_INTERVALS = ['30', '60', '120', '300'];
const DEFAULT_POLL_SECONDS = 60;

const readString = (raw) =>
  typeof raw === 'string' ? raw.trim() : typeof raw === 'number' ? String(raw) : '';

/**
 * @description Read a boolean of the configuration ("true", true, 1).
 * @param {unknown} raw - The value.
 * @returns {boolean} The boolean.
 */
const readBoolean = (raw) => raw === true || raw === 1 || /^(true|1|yes|on)$/i.test(String(raw));

/**
 * @description Normalize the raw config object from the host API.
 * @param {object} [rawConfig] - The raw config values.
 * @returns {object} `{ appId, appSecret, allowControl, pollSeconds, language }`.
 * @example
 * normalizeConfig({ app_id: 'alpha123', app_secret: 's' });
 */
function normalizeConfig(rawConfig = {}) {
  const config = rawConfig ?? {};
  const poll = readString(config.poll_interval);
  return {
    // An AppID or a secret never holds a space: one pasted with a space or a
    // line break is cut there.
    appId: readString(config.app_id).split(/\s+/)[0] ?? '',
    appSecret: readString(config.app_secret).split(/\s+/)[0] ?? '',
    allowControl: readBoolean(config.allow_control),
    pollSeconds: POLL_INTERVALS.includes(poll) ? Number(poll) : DEFAULT_POLL_SECONDS,
    language: isLanguage(config.language) ? config.language : AUTO_LANGUAGE,
  };
}

// The timezones of the countries that speak the languages of the integration:
// the automatic language before any widget was shown.
const TIMEZONE_LANGUAGES = {
  fr: [
    'Europe/Paris',
    'Europe/Monaco',
    'Europe/Brussels',
    'Europe/Luxembourg',
    'Indian/Reunion',
    'Indian/Mayotte',
    'America/Guadeloupe',
    'America/Martinique',
    'America/Cayenne',
    'America/Miquelon',
    'Pacific/Noumea',
    'Pacific/Tahiti',
    'America/Montreal',
    'Africa/Abidjan',
    'Africa/Dakar',
    'Africa/Casablanca',
    'Africa/Algiers',
    'Africa/Tunis',
  ],
  de: ['Europe/Berlin', 'Europe/Busingen', 'Europe/Vienna', 'Europe/Zurich', 'Europe/Vaduz'],
  es: [
    'Europe/Madrid',
    'Atlantic/Canary',
    'Africa/Ceuta',
    'America/Mexico_City',
    'America/Bogota',
    'America/Lima',
    'America/Santiago',
    'America/Caracas',
    'America/Montevideo',
    'America/Asuncion',
    'America/La_Paz',
    'America/Guayaquil',
    'America/Havana',
    'America/Costa_Rica',
    'America/Panama',
  ],
};

/**
 * @description The language of the texts guessed from a timezone, before
 * any widget was shown.
 * @param {string} timezone - IANA timezone of Gladys.
 * @returns {string} en, fr, de or es.
 * @example
 * guessLanguage('Europe/Paris'); // -> 'fr'
 */
function guessLanguage(timezone) {
  const zone = String(timezone ?? '');
  if (zone.startsWith('America/Argentina/')) {
    return 'es';
  }
  const found = Object.entries(TIMEZONE_LANGUAGES).find(([, zones]) => zones.includes(zone));
  return found ? found[0] : 'en';
}

/**
 * @description Read the stored language of the last widget request.
 * @param {object} [rawConfig] - The raw config values.
 * @param {string} fallback - The language to keep when nothing valid is stored.
 * @returns {string} The language.
 */
function readLanguage(rawConfig, fallback) {
  const language = (rawConfig ?? {})[INTERNAL_KEYS.language];
  return isLanguage(language) ? language : fallback;
}

export {
  AUTO_LANGUAGE,
  INTERNAL_KEYS,
  POLL_INTERVALS,
  DEFAULT_POLL_SECONDS,
  readBoolean,
  normalizeConfig,
  guessLanguage,
  readLanguage,
};

// -----------------------------------------------------------------------------
// Dashboard widgets of the Alpha ESS integration.
//
//   - `live`      the energy flow now: the battery level (gauge), the solar
//                 power, the house load, the grid (import or export) and the
//                 battery (charging or discharging); when it was read, or
//                 since when the system is offline;
//   - `today`     the day: solar production, house consumption, grid import
//                 and export, self-sufficiency, and the power curve of the day
//                 (getOneDayPowerBySn, read only while this widget is shown);
//   - `schedule`  the battery settings stored on the cloud: charge from the
//                 grid (on / off, periods, up to which SOC), discharge time
//                 control (on / off, periods, cut-off SOC), and whether the
//                 scenes may change them.
// No button: a write to the inverter goes through a scene action, with the
// option of the configuration. Every text exists in the four languages (the
// content is cached per language). Content budget of a card: 8 components,
// 1 main one, 6 tiles, 2 texts (1 body), 1 status, 4 buttons.
// -----------------------------------------------------------------------------

import { WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { t, ago, formatNumber } from './i18n.js';
import { formatTime } from './time.js';
import { formatPeriod } from './actions.js';

const WIDGETS = { LIVE: 'live', TODAY: 'today', SCHEDULE: 'schedule' };
const TTL_SECONDS = { live: 60, today: 600, schedule: 900, message: 120 };
const IDLE_W = 50;

/**
 * @description Truncate a text to a bound, with an ellipsis.
 * @param {string} value - The text.
 * @param {number} max - The bound.
 * @returns {string} The text.
 */
function clip(value, max) {
  const text = String(value ?? '');
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/**
 * @description A widget content made of one message.
 * @param {string} message - The message.
 * @param {object} [options] - `{ heading, ttl }`.
 * @returns {object} The content.
 */
function messageContent(message, { heading, ttl = TTL_SECONDS.message } = {}) {
  const components = [];
  if (heading) {
    components.push({ type: 'text', variant: 'heading', text: clip(heading, 40) });
  }
  components.push({ type: 'text', variant: 'body', text: clip(message, 300) });
  return { ttl_seconds: ttl, components };
}

/**
 * @description A power as a tile shows it: W under 1 kW, kW above.
 * @param {number} watts - Watts (absolute value shown).
 * @returns {{ value: number, unit: string }} The value.
 */
function powerTile(watts) {
  const value = Math.abs(watts);
  if (value >= 1000) {
    return { value: Math.round(value / 100) / 10, unit: 'kW' };
  }
  return { value: Math.round(value), unit: 'W' };
}

/**
 * @description An energy as a tile shows it, kWh.
 * @param {number} kwh - Kilowatt hours.
 * @returns {{ value: number, unit: string }} The value.
 */
const energyTile = (kwh) => ({ value: Math.round(kwh * 10) / 10, unit: 'kWh' });

/**
 * @description The caption of a system: "SMILE5-INV · AL7011023030601 · 13.3 kWh".
 * @param {object} view - `{ model, sn, batteryCapacity }`.
 * @param {string} language - The language.
 * @returns {string} The caption.
 */
function captionOf(view, language) {
  const capacity =
    Number.isFinite(view.batteryCapacity) && view.batteryCapacity > 0
      ? t('captionBattery', language, { value: formatNumber(view.batteryCapacity, language, 1) })
      : null;
  return clip([view.model ?? 'Alpha ESS', view.sn, capacity].filter(Boolean).join(' · '), 60);
}

/**
 * @description The row of the freshness of the readings.
 * @param {object} view - The view of the system.
 * @param {object} options - `{ language, now, timeZone }`.
 * @returns {object} A status row.
 */
function freshnessRow(view, { language, now, timeZone }) {
  const label = clip(t('rowReading', language), 40);
  const time = (instant) => formatTime(instant, { language, timeZone, now });
  if (view.offline) {
    return {
      label,
      value: clip(t('rowOffline', language, { time: time(view.offlineSince) }), 40),
      color: WIDGET_COLORS.DANGER,
    };
  }
  if (!Number.isFinite(view.powerAt)) {
    return { label, value: clip(t('rowNoReading', language), 40), color: WIDGET_COLORS.WARNING };
  }
  return {
    label,
    value: clip(
      t('rowAgo', language, { time: time(view.powerAt), ago: ago(view.powerAt, now, language) }),
      40,
    ),
    color: view.fresh ? WIDGET_COLORS.SUCCESS : WIDGET_COLORS.WARNING,
  };
}

/**
 * @description The "live" widget.
 * @param {object} options - Options.
 * @param {object} options.view - The view of the system (app.js).
 * @param {string} options.language - The user language.
 * @param {number} options.now - Now (ms).
 * @param {string} options.timeZone - The timezone of Gladys.
 * @returns {object} The content.
 */
function buildLiveWidget({ view, language, now, timeZone }) {
  const power = view.fresh ? view.power : null;
  if (!power) {
    return {
      ttl_seconds: TTL_SECONDS.live,
      components: [
        { type: 'text', variant: 'caption', text: captionOf(view, language) },
        {
          type: 'text',
          variant: 'body',
          text: clip(t(view.offline ? 'widgetOffline' : 'widgetWaiting', language), 300),
        },
        { type: 'status', items: [freshnessRow(view, { language, now, timeZone })] },
      ],
    };
  }
  const components = [{ type: 'text', variant: 'caption', text: captionOf(view, language) }];
  if (view.battery && Number.isFinite(power.soc)) {
    components.push({
      type: 'gauge',
      value: Math.round(power.soc),
      min: 0,
      max: 100,
      unit: '%',
      label: clip(t('tileBattery', language), 24),
      color:
        power.soc <= (view.cutoffSoc ?? 10) + 1
          ? WIDGET_COLORS.DANGER
          : power.soc < 30
            ? WIDGET_COLORS.WARNING
            : WIDGET_COLORS.SUCCESS,
    });
  }
  if (Number.isFinite(power.pv)) {
    components.push({
      type: 'value',
      ...powerTile(Math.max(0, power.pv)),
      label: clip(t('tileSolar', language), 24),
      icon: 'sun',
      color: power.pv > IDLE_W ? WIDGET_COLORS.WARNING : WIDGET_COLORS.NEUTRAL,
    });
  }
  if (Number.isFinite(power.load)) {
    components.push({
      type: 'value',
      ...powerTile(Math.max(0, power.load)),
      label: clip(t('tileHouse', language), 24),
      icon: 'home',
      color: WIDGET_COLORS.PRIMARY,
    });
  }
  if (Number.isFinite(power.grid)) {
    const direction = power.grid > IDLE_W ? 'import' : power.grid < -IDLE_W ? 'export' : 'idle';
    components.push({
      type: 'value',
      ...powerTile(direction === 'idle' ? 0 : power.grid),
      label: clip(
        t(
          { import: 'tileGridImport', export: 'tileGridExport', idle: 'tileGrid' }[direction],
          language,
        ),
        24,
      ),
      icon: { import: 'download', export: 'upload', idle: 'activity' }[direction],
      color: {
        import: WIDGET_COLORS.WARNING,
        export: WIDGET_COLORS.SUCCESS,
        idle: WIDGET_COLORS.NEUTRAL,
      }[direction],
    });
  }
  if (view.battery && Number.isFinite(power.battery)) {
    const direction =
      power.battery > IDLE_W ? 'discharge' : power.battery < -IDLE_W ? 'charge' : 'idle';
    components.push({
      type: 'value',
      ...powerTile(direction === 'idle' ? 0 : power.battery),
      label: clip(
        t(
          { charge: 'tileCharging', discharge: 'tileDischarging', idle: 'tileBatteryIdle' }[
            direction
          ],
          language,
        ),
        24,
      ),
      icon: direction === 'charge' ? 'battery-charging' : 'battery',
      color: direction === 'charge' ? WIDGET_COLORS.SUCCESS : WIDGET_COLORS.INFO,
    });
  }
  const rows = [freshnessRow(view, { language, now, timeZone })];
  if (Number.isFinite(view.summary?.selfSufficiency)) {
    rows.push({
      label: clip(t('rowSelfSufficiency', language), 40),
      value: `${formatNumber(view.summary.selfSufficiency, language, 0)} %`,
      color: WIDGET_COLORS.INFO,
    });
  }
  components.push({ type: 'status', items: rows });
  return { ttl_seconds: TTL_SECONDS.live, components };
}

/**
 * @description The energies of today a widget shows.
 * @param {object} view - The view of the system.
 * @returns {object} `{ pv, load, input, output, charge, discharge }`, kWh or null.
 */
function todayEnergies(view) {
  const day = view.dayEnergy ?? {};
  const summary = view.summary ?? {};
  const pick = (...values) => values.find((value) => Number.isFinite(value)) ?? null;
  return {
    pv: pick(day.pv, summary.pv),
    load: pick(summary.load),
    input: pick(day.input, summary.input),
    output: pick(day.output, summary.output),
    charge: pick(day.charge),
    discharge: pick(day.discharge),
    selfSufficiency: pick(summary.selfSufficiency),
  };
}

/**
 * @description The "today" widget.
 * @param {object} options - Options.
 * @param {object} options.view - The view of the system (app.js).
 * @param {string} options.language - The user language.
 * @param {number} options.now - Now (ms).
 * @param {string} options.timeZone - The timezone of Gladys.
 * @returns {object} The content.
 */
function buildTodayWidget({ view, language, now, timeZone }) {
  const energy = todayEnergies(view);
  const known = Object.values(energy).some((value) => value !== null);
  if (!known && !(view.curve?.points?.length > 1)) {
    return messageContent(t('widgetWaiting', language), {
      heading: view.name,
      ttl: TTL_SECONDS.message,
    });
  }
  const components = [{ type: 'text', variant: 'caption', text: captionOf(view, language) }];
  const tile = (value, key, icon, color) => {
    if (Number.isFinite(value)) {
      components.push({
        type: 'value',
        ...energyTile(value),
        label: clip(t(key, language), 24),
        icon,
        ...(color ? { color } : {}),
      });
    }
  };
  tile(energy.pv, 'tileSolarToday', 'sun', WIDGET_COLORS.WARNING);
  tile(energy.load, 'tileHouseToday', 'home', WIDGET_COLORS.PRIMARY);
  tile(energy.input, 'tileImportToday', 'download');
  tile(energy.output, 'tileExportToday', 'upload', WIDGET_COLORS.SUCCESS);
  if (Number.isFinite(energy.selfSufficiency)) {
    components.push({
      type: 'value',
      value: Math.round(energy.selfSufficiency),
      unit: '%',
      label: clip(t('tileSelfSufficiency', language), 24),
      icon: 'shield',
      color: WIDGET_COLORS.INFO,
    });
  }
  const points = (view.curve?.date === view.date ? view.curve.points : []) ?? [];
  const series = [
    ['pv', 'seriesSolar'],
    ['load', 'seriesHouse'],
    ['gridCharge', 'seriesImport'],
    ['feedIn', 'seriesExport'],
  ]
    .map(([key, name]) => ({
      name: clip(t(name, language), 24),
      points: points
        .filter((point) => Number.isFinite(point[key]))
        .slice(-300)
        .map((point) => ({ t: new Date(point.at).toISOString(), v: Math.round(point[key]) })),
    }))
    .filter((line) => line.points.length >= 2 && line.points.some((point) => point.v !== 0));
  if (series.length) {
    components.push({
      type: 'chart',
      chart_type: 'line',
      title: clip(t('chartToday', language), 40),
      unit: 'W',
      series,
    });
  } else {
    components.push({
      type: 'text',
      variant: 'body',
      text: clip(t(points.length ? 'widgetCurveSoon' : 'widgetCurveLoading', language), 300),
    });
  }
  const rows = [];
  if (view.battery && (Number.isFinite(energy.charge) || Number.isFinite(energy.discharge))) {
    rows.push({
      label: clip(t('rowBatteryToday', language), 40),
      value: clip(
        t('rowBatteryTodayValue', language, {
          charge: formatNumber(energy.charge ?? 0, language, 1),
          discharge: formatNumber(energy.discharge ?? 0, language, 1),
        }),
        40,
      ),
      color: WIDGET_COLORS.INFO,
    });
  }
  rows.push(freshnessRow(view, { language, now, timeZone }));
  components.push({ type: 'status', items: rows });
  return { ttl_seconds: TTL_SECONDS.today, components };
}

/**
 * @description The periods of a setting: "01:00-05:00 · 13:00-14:00", or none.
 * @param {string[][]} periods - The two periods.
 * @param {string} language - The language.
 * @returns {string} The text.
 */
function periodsText(periods, language) {
  const active = (periods ?? []).map(formatPeriod).filter((text) => text !== 'off');
  return active.length ? active.join(' · ') : t('periodsNone', language);
}

/**
 * @description The "schedule" widget.
 * @param {object} options - Options.
 * @param {object} options.view - The view of the system (app.js).
 * @param {string} options.language - The user language.
 * @param {number} options.now - Now (ms).
 * @param {string} options.timeZone - The timezone of Gladys.
 * @param {boolean} options.allowControl - The option of the configuration.
 * @returns {object} The content.
 */
function buildScheduleWidget({ view, language, now, timeZone, allowControl }) {
  if (!view.battery) {
    return messageContent(t('widgetNoBattery', language), { heading: view.name });
  }
  const charge = view.chargeConfig;
  const discharge = view.dischargeConfig;
  if (!charge && !discharge) {
    return messageContent(
      t(view.configRefused ? 'widgetScheduleRefused' : 'widgetScheduleWaiting', language),
      { heading: view.name },
    );
  }
  const components = [{ type: 'text', variant: 'caption', text: captionOf(view, language) }];
  if (view.fresh && Number.isFinite(view.power?.soc)) {
    components.push({
      type: 'gauge',
      value: Math.round(view.power.soc),
      min: 0,
      max: 100,
      unit: '%',
      label: clip(t('tileBattery', language), 24),
      color: WIDGET_COLORS.SUCCESS,
    });
  }
  if (Number.isFinite(charge?.maxSoc)) {
    components.push({
      type: 'value',
      value: Math.round(charge.maxSoc),
      unit: '%',
      label: clip(t('tileMaxSoc', language), 24),
      icon: 'battery-charging',
      color: charge.enabled ? WIDGET_COLORS.PRIMARY : WIDGET_COLORS.NEUTRAL,
    });
  }
  if (Number.isFinite(discharge?.cutoffSoc)) {
    components.push({
      type: 'value',
      value: Math.round(discharge.cutoffSoc),
      unit: '%',
      label: clip(t('tileCutoffSoc', language), 24),
      icon: 'battery',
      color: WIDGET_COLORS.WARNING,
    });
  }
  const rows = [];
  if (charge) {
    rows.push(
      {
        label: clip(t('rowGridCharge', language), 40),
        value: clip(t(charge.enabled ? 'valueOn' : 'valueOff', language), 40),
        color: charge.enabled ? WIDGET_COLORS.SUCCESS : WIDGET_COLORS.NEUTRAL,
      },
      {
        label: clip(t('rowGridChargePeriods', language), 40),
        value: clip(periodsText(charge.periods, language), 40),
        color: WIDGET_COLORS.INFO,
      },
    );
  }
  if (discharge) {
    rows.push(
      {
        label: clip(t('rowDischarge', language), 40),
        value: clip(t(discharge.enabled ? 'valueOn' : 'valueOff', language), 40),
        color: discharge.enabled ? WIDGET_COLORS.SUCCESS : WIDGET_COLORS.NEUTRAL,
      },
      {
        label: clip(t('rowDischargePeriods', language), 40),
        value: clip(periodsText(discharge.periods, language), 40),
        color: WIDGET_COLORS.INFO,
      },
    );
  }
  rows.push({
    label: clip(t('rowSceneControl', language), 40),
    value: clip(t(allowControl ? 'valueAllowed' : 'valueDisabled', language), 40),
    color: allowControl ? WIDGET_COLORS.WARNING : WIDGET_COLORS.NEUTRAL,
  });
  if (Number.isFinite(view.configAt)) {
    rows.push({
      label: clip(t('rowSettingsRead', language), 40),
      value: clip(formatTime(view.configAt, { language, timeZone, now }), 40),
      color: WIDGET_COLORS.NEUTRAL,
    });
  }
  components.push({ type: 'status', items: rows });
  return { ttl_seconds: TTL_SECONDS.schedule, components };
}

export {
  WIDGETS,
  TTL_SECONDS,
  clip,
  messageContent,
  powerTile,
  energyTile,
  todayEnergies,
  periodsText,
  buildLiveWidget,
  buildTodayWidget,
  buildScheduleWidget,
};

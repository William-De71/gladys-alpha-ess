// -----------------------------------------------------------------------------
// The answers of the Alpha ESS Open API, made safe. Field names and units are
// those of the portal documentation as checked live by the reference library
// alphaess-openAPI (docs/API.md): powers in W, energies in kWh, nominal powers
// in kW, SOC in %. Any field may be null (an inverter that does not report it,
// a tariff not set on the portal, a server hiccup): a missing or non-numeric
// value is null, never 0 — a 0 that is not one would show as a fall in the
// history.
//
// Signs: `pgrid` is positive when the house imports from the grid, negative
// when it exports (documented); `pbat` is positive when the battery
// discharges, negative when it charges (the documented live sample: in the
// evening, pload 1275 W ≈ pbat 1264 W + pgrid 11 W with no sun).
// -----------------------------------------------------------------------------

/**
 * @description A finite number, or null.
 * @param {unknown} value - "12.5", 12.5, null.
 * @returns {number|null} The number.
 */
function num(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

/**
 * @description A trimmed string, or null.
 * @param {unknown} value - The value.
 * @param {number} [max] - Maximum length.
 * @returns {string|null} The string.
 */
function str(value, max = 100) {
  if (typeof value !== 'string' && typeof value !== 'number') {
    return null;
  }
  const text = String(value).trim();
  return text ? text.slice(0, max) : null;
}

/**
 * @description The systems of getEssList.
 * @param {unknown} data - The `data` of the answer.
 * @returns {object[]} `{ sn, inverterModel, batteryModel, batteryCapacity,
 * inverterPower, pvPower, usableCapacity, emsStatus }`, kW and kWh.
 */
function parseEssList(data) {
  if (!Array.isArray(data)) {
    return [];
  }
  const seen = new Set();
  return data
    .map((item) => ({
      sn: str(item?.sysSn, 40),
      inverterModel: str(item?.minv, 60),
      batteryModel: str(item?.mbat, 60),
      batteryCapacity: num(item?.cobat),
      usableCapacity: num(item?.surplusCobat),
      inverterPower: num(item?.poinv),
      pvPower: num(item?.popv),
      emsStatus: str(item?.emsStatus, 40),
    }))
    .filter((system) => {
      if (!system.sn || !/^[A-Za-z0-9_-]+$/.test(system.sn) || seen.has(system.sn)) {
        return false;
      }
      seen.add(system.sn);
      return true;
    });
}

/**
 * @description The power now (getLastPowerData).
 * @param {unknown} data - The `data` of the answer.
 * @returns {object|null} `{ pv, load, grid, battery, soc, ev, evDetail }` in W
 * and %, null when the answer has nothing usable.
 */
function parsePower(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return null;
  }
  const evDetail = [1, 2, 3, 4].map((i) => num(data.pevDetail?.[`ev${i}Power`]));
  const power = {
    pv: num(data.ppv),
    load: num(data.pload),
    grid: num(data.pgrid),
    battery: num(data.pbat),
    soc: num(data.soc),
    ev: num(data.pev),
    evDetail,
  };
  if (Number.isFinite(power.soc)) {
    power.soc = Math.min(100, Math.max(0, power.soc));
  }
  const known = ['pv', 'load', 'grid', 'battery', 'soc'].some((key) => power[key] !== null);
  return known ? power : null;
}

const ENERGY_FIELDS = {
  pv: 'epv',
  input: 'eInput',
  output: 'eOutput',
  charge: 'eCharge',
  discharge: 'eDischarge',
  gridCharge: 'eGridCharge',
  ev: 'eChargingPile',
};

/**
 * @description The energies of a day (getOneDateEnergyBySn).
 * @param {unknown} data - The `data` of the answer.
 * @returns {object|null} `{ date, pv, input, output, charge, discharge,
 * gridCharge, ev }` in kWh (never negative), null when empty.
 */
function parseDayEnergy(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return null;
  }
  const energy = { date: str(data.theDate, 10) };
  let known = false;
  for (const [key, field] of Object.entries(ENERGY_FIELDS)) {
    const value = num(data[field]);
    energy[key] = value === null ? null : Math.max(0, value);
    known ||= value !== null;
  }
  return known ? energy : null;
}

/**
 * @description The totals of today (getSumDataForCustomer).
 * @param {unknown} data - The `data` of the answer.
 * @returns {object|null} `{ load, pv, input, output, selfConsumption,
 * selfSufficiency }`: kWh, and % (0..100) or null.
 */
function parseSummary(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return null;
  }
  // The portal gives the two ratios as fractions (0..1): the HA integration
  // multiplies them by 100. A value above 1 is already a percentage.
  const percent = (value) => {
    const number = num(value);
    if (number === null || number < 0) return null;
    return Math.min(100, number <= 1 ? number * 100 : number);
  };
  const kwh = (value) => {
    const number = num(value);
    return number === null ? null : Math.max(0, number);
  };
  const summary = {
    load: kwh(data.eload),
    pv: kwh(data.epvtoday),
    pvTotal: kwh(data.epvtotal),
    input: kwh(data.einput),
    output: kwh(data.eoutput),
    selfConsumption: percent(data.eselfConsumption),
    selfSufficiency: percent(data.eselfSufficiency),
  };
  return Object.values(summary).some((value) => value !== null) ? summary : null;
}

/**
 * @description A time of the charge settings: "HH:mm" on the 15-minute grid.
 * @param {unknown} value - "01:00".
 * @returns {string|null} The time.
 */
function readSlot(value) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value ?? '').trim());
  if (!match) {
    return null;
  }
  const [hour, minute] = match.slice(1).map(Number);
  if (hour > 23 || minute > 59) {
    return null;
  }
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

/**
 * @description The charge from the grid settings (getChargeConfigInfo).
 * @param {unknown} data - The `data` of the answer.
 * @returns {object|null} `{ enabled, maxSoc, periods: [[from, to], [from, to]] }`.
 */
function parseChargeConfig(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return null;
  }
  return {
    enabled: num(data.gridCharge) === 1,
    maxSoc: num(data.batHighCap),
    periods: [
      [readSlot(data.timeChaf1), readSlot(data.timeChae1)],
      [readSlot(data.timeChaf2), readSlot(data.timeChae2)],
    ],
  };
}

/**
 * @description The discharge time control settings (getDisChargeConfigInfo).
 * @param {unknown} data - The `data` of the answer.
 * @returns {object|null} `{ enabled, cutoffSoc, periods: [[from, to], [from, to]] }`.
 */
function parseDischargeConfig(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return null;
  }
  return {
    enabled: num(data.ctrDis) === 1,
    cutoffSoc: num(data.batUseCap),
    periods: [
      [readSlot(data.timeDisf1), readSlot(data.timeDise1)],
      [readSlot(data.timeDisf2), readSlot(data.timeDise2)],
    ],
  };
}

/**
 * @description The powers of a day (getOneDayPowerBySn), in time order.
 * @param {unknown} data - The `data` of the answer.
 * @param {Function} toInstant - `(date, time) => ms` in the timezone of the system.
 * @returns {object[]} `{ at, pv, load, soc, feedIn, gridCharge, ev }`.
 */
function parseDayPower(data, toInstant) {
  if (!Array.isArray(data)) {
    return [];
  }
  return data
    .map((item) => {
      const match = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})/.exec(String(item?.uploadTime ?? ''));
      const at = match ? toInstant(match[1], match[2]) : null;
      return {
        at,
        pv: num(item?.ppv),
        load: num(item?.load),
        // The live API says cbat; the portal documents cobat.
        soc: num(item?.cbat ?? item?.cobat),
        feedIn: num(item?.feedIn),
        gridCharge: num(item?.gridCharge),
        ev: num(item?.pchargingPile ?? item?.pChargingPile),
      };
    })
    .filter((point) => Number.isFinite(point.at))
    .sort((a, b) => a.at - b.at);
}

/**
 * @description The EV chargers of a system (getEvChargerConfigList).
 * @param {unknown} data - The `data` of the answer.
 * @returns {object[]} `{ sn, model }`.
 */
function parseEvChargers(data) {
  if (!Array.isArray(data)) {
    return [];
  }
  const seen = new Set();
  return data
    .map((item) => ({ sn: str(item?.evchargerSn, 40), model: str(item?.evchargerModel, 60) }))
    .filter((charger) => {
      if (!charger.sn || !/^[A-Za-z0-9_-]+$/.test(charger.sn) || seen.has(charger.sn)) {
        return false;
      }
      seen.add(charger.sn);
      return true;
    });
}

// The states of getEvChargerStatusBySn (7 and 8 are not documented).
const EV_STATES = {
  1: 'available',
  2: 'preparing',
  3: 'charging',
  4: 'suspended_evse',
  5: 'suspended_ev',
  6: 'finishing',
  9: 'faulted',
};

/**
 * @description The state of an EV charger. The portal describes `data` as a
 * list and its fields as an object: both are read.
 * @param {unknown} data - The `data` of the answer.
 * @returns {string|null} A value of EV_STATES, null when unknown.
 */
function parseEvStatus(data) {
  const item = Array.isArray(data) ? data[0] : data;
  const code = num(item?.evchargerStatus);
  return EV_STATES[code] ?? null;
}

export {
  num,
  str,
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
  EV_STATES,
};

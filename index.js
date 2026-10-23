// -----------------------------------------------------------------------------
// Entry point of the Alpha ESS external integration.
//
// The hybrid inverters, batteries and EV chargers of an Alpha ESS developer
// account (open.alphaess.com), through the official Open API, with the AppID
// and AppSecret of the user:
//   - devices: one per system (solar, battery, grid, house, energies) and one
//     per Alpha ESS EV charger, offered on the Discovery screen (src/device.js);
//   - scene triggers: battery full / low, grid export / import started, system
//     offline / back, EV charger state, access refused;
//   - scene actions: charge from the grid, discharge time control, start /
//     stop an EV charger (off unless allowed in the configuration), the
//     energies of today;
//   - dashboard widgets: energy flow now, today, battery schedule.
//
// This file only wires the SDK client: the handlers are in src/app.js.
//
// Environment variables provided by the Gladys supervisor:
//   GLADYS_HOST_API_URL / GLADYS_INTEGRATION_TOKEN / GLADYS_INTEGRATION_SELECTOR
//   TZ (the timezone of Gladys: the dates of the energies of the day)
// The SDK reads the first three: `new GladysIntegration()` is enough.
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';
import { GladysIntegration, logger } from '@gladysassistant/integration-sdk';
import { createApp } from './src/app.js';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

const gladys = new GladysIntegration();
createApp(gladys);

// --- Startup -----------------------------------------------------------------------
logger.info(`Starting the Alpha ESS integration ${version}...`);
gladys.connect().catch((err) => {
  logger.error('Initial connection failed', err);
  process.exit(1);
});

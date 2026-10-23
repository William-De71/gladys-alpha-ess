# CLAUDE.md

Project rules for coding assistants (Claude Code reads this file) and for human
contributors.

## What this is

A Gladys Assistant **external integration** for **Alpha ESS** hybrid
inverters, batteries and EV chargers: a Node.js service (Node 22+, ESM, no
build step) in its own sandboxed Docker container, talking to Gladys through
[`@gladysassistant/integration-sdk`](https://github.com/GladysAssistant/integration-sdk-js),
its only runtime dependency, and to the official Alpha ESS Open API
(<https://open.alphaess.com>, base `https://openapi.alphaess.com/api`) with the
AppID and AppSecret of the user's developer account. `type: "device"`, Gladys
5.1.0+ (widgets, scenes), `transports: ["cloud"]`. Not affiliated with Alpha
ESS. The portal needs an account to read: the endpoints, fields, units and
return codes come from its transcription by the reference library
[alphaess-openAPI](https://github.com/CharlesGillanders/alphaess-openAPI)
(`docs/API.md`, `docs/RETURN_CODES.md`, checked live by its authors).
**Never tested with a real account**: only the answer to an unknown AppID was
checked live (HTTP 200, `{"code":6007,"msg":"Sign check error"}`, no `data`).

## Commands

```bash
npm install
npm test                                  # node --test; a fake Alpha ESS HTTP server on 127.0.0.1
node --test test/app.test.js              # one file
UPDATE_BASELINE=1 npm test                # rewrite test/fixtures/discovery.baseline.json (on purpose only)
npm run lint                              # ESLint
npm run format:check                      # Prettier, as the CI runs it
npx github:GladysAssistant/integration-store . --skip-image-check   # store checks
scripts/build-cover.sh                    # cover.jpg from docs/assets/cover.svg
docs/illustrations/render.sh              # docs/assets/widgets.<lang>.png
node .github/scripts/release.mjs next     # the version the next release would get
```

## Architecture

```
index.js               SDK wiring only (new GladysIntegration + createApp)
src/app.js             every handler; the timer (what is due per system), devices and states,
                       scene events, scene actions, widgets, configuration buttons, status
src/alphaess-api.js    HTTP client: appId / timeStamp / sign headers (SHA-512), verbs, the
                       envelope { code, msg, data }, return codes -> kinds, one request at a
                       time 10 s apart, writes first, pause and slower pace after a 6053
src/parse.js           the answers made safe (null is null, never 0), signs of pgrid / pbat
src/energy.js          indexes built from the energies of each day (midnight, catch-up)
src/device.js          one device per system and per EV charger, features and states
src/events.js          triggers (battery, grid direction with hysteresis, offline), keys, outputs
src/actions.js         fields of the battery scene actions -> full update bodies, EV commands
src/widgets.js         live, today and schedule widgets
src/time.js            local dates and times (TZ of Gladys, Intl only)
src/store.js           /data/alpha-ess.json
src/config.js          AppID, AppSecret, control allowed, power interval, language
src/i18n.js            runtime texts, en / fr / de / es
test/helpers/fake-alphaess.js   the fake Alpha ESS (signature check, verbs, return codes)
.github/scripts/release.mjs     version, changelog, bump (tested in test/)
```

## Rules

- **External ids are forever**, and so is every key users store:
  `ext:<selector>:system:<sysSn>`, `ext:<selector>:evcharger:<evchargerSn>`,
  features `…:<key>` (`pv_power`, `battery_level`, `battery_charge_power`,
  `battery_discharge_power`, `grid_power`, `load_power`, `pv_today`,
  `load_today`, `pv_index`, `grid_import_index`, `grid_export_index`,
  `battery_charge_index`, `battery_discharge_index`; `connector_status`,
  `charging_state`, `power`), feature `category` / `type` / `unit` / `min` /
  `max`, the keys of `config_schema` and `actions` (and their fields),
  `last_language`, widgets and settings, triggers (fields, options,
  variables), scene actions (fields, option values, outputs).
  `test/structure.test.js` compares them to
  `test/fixtures/discovery.baseline.json`: never update it to make a test pass
  without a documented migration.
- **Core contracts of the categories** (server/utils/constants.js, the same in
  5.1.0 and on master): battery-storage powers are >= 0 (the signed `pbat`
  becomes charge and discharge), grid-sensor `power` is signed (import > 0)
  with symmetric bounds, the house load measured by the inverter is
  energy-sensor `power`. **Never an energy-sensor `index` / `energy` nor a
  `daily-consumption`**: Gladys would count the house as a consumer and twice
  next to a Linky.
- **Indexes are built, not read**: index = finished days + today; never down;
  the last value of a day is counted at midnight and the day read again later.
- **The pace.** Every request goes through the client queue: 10 s apart,
  writes before reads, a 6053 pauses the readings a minute and doubles the
  spacing. Never a request from a widget handler, a `get_today` action, or at
  startup before its time. The curve of the day only while a "today" widget
  is shown.
- **Writes are off by default** (`allow_control`). The battery settings are
  full replacements: read first, merge, never send an unchanged setting
  (Alpha ESS documents about one change a day). Times on quarter hours, SOC 10
  to 100.
- **`should_poll` stays false**: the integration has its own timer.
- **The AppSecret** is a `secret`: never logged, never in /data, never sent —
  only the SHA-512 signature travels.
- **Times**: the dates of Alpha ESS are local: the TZ of Gladys, else UTC.
  Never `new Date().getHours()`.
- **Scene events** once per transition, never at the first reading, never
  from a scene action.
- **Scene action periods are `string` fields** (they take `{{…}}`), the SOC
  `number` fields with min / max. 10 fields at most per action.
- **The container rootfs is read-only.** Write only under `/data`.
- **Four languages.** Every user-facing text (manifest, `src/i18n.js`,
  `docs/*.md`, README) exists in en, fr, de, es; `test/i18n.test.js` checks it.
  German says "du", Spanish "usted".
- **Widget images.** After any change to a widget content, run
  `docs/illustrations/render.sh` again and look at the four PNG files.
- **Versions belong to the Release workflow**: never edit `version` in
  `package.json`, the lockfile or the manifest, nor the `docker_image` tag.
  Below 1.0.0 until the maintainer runs Release with `release-as: 1.0.0`.
- **Changelog.** Ne jamais éditer CHANGELOG.md à la main, il est généré à la
  release. Écris le titre de PR comme la ligne que l'utilisateur lira.
- **Commits and PR titles** follow Conventional Commits, in English.
- **Forum drafts** (`.github/forum-*.md`) are never committed.
- **Style.** Prettier formats, ESLint catches mistakes. Comments explain why,
  in English. Tests never touch the network.

## Pitfalls

- `msg` is localized by the portal (even Chinese on an English account): read
  `code` only. A wrong AppID answers 6007 with no `data` field at all.
- `code: 200` does not promise data: writes answer `data: null`,
  getEvChargerConfigList `[]` without a charger.
- getVerificationCode is GET (the portal says JSON), bindSn is POST (the
  Postman collection says GET); 6003 on bindSn means already bound.
- getOneDayPowerBySn says `cbat` / `pchargingPile` live, `cobat` /
  `pChargingPile` on the portal: both are read.
- 6042 (system offline) is routine at night on some systems: offline only
  after 10 minutes. 6017 means "not for this model / account" (the periodic
  schedule endpoints, sometimes the charge settings): never retried soon.
- SMILE-G3 inverters keep their schedule in getTimeChargeBySn /
  setTimeChargeBySn (often 6017 for third parties); the legacy settings may
  be accepted and ignored. Not used: documented as a limit.
- `node --test` also runs `test/helpers/`: nothing starts on import.
- The validator of the Gladys core creates `gladys-development.duckdb` in the
  current folder: run it from elsewhere.

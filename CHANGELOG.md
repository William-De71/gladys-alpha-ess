# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions
follow [Semantic Versioning](https://semver.org/). This file is generated at
each release from the Conventional Commits: do not edit it by hand.

## [0.1.0] - 2026-10-23

### Added

- **systems:** every Alpha ESS system bound to the AppID of a developer account (open.alphaess.com), through the official Open API, each request signed with SHA-512 so the AppSecret never travels; one request at a time, 10 seconds apart, a pause and a slower pace when Alpha ESS answers 6053
- **devices:** one device per system: solar power, battery level, battery charge and discharge power, signed grid power (import +, export −), house consumption, solar production and house consumption of the day, and energy indexes built from the energies of each day (solar production, grid import and export, battery charge and discharge) without counting the house twice next to a Linky; one device per Alpha ESS EV charger (connector status, charging state, power)
- **scenes:** triggers when the battery is full or reaches its cut-off SOC, when the house starts exporting to or importing from the grid, when a system goes offline or comes back, when an EV charger changes state and when Alpha ESS refuses the access; actions to set the charge from the grid and the discharge time control (periods, SOC limits), to start or stop an EV charger, all off unless allowed in the configuration, and to read the energies of today
- **widgets:** the energy flow now (battery, solar, house, grid), today (energies, self-sufficiency, power curve of the day) and the battery schedule stored on the cloud
- **configuration:** AppID and AppSecret with a guide, binding a system to the AppID from Gladys (code e-mailed to the owner, then the code), the reading interval of the power, "Test the connection" and "Diagnostic" buttons
- **i18n:** English, French, German and Spanish for the manifest, the runtime texts, the documentation and the README

[0.1.0]: https://github.com/William-De71/gladys-alpha-ess/releases/tag/v0.1.0

# dark-toolbox

Dark 工具集 for DeepSeek Harness — practical, lightweight, optimized.

## Features

- **Background plugin installs.** A small Host queue drives `pluginManager.installBundle` with its own request id, so pnpm keeps running while you keep using DSH. Installs started anywhere in the profile (including the built-in Plugins dialog) are observed through the manager's `install-state` / `install-log` events.
- **Live install list.** A third tab beside **Installed** and **Discover** in the Plugins page, registered through the `plugins.tab` slot, showing each install's phase, registry attempt, elapsed time, real-time pnpm output, result, and failures.
- **Dark工具集 settings page.** Every feature has a switch there; choices persist per browser.

## Install

Install this directory as a bundle in the current profile: use the install field on the Plugins page, or the `plugin_manager` `install_bundle` action with the absolute path of this directory. No dependencies or build step are required.

## How it works

- Host half (`index.js`) registers `/dark-toolbox/api`: JSON actions (`install`, `cancel`, `approve`, `dismiss`, `clear`, `status`) plus a Server-Sent Events stream for live progress. It subscribes to the plugin manager's install events and keeps a bounded in-memory history for the current DSH process.
- Client half (`client.js`) registers the settings section (`settings.section`) and the install tab (`plugins.tab`). It uses only React from the host module table and theme tokens for styling.

Installs run one at a time; additional requests are queued. Failed runs that report `pendingBuilds` show an **Allow these scripts and retry** action. Completed install history is not persisted across a DSH restart.
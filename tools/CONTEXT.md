# Directory Context: `/tools`

## Purpose
Everything that builds, installs, launches, packages, or loads the product. What checks it is in `tests/`.

## Key Exports & Entry Points
- `build_extension.ts`, `package_release.ts`, `npm_command_entry.ts`: bundle the extension; wrap it plus a bundled host into a folder needing no repository, with the manifest npm publishes it with; the command `npx webmcp_everywhere` starts. `npm run build`, `npm run package:release`, `npm run pack:npm`
- `sync_adapter_registry.ts`: reads every adapter folder, writes the adapter list. `npm run sync:adapters`
- `new_adapter.ts`: writes an adapter folder, its runner and its documents, then registers it. `npm run new-adapter`
- `load_adapter.ts`, `unload_adapter.ts`: check an adapter folder from anywhere and install it, and remove it. `npm run load-adapter`, `npm run unload-adapter`
- `launch_chrome.ts`: the recipe for a Chrome that works, wherever it lives, and the waits on the registrar. `npm run chrome`
- `install_native_host.ts`, `uninstall_native_host.ts`, `packaged_release_installation.ts`: register the host with Chrome and take that back out; copy a packaged release somewhere npm will not empty it, and register that. `npm run install:host`, `npm run uninstall:host`
- `adapter_validation/`, `chrome_devtools_protocol/`, `environment_reports/`: the checks an adapter must pass, the connection to a running Chrome, and what a machine and each site can do — each has its own CONTEXT.md.

## Rules
- A tool writing into a hand-written file writes only between its own markers: `sync_adapter_registry.ts` in `adapter_registry.ts`, `adapter_freshness.ts` in `README.md`. Neither writes a whole file it did not generate, and nothing goes into `manifest.json`.
- `new_adapter.ts` writes no knowledge of any site. Every adapter earns its rules by probing the live site, and a scaffold that guessed a selector teaches the opposite.
- `load_adapter.ts` runs the same checks the build runs, and prints every tool with its permission class first: installing somebody else's code into your own logged-in sessions is done on purpose.
- Every way of installing something has a way back, as easy to find as the way in: `unload_adapter.ts` beside `load_adapter.ts`, `uninstall_native_host.ts` beside `install_native_host.ts`.
- The repository is not the published package: the root `package.json` is private, and `package_release.ts` writes the `build/release/package.json` npm publishes. Nothing registers Chrome against a folder npm may empty, so the command copies the release into the state directory first and names the copy.
- A file name inside a packaged release is spelled once, in `release_layout.ts`. Four programs need those names, and the fourth is where a stale one hides.
- Anything reading an adapter bundles it with esbuild and runs the bundle, never parses source: adapters import with a `.js` extension, which Node.js cannot resolve from `.ts`.
- Only `npm run install:host` and the installed `npx webmcp_everywhere` may write into the everyday Chrome; everything else passes `isEverydayChromeCovered: false`. `InstallNativeHost.plan` names every file before `run` writes one, and installing and uninstalling share the one `manifestDirectories`: a missed directory leaves Chrome starting a program the user asked it to stop.
- A packaged release carries its own launcher, its own bundled host, and its own copy of the manifest template, and `InstallNativeHost` is pointed at them. A release that reached for `src/` would pass every check here and fail for every user.
- Every expression given to `ServiceWorkerEvaluation` is safe to run twice, because it retries — see [chrome_devtools_protocol/CONTEXT.md](chrome_devtools_protocol/CONTEXT.md) for why an idle service worker forces that.
- Nothing in `src/` imports from here, and nothing here writes into `src/`, which `tests/source_boundary.test.ts` checks. Node.js runs these files directly, so they stay within erasable syntax: no `enum`, no runtime `namespace`, no parameter properties, no decorators.
- Every step `LaunchChrome` takes prevents a silent failure, none is safe to drop, and all are named in [build_and_install.md](../docs/build_and_install.md). The manifest names no site, so a page opened before the registrar has run carries no adapter, and the check fails for a reason unlike the cause.

## Background
- Every rule about launching Chrome is a failure that happened in [issue #2](https://github.com/jeromeetienne/webmcp_everywhere/issues/2); none report an error. The everyday Chrome, the announcement, and the shared directory list come from [issue #4](https://github.com/jeromeetienne/webmcp_everywhere/issues/4).
- Loading an adapter with no rebuild is milestone 3 of [issue #9](https://github.com/jeromeetienne/webmcp_everywhere/issues/9); the nightly checks, the table, and the release are milestone 4. The package on npmjs is [issue #12](https://github.com/jeromeetienne/webmcp_everywhere/issues/12).

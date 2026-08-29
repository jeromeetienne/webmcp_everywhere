# Directory Context: `/tools`

## Purpose
Everything that builds, installs, or launches the product. The code that checks it lives in `tests/`.

## Key Exports & Entry Points
- `build_extension.ts`: `BuildExtension` — runs the adapter review checks, then bundles into `build/chrome_extension/`. `npm run build`
- `sync_adapter_registry.ts`: `SyncAdapterRegistry` — writes the adapter list and the three manifest match pattern lists from the folders under `src/site_adapters/`. `npm run sync:adapters`
- `new_adapter.ts`: `NewAdapter` — writes a new adapter folder, its runner, and its two documents, then registers it. `npm run new-adapter`
- `launch_chrome.ts`: `LaunchChrome` — the four-step recipe for a Chrome that works. `npm run chrome`
- `install_native_host.ts`: `InstallNativeHost` — registers the host with Chrome. `npm run install:host`
- `uninstall_native_host.ts`: `UninstallNativeHost` — takes that registration back out. `npm run uninstall:host`
- `generate_extension_key.ts`: `GenerateExtensionKey` — pins the extension identifier.
- `grant_acting.ts`: `GrantActing` — stands in for the popup, waiting for the service worker first. `npm run grant`
- `adapter_validation/`: The checks an adapter must pass before a build will bundle it — see its own CONTEXT.md.
- `chrome_devtools_protocol/`: The connection to a locally running Chrome — see its own CONTEXT.md.

## Rules
- `sync_adapter_registry.ts` writes only between the `sync:adapters` markers in `adapter_registry.ts`, and only the three match pattern lists in `manifest.json`. It never writes a whole file it did not fully generate, because everything else in those two files is product code somebody wrote by hand.
- `new_adapter.ts` writes no knowledge of any site. Every adapter earns its rules by probing the live site, and a scaffold that guessed a selector would teach the opposite.
- Both read the adapters by bundling them with esbuild and running the bundle, never by parsing source. Adapters import with a `.js` extension for the browser, which Node.js cannot resolve from a `.ts` file on disk.
- `install_native_host.ts` fills in `data/native_messaging_template/com.webmcp_everywhere.host.json` rather than writing the host manifest out of string literals.
- Only `npm run install:host` may write into the everyday Chrome, the browser the user installed. Everything else passes `isEverydayChromeCovered: false` and covers a throwaway user data directory alone.
- `InstallNativeHost.plan` names every file before `InstallNativeHost.run` writes one, and `run` writes exactly what `plan` named. Announcing a change to a user's browser after making it is not announcing it.
- Installing and uninstalling take their directory list from the one `InstallNativeHost.manifestDirectories`: an uninstallation that misses a directory leaves Chrome starting a program the user asked it to stop starting.
- Nothing in `src/` imports from here. `node --test tests/source_boundary.test.ts` refuses any relative import that leaves `src/`.
- `GrantActing` is the only place that writes the extension's settings from outside the browser, so the wait for its service worker is written once rather than in every caller.
- The build writes to `build/chrome_extension/`, copying `manifest.json` and the popup markup in beside the bundles, because Chrome loads an unpacked extension from the folder holding `manifest.json`. Nothing is ever written into `src/`.
- Node.js runs these files directly, so they stay within erasable syntax: no `enum`, no runtime `namespace`, no parameter properties, no decorators. `npm run typecheck` checks that.
- Never use `--load-extension`. Chrome 151 ignores it silently, leaving zero extensions installed and nothing in the log. Install with the Chrome DevTools Protocol method `Extensions.loadUnpacked`.
- The profile needs `enable-webmcp-testing@1` in `Local State` before launch, or `document.modelContext` is absent, and `extensions.ui.developer_mode` in `Preferences`, or the extension installs but its content scripts never run.
- `LaunchChrome` launches hidden unless `WEBMCP_EVERYWHERE_CHROME_VISIBILITY` is `visible`; `npm run chrome` shows one. Hidden is `--headless=new`, which still installs the extension and still starts the native messaging host.
- The launcher deletes the profile before every launch. Chrome does not re-read an unpacked extension it has already installed, so keeping the profile silently runs the previous build, and every check still passes while testing old code.

## Background
- Every rule about launching Chrome is a failure that actually happened while building [issue #2](https://github.com/jeromeetienne/webmcp_everywhere/issues/2); none of them report an error.
- The rules about the everyday Chrome, the announcement, and the shared directory list come from [issue #4](https://github.com/jeromeetienne/webmcp_everywhere/issues/4).
- The separation from `tests/` came from `src/` having filled up with code that never ships.

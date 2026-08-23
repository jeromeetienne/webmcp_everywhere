# Directory Context: `/tools`

## Purpose
Everything that builds, installs, or launches the product. The code that checks it lives in `tests/`.

## Key Exports & Entry Points
- `build_extension.ts`: `BuildExtension` — runs the adapter review checks, then bundles into `build/chrome_extension/`. `npm run build`
- `launch_chrome.ts`: `LaunchChrome` — the four-step recipe for a Chrome that works. `npm run chrome`
- `install_native_host.ts`: `InstallNativeHost` — registers the host with Chrome. `npm run install:host`
- `generate_extension_key.ts`: `GenerateExtensionKey` — pins the extension identifier.
- `grant_acting.ts`: `GrantActing` — stands in for the popup, waiting for the service worker first. `npm run grant`
- `adapter_validation/`: The checks an adapter must pass before a build will bundle it — see its own CONTEXT.md.
- `chrome_devtools_protocol/`: The connection to a locally running Chrome — see its own CONTEXT.md.

## Rules
- `install_native_host.ts` never writes the native messaging host manifest out of string literals. It fills in `data/native_messaging_template/com.webmcp_everywhere.host.json` — see that folder's own CONTEXT.md.
- Nothing in `src/` imports from here. `npm run verify:boundary` refuses any relative import that leaves `src/`.
- `GrantActing` is the only place that writes the extension's settings from outside the browser, so the wait for the extension's service worker to start is written once rather than in every caller.
- The build writes to `build/chrome_extension/` and copies `manifest.json` and `user_interface/popup.html` in beside the bundles, because Chrome loads an unpacked extension from the folder that holds `manifest.json`. Nothing is ever written into `src/`.
- Node.js runs these files directly, so they stay within erasable syntax: no `enum`, no runtime `namespace`, no parameter properties, no decorators. `npm run typecheck` checks that.
- Never use `--load-extension`. Chrome 151 ignores it silently, leaving zero extensions installed and nothing in the log. Install with the Chrome DevTools Protocol method `Extensions.loadUnpacked`.
- The profile needs `enable-webmcp-testing@1` in `Local State` before launch, or `document.modelContext` is absent, and `extensions.ui.developer_mode` in `Preferences`, or the extension installs but its content scripts never run.
- `LaunchChrome` launches hidden unless `WEBMCP_EVERYWHERE_CHROME_VISIBILITY` is `visible`; `npm run chrome` shows one. Hidden is `--headless=new`, which still installs the extension and still starts the native messaging host.
- The launcher deletes the profile before every launch. Chrome does not re-read an unpacked extension it has already installed, so keeping the profile silently runs the previous build, and every check still passes while testing old code.

## Background
- Every rule about launching Chrome is a failure that actually happened while building [issue #2](https://github.com/jeromeetienne/webmcp_everywhere/issues/2), each costing time because none of them report an error.
- The separation from `tests/`, and the move of the build output out of `src/`, came from `src/` having filled up with code that never ships.

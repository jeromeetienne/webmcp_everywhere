# Directory Context: `/tools`

## Purpose
Everything that builds, installs, launches, or loads the product. What checks it lives in `tests/`.

## Key Exports & Entry Points
- `build_extension.ts`: `BuildExtension` — checks every adapter, then bundles into `build/chrome_extension/`. `npm run build`
- `sync_adapter_registry.ts`: `SyncAdapterRegistry` — writes the adapter list from the folders under `src/site_adapters/`. `npm run sync:adapters`
- `new_adapter.ts`: `NewAdapter` — writes an adapter folder, its runner, and its documents, then registers it. `npm run new-adapter`
- `load_adapter.ts` and `unload_adapter.ts`: `LoadAdapter` and `UnloadAdapter` — check an adapter folder from anywhere and install it, and take it back out. `npm run load-adapter`, `npm run unload-adapter`
- `allow_user_scripts.ts`: `AllowUserScripts` — turns on **Allow User Scripts**, standing in for a person at `chrome://extensions`.
- `launch_chrome.ts`: `LaunchChrome` — the recipe for a Chrome that works. `npm run chrome`
- `install_native_host.ts` and `uninstall_native_host.ts`: `InstallNativeHost` and `UninstallNativeHost` — register the host with Chrome, and take that registration back out. `npm run install:host`, `npm run uninstall:host`
- `generate_extension_key.ts`: `GenerateExtensionKey` — pins the extension identifier.
- `grant_acting.ts`: `GrantActing` — stands in for the popup, waiting for the service worker. `npm run grant`
- `adapter_validation/`: The checks an adapter must pass before it reaches a browser — see its own CONTEXT.md.
- `chrome_devtools_protocol/`: The connection to a running Chrome — see its own CONTEXT.md.

## Rules
- `sync_adapter_registry.ts` writes only between the `sync:adapters` markers in `adapter_registry.ts`, never a whole file it did not generate. It writes nothing into `manifest.json`, which names no site at all.
- `new_adapter.ts` writes no knowledge of any site. Every adapter earns its rules by probing the live site, and a scaffold that guessed a selector teaches the opposite.
- `load_adapter.ts` runs the same `AdapterSchema` and `PermissionAudit` the build runs, and prints every tool with its permission class first. Installing somebody else's code into your own logged-in sessions is done on purpose, with the tool list in front of you.
- Every way of installing something has a way back, as easy to find as the way in: `unload_adapter.ts` beside `load_adapter.ts`, `uninstall_native_host.ts` beside `install_native_host.ts`.
- Those three read an adapter by bundling it with esbuild and running the bundle, never by parsing source. Adapters import with a `.js` extension for the browser, which Node.js cannot resolve from a `.ts` file on disk.
- Only `npm run install:host` may write into the everyday Chrome, the browser the user installed. Everything else passes `isEverydayChromeCovered: false` and covers a throwaway user data directory alone.
- `InstallNativeHost.plan` names every file before `run` writes one, and both take their directory list from the one `InstallNativeHost.manifestDirectories`. Announcing a change to a browser after making it is not announcing it, and an uninstallation that misses a directory leaves Chrome starting a program the user asked it to stop.
- `GrantActing` is the only place that writes the extension's settings from outside the browser, so the wait for its service worker is written once, not in every caller.
- Nothing in `src/` imports from here, and nothing here writes into `src/`. `node --test tests/source_boundary.test.ts` refuses any relative import that leaves `src/`.
- Node.js runs these files directly, so they stay within erasable syntax: no `enum`, no runtime `namespace`, no parameter properties, no decorators. `npm run typecheck` checks it.
- `LaunchChrome` waits for the extension to register its first content script before it opens any page. The manifest names no site, so a page opened before that gets no adapter, and every check after it fails for a reason that looks nothing like the cause.
- The launcher deletes the profile before every launch. Chrome does not re-read an unpacked extension it already installed, so keeping the profile runs the previous build while every check still passes.
- Every other step `LaunchChrome` takes prevents a silent failure: the two profile settings, `Extensions.loadUnpacked` rather than `--load-extension`, the visibility variable. All are named in [build_and_install.md](../docs/build_and_install.md), and none is safe to drop.

## Background
- Every rule about launching Chrome is a failure that happened while building [issue #2](https://github.com/jeromeetienne/webmcp_everywhere/issues/2); none of them report an error. The rules about the everyday Chrome, the announcement, and the shared directory list come from [issue #4](https://github.com/jeromeetienne/webmcp_everywhere/issues/4).
- Loading an adapter with no rebuild is milestone 3 of [issue #9](https://github.com/jeromeetienne/webmcp_everywhere/issues/9).

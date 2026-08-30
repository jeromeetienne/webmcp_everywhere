# Directory Context: `/tools/chrome_extension`

## Purpose
Everything that turns [`/contribs/chrome_extension`](../../contribs/chrome_extension/CONTEXT.md) into a running extension and puts it into a given state: bundle it, pin its identifier, launch a Chrome with it loaded, and set the two things a person would otherwise set by hand.

## Key Exports & Entry Points
- `build_extension.ts`: `BuildExtension` — checks every adapter, then bundles every script the manifest points at. `npm run build`
- `launch_chrome.ts`: `LaunchChrome` — the recipe for a Chrome that works, wherever it lives, and the waits on the registrar. `npm run chrome`
- `grant_acting.ts`: `GrantActing` — writes the settings the popup writes, straight into extension storage. `npm run grant`
- `allow_user_scripts.ts`: `AllowUserScripts` — turns on the **Allow User Scripts** toggle a loaded adapter cannot run without.
- `generate_extension_key.ts` and `generate_extension_key_entry.ts`: `GenerateExtensionKey` — generates the key pair that pins the extension identifier, once, by hand. Reading one back is `ExtensionIdentifier` in `packages/webmcp_everywhere/`, because that half ships.

## Rules
- Every step `LaunchChrome` takes prevents a silent failure, none is safe to drop, and all are named in [build_and_install.md](../../docs/build_and_install.md).
- Nothing here writes into the everyday Chrome: every launch passes `isEverydayChromeCovered: false`, and the one command allowed to write there is `npm run install:host`, in [`../webmcp_everywhere/`](../webmcp_everywhere/CONTEXT.md).
- `grant_acting.ts` and `allow_user_scripts.ts` reach a browser only through its remote debugging port, so they work against a Chrome this repository launched and never against the browser the user installed.
- `build_extension.ts` keeps each entry point's folder in the source path and only its base name in the output name. Letting esbuild derive the output path recreates the subfolders inside `dist/` and breaks every path in `manifest.json`.
- Nothing writes into `manifest.json` except `generate_extension_key.ts`, which adds the `key` field and leaves every other field alone.

## Background
- Every rule about launching Chrome is a failure that happened in [issue #2](https://github.com/jeromeetienne/webmcp_everywhere/issues/2) and none reports an error. The everyday Chrome and the announcement come from [issue #4](https://github.com/jeromeetienne/webmcp_everywhere/issues/4).
- Why the toggle exists at all, and why turning it on by hand is the intended way, is in [permissions_and_trust.md](../../docs/permissions_and_trust.md).
- Splitting `ExtensionIdentifier` out of `generate_extension_key.ts` came from milestone 3 of [issue #11](https://github.com/jeromeetienne/webmcp_everywhere/issues/11): it took the key-pair generation, which could never work for a user, out of both published bundles.

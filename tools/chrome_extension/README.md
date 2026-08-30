# The extension build and launch tools

This folder holds everything that turns [`/contribs/chrome_extension`](../../contribs/chrome_extension/README.md) into a running extension and puts a browser into the state a check needs: build it, key it, launch a Chrome with it loaded, grant the acting permission, and turn on the toggle a loaded adapter cannot run without.

Nothing here writes into the Chrome you use every day. Every launch uses a throwaway profile of its own. The single command allowed to touch your everyday Chrome is `npm run install:host`, which is in [`../webmcp_everywhere/`](../webmcp_everywhere/README.md).

## What is in here

- `build_extension.ts` — checks every adapter, then bundles every script `manifest.json` points at. `npm run build`
- `launch_chrome.ts` — launches a Chrome with the extension loaded, and waits until the extension is really ready. `npm run chrome`
- `grant_acting.ts` — writes the same settings the popup writes, straight into extension storage, so a check does not have to click the popup. `npm run grant`
- `allow_user_scripts.ts` — turns on the **Allow User Scripts** toggle that an adapter loaded with `npm run load-adapter` needs.
- `generate_extension_key.ts` and `generate_extension_key_entry.ts` — generate the key pair that pins the extension identifier. This is done once, by hand, by a maintainer.

## Running it

```bash
npm run build
```

```bash
npm run chrome
```

```bash
npm run grant
```

## Reading further

- The rules for editing this folder are in [CONTEXT.md](CONTEXT.md).
- What the build writes and what the launch does step by step: [build_and_install.md](../../docs/build_and_install.md).
- Why the **Allow User Scripts** toggle exists and why you turn it on by hand: [permissions_and_trust.md](../../docs/permissions_and_trust.md).

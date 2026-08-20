# WebMCP Everywhere

A browser extension that carries community-maintained WebMCP adapters — small scripts that register tools into sites that never shipped their own. One install, and an agent gains a usable tool surface on the sites you already use.

The idea and its reasoning are in [issue #1](https://github.com/jeromeetienne/webmcp_everywhere/issues/1). This repository currently holds the first vertical slice, planned in [issue #2](https://github.com/jeromeetienne/webmcp_everywhere/issues/2): one adapter, for the Playwright TodoMVC demonstration, proven end to end with a real agent.

## What works today

Ten tools on `https://demo.playwright.dev/todomvc/` — three read-only and seven acting. On a fresh install only the read-only tools register; the acting tools stay withheld until you opt in for that origin. Codex drives the site through them, with no screenshots and no Document Object Model guesswork.

## Try it

You need Google Chrome 149 or later. The WebMCP origin trial runs from Chrome 149 to Chrome 156.

```bash
npm install
npm run build      # checks every adapter, then bundles the extension
npm run chrome     # launches a throwaway Chrome with the extension installed
npm run verify     # 14 checks against the live site
```

`npm run chrome` uses a throwaway profile and never touches your everyday Chrome. It handles four steps that are each silent when they go wrong:

1. `enable-webmcp-testing@1` goes into the profile's `Local State`, or `document.modelContext` is simply absent.
2. `extensions.ui.developer_mode` goes into `Preferences`, or the extension installs but its content scripts never run.
3. Chrome launches with `--enable-unsafe-extension-debugging`.
4. The extension is installed with `Extensions.loadUnpacked` over the Chrome DevTools Protocol.

**Do not reach for `--load-extension`.** Chrome 151 ignores it, leaving zero extensions installed and nothing in the log.

## Letting an agent drive it

No agent speaks WebMCP yet, so `src/bridge` re-exposes the page's tools over Model Context Protocol.

```bash
npm run grant           # stands in for ticking the box in the popup
npm run verify:bridge   # 4 checks through a real Model Context Protocol client
```

Then point any Model Context Protocol client at `src/bridge/webmcp_bridge.mjs`. With Codex:

```bash
codex exec -c 'mcp_servers.webmcp_everywhere={command="node", args=["'"$PWD"'/src/bridge/webmcp_bridge.mjs"]}' "Add a todo called buy milk, mark it done, and tell me how many are left."
```

## Layout

- `src/adapter_format/` — what an adapter is, and the checks it must pass before a build will bundle it.
- `src/adapters/` — one folder per target site.
- `src/extension/` — the Manifest Version 3 extension.
- `src/bridge/` — the Model Context Protocol bridge.
- `tools/` — build, launch, and verification.

Each folder has its own `CONTEXT.md`.

## What this is not

There is no registry, no signing, no review pipeline, no telemetry, and no automated repair. Those are what make a catalogue viable at scale, and none of them can be designed honestly until one adapter has been written and has broken at least once.

# The Chrome DevTools Protocol bridge, and its runner

The bridge is a Model Context Protocol server on standard input and output. It carries the WebMCP tools registered on a browser page out to an agent, reaching the page over the Chrome DevTools Protocol. It exists so an adapter can be checked on its own, with the extension and the native messaging host taken out of the picture.

**This is not the product path.** The debugging port the bridge depends on is unauthenticated and reachable by every process on the machine, it needs a Chrome launched for the purpose, and it goes around the extension, which is the only place that knows which tabs have adapters and what you have allowed. An agent reaches the product through [`/packages/native_messaging_host`](../../packages/native_messaging_host/README.md).

## What is in here

- `libs/webmcp_bridge.ts` — the bridge itself. `npm run bridge`
- `webmcp_bridge.test.ts` — 4 checks that drive the bridge from a Model Context Protocol client, against a live page.

## Running it

```bash
npm run bridge
```

```bash
node --test tests/devtools_protocol_bridge/webmcp_bridge.test.ts
```

Reach for the bridge when `node --test tests/native_messaging_host/native_host.test.ts` fails and you need to tell an adapter fault from a delivery fault. It is the smallest path from an agent to a page in this repository.

## Reading further

- The rules for editing this folder are in [CONTEXT.md](CONTEXT.md).
- Why a Chrome extension cannot hold the port itself, and why this path is not the product: [why_a_native_messaging_host.md](../../docs/why_a_native_messaging_host.md).
- The three paths to the browser, and which runner covers which: [testing_and_verification.md](../../docs/testing_and_verification.md).

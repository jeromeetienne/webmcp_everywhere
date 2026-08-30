# Directory Context: `/tests/devtools_protocol_bridge`

## Purpose
A Model Context Protocol server on standard input and output that carries the WebMCP tools registered on a browser page out to an agent, reaching the page over the Chrome DevTools Protocol, and the runner that drives it. The bridge exists to check the adapters on their own, with the extension and the native messaging host taken out of the picture.

## Key Exports & Entry Points
- `libs/webmcp_bridge.ts`: `WebmcpBridge` — the stdio Model Context Protocol server this folder's runner drives. `npm run bridge`
- `webmcp_bridge.test.ts`: `WebmcpBridgeTest` — 4 checks that drive the bridge from a Model Context Protocol client, against a live page.
- Command to check this folder: `node --test tests/devtools_protocol_bridge/webmcp_bridge.test.ts`

## Rules
- This is not the product path. The Chrome DevTools Protocol debugging port it depends on is unauthenticated and reachable by every process on the machine, it needs a purpose-launched Chrome, and it bypasses the extension, which is the only place that knows which tabs have adapters and what the user has allowed. Agents reach the product through `src/native_messaging_host/`.
- Pass tool input to `executeTool` as a JSON string. Chrome 151 rejects a plain object with `UnknownError: Failed to parse input arguments`, whatever the specification's WebIDL says.
- Look tools up by name inside the page, never outside it. A `RegisteredTool` carries a live `window` reference, so it cannot be serialised across the Chrome DevTools Protocol boundary.
- Parse `inputSchema` before handing it on. WebMCP returns it as a JSON string, and a Model Context Protocol client rejects a tool whose schema is a string.
- Read the tool list from the page on every `tools/list`. Caching it would hide an adapter that registers or withdraws tools as the page changes.
- The runner sits here rather than in `tests/` because the bridge is its only subject. It launches its own Chrome rather than sharing `LivePageHarness`, since it reaches the page through the bridge instead of driving the page itself.
- The bridge is started as a child process by path, not imported, so `webmcp_bridge.test.ts` names `libs/webmcp_bridge.ts` in a `Path.join` and the `bridge` script in the root `package.json` names it again. Moving the file means editing both.

## Background
- This was the first path that worked, written before the extension and the native messaging host existed, and it is kept because it is the smallest way to tell an adapter fault from a delivery fault when `node --test tests/delivery_path/native_host.test.ts` fails.
- Verified with Codex driving the live TodoMVC page — see [issue #2](https://github.com/jeromeetienne/webmcp_everywhere/issues/2).

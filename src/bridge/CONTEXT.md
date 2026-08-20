# Directory Context: `/src/bridge`

## Purpose
Carries the WebMCP tools registered on a browser page out to agents that speak Model Context Protocol and not WebMCP, which today is all of them.

## Key Exports & Entry Points
- `webmcp_bridge.mjs`: `WebmcpBridge` — a Model Context Protocol server on standard input and output. `npm run bridge`
- `cdp_client.mjs`: `CdpClient` — one Chrome DevTools Protocol connection, also used by `tools/`.
- Command to check this folder: `npm run verify:bridge`

## Rules
- Pass tool input to `executeTool` as a JSON string. Chrome 151 rejects a plain object with `UnknownError: Failed to parse input arguments`, whatever the specification's WebIDL says.
- Look tools up by name inside the page, never outside it. A `RegisteredTool` carries a live `window` reference, so it cannot be serialised across the Chrome DevTools Protocol boundary.
- Parse `inputSchema` before handing it on. WebMCP returns it as a JSON string, and a Model Context Protocol client rejects a tool whose schema is a string.
- Read the tool list from the page on every `tools/list`. Caching it would hide an adapter that registers or withdraws tools as the page changes.
- This is the only folder under `src/` that opens a network connection, and it talks to a local Chrome and nothing else.

## Background
- The bridge exists because no shipping agent speaks WebMCP. It is not scaffolding for the demonstration; it is how any ordinary agent reaches this project's adapters until browsers ship an agent surface of their own.
- Verified with Codex driving the live TodoMVC page — see [issue #2](https://github.com/jeromeetienne/webmcp_everywhere/issues/2).

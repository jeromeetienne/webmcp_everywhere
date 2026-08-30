# Directory Context: `/tests/devtools_protocol_bridge/libs`

## Purpose
The stdio Model Context Protocol server the runner in the folder above drives. It holds no check of its own.

## Key Exports & Entry Points
- `webmcp_bridge.ts`: `WebmcpBridge` — carries the WebMCP tools registered on a browser page out to an agent over standard input and output, reaching the page over the Chrome DevTools Protocol. `npm run bridge`
- No command runs this folder: nothing here holds a check.

## Rules
- This file is started as a program, never imported. `webmcp_bridge.test.ts` names it in a `Path.join` and the `bridge` script in the root `package.json` names it again, so moving or renaming it means editing both.
- The rules the bridge itself must keep — how tool input is passed, why tools are looked up inside the page, why `inputSchema` is parsed, and why the tool list is never cached — are in the CONTEXT.md of the folder above, because they are what the runner there checks.

## Background
- Why this folder holds one file, against the convention that a lone file stays at the parent level: [issue #20](https://github.com/jeromeetienne/webmcp_everywhere/issues/20) chose to have every file that holds no check sit in a `libs/` folder, so that all three folders read the same way.
- Why this path is not the product: [why_a_native_messaging_host.md](../../../docs/why_a_native_messaging_host.md).

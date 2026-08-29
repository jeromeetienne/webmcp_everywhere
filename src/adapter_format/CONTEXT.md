# Directory Context: `/src/adapter_format`

## Purpose
Defines what an adapter is, how its tools are named, and how everything a page returns is framed before an agent sees it. The checks an adapter must pass live in `tools/adapter_validation/`, because they run at build time and are never bundled into a page.

## Key Exports & Entry Points
- `adapter_types.ts`: `Adapter`, `AdapterToolDefinition`, `PermissionClass`, `OriginGrant`. The shape everything else agrees on.
- `adapter_format_version.ts`: `ADAPTER_FORMAT_VERSION` — the version every adapter must carry, in a file holding nothing else so that Node.js can import it without bundling.
- `tool_naming.ts`: `ToolNaming` — qualifies `list_todos` into `demo_playwright_dev__list_todos`.
- `untrusted_content.ts`: `UntrustedContent` — cleans, bounds, frames, and flags everything a page returns.
- `webmcp_globals.d.ts`: Ambient declarations for `document.modelContext`, written from probing Chrome 151.

## Rules
- This folder imports nothing from `chrome_extension/` or from `site_adapters/`, so an adapter can be checked without a browser.
- A tool's `permissionClass` is checked against its handler's source by `tools/adapter_validation/permission_audit.ts`, never trusted. A handler that clicks, submits, navigates, or assigns to `value` is acting, whatever the field says.
- Every tool result passes through `UntrustedContent.frame` before an agent sees it. This happens in the runtime, not in each adapter, so no author can forget it and no hostile adapter can skip it.
- Invisible characters are removed; visible instruction-shaped text is flagged and kept. Removing the visible text would be defeated by rephrasing and would hide the attack from the user.
- No adapter may reach the network. `PermissionAudit.findNetworkEgress`, in `tools/adapter_validation/`, fails the build on `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `sendBeacon`, or a dynamic import.
- `webmcp_globals.d.ts` describes Chrome's real behaviour, not the specification's WebIDL, where the two disagree.

## Background
- `executeTool` takes a JSON string rather than an object, and `RegisteredTool.inputSchema` comes back as a string carrying a live `window` reference. Both were found by probing, and both are recorded in [issue #2](https://github.com/jeromeetienne/webmcp_everywhere/issues/2).
- Nothing in `untrusted_content.ts` stops prompt injection, and it must never be described as though it does. It removes the cheap attacks and makes an attempt visible. An attempt phrased so the patterns miss it goes unnoticed.
- The permission audit is a lint, not a proof: it reads only the handler's own source, so a handler that calls a mutating helper defeats it. The no-network rule is the defence that does not depend on reading source.

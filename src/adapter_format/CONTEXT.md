# Directory Context: `/src/adapter_format`

## Purpose
Defines what an adapter is, how its tools are named, and the checks an adapter must pass before a build will bundle it.

## Key Exports & Entry Points
- `adapter_types.ts`: `Adapter`, `AdapterToolDefinition`, `PermissionClass`, `OriginGrant`. The shape everything else agrees on.
- `tool_naming.ts`: `ToolNaming` — qualifies `list_todos` into `demo_playwright_dev__list_todos`.
- `adapter_schema.ts`: `AdapterValidator`, plus `ADAPTER_FORMAT_VERSION`.
- `permission_audit.ts`: `PermissionAudit` — reads handler source and disagrees with a wrong declaration.
- `untrusted_content.ts`: `UntrustedContent` — cleans, bounds, frames, and flags everything a page returns.
- `webmcp_globals.d.ts`: Ambient declarations for `document.modelContext`, written from probing Chrome 151.
- `validate_all_adapters.ts`: The build-time check. Run by `npm run build`, never bundled into a page.

## Rules
- This folder imports nothing from `extension/` or `adapters/`, so an adapter can be checked without a browser. The one exception, `validate_all_adapters.ts`, imports the registry on purpose and only ever runs in Node.js.
- A tool's `permissionClass` is checked against its handler's source, never trusted. A handler that clicks, submits, navigates, or assigns to `value` is acting, whatever the field says.
- Every tool result passes through `UntrustedContent.frame` before an agent sees it. This happens in the runtime, not in each adapter, so no author can forget it and no hostile adapter can skip it.
- Invisible characters are removed; visible instruction-shaped text is flagged and kept. Removing the visible text would be defeated by rephrasing and would hide the attack from the user.
- No adapter may reach the network. `PermissionAudit.findNetworkEgress` fails the build on `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `sendBeacon`, or a dynamic import.
- `webmcp_globals.d.ts` describes Chrome's real behaviour, not the specification's WebIDL, where the two disagree.

## Background
- `executeTool` takes a JSON string rather than an object, and `RegisteredTool.inputSchema` comes back as a string carrying a live `window` reference. Both were found by probing, and both are recorded in [issue #2](https://github.com/jeromeetienne/webmcp_everywhere/issues/2).
- Nothing in `untrusted_content.ts` stops prompt injection, and it must never be described as though it does. It removes the cheap attacks and makes an attempt visible. An attempt phrased so the patterns miss it goes unnoticed.
- The permission audit is a lint, not a proof: it reads only the handler's own source, so a handler that calls a mutating helper defeats it. The no-network rule is the defence that does not depend on reading source.

# Directory Context: `/packages/site_adapter/src/format`

## Purpose
The contract half of `@webmcp_everywhere/site_adapter`: what an adapter is, the version it declares, how its tools are named, and how everything a page returns is framed before an agent sees it. Everything here is meant to stop changing, because taking anything out of it breaks every adapter that exists.

## Key Exports & Entry Points
- `adapter_types.ts`: `Adapter`, `AdapterToolDefinition`, `PermissionClass`, `OriginGrant`. The shape everything else agrees on.
- `adapter_format_version.ts`: `ADAPTER_FORMAT_VERSION` — the version every adapter must carry, which always equals the package's own version.
- `loaded_adapter_types.ts`: `LoadedAdapter`, `LoadedToolSummary`, `LOADED_ADAPTER_GLOBAL` — what an adapter installed from a folder looks like as it travels from `npm run load-adapter` through the native messaging host to the extension.
- `tool_naming.ts`: `ToolNaming` — qualifies `list_todos` into `demo_playwright_dev__list_todos`.
- `untrusted_content.ts`: `UntrustedContent` — cleans, bounds, frames, and flags everything a page returns.
- `webmcp_globals.d.ts`: Ambient declarations for `document.modelContext`, written from probing Chrome 151. `../index.ts` carries them to anybody importing the package with a triple-slash reference, because they declare globals and there is nothing to re-export.
- Everything here reaches the outside through `../index.ts`, never by its own path.

## Rules
- **Nothing here imports `../toolkit/`.** The format is checked in Node.js with no browser, and a page helper reaching into it would end that. The dependency runs one way or not at all.
- `ADAPTER_FORMAT_VERSION` and the `version` field of `package.json` say the same thing, which `tests/repository_layout/workspace_packages.test.ts` checks. An author reading one and a check reading the other would otherwise disagree about which format an adapter must carry.
- A tool's `permissionClass` is checked against its handler's source by `packages/site_adapter/tools/permission_audit.ts`, never trusted. A handler that clicks, submits, navigates, or assigns to `value` is acting, whatever the field says.
- Every tool result passes through `UntrustedContent.frame` before an agent sees it. This happens in the runtime, not in each adapter, so no author can forget it and no hostile adapter can skip it.
- Invisible characters are removed; visible instruction-shaped text is flagged and kept. Removing the visible text would be defeated by rephrasing and would hide the attack from the user.
- No adapter may reach the network. `PermissionAudit.findNetworkEgress`, in `packages/site_adapter/tools/`, refuses `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `sendBeacon`, or a dynamic import, in `npm run build` and in `npm run load-adapter` alike.
- `webmcp_globals.d.ts` describes Chrome's real behaviour, not the specification's WebIDL, where the two disagree.

## Background
- `executeTool` takes a JSON string rather than an object, and `RegisteredTool.inputSchema` comes back as a string carrying a live `window` reference. Both were found by probing, and both are recorded in [issue #2](https://github.com/jeromeetienne/webmcp_everywhere/issues/2).
- It became a package in milestone 2 of [issue #11](https://github.com/jeromeetienne/webmcp_everywhere/issues/11), and a half of one in [issue #23](https://github.com/jeromeetienne/webmcp_everywhere/issues/23) — the reasoning is in `../../CONTEXT.md`.
- Nothing in `untrusted_content.ts` stops prompt injection, and it must never be described as though it does. It removes the cheap attacks and makes an attempt visible. An attempt phrased so the patterns miss it goes unnoticed.
- The permission audit is a lint, not a proof: it reads only the handler's own source, so a handler that calls a mutating helper defeats it. The no-network rule is the defence that does not depend on reading source.

# Directory Context: `/packages/adapter_format`

## Purpose
Defines what an adapter is, how its tools are named, and how everything a page returns is framed before an agent sees it. This is the contract an adapter is written against, whether it lives in `contribs/site_adapters/` or in a folder of somebody else's. The checks an adapter must pass live in `tools/adapter_validation/`, because they run in Node.js before an adapter reaches a browser and are never bundled into a page.

## Key Exports & Entry Points
- `src/index.ts`: the whole of `@webmcp_everywhere/adapter_format`, and the only entry point `package.json` names.
- `src/adapter_types.ts`: `Adapter`, `AdapterToolDefinition`, `PermissionClass`, `OriginGrant`. The shape everything else agrees on.
- `src/adapter_format_version.ts`: `ADAPTER_FORMAT_VERSION` — the version every adapter must carry, which always equals this package's own version.
- `src/loaded_adapter_types.ts`: `LoadedAdapter`, `LoadedToolSummary`, `LOADED_ADAPTER_GLOBAL` — what an adapter installed from a folder looks like as it travels from `npm run load-adapter` through the native messaging host to the extension.
- `src/tool_naming.ts`: `ToolNaming` — qualifies `list_todos` into `demo_playwright_dev__list_todos`.
- `src/untrusted_content.ts`: `UntrustedContent` — cleans, bounds, frames, and flags everything a page returns.
- `src/webmcp_globals.d.ts`: Ambient declarations for `document.modelContext`, written from probing Chrome 151. `src/index.ts` carries them to anybody importing this package with a triple-slash reference, because they declare globals and there is nothing to re-export.
- `README.md`: what an adapter author outside this repository reads. It ships in the tarball; `CONTEXT.md` does not.

## Rules
- `ADAPTER_FORMAT_VERSION` and the `version` field of `package.json` say the same thing, which `tests/repository_layout/workspace_packages.test.ts` checks. An author reading one and a check reading the other would otherwise disagree about which format an adapter must carry.
- This package imports nothing: not `@webmcp_everywhere/adapter_toolkit`, not anything under `contribs/`, and no adapter. So an adapter can be checked without a browser.
- **Node.js reads this package only while npm links it.** `tools/` and `tests/` import it by name and Node.js resolves the link to a real path outside `node_modules`, which is what lets that work with no build step. An adapter author gets a real folder inside `node_modules` instead, where Node.js refuses to strip types, so esbuild is their only way in — `npm run load-adapter` bundles before anything runs. `tests/repository_layout/workspace_packages.test.ts` pins both halves.
- `"sideEffects": false`, so esbuild drops what a bundle does not use. Without it, importing `ToolNaming` alone dragged 8 kilobytes of `UntrustedContent` into the `npx webmcp_everywhere` command.
- A tool's `permissionClass` is checked against its handler's source by `tools/adapter_validation/permission_audit.ts`, never trusted. A handler that clicks, submits, navigates, or assigns to `value` is acting, whatever the field says.
- Every tool result passes through `UntrustedContent.frame` before an agent sees it. This happens in the runtime, not in each adapter, so no author can forget it and no hostile adapter can skip it.
- Invisible characters are removed; visible instruction-shaped text is flagged and kept. Removing the visible text would be defeated by rephrasing and would hide the attack from the user.
- No adapter may reach the network. `PermissionAudit.findNetworkEgress`, in `tools/adapter_validation/`, refuses `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `sendBeacon`, or a dynamic import, in `npm run build` and in `npm run load-adapter` alike.
- `src/webmcp_globals.d.ts` describes Chrome's real behaviour, not the specification's WebIDL, where the two disagree.

## Background
- `executeTool` takes a JSON string rather than an object, and `RegisteredTool.inputSchema` comes back as a string carrying a live `window` reference. Both were found by probing, and both are recorded in [issue #2](https://github.com/jeromeetienne/webmcp_everywhere/issues/2).
- It became a package in milestone 2 of [issue #11](https://github.com/jeromeetienne/webmcp_everywhere/issues/11), so that an adapter author outside this repository installs the contract rather than copying it. Whether it is published on npmjs is the decision that milestone left open.
- Nothing in `src/untrusted_content.ts` stops prompt injection, and it must never be described as though it does. It removes the cheap attacks and makes an attempt visible. An attempt phrased so the patterns miss it goes unnoticed.
- The permission audit is a lint, not a proof: it reads only the handler's own source, so a handler that calls a mutating helper defeats it. The no-network rule is the defence that does not depend on reading source.

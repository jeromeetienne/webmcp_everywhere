# Directory Context: `/src/extension`

## Purpose
The Manifest Version 3 extension: it matches a page against the bundled adapters, injects into the main world, enforces the permission classes, and shows the user what an agent can currently do.

## Key Exports & Entry Points
- `manifest.json`: The extension itself. Load this folder, not `dist/`.
- `content_main.ts`: The main world entry point, the only code that touches `document.modelContext`.
- `content_isolated.ts`: The isolated world entry point, the only code that touches extension storage.
- `adapter_runtime.ts`: `AdapterRuntime` — decides what may register, then registers it.
- `adapter_registry.ts`: `AdapterRegistry` — the adapters this build carries, and match pattern testing.
- `extension_storage.ts`: `ExtensionStorage` — the grants and the kill switch.
- `service_worker.ts`, `popup.ts`, `popup.html`: The background script and the user interface.
- Command to build this folder: `npm run build`

## Rules
- `content_main.ts` never touches `chrome.*`. The main world has no extension privileges, so every grant arrives as a message from `content_isolated.ts`.
- `content_isolated.ts` never sends code into the page, only plain grant objects, and never takes instructions from the page.
- Re-register only when the matching adapter actually changes. Re-registering on every fragment change made a tool abort its own call part way through.
- After aborting a registration, wait until `getTools` stops listing those names before registering again.
- The kill switch travels as its own field on the grant. Collapsing it into `actingAllowed` silently left read-only tools registered.

## Background
- Main-world injection is required and was proven to work in [issue #2](https://github.com/jeromeetienne/webmcp_everywhere/issues/2); the isolated world cannot see `document.modelContext` at all.
- Issue #1 expects a content security policy to stop adapters reaching the network. It cannot: a main-world script runs under the page's own policy, not the extension's. The build-time check in `adapter_format/permission_audit.ts` is what enforces the rule instead.

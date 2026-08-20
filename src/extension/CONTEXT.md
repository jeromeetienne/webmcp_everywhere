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
- `native_bridge.ts`: `NativeBridge` — answers the native host, aggregating tools across every adapted tab.
- `page_query.ts`: `PageQuery` — the request and reply shapes that cross between the isolated and main worlds.
- `injection_watch.ts`: `InjectionWatch` — refuses acting tools after a page tries to issue instructions.
- `background_service_worker.ts`, `popup.ts`, `popup.html`: The background script and the user interface. Named `Background` because `ServiceWorker` is already a Document Object Model interface.
- Command to build this folder: `npm run build`

## Rules
- `content_main.ts` never touches `chrome.*`. The main world has no extension privileges, so every grant arrives as a message from `content_isolated.ts`.
- `content_isolated.ts` never sends code into the page, only plain grant objects, and never takes instructions from the page.
- Re-register only when the matching adapter actually changes. Re-registering on every fragment change made a tool abort its own call part way through.
- After aborting a registration, wait until `getTools` stops listing those names before registering again.
- The kill switch travels as its own field on the grant. Collapsing it into `actingAllowed` silently left read-only tools registered.
- Check the grant again in `content_isolated.ts` before running a tool, not only when registering it, so enforcement sits on the path the agent's request actually travels.
- Once any page returns instruction-shaped content, every acting tool is refused until a person clears it in the popup. Reading keeps working, so an agent can still report what it found.
- Read the framing off a result with `NativeBridge._asFramed`. `executeTool` returns a JSON string, so reading `.webmcpEverywhere` straight off a result silently finds nothing and leaves the watch unarmed.
- A tool offered from two tabs gains a tab suffix in both, never in just one, so the ambiguity is visible rather than resolved to whichever tab came first.

## Background
- Main-world injection is required and was proven to work in [issue #2](https://github.com/jeromeetienne/webmcp_everywhere/issues/2); the isolated world cannot see `document.modelContext` at all.
- Issue #1 expects a content security policy to stop adapters reaching the network. It cannot: a main-world script runs under the page's own policy, not the extension's. The build-time check in `adapter_format/permission_audit.ts` is what enforces the rule instead.

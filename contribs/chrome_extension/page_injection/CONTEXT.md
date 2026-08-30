# Directory Context: `/contribs/chrome_extension/page_injection`

## Purpose
The scripts injected into a page, one entry point per execution context and per kind of adapter, and the messages that cross between them. This folder is where an adapter is matched to a page, where the grant is checked, and where a tool is registered into `document.modelContext`.

## Key Exports & Entry Points
- `content_main.ts`: The main world entry point for an adapter bundled into this build.
- `external_adapter_main.ts`: The main world entry point for an adapter loaded from a folder, which runs after that adapter's own bundle has assigned itself to a global.
- `main_world_runtime.ts`: `MainWorldRuntime` — everything both main world entry points do once they have a way to find the adapter for this page.
- `content_isolated.ts`: The isolated world entry point, the only code here that touches extension storage.
- `adapter_runtime.ts`: `AdapterRuntime` — decides what may register, then registers it.
- `page_query.ts`: `PageQuery` — the request and reply shapes that cross between the isolated and main worlds. `native_host_link/` imports the types from here, and nothing else from this folder.

## Rules
- Nothing in the main world touches `chrome.*`. The main world has no extension privileges, so every grant arrives as a message from `content_isolated.ts`.
- The two main world entry points differ in one thing only: how they find the adapter for this page. Everything after that is `MainWorldRuntime`, so a loaded adapter and a bundled one run under the same rules, the same grant check, and the same untrusted content framing.
- Registrations run one after another, never side by side. Two grants arrive close together on every page load — one when the isolated world starts, another when the main world asks — and two at once both passed the wait for the old names and registered the same names, costing a tool to `InvalidStateError: Duplicate tool name` and leaving one registration alive after the kill switch.
- `content_isolated.ts` never sends code into the page, only plain grant objects, and never takes instructions from the page.
- Re-register only when the matching adapter actually changes. Re-registering on every fragment change made a tool abort its own call part way through.
- After aborting a registration, wait until `getTools` stops listing those names before registering again.
- The kill switch travels as its own field on the grant. Collapsing it into `actingAllowed` silently left read-only tools registered.
- Check the grant again in `content_isolated.ts` before running a tool, not only when registering it, so enforcement sits on the path the agent's request actually travels.

## Background
- Main-world injection is required and was proven to work in [issue #2](https://github.com/jeromeetienne/webmcp_everywhere/issues/2); the isolated world cannot see `document.modelContext` at all.

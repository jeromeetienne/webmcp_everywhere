# Directory Context: `/src/chrome_extension/page_injection`

## Purpose
The two content scripts, one per execution context, and the messages that cross between them. This folder is where an adapter is matched to a page, where the grant is checked, and where a tool is registered into `document.modelContext`.

## Key Exports & Entry Points
- `content_main.ts`: The main world entry point, the only code that touches `document.modelContext`.
- `content_isolated.ts`: The isolated world entry point, the only code here that touches extension storage.
- `adapter_runtime.ts`: `AdapterRuntime` — decides what may register, then registers it.
- `page_query.ts`: `PageQuery` — the request and reply shapes that cross between the isolated and main worlds. `native_host_link/` imports the types from here, and nothing else from this folder.

## Rules
- `content_main.ts` never touches `chrome.*`. The main world has no extension privileges, so every grant arrives as a message from `content_isolated.ts`.
- `content_isolated.ts` never sends code into the page, only plain grant objects, and never takes instructions from the page.
- Re-register only when the matching adapter actually changes. Re-registering on every fragment change made a tool abort its own call part way through.
- After aborting a registration, wait until `getTools` stops listing those names before registering again.
- The kill switch travels as its own field on the grant. Collapsing it into `actingAllowed` silently left read-only tools registered.
- Check the grant again in `content_isolated.ts` before running a tool, not only when registering it, so enforcement sits on the path the agent's request actually travels.

## Background
- Main-world injection is required and was proven to work in [issue #2](https://github.com/jeromeetienne/webmcp_everywhere/issues/2); the isolated world cannot see `document.modelContext` at all.

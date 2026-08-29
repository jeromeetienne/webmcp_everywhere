# Directory Context: `/src/site_adapters`

## Purpose
Holds one folder per target site, each exporting a single adapter that gives that site a WebMCP tool surface it never shipped.

## Key Exports & Entry Points
- `demo_playwright_dev/`: The Playwright TodoMVC demonstration — see its own CONTEXT.md.
- `caniuse_com/`: The Can I use... browser support tables — see its own CONTEXT.md.
- `openstreetmap_org/`: The OpenStreetMap map, aimed at a mapper — see its own CONTEXT.md.

## Rules
- One folder per origin, named after the origin in `snake_case`, matching the adapter's `siteSlug`.
- An adapter imports types from `@webmcp_everywhere/adapter_format` and helpers from `@webmcp_everywhere/adapter_toolkit`, and nothing else. Both are packages, so an adapter here and an adapter in a folder of somebody's own are written the same way. It never imports another adapter, and it never imports from `chrome_extension/`.
- A helper that any second site would also need belongs in `packages/adapter_toolkit/`, not here, and it reaches every adapter author at once when it goes there. What stays here is this site's own figures and its own selectors: how long it takes to settle, where it keeps its state, which element means what.
- Every adapter sets a `yieldCondition`. An adapter that cannot stand down when the site ships its own tools is not finished.
- A tool that cannot serve a reasonable request returns a refusal object naming the tool to call next, rather than throwing. Chrome 151 replaces a thrown handler error with a fixed `UnknownError` text, so a thrown message reaches no agent.
- A folder here is the only thing an adapter author adds. `npm run sync:adapters` writes the adapter list in `src/chrome_extension/shared_state/adapter_registry.ts` from these folders, and `node --test tests/adapter_registry_sync.test.ts` refuses a working copy where the two disagree. Nothing goes into `src/chrome_extension/manifest.json`, which names no site.
- Nothing is still picked up silently, which is what the hand edits used to protect: the command runs when a person asks it to, its output is committed, and the change arrives as a diff a reviewer reads.
- A folder here is an adapter this build ships, and this build ships two or three as examples. An adapter that covers a site well but shows nothing the others show belongs in a folder of its own, installed with `npm run load-adapter` — see [write_a_site_adapter.md](../../docs/write_a_site_adapter.md).
- Every folder here carries its own `CONTEXT.md` and `README.md`, and has a runner named after it in `tests/site_adapters/`. All three are checked.

## Background
- A new folder is written by `npm run new-adapter -- <site address>`, which also writes the runner and the two documents, and registers the adapter. Filling it in: [write_a_site_adapter.md](../../docs/write_a_site_adapter.md).
- Long-term success is a shrinking adapter count, not a growing one, per [issue #1](https://github.com/jeromeetienne/webmcp_everywhere/issues/1).

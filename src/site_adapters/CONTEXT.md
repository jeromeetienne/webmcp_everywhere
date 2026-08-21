# Directory Context: `/src/site_adapters`

## Purpose
Holds one folder per target site, each exporting a single adapter that gives that site a WebMCP tool surface it never shipped.

## Key Exports & Entry Points
- `demo_playwright_dev/`: The Playwright TodoMVC demonstration — see its own CONTEXT.md.
- `caniuse_com/`: The Can I use... browser support tables — see its own CONTEXT.md.
- `openstreetmap_org/`: The OpenStreetMap map, aimed at a mapper — see its own CONTEXT.md.

## Rules
- One folder per origin, named after the origin in `snake_case`, matching the adapter's `siteSlug`.
- An adapter imports types from `../../adapter_format/` and nothing else. It never imports another adapter, and it never imports from `chrome_extension/`.
- Every adapter sets a `yieldCondition`. An adapter that cannot stand down when the site ships its own tools is not finished.
- A tool that cannot serve a reasonable request returns a refusal object naming the tool to call next, rather than throwing. Chrome 151 replaces a thrown handler error with a fixed `UnknownError` text, so a thrown message reaches no agent.
- Adding a site to an adapter means adding its match pattern to both `host_permissions` and both `content_scripts` entries in `src/chrome_extension/manifest.json`. A registered adapter whose pattern is missing there never runs.
- Adapters are added to `src/chrome_extension/shared_state/adapter_registry.ts` by hand. There is no automatic discovery, because a build that silently picks up a new file is a build that silently ships one.

## Background
- Long-term success is a shrinking adapter count, not a growing one, per [issue #1](https://github.com/jeromeetienne/webmcp_everywhere/issues/1).

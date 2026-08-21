# Directory Context: `/src/adapters`

## Purpose
Holds one folder per target site, each exporting a single adapter that gives that site a WebMCP tool surface it never shipped.

## Key Exports & Entry Points
- `demo_playwright_dev/`: The Playwright TodoMVC demonstration — see its own CONTEXT.md.

## Rules
- One folder per origin, named after the origin in `snake_case`, matching the adapter's `siteSlug`.
- An adapter imports types from `../../adapter_format/` and nothing else. It never imports another adapter, and it never imports from `chrome_ext/`.
- Every adapter sets a `yieldCondition`. An adapter that cannot stand down when the site ships its own tools is not finished.
- Adapters are added to `src/chrome_ext/adapter_registry.ts` by hand. There is no automatic discovery, because a build that silently picks up a new file is a build that silently ships one.

## Background
- Long-term success is a shrinking adapter count, not a growing one, per [issue #1](https://github.com/jeromeetienne/webmcp_everywhere/issues/1).

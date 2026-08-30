# The site adapters that ship with WebMCP Everywhere

One folder per target site. Each folder exports a single adapter that gives that site a set of Model Context Protocol tools it never shipped, so an agent calls a named tool and reads an exact answer instead of taking a screenshot and guessing.

Each adapter has its own README.md saying what you can ask an agent to do on that site. Read that one, not this one, when you want to use a site.

- [The Playwright TodoMVC adapter](demo_playwright_dev/README.md) — `https://demo.playwright.dev/todomvc/`
- [The Can I use... adapter](caniuse_com/README.md) — `https://caniuse.com/`
- [The OpenStreetMap adapter](openstreetmap_org/README.md) — `https://www.openstreetmap.org/`

## What ships here, and what does not

This build ships two or three adapters as examples. An adapter that covers a site well but shows nothing the three above already show belongs in a folder of your own, installed with `npm run load-adapter`, rather than here.

Long-term success for this project is a shrinking number of adapters, not a growing one: every one of them exists because a site has not yet shipped its own tools, and every adapter sets a condition on which it stands down once the site does.

## Adding one

```bash
npm run new-adapter -- https://example.com/
```

That writes the adapter folder, its verification runner under `tests/site_adapters/`, its `CONTEXT.md`, and its `README.md`, and registers the adapter. It writes no knowledge of the site: you fill that in by probing the live site yourself.

```bash
npm run sync:adapters
```

That writes the adapter list in `contribs/chrome_extension/shared_state/adapter_registry.ts` from these folders. The list is generated and committed, so a new adapter still arrives as a difference a reviewer reads.

## Reading further

- The rules for editing this folder are in [CONTEXT.md](CONTEXT.md), and each adapter folder has its own.
- The task-shaped guide to covering a site: [write_a_site_adapter.md](../../docs/write_a_site_adapter.md).
- What an adapter must look like and the checks it must pass: [adapter_format.md](../../docs/adapter_format.md).
- Everything an adapter is written against: [`@webmcp_everywhere/site_adapter`](../../packages/site_adapter/README.md).

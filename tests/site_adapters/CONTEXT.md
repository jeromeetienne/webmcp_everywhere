# Directory Context: `/tests/site_adapters`

## Purpose
One verification runner per adapted site, each driving the real public site in a real Chrome and comparing what the adapter's tools report against what the page itself shows.

## Key Exports & Entry Points
- `todomvc.test.ts`: `TodomvcTest` — 14 checks driving `https://demo.playwright.dev/todomvc/`, which are also the checks the extension's milestones were written against.
- `caniuse.test.ts`: `CaniuseTest` — 14 checks driving `https://caniuse.com/`.
- `openstreetmap.test.ts`: `OpenStreetMapTest` — 24 checks driving `https://www.openstreetmap.org/`.
- `libs/`: The result shapes two of these runners compare against — see its own CONTEXT.md.
- Command to run one runner: `node --test tests/site_adapters/caniuse.test.ts`.

## Rules
- One file here per adapter folder in `contribs/site_adapters/`, named after that folder's adapter file with `_adapter` dropped: `caniuse_adapter.ts` is checked by `caniuse.test.ts`. `npm run new-adapter` writes it, and `node --test tests/repository_layout/adapter_registry_sync.test.ts` refuses an adapter that has none.
- A runner here uses `LivePageHarness` and writes no launch, opt-in, reload, tool list or tool call of its own, keeping only the helpers for its own site. It reaches extension storage through `GrantActing`, which is where the wait for the service worker lives.
- The result shapes one site's runner compares against sit in `libs/<site>_result_types.ts`, one file per site. `tests/libs/host_call_types.ts` holds only the shapes that cross to the native messaging host, which every runner shares.
- Nothing in `contribs/site_adapters/` imports from here, and nothing here is imported by the product. This folder is one direction of the import rule the whole of `tests/` follows.

## Background
- These three runners were flat files in `tests/` named `verify_<something>.test.ts`. They moved down here because `tests/` grows by one runner and one result-shapes file per adapter, and that is the only part of `tests/` that grows at all. The result-shapes files moved again, into `libs/`, so that a listing of this folder is a listing of the sites checked — see [issue #20](https://github.com/jeromeetienne/webmcp_everywhere/issues/20).
- The shape every runner follows, and which one to reach for when: [testing_and_verification.md](../../docs/testing_and_verification.md).
- Writing a runner for a new adapter: [write_a_site_adapter.md](../../docs/write_a_site_adapter.md).

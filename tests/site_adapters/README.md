# The site verification runners

One verification runner per adapted site. Each drives the real public site in a real Chrome and compares what the adapter's tools report against what the page itself shows. Nothing is mocked, and a check that cannot fail is not a check.

There is one runner here for every adapter folder under [`/contribs/site_adapters`](../../contribs/site_adapters/README.md), named after that folder's adapter file with `_adapter` dropped.

## What is in here

- `todomvc.test.ts` — 14 checks driving `https://demo.playwright.dev/todomvc/`.
- `caniuse.test.ts` — 14 checks driving `https://caniuse.com/`.
- `openstreetmap.test.ts` — 24 checks driving `https://www.openstreetmap.org/`.
- `libs/` — the result shapes two of these runners compare against, one file per site.

Every runner here uses `LivePageHarness`, in `tests/libs/`, and writes no launch, opt-in, reload, tool list, or tool call of its own. What stays in a runner is the helpers for its own site.

## Running it

```bash
node --test tests/site_adapters/caniuse.test.ts
```

```bash
node --test --test-concurrency=1 tests/site_adapters/*.test.ts
```

These drive live public sites, so a failure here can mean the site changed rather than the adapter broke. When that is not clear, run the environment reports in `tools/environment_reports/`.

## Reading further

- The rules for editing this folder are in [CONTEXT.md](CONTEXT.md).
- Writing a runner for a new adapter: [write_a_site_adapter.md](../../docs/write_a_site_adapter.md).
- The shape every runner follows: [testing_and_verification.md](../../docs/testing_and_verification.md).

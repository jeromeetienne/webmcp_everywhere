# The OpenStreetMap verification runner

The runner that drives `https://www.openstreetmap.org/` in a real Chrome and compares what [the OpenStreetMap adapter](../README.md) reports against what the page itself shows.

## What is in here

- `openstreetmap.test.ts` — 24 checks against the live site.
- `openstreetmap_result_types.ts` — the result shapes those checks compare against.

## Running it

```bash
node --test contribs/site_adapters/openstreetmap_org/tests/openstreetmap.test.ts
```

The runner uses `LivePageHarness`, in [`/tests/libs`](../../../../tests/libs/README.md), so it writes no launch, opt-in, reload, tool list, or tool call of its own. What stays here is the helpers for this site.

## When this fails

It drives a live public site, so a failure can mean the site changed rather than the adapter broke. When that is not clear, run the environment reports in [`/tools/environment_reports`](../../../../tools/environment_reports/README.md).

## Reading further

- What this adapter lets you ask for: [the adapter README.md](../README.md).
- The rules for editing the adapter: [its CONTEXT.md](../CONTEXT.md).
- The shape every runner follows: [testing_and_verification.md](../../../../docs/testing_and_verification.md).

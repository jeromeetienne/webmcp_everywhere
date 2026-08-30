# The environment reports

These two programs say what this machine and each adapted site can actually do. Run one when a live check fails and you do not yet know whether the adapter, the browser, or the site is at fault.

Neither is a verification runner. Neither passes or fails as a whole: each reports facts field by field, and you read the field that answers your question.

## What is in here

- `report_browser_environment.ts` — which Chrome was found, its version, whether the extension installs, and whether `document.modelContext` is there.
- `report_site_reachability.ts` — loads every adapted site in a real Chrome and reports where the browser landed, what came back, and how many tools registered.

## Running it

```bash
node tools/environment_reports/report_browser_environment.ts
```

```bash
node tools/environment_reports/report_site_reachability.ts
```

The nightly job runs the first before it runs an adapter's checks, and the second only after those checks fail.

## Reading further

- The rules for editing this folder are in [CONTEXT.md](CONTEXT.md).
- Which verification runner covers what: [testing_and_verification.md](../../docs/testing_and_verification.md).
- The failures that report nothing, and what each one means: [troubleshooting.md](../../docs/troubleshooting.md).

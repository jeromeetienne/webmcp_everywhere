# Directory Context: `/tools/environment_reports`

## Purpose
Says what a machine and each adapted site can actually do, so that a failing live check names the right cause instead of blaming the adapter.

## Key Exports & Entry Points
- `report_browser_environment.ts`: `ReportBrowserEnvironment` — the Chrome found, its version, whether the extension installs, and whether `document.modelContext` is there. `node tools/environment_reports/report_browser_environment.ts`
- `report_site_reachability.ts`: `ReportSiteReachability` — loads every adapted site in a real Chrome and reports where it landed, what came back, and how many tools registered. `node tools/environment_reports/report_site_reachability.ts`

## Rules
- Each reports facts field by field and never passes or fails as a whole. A runner reports the same failure when the adapter broke, when the machine cannot run a browser, and when the site refused that machine, and those are three different conclusions.
- Neither is a verification runner and neither ends in `.test.ts`. They answer "can this be checked here at all", which is the question asked before a check runs and again after one fails.
- The nightly job runs the first before an adapter's runner and the second only after that runner fails, which is what keeps a failing job's log short and its cause named.

## Background
- These exist because a runner hung for twenty minutes on a continuous integration machine and had to be cancelled by hand, and nothing in the output said whether the browser, the site, or the adapter was at fault. Milestone 4 of [issue #9](https://github.com/jeromeetienne/webmcp_everywhere/issues/9).
- Which runner covers what: [testing_and_verification.md](../../docs/testing_and_verification.md).

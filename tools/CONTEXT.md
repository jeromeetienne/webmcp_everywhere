# Directory Context: `/tools`

## Purpose
Development tooling: builds the extension, brings up a Chrome that speaks WebMCP with the extension installed, and checks the milestones against that live browser.

## Key Exports & Entry Points
- `build_extension.mjs`: `BuildExtension` — runs the adapter review checks, then bundles. `npm run build`
- `launch_chrome.mjs`: `LaunchChrome` — the four-step recipe for a Chrome that works. `npm run chrome`
- `verify_milestones.mjs`: `VerifyMilestones` — the end-to-end checks. `npm run verify`

## Rules
- Never use `--load-extension`. Chrome 151 ignores it silently, leaving zero extensions installed and nothing in the log. Install with the Chrome DevTools Protocol method `Extensions.loadUnpacked`.
- The profile needs `enable-webmcp-testing@1` in `Local State` before launch, or `document.modelContext` is absent, and `extensions.ui.developer_mode` in `Preferences`, or the extension installs but its content scripts never run.
- Verification asserts against state read back out of the live page. Nothing here is mocked, and a check that cannot fail is not a check.
- `Page.addScriptToEvaluateOnNewDocument` is dropped when the client that added it disconnects, so add and navigate on one connection.

## Background
- Every rule above is a failure that actually happened while building [issue #2](https://github.com/jeromeetienne/webmcp_everywhere/issues/2), each costing time because none of them report an error.

# Directory Context: `/tools`

## Purpose
Development tooling: builds the extension, brings up a Chrome that speaks WebMCP with the extension installed, and checks the milestones against that live browser.

## Key Exports & Entry Points
- `build_extension.ts`: `BuildExtension` — runs the adapter review checks, then bundles. `npm run build`
- `launch_chrome.ts`: `LaunchChrome` — the four-step recipe for a Chrome that works. `npm run chrome`
- `verify_milestones.ts`: `VerifyMilestones` — checks over the Chrome DevTools Protocol path. `npm run verify`
- `verify_native_host.ts`: `VerifyNativeHost` — checks over the real delivery path. `npm run verify:host`
- `verify_injection_defence.ts`: `VerifyInjectionDefence` — writes hostile content onto the page and attacks through it. `npm run verify:injection`
- `verify_bridge.ts`: `VerifyBridge` — checks the stdio bridge. `npm run verify:bridge`
- `install_native_host.ts`: `InstallNativeHost` — registers the host with Chrome. `npm run install:host`
- `generate_extension_key.ts`: `GenerateExtensionKey` — pins the extension identifier.
- `grant_acting.ts`: `GrantActing` — stands in for the popup. `npm run grant`
- `verify_types.ts`: The result shapes the four verification tools share.

## Rules
- Every file here is TypeScript that Node.js runs directly, so it must stay within erasable syntax: no `enum`, no `namespace` holding runtime code, no parameter properties, and no decorators. `npm run typecheck` checks this folder through `tsconfig.node.json`.
- Never use `--load-extension`. Chrome 151 ignores it silently, leaving zero extensions installed and nothing in the log. Install with the Chrome DevTools Protocol method `Extensions.loadUnpacked`.
- The profile needs `enable-webmcp-testing@1` in `Local State` before launch, or `document.modelContext` is absent, and `extensions.ui.developer_mode` in `Preferences`, or the extension installs but its content scripts never run.
- Verification asserts against state read back out of the live page. Nothing here is mocked, and a check that cannot fail is not a check.
- `Page.addScriptToEvaluateOnNewDocument` is dropped when the client that added it disconnects, so add and navigate on one connection.
- The launcher deletes the profile before every launch. Chrome does not re-read an unpacked extension it has already installed, so keeping the profile silently runs the previous build, and every check still passes while testing old code.

## Background
- Every rule above is a failure that actually happened while building [issue #2](https://github.com/jeromeetienne/webmcp_everywhere/issues/2), each costing time because none of them report an error.

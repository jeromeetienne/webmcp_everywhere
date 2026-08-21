# Directory Context: `/tests`

## Purpose
Everything that exists only to check the product: the verification runners that drive a live Chrome, and the stdio Model Context Protocol bridge one of them checks.

## Key Exports & Entry Points
- `verify_milestones.test.ts`: `VerifyMilestones` — 14 checks driving the TodoMVC page. `npm run verify`
- `verify_caniuse.test.ts`: `VerifyCaniuse` — 14 checks driving `https://caniuse.com/`. `npm run verify:caniuse`
- `verify_openstreetmap.test.ts`: `VerifyOpenStreetMap` — 24 checks driving `https://www.openstreetmap.org/`. `npm run verify:openstreetmap`
- `verify_native_host.test.ts`: `VerifyNativeHost` — 10 checks over the real delivery path. `npm run verify:host`
- `verify_injection_defence.test.ts`: `VerifyInjectionDefence` — writes hostile content onto the page and attacks through it. `npm run verify:injection`
- `verify_bridge.test.ts`: `VerifyBridge` — 4 checks through the stdio bridge. `npm run verify:bridge`
- `verify_source_boundary.test.ts`: `VerifySourceBoundary` — refuses a relative import that leaves `src/`. `npm run verify:boundary`
- `verify_types.ts`: The result shapes the verification runners share.
- `devtools_protocol_bridge/`: The stdio Model Context Protocol bridge — see its own CONTEXT.md.
- Command to run this folder: `npm test`

## Rules
- Imports run one way only: `tests/` may import from `tools/` and from `src/`, `tools/` may import from `src/`, and `src/` imports from neither. `npm run verify:boundary` checks the last of those three.
- Verification asserts against state read back out of the live page. Nothing is mocked, and a check that cannot fail is not a check.
- Every file holding checks ends in `.test.ts`, so `node --test` finds it with no file list. `verify_types.ts` holds no check and keeps its plain name.
- One shape everywhere: `NodeTest.before` prepares the live browser into a static field, `NodeTest.after` closes it, `NodeTest.describe` carries what a section header used to print, and a check throws its own message instead of calling `node:assert`, because those messages are what the runner is for. Detail lines go to `t.diagnostic`.
- Checks in one file run in the order written and share one live page, so a check may depend on the one before it. Anything that must happen between two checks belongs in the `NodeTest.before` of a nested `NodeTest.describe`, never inside a check that does not own it.
- `npm test` runs with `--test-concurrency=1`: every runner takes the same debugging port and throwaway profile.
- Node.js runs these files directly, so they stay within erasable syntax: no `enum`, no runtime `namespace`, no parameter properties, no decorators. `npm run typecheck` checks that.

## Background
- These runners lived in `tools/` until the build tooling and the verification code were separated. The failures they were written against are in [issue #2](https://github.com/jeromeetienne/webmcp_everywhere/issues/2).
- `node:test` replaced the hand-written test helper in [issue #6](https://github.com/jeromeetienne/webmcp_everywhere/issues/6), which records why `verify_bridge.test.ts` launches its own Chrome.

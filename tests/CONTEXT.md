# Directory Context: `/tests`

## Purpose
Everything that exists only to check the product: the verification runners that drive a live Chrome, and the stdio Model Context Protocol bridge one of them checks.

## Key Exports & Entry Points
- `verify_milestones.ts`: `VerifyMilestones` — 14 checks driving the TodoMVC page. `npm run verify`
- `verify_caniuse.ts`: `VerifyCaniuse` — 14 checks driving `https://caniuse.com/`. `npm run verify:caniuse`
- `verify_native_host.ts`: `VerifyNativeHost` — 8 checks over the real delivery path. `npm run verify:host`
- `verify_injection_defence.ts`: `VerifyInjectionDefence` — writes hostile content onto the page and attacks through it. `npm run verify:injection`
- `verify_bridge.ts`: `VerifyBridge` — 4 checks through the stdio bridge. `npm run verify:bridge`
- `verify_source_boundary.ts`: `VerifySourceBoundary` — refuses a relative import that leaves `src/`. `npm run verify:boundary`
- `verify_types.ts`: The result shapes the verification runners share.
- `devtools_protocol_bridge/`: The stdio Model Context Protocol bridge — see its own CONTEXT.md.

## Rules
- Imports run one way only: `tests/` may import from `tools/` and from `src/`, `tools/` may import from `src/`, and `src/` imports from neither. `npm run verify:boundary` checks the last of those three.
- Verification asserts against state read back out of the live page. Nothing here is mocked, and a check that cannot fail is not a check.
- Every file here is TypeScript that Node.js runs directly, so it must stay within erasable syntax: no `enum`, no `namespace` holding runtime code, no parameter properties, and no decorators. `npm run typecheck` checks this folder through the single `tsconfig.json` at the repository root.

## Background
- These runners lived in `tools/` until the build tooling and the verification code were separated. The failures each of them was written against are recorded in [issue #2](https://github.com/jeromeetienne/webmcp_everywhere/issues/2).

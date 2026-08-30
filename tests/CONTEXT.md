# Directory Context: `/tests`

## Purpose
The verification code with no one subject under `packages/` or `contribs/` to sit in: the checks on the repository itself, the stdio Model Context Protocol bridge and the runner driving it, and the two files every other runner shares.

## Key Exports & Entry Points
- `repository_layout/`: That the repository agrees with itself — the registry against the folders, the imports against the boundaries, the packages against their manifests — see its own CONTEXT.md.
- `devtools_protocol_bridge/`: The stdio Model Context Protocol bridge and the runner driving it — see its own CONTEXT.md.
- `libs/`: `live_page_harness.ts` and `host_call_types.ts`, the two files holding no check, each read by runners of more than one subject — see its own CONTEXT.md.
- Commands: `npm test`; `npm run test:no_browser`; `node --test <runner>`.

## Rules
- **A runner lives inside the folder it checks.** `packages/native_messaging_host/tests/`, `packages/webmcp_everywhere/tests/`, `contribs/chrome_extension/tests/`, and one `tests/` folder inside each adapter folder under `contribs/site_adapters/`. Only verification code whose subject is neither a package nor a `contribs/` folder stays here.
- A file stays here when more than one subject reads it. `live_page_harness.ts` is read by the three site adapter runners; `host_call_types.ts` is read by the extension runners and by the native messaging host runners. A file read by one subject belongs in that subject's `tests/` folder.
- A runner is named after its subject and ends in `.test.ts`, so `node --test` finds it with no file list. A file with no check keeps a plain name and lives in a `libs/` folder.
- `package.json` holds no script for a single runner, except `npm run test:no_browser`, which names the six starting no browser. Those six are spread across `tests/repository_layout/`, `packages/native_messaging_host/tests/` and `packages/webmcp_everywhere/tests/`.
- Imports run one way only: a `tests/` or a `tools/` folder may import from product code, and no product file may import from either. `tests/repository_layout/source_boundary.test.ts` checks both directions, for `contribs/` and for every package publishing its source.
- Verification asserts against state read back out of the live page. Nothing is mocked, and a check that cannot fail is not a check.
- Nothing anywhere writes into the browser the user installed, which [issue #4](https://github.com/jeromeetienne/webmcp_everywhere/issues/4) refuses: `packages/webmcp_everywhere/tests/native_host_install.test.ts` passes `isEverydayChromeCovered: false`, and `packages/webmcp_everywhere/tests/webmcp_everywhere.test.ts` sets `HOME` elsewhere.
- One shape everywhere: `NodeTest.before` prepares the live browser, `NodeTest.after` closes it, and a check throws its own message rather than calling `node:assert`, because those messages are what the runner is for. Detail goes to `t.diagnostic`. Checks in one file share one live page and run in order, so anything that must happen between two belongs in a nested `NodeTest.describe`'s `NodeTest.before`.
- `npm test` runs with `--test-concurrency=1`: every browser runner takes the same port and profile.
- Node.js runs these files directly, so they stay within erasable syntax: no `enum`, no runtime `namespace`, no parameter properties, no decorators.

## Background
- The failures these runners were written against are in [issue #2](https://github.com/jeromeetienne/webmcp_everywhere/issues/2); the npm package is [issue #12](https://github.com/jeromeetienne/webmcp_everywhere/issues/12).
- **Moving each runner folder inside the folder it checks is [issue #28](https://github.com/jeromeetienne/webmcp_everywhere/issues/28).** [Issue #25](https://github.com/jeromeetienne/webmcp_everywhere/issues/25) had already named each folder here after its subject, which is what made the move obvious: a folder named after its subject belongs inside its subject. Issue #25 also says why `native_host.test.ts` sits with the native messaging host rather than with the extension.
- Which runner to reach for when: [testing_and_verification.md](../docs/testing_and_verification.md). `node:test` replaced the hand-written helper in [issue #6](https://github.com/jeromeetienne/webmcp_everywhere/issues/6), which says why the bridge runner launches its own Chrome.

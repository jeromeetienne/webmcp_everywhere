# Directory Context: `/tests`

## Purpose
Everything that exists only to check the product: the runners, grouped one folder per subject, the live browser they share, and the stdio Model Context Protocol bridge one of them checks.

## Key Exports & Entry Points
- `chrome_extension/`: What [`/contribs/chrome_extension`](../contribs/chrome_extension/CONTEXT.md) enforces against code and content this repository did not write — a hostile page, and an adapter from a stranger — see its own CONTEXT.md.
- `native_messaging_host/`: The path [`/packages/native_messaging_host`](../packages/native_messaging_host/CONTEXT.md) serves, from an agent's HTTP request to the page and back, and the file that names its address — see its own CONTEXT.md.
- `site_adapters/`: One verification runner per folder under [`/contribs/site_adapters`](../contribs/site_adapters/CONTEXT.md) — see its own CONTEXT.md.
- `webmcp_everywhere/`: What [`/packages/webmcp_everywhere`](../packages/webmcp_everywhere/CONTEXT.md) installs, from the host manifest file through the npm package to a release with no repository under it — see its own CONTEXT.md.
- `repository_layout/`: That the repository agrees with itself — the registry against the folders, the imports against the boundaries, the packages against their manifests — see its own CONTEXT.md.
- `devtools_protocol_bridge/`: The stdio Model Context Protocol bridge and the runner driving it — see its own CONTEXT.md.
- `libs/`: The two files holding no check that the runner folders share — see its own CONTEXT.md.
- Commands: `npm test`; `npm run test:no_browser`; `node --test <runner>`.

## Rules
- **A folder here is named after the folder under `packages/` or `contribs/` whose subject it checks, keeping that folder's basename.** A folder whose subject is neither — `repository_layout/`, `devtools_protocol_bridge/`, `libs/` — keeps its own subject name.
- A folder appears when a runner needs it, never before: `packages/site_adapter` has no runner yet, so `tests/site_adapter/` does not exist.
- A runner is named after its subject and ends in `.test.ts`, so `node --test` finds it with no file list. A file with no check keeps a plain name.
- Every runner lives in the subfolder for its subject, and no `.ts` file sits loose at the top of `tests/`. A file that holds no check lives in `libs/`.
- `package.json` holds no script for a single runner, except `npm run test:no_browser`, which names the six starting no browser. Those six are spread across `repository_layout/`, `native_messaging_host/` and `webmcp_everywhere/`, so the folders and that list are two different groupings of the same runners and neither replaces the other.
- Imports run one way only: `tests/` from `tools/` and `contribs/`, `tools/` from `contribs/`, `contribs/` from neither. `tests/repository_layout/source_boundary.test.ts` checks the last, for `contribs/` and for every package.
- Verification asserts against state read back out of the live page. Nothing is mocked, and a check that cannot fail is not a check.
- Nothing here writes into the browser the user installed, which [issue #4](https://github.com/jeromeetienne/webmcp_everywhere/issues/4) refuses: `webmcp_everywhere/native_host_install.test.ts` passes `isEverydayChromeCovered: false`, and `webmcp_everywhere/webmcp_everywhere.test.ts` sets `HOME` elsewhere.
- One shape everywhere: `NodeTest.before` prepares the live browser, `NodeTest.after` closes it, and a check throws its own message rather than calling `node:assert`, because those messages are what the runner is for. Detail goes to `t.diagnostic`. Checks in one file share one live page and run in order, so anything that must happen between two belongs in a nested `NodeTest.describe`'s `NodeTest.before`.
- `npm test` runs with `--test-concurrency=1`: every browser runner takes the same port and profile.
- Node.js runs these files directly, so they stay within erasable syntax: no `enum`, no runtime `namespace`, no parameter properties, no decorators.

## Background
- The failures these runners were written against are in [issue #2](https://github.com/jeromeetienne/webmcp_everywhere/issues/2); the npm package is [issue #12](https://github.com/jeromeetienne/webmcp_everywhere/issues/12).
- **Naming a folder here after the source folder it checks is [issue #25](https://github.com/jeromeetienne/webmcp_everywhere/issues/25).** The folders were named after what a runner was about — `delivery_path/`, `installation/`, `code_from_outside/` — names appearing nowhere else in the repository, so somebody who knew the source layout had to learn a second one. That issue says why `native_host.test.ts` sits with the native messaging host rather than with the extension.
- Which runner to reach for when: [testing_and_verification.md](../docs/testing_and_verification.md). `node:test` replaced the hand-written helper in [issue #6](https://github.com/jeromeetienne/webmcp_everywhere/issues/6), which says why the bridge runner launches its own Chrome.

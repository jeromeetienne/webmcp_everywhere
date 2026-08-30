# Directory Context: `/tests`

## Purpose
Everything that exists only to check the product: the runners, grouped one folder per subject, the live browser they share, and the stdio Model Context Protocol bridge one of them checks.

## Key Exports & Entry Points
- `repository_layout/`: That the repository agrees with itself — the registry against the folders, the imports against the boundaries, the packages against their manifests — see its own CONTEXT.md.
- `delivery_path/`: The path from an agent's HTTP request to the page and back, and the file that names its address — see its own CONTEXT.md.
- `installation/`: What a user installs, from the host manifest file through the npm package to a release with no repository under it — see its own CONTEXT.md.
- `code_from_outside/`: Content and code this repository did not write — a hostile page, and an adapter from a stranger — see its own CONTEXT.md.
- `site_adapters/`: One verification runner per adapted site — see its own CONTEXT.md.
- `devtools_protocol_bridge/`: The stdio Model Context Protocol bridge and the runner driving it — see its own CONTEXT.md.
- `libs/`: The two files that hold no check and that the runner folders share — see its own CONTEXT.md.
- Commands: `npm test`; `npm run test:no_browser`; one alone, `node --test <runner>`.

## Rules
- A runner is named after its subject and ends in `.test.ts`, so `node --test` finds it with no file list. A file with no check keeps a plain name.
- Every runner lives in the subfolder for its subject, and no `.ts` file sits loose at the top of `tests/`. A file that holds no check lives in `libs/`.
- `package.json` holds no script for a single runner, except `npm run test:no_browser`, which names the six starting no browser. Those six are spread across `repository_layout/`, `delivery_path/` and `installation/`, so the folders and that list are two different groupings of the same runners and neither replaces the other.
- Imports run one way only: `tests/` from `tools/` and `contribs/`, `tools/` from `contribs/`, `contribs/` from neither. `tests/repository_layout/source_boundary.test.ts` checks the last, for `contribs/` and for every package.
- Verification asserts against state read back out of the live page. Nothing is mocked, and a check that cannot fail is not a check.
- Nothing here writes into the browser the user installed, which [issue #4](https://github.com/jeromeetienne/webmcp_everywhere/issues/4) refuses: `installation/native_host_install.test.ts` passes `isEverydayChromeCovered: false`, and `installation/npm_package.test.ts` sets `HOME` elsewhere.
- One shape everywhere: `NodeTest.before` prepares the live browser, `NodeTest.after` closes it, and a check throws its own message rather than calling `node:assert`, because those messages are what the runner is for. Detail goes to `t.diagnostic`. Checks in one file share one live page and run in order, so anything that must happen between two belongs in a nested `NodeTest.describe`'s `NodeTest.before`.
- `npm test` runs with `--test-concurrency=1`: every browser runner takes the same port and profile.
- Node.js runs these files directly, so they stay within erasable syntax: no `enum`, no runtime `namespace`, no parameter properties, no decorators.

## Background
- The failures these runners were written against are in [issue #2](https://github.com/jeromeetienne/webmcp_everywhere/issues/2); the npm package is [issue #12](https://github.com/jeromeetienne/webmcp_everywhere/issues/12).
- Which runner to reach for when: [testing_and_verification.md](../docs/testing_and_verification.md). `node:test` replaced the hand-written helper in [issue #6](https://github.com/jeromeetienne/webmcp_everywhere/issues/6), which says why the bridge runner launches its own Chrome.

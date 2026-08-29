# Directory Context: `/tests`

## Purpose
Everything that exists only to check the product: the verification runners, the live browser they share, and the stdio Model Context Protocol bridge one of them checks. All but three drive a live Chrome.

## Key Exports & Entry Points
- `site_adapters/`: One verification runner per adapted site — see its own CONTEXT.md.
- `devtools_protocol_bridge/`: The stdio Model Context Protocol bridge, and the runner that drives it — see its own CONTEXT.md.
- `adapter_registry_sync.test.ts`: `AdapterRegistrySyncTest` — 5 checks that the registry, the manifest, and the runners still match the folders under `src/site_adapters/`.
- `native_host.test.ts`: `NativeHostTest` — 10 checks over the real delivery path, from the HTTP endpoint through to the page.
- `endpoint_file.test.ts`: `EndpointFileTest` — 10 checks that `endpoint.json` always names a host that is really listening.
- `native_host_install.test.ts`: `NativeHostInstallTest` — 7 checks that installing announces every file first and that uninstalling removes every one of them.
- `injection_defence.test.ts`: `InjectionDefenceTest` — writes hostile content onto the page and attacks through it.
- `source_boundary.test.ts`: `SourceBoundaryTest` — refuses a relative import that leaves `src/`.
- `live_page_harness.ts`: `LivePageHarness` — the live browser the site checks share: it launches Chrome, writes the opt-in, loads the page, names the registered tools, and calls one.
- `host_call_types.ts`: The shapes a check sends to the native messaging host and reads back.
- Command to run this folder: `npm test`. The runners that need no browser: `npm run test:no_browser`. One runner on its own: `node --test tests/native_host.test.ts`.

## Rules
- A runner is named after its subject, and the `.test.ts` ending says it holds checks. No file here carries a `verify_` prefix.
- `package.json` holds no script for a single runner, except `npm run test:no_browser`, which names the four that start no browser and gains another in the same pull request that adds one. `npm test` runs them all, and one alone is `node --test` with that runner's path.
- Every runner ends in `.test.ts`, so `node --test` finds it with no file list, in these subfolders as well as here. A file holding no check keeps a plain name.
- Imports run one way only: `tests/` may import from `tools/` and from `src/`, `tools/` may import from `src/`, and `src/` imports from neither. `node --test tests/source_boundary.test.ts` checks the last of those three.
- Verification asserts against state read back out of the live page. Nothing is mocked, and a check that cannot fail is not a check.
- `adapter_registry_sync.test.ts`, `endpoint_file.test.ts`, `native_host_install.test.ts`, and `source_boundary.test.ts` are the four that start no browser, which `npm run test:no_browser` names. `endpoint_file.test.ts` still starts the real host over a real pipe, into a throwaway `WEBMCP_EVERYWHERE_STATE_DIR`; why it leaves the browser out is written in the file itself.
- `native_host_install.test.ts` covers throwaway user data directories alone and always passes `isEverydayChromeCovered: false`. Writing into the browser the user installed is the thing [issue #4](https://github.com/jeromeetienne/webmcp_everywhere/issues/4) refuses, and a check that did it while covering it would be absurd.
- One shape everywhere: `NodeTest.before` prepares the live browser, `NodeTest.after` closes it, and a check throws its own message rather than calling `node:assert`, because those messages are what the runner is for. Detail lines go to `t.diagnostic`.
- Checks in one file run in the order written and share one live page, so a check may depend on the one before it. Anything that must happen between two checks belongs in the `NodeTest.before` of a nested `NodeTest.describe`, never in a check that does not own it.
- `npm test` runs with `--test-concurrency=1`: every runner that starts a browser takes the same debugging port and throwaway profile.
- Node.js runs these files directly, so they stay within erasable syntax: no `enum`, no runtime `namespace`, no parameter properties, no decorators. `npm run typecheck` checks that.

## Background
- The `verify_` prefix came from the days when these files sat in `tools/` beside the build tooling: in a folder where every file verifies something, the prefix said nothing. The failures they were written against are in [issue #2](https://github.com/jeromeetienne/webmcp_everywhere/issues/2).
- The nine scripts that each named one runner went the same way: every rename of a runner meant three renames elsewhere.
- Which runner to reach for when: [testing_and_verification.md](../docs/testing_and_verification.md).
- `node:test` replaced the hand-written test helper in [issue #6](https://github.com/jeromeetienne/webmcp_everywhere/issues/6), which records why the bridge runner launches its own Chrome.

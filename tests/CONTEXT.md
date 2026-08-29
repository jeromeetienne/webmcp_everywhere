# Directory Context: `/tests`

## Purpose
Everything that exists only to check the product: the verification runners, the live browser they share, and the stdio Model Context Protocol bridge one of them checks. All but four drive a live Chrome.

## Key Exports & Entry Points
- `site_adapters/`: One verification runner per adapted site — see its own CONTEXT.md.
- `devtools_protocol_bridge/`: The stdio Model Context Protocol bridge and the runner driving it — see its own CONTEXT.md.
- `adapter_registry_sync.test.ts`: `AdapterRegistrySyncTest` — 5 checks that the registry and the runners still match the folders under `src/site_adapters/`, and the manifest still names no site.
- `loaded_adapter.test.ts`: `LoadedAdapterTest` — 5 checks that an adapter written outside this repository is refused when dishonest, and otherwise installed, registered, and run with no rebuild.
- `native_host.test.ts`: `NativeHostTest` — 10 checks over the real delivery path, from the HTTP endpoint to the page.
- `endpoint_file.test.ts`: `EndpointFileTest` — 10 checks that `endpoint.json` always names a host really listening.
- `native_host_install.test.ts`: `NativeHostInstallTest` — 7 checks that installing announces every file first and uninstalling removes every one of them.
- `injection_defence.test.ts`: `InjectionDefenceTest` — writes hostile content onto the page, and attacks through it.
- `source_boundary.test.ts`: `SourceBoundaryTest` — refuses a relative import that leaves `src/`.
- `live_page_harness.ts`: `LivePageHarness` — the live browser the site checks share: it launches Chrome, writes the opt-in, loads the page, names the registered tools, and calls one.
- `host_call_types.ts`: The shapes a check sends to the native messaging host, and reads back.
- Command to run this folder: `npm test`. The runners needing no browser: `npm run test:no_browser`. One alone: `node --test tests/native_host.test.ts`.

## Rules
- A runner is named after its subject, and ends in `.test.ts`, so `node --test` finds it with no file list, in these subfolders as well as here. A file holding no check keeps a plain name, and no file here carries a `verify_` prefix.
- `package.json` holds no script for a single runner, except `npm run test:no_browser`, which names the four that start no browser and gains another in the pull request that adds one.
- Imports run one way only: `tests/` may import from `tools/` and `src/`, `tools/` from `src/`, and `src/` from neither. `node --test tests/source_boundary.test.ts` checks the last of those three.
- Verification asserts against state read back out of the live page. Nothing is mocked, and a check that cannot fail is not a check.
- The four that start no browser are the ones `npm run test:no_browser` names. `endpoint_file.test.ts` is one of them and still starts the real host over a real pipe, into a throwaway `WEBMCP_EVERYWHERE_STATE_DIR`.
- `native_host_install.test.ts` covers throwaway user data directories alone and always passes `isEverydayChromeCovered: false`. Writing into the browser the user installed is what [issue #4](https://github.com/jeromeetienne/webmcp_everywhere/issues/4) refuses, and a check that did it while covering it would be absurd.
- `loaded_adapter.test.ts` writes its adapter folder into the system temporary directory and removes what it installed afterwards. An adapter left in `~/.webmcp_everywhere/adapters/` would run in the browser of whoever ran the checks.
- One shape everywhere: `NodeTest.before` prepares the live browser, `NodeTest.after` closes it, and a check throws its own message rather than calling `node:assert`, because those messages are what the runner is for. Detail goes to `t.diagnostic`.
- Checks in one file run in the order written and share one live page, so one may depend on the one before it. Anything that must happen between two checks belongs in the `NodeTest.before` of a nested `NodeTest.describe`, never in a check that does not own it.
- `npm test` runs with `--test-concurrency=1`: every runner that starts a browser takes the same debugging port and throwaway profile.
- Node.js runs these files directly, so they stay within erasable syntax: no `enum`, no runtime `namespace`, no parameter properties, no decorators. `npm run typecheck` checks it.

## Background
- The `verify_` prefix, and the nine scripts that each named one runner, both went the same way: in a folder where every file verifies something the prefix said nothing, and every rename of a runner meant three renames elsewhere. The failures these runners were written against are in [issue #2](https://github.com/jeromeetienne/webmcp_everywhere/issues/2).
- Which runner to reach for when: [testing_and_verification.md](../docs/testing_and_verification.md). `node:test` replaced the hand-written test helper in [issue #6](https://github.com/jeromeetienne/webmcp_everywhere/issues/6), which records why the bridge runner launches its own Chrome.

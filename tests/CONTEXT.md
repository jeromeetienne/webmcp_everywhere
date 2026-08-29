# Directory Context: `/tests`

## Purpose
Everything that exists only to check the product: the runners, the live browser they share, and the stdio Model Context Protocol bridge one of them checks.

## Key Exports & Entry Points
- `site_adapters/`: One verification runner per adapted site — see its own CONTEXT.md.
- `devtools_protocol_bridge/`: The stdio Model Context Protocol bridge and the runner driving it — see its own CONTEXT.md.
- `adapter_registry_sync.test.ts`: `AdapterRegistrySyncTest` — 5 checks that the registry and the runners match the folders under `src/site_adapters/`, and the manifest names no site.
- `loaded_adapter.test.ts`: `LoadedAdapterTest` — 5 checks that an adapter written outside this repository is refused when dishonest, and otherwise installed, registered, and run with no rebuild.
- `packaged_release.test.ts`: `PackagedReleaseTest` — 3 checks that a release copied out of the repository installs its host and serves an agent, with nothing above it.
- `npm_package.test.ts`: `NpmPackageTest` — 13 checks that the published package names one version, is byte for byte the release Chrome drives, installs into its own home, says if it works, outlives npm's folder, and comes back out.
- `native_host.test.ts`: `NativeHostTest` — 10 checks over the delivery path, endpoint to page.
- `endpoint_file.test.ts`: `EndpointFileTest` — 10 checks that `endpoint.json` names a host really listening.
- `native_host_install.test.ts`: `NativeHostInstallTest` — 7 checks that installing announces every file first and uninstalling removes each.
- `injection_defence.test.ts`: `InjectionDefenceTest` — attacks through hostile content put on the page.
- `source_boundary.test.ts`: `SourceBoundaryTest` — refuses a relative import that leaves `src/`.
- `live_page_harness.ts`: `LivePageHarness` — the live browser the site checks share, from launching Chrome to calling one tool.
- Commands: `npm test`; `npm run test:no_browser`; one alone, `node --test tests/native_host.test.ts`.

## Rules
- A runner is named after its subject and ends in `.test.ts`, so `node --test` finds it with no file list, here and in the subfolders. A file holding no check keeps a plain name.
- `package.json` holds no script for a single runner, except `npm run test:no_browser`, which names the five starting no browser.
- Imports run one way only: `tests/` from `tools/` and `src/`, `tools/` from `src/`, `src/` from neither. `tests/source_boundary.test.ts` checks the last.
- Verification asserts against state read back out of the live page. Nothing is mocked, and a check that cannot fail is not a check.
- The five starting no browser are what `npm run test:no_browser` names, and none mocks anything: `endpoint_file.test.ts` starts the real host over a real pipe, and `npm_package.test.ts` really packs, installs and runs the published command.
- Nothing here writes into the browser the user installed, which [issue #4](https://github.com/jeromeetienne/webmcp_everywhere/issues/4) refuses: `native_host_install.test.ts` passes `isEverydayChromeCovered: false`, and `npm_package.test.ts` sets `HOME` to a throwaway directory, so the everyday Chrome it covers is one inside that home.
- `loaded_adapter.test.ts` writes its adapter folder into the system temporary directory and removes what it installed afterwards. An adapter left in `~/.webmcp_everywhere/adapters/` would run in the browser of whoever ran the checks.
- `packaged_release.test.ts` copies the release out of the repository before driving it: one still inside `build/` has a repository above it, so a path reaching for one would resolve while the thing it checks was broken. It needs port 8765, which serves one browser at a time, so it says why and skips when another Chrome owns the port.
- One shape everywhere: `NodeTest.before` prepares the live browser, `NodeTest.after` closes it, and a check throws its own message rather than calling `node:assert`: those messages are what the runner is for. Detail goes to `t.diagnostic`. Checks in one file run in the order written and share one live page, so anything that must happen between two of them belongs in a nested `NodeTest.describe`'s `NodeTest.before`.
- `npm test` runs with `--test-concurrency=1`: every browser runner takes the same debugging port and profile.
- Node.js runs these files directly, so they stay within erasable syntax: no `enum`, no runtime `namespace`, no parameter properties, no decorators.

## Background
- The failures these runners were written against are in [issue #2](https://github.com/jeromeetienne/webmcp_everywhere/issues/2); the npm package they now also cover is [issue #12](https://github.com/jeromeetienne/webmcp_everywhere/issues/12).
- Which runner to reach for when: [testing_and_verification.md](../docs/testing_and_verification.md). `node:test` replaced the hand-written helper in [issue #6](https://github.com/jeromeetienne/webmcp_everywhere/issues/6), which says why the bridge runner launches its own Chrome.

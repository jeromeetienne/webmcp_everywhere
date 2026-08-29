# Directory Context: `/tests`

## Purpose
Everything that exists only to check the product: the runners, the live browser they share, and the stdio Model Context Protocol bridge one of them checks.

## Key Exports & Entry Points
- `site_adapters/`: One verification runner per adapted site — see its own CONTEXT.md.
- `devtools_protocol_bridge/`: The stdio Model Context Protocol bridge and the runner driving it — see its own CONTEXT.md.
- `adapter_registry_sync.test.ts`: `AdapterRegistrySyncTest` — 5 checks that the registry and the runners match the folders under `src/site_adapters/`, and that the manifest names no site.
- `loaded_adapter.test.ts`: `LoadedAdapterTest` — 5 checks that an adapter written outside this repository, importing both packages, is refused when dishonest and otherwise run with no rebuild.
- `packaged_release.test.ts`: `PackagedReleaseTest` — 3 checks that a release copied out of the repository installs its host and serves an agent.
- `npm_package.test.ts`: `NpmPackageTest` — 13 checks that the published package names one version, is byte for byte the release Chrome drives, installs into a home of its own, and comes back out.
- `native_host.test.ts`: `NativeHostTest` — 10 checks over the delivery path, endpoint to page.
- `endpoint_file.test.ts`: `EndpointFileTest` — 10 checks that `endpoint.json` names a host really listening.
- `native_host_install.test.ts`: `NativeHostInstallTest` — 7 checks that installing announces every file first and uninstalling removes each one.
- `injection_defence.test.ts`: `InjectionDefenceTest` — attacks through hostile content put on the page.
- `source_boundary.test.ts`: `SourceBoundaryTest` — refuses a relative import that leaves `src/`, or that leaves a package under `packages/`.
- `workspace_packages.test.ts`: `WorkspacePackagesTest` — 5 checks over the two packages an adapter author installs, packed rather than linked.
- `live_page_harness.ts`: `LivePageHarness` — the live browser the site checks share, from launching Chrome to calling a tool.
- Commands: `npm test`; `npm run test:no_browser`; one alone, `node --test <runner>`.

## Rules
- A runner is named after its subject and ends in `.test.ts`, so `node --test` finds it with no file list. A file with no check keeps a plain name.
- `package.json` holds no script for a single runner, except `npm run test:no_browser`, which names the six starting no browser.
- Imports run one way only: `tests/` from `tools/` and `src/`, `tools/` from `src/`, `src/` from neither. `tests/source_boundary.test.ts` checks the last, for `src/` and for every package.
- Verification asserts against state read back out of the live page. Nothing is mocked, and a check that cannot fail is not a check.
- The six starting no browser are what `npm run test:no_browser` names, and none mocks anything: `endpoint_file.test.ts` starts a real host over a real pipe, and `npm_package.test.ts` and `workspace_packages.test.ts` really pack and install.
- Nothing here writes into the browser the user installed, which [issue #4](https://github.com/jeromeetienne/webmcp_everywhere/issues/4) refuses: `native_host_install.test.ts` passes `isEverydayChromeCovered: false`, and `npm_package.test.ts` sets `HOME` elsewhere.
- `loaded_adapter.test.ts` writes its adapter folder into the system temporary directory, installs both packages into it out of this clone, and removes what it installed: an adapter left in `~/.webmcp_everywhere/adapters/` would run in the browser of whoever ran the checks.
- `packaged_release.test.ts` copies the release out of the repository first: one inside `build/` has a repository above it, so a path reaching for one would resolve while the thing it checks was broken. It needs port 8765 and skips, saying why, when another Chrome owns it.
- One shape everywhere: `NodeTest.before` prepares the live browser, `NodeTest.after` closes it, and a check throws its own message rather than calling `node:assert`, because those messages are what the runner is for. Detail goes to `t.diagnostic`. Checks in one file share one live page and run in order, so anything that must happen between two belongs in a nested `NodeTest.describe`'s `NodeTest.before`.
- `npm test` runs with `--test-concurrency=1`: every browser runner takes the same port and profile.
- Node.js runs these files directly, so they stay within erasable syntax: no `enum`, no runtime `namespace`, no parameter properties, no decorators.

## Background
- The failures these runners were written against are in [issue #2](https://github.com/jeromeetienne/webmcp_everywhere/issues/2); the npm package is [issue #12](https://github.com/jeromeetienne/webmcp_everywhere/issues/12).
- Which runner to reach for when: [testing_and_verification.md](../docs/testing_and_verification.md). `node:test` replaced the hand-written helper in [issue #6](https://github.com/jeromeetienne/webmcp_everywhere/issues/6), which says why the bridge runner launches its own Chrome.

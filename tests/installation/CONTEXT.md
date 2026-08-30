# Directory Context: `/tests/installation`

## Purpose
The runners covering what a user installs, in the order a user meets it: the host manifest file written into Chrome, the package npmjs carries, and a release driven with no repository under it.

## Key Exports & Entry Points
- `native_host_install.test.ts`: `NativeHostInstallTest` — 7 checks that installing announces every file first and uninstalling removes each one.
- `webmcp_everywhere.test.ts`: `WebmcpEverywhereTest` — 13 checks that the published package names one version, is byte for byte what Chrome is driven against, installs into a home of its own, and comes back out.
- `packaged_release.test.ts`: `PackagedReleaseTest` — 3 checks that a release copied out of the repository installs its host and serves an agent.
- Command to check this folder: `node --test --test-concurrency=1 tests/installation/*.test.ts`

## Rules
- Nothing here writes into the browser the user installed, which [issue #4](https://github.com/jeromeetienne/webmcp_everywhere/issues/4) refuses: every call passes `isEverydayChromeCovered: false`, and `webmcp_everywhere.test.ts` sets `HOME` elsewhere.
- `packaged_release.test.ts` copies the release out of the repository first: one still inside `build/` has a repository above it, so a path reaching for one would resolve while the thing it checks was broken. It needs port 8765 and skips, saying why, when another Chrome owns it.
- `webmcp_everywhere.test.ts` and `packaged_release.test.ts` install through the same `PackagedReleaseInstallation`, so what npm delivers and what Chrome is driven against are checked to be the same bytes rather than assumed to be.
- `native_host_install.test.ts` and `webmcp_everywhere.test.ts` start no browser and are named by `npm run test:no_browser`; `packaged_release.test.ts` drives a real Chrome.

## Background
- Announcing every file before writing it, and removing every one of them, comes from [issue #4](https://github.com/jeromeetienne/webmcp_everywhere/issues/4); the package on npmjs is [issue #12](https://github.com/jeromeetienne/webmcp_everywhere/issues/12).
- What the release holds and how it is built is [build_and_install.md](../../docs/build_and_install.md); the release workflow attaches no archive until `packaged_release.test.ts` has passed.

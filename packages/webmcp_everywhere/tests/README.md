# The installation verification runners

These runners cover what [`/packages/webmcp_everywhere`](../README.md) installs, in the order a user meets it: the host manifest file written into Chrome, the package npmjs carries, and a release driven with no repository under it.

Nothing here writes into the Chrome you use every day, and nothing here writes into your own home directory.

## What is in here

- `native_host_install.test.ts` — 7 checks that installing announces every file before writing it, and that uninstalling removes each one. Starts no browser.
- `webmcp_everywhere.test.ts` — 13 checks that the published package names one version, is byte for byte what Chrome is driven against, installs into a home directory of its own, and comes back out. Starts no browser.
- `packaged_release.test.ts` — 3 checks that a release copied out of the repository installs its host and serves an agent. Drives a real Chrome.

`packaged_release.test.ts` copies the release out of the repository first, because a release still inside `build/` has a repository above it and a path reaching for one would resolve while the thing being checked was broken. It needs port 8765 and skips, saying so, when another Chrome owns it.

## Running it

```bash
node --test --test-concurrency=1 packages/webmcp_everywhere/tests/*.test.ts
```

The release workflow attaches no archive until `packaged_release.test.ts` has passed.

## Reading further

- The rules for editing this folder are in [CONTEXT.md](CONTEXT.md).
- What the release holds and how it is built: [build_and_install.md](../../../docs/build_and_install.md).

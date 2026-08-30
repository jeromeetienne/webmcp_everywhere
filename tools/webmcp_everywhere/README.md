# The release and installation tools

This folder builds and installs what [`/packages/webmcp_everywhere`](../../packages/webmcp_everywhere/README.md) publishes: it packages a release, refuses a release whose version numbers disagree, and registers this working copy's native messaging host with Chrome.

`npm run install:host` is the one command in `tools/` allowed to write into the Chrome you use every day. It announces every file it is about to write before it writes any of them, and `npm run uninstall:host` removes each one.

## What is in here

- `package_release.ts` — builds the four things the published package cannot commit, and archives what it publishes. `npm run package:release`
- `version_agreement.ts` — refuses a release whose tag, package version, and extension version disagree. `npm run check:versions`
- `install_native_host_entry.ts` — registers this working copy's native messaging host with Chrome. `npm run install:host`
- `uninstall_native_host_entry.ts` — removes what the installation wrote. `npm run uninstall:host`
- `working_copy_layout.ts` — names this working copy's launcher, host manifest template, and extension manifest, in one place.

The installation itself ships to users, so it lives in `packages/webmcp_everywhere/src/`. The two files ending in `_entry.ts` here are only entry points into it.

## Running it

```bash
npm run install:host
```

```bash
npm run uninstall:host
```

```bash
npm run package:release
```

```bash
npm run check:versions
```

## Reading further

- The rules for editing this folder are in [CONTEXT.md](CONTEXT.md).
- What the release holds and what the installation registers: [build_and_install.md](../../docs/build_and_install.md).
- Why a native messaging host exists at all: [why_a_native_messaging_host.md](../../docs/why_a_native_messaging_host.md).

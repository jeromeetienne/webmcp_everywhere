# Directory Context: `/packages/webmcp_everywhere/tools`

## Purpose
Everything that builds and installs what [the package this folder sits in](../CONTEXT.md) publishes, and the one file naming where a working copy keeps the three things a release carries beside itself.

## Key Exports & Entry Points
- `package_release.ts`: `PackageRelease` — builds the four things the published package cannot commit, and archives what it publishes. `npm run package:release`, `npm run pack:npm`
- `version_agreement.ts`: `VersionAgreement` — refuses a release whose tag, package and extension disagree. `npm run check:versions`
- `install_native_host_entry.ts` and `uninstall_native_host_entry.ts`: register this working copy's native messaging host with Chrome, announcing every file first, and take that back out. `npm run install:host`, `npm run uninstall:host`
- `working_copy_layout.ts`: `WorkingCopyLayout` — names this working copy's launcher, host manifest template and extension manifest, once.

## Rules
- The repository is not the published package: the root `package.json` is private, and what npm publishes is the package above this folder, whose manifest is committed there rather than written here. `package_release.ts` builds four things into that folder and nothing else.
- The installation itself ships, so it lives in this package's `src/`. The two `*_entry.ts` files here are entry points into it and hold no installation logic of their own. Nothing under `src/` imports from here, which `tests/repository_layout/source_boundary.test.ts` refuses, and which is why `files` in the manifest names no `tools`.
- A module anything imports carries no `import.meta.filename === process.argv[1]` test, which is why those two entry points are files of their own: a bundle shares one `import.meta.filename` across every module inlined into it.
- `working_copy_layout.ts` is the counterpart of `../src/release_layout.ts`. A package that ships to a user carries no default path into the repository, so every caller passes these paths in.
- `npm run install:host` is the only command in the repository, outside what a user runs, allowed to write into the everyday Chrome, and it announces every file before writing it.

## Background
- The package on npmjs is [issue #12](https://github.com/jeromeetienne/webmcp_everywhere/issues/12), and what ships moving out of `tools/` is milestone 3 of [issue #11](https://github.com/jeromeetienne/webmcp_everywhere/issues/11), which is also when `working_copy_layout.ts` was split out. This folder was `tools/webmcp_everywhere/` until [issue #28](https://github.com/jeromeetienne/webmcp_everywhere/issues/28) moved it inside the package it acts on.
- Why an installation announces every file first, and why installing and uninstalling share one directory list, is [issue #4](https://github.com/jeromeetienne/webmcp_everywhere/issues/4) and [the CONTEXT.md of the package above](../CONTEXT.md).

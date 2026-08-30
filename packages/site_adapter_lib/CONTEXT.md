# Directory Context: `/packages/site_adapter_lib`

## Purpose
Everything a site adapter is written against, whether it lives in `contribs/site_adapters/` or in a folder of somebody else's. It has two halves that are not the same kind of thing, and `src/index.ts` is where that is said: `src/format/` is a contract meant to stop changing, `src/toolkit/` is a helper library meant to grow. The checks an adapter must pass live in `packages/site_adapter_lib/tools/`, because they run in Node.js before an adapter reaches a browser and are never bundled into a page.

## Key Exports & Entry Points
- `src/index.ts`: the whole of `@webmcp_everywhere/site_adapter_lib`, and the only entry point `package.json` names. It re-exports both halves under one name and carries the ambient declarations for `document.modelContext` with a triple-slash reference.
- `src/format/`: what an adapter must conform to and the version it declares — see its own CONTEXT.md.
- `src/toolkit/`: the page helpers every adapter shares, waiting and driving — see its own CONTEXT.md.
- `README.md`: what an adapter author outside this repository reads. It ships in the tarball; `CONTEXT.md` does not.

## Rules
- **The two halves stay apart inside `src/`, and a new file joins one of them rather than sitting beside `index.ts`.** The split is the whole reason this is one package rather than two: naming it once stopped an author asking which package a symbol came from, and a flat `src/` would lose what the two package names were carrying. `tests/repository_layout/` checks the layout.
- `ADAPTER_FORMAT_VERSION` versions the format half only, and equals the `version` field of `package.json`, which `tests/repository_layout/workspace_packages.test.ts` checks. A toolkit helper added on its own is not a reason to bump either.
- This package imports nothing: not anything under `contribs/`, and no adapter. So an adapter can be checked without a browser.
- No relative import leaves this folder, which `tests/repository_layout/source_boundary.test.ts` checks. One that reached back into the repository would work here and break for anybody who installed the package.
- `"sideEffects": false`, so esbuild drops what a bundle does not use. Without it, one entry point means every bundle carries every module: importing `ToolNaming` alone dragged 8 kilobytes of `UntrustedContent` into the `npx webmcp_everywhere` command, and the toolkit half is bundled into a main-world content script on every covered page.
- `"private": true` until the decision in milestone 2 of [issue #11](https://github.com/jeromeetienne/webmcp_everywhere/issues/11) is taken. Nothing is published from here yet, and an accidental publish should fail rather than take the name.

## Background
- **The two halves were two packages, `adapter_format` and `adapter_toolkit`, until [issue #23](https://github.com/jeromeetienne/webmcp_everywhere/issues/23).** Both are about writing an adapter, so an author had to know which of two names a symbol came from before importing it, and every argument for keeping them apart turned out to be bookkeeping — the version rule, the Node.js and browser split, the bundle size — rather than a difference an author could feel. The one real difference, a contract that must freeze against a library that must grow, is now `src/format/` against `src/toolkit/`, where it is visible in a directory listing.
- Whether this package goes on npmjs is the decision milestone 2 of [issue #11](https://github.com/jeromeetienne/webmcp_everywhere/issues/11) left open.
- **Node.js reads this package only while npm links it.** `tools/` and `tests/` import it by name and Node.js resolves the link to a real path outside `node_modules`, which is what lets that work with no build step. An adapter author gets a real folder inside `node_modules` instead, where Node.js refuses to strip types, so esbuild is their only way in — `npm run load-adapter` bundles before anything runs. `tests/repository_layout/workspace_packages.test.ts` pins both halves.

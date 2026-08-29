# Directory Context: `/packages`

## Purpose
The npm workspace: one folder per package, each with its own `package.json`. Two hold what an adapter is written against and are imported by their `@webmcp_everywhere/` names; one holds what npmjs carries and what a user installs.

## Key Exports & Entry Points
- `adapter_format/`: what an adapter is, how its tools are named, and how page content is framed — see its own CONTEXT.md.
- `npm_package/`: what npmjs carries and what a user installs — see its own CONTEXT.md.
- `adapter_toolkit/`: the page helpers every adapter shares, waiting and driving — see its own CONTEXT.md.
- Command to link every package: `npm install`, which the root `package.json` `workspaces` field drives.

## Rules
- A package offers one thing: either one entry point, `./src/index.ts`, under a single `"."` key in `exports`, or a `bin` for a command. Never a list of separate files under `exports`, and never both.
- No relative import leaves a package that publishes its own source, which `tests/source_boundary.test.ts` checks by reading each `files` list. A package that reached back into the repository would work here and break for anybody who installed it. `npm_package` publishes bundles rather than source, so its `src/` may import from `src/` — and in exchange it names no path of its own that only a working copy has.
- A package that ships to a user carries no default path into the repository. `tools/working_copy_layout.ts` is where a working copy's launcher, template and extension manifest are named, and every caller passes them in.
- A package whose entry point is TypeScript is read by Node.js only while npm links it: Node.js resolves the link to a real path outside `node_modules`, where it will still strip types. Installed as a real folder, the same package is refused with `ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`, so esbuild is the only way in for anybody who installed it. `tests/workspace_packages.test.ts` pins both halves.
- A package sets `"sideEffects": false`, so esbuild drops what a bundle does not use. Without it, one entry point means every bundle carries every module: importing `ToolNaming` alone dragged 8 kilobytes of `UntrustedContent` into the `npx webmcp_everywhere` command.
- A package ships its `README.md` and its `src/`, named by `files`, and never its `CONTEXT.md`. This file rules the folder for whoever edits it here; the README is for whoever installs it.
- Whatever depends on a package declares it: `src/`, `tools/` and `tests/` import both packages, so the root `package.json` names both in `devDependencies` even though the workspace would link them anyway.
- Every package stays `"private": true` except `npm_package`, which [issue #12](https://github.com/jeromeetienne/webmcp_everywhere/issues/12) put on npmjs. Publishing takes a name and is not undone, so a second publishable package is refused by `tests/workspace_packages.test.ts` until somebody decides otherwise.

## Background
- The workspace, what it buys and what it costs, is [issue #11](https://github.com/jeromeetienne/webmcp_everywhere/issues/11). Milestone 1 moved one folder in and changed nothing that is built or published, milestone 2 moved the adapter contract in so an author outside this repository installs it rather than copying it, and milestone 4 is where the split is meant to stop.
- Neither package an adapter author needs is on npmjs. Whether they go there is the decision milestone 2 left open, and until it is taken an adapter author installs them out of a clone. Milestone 3 made `npm_package` a package of its own, so what npm publishes is committed rather than generated.

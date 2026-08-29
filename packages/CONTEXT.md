# Directory Context: `/packages`

## Purpose
The npm workspace: one folder per package, each with its own `package.json`, each importable by its `@webmcp_everywhere/` name rather than by a relative path out of `src/`.

## Key Exports & Entry Points
- `adapter_format/`: what an adapter is, how its tools are named, and how page content is framed — see its own CONTEXT.md.
- `adapter_toolkit/`: the page helpers every adapter shares, waiting and driving — see its own CONTEXT.md.
- Command to link every package: `npm install`, which the root `package.json` `workspaces` field drives.

## Rules
- A package names one entry point, `./src/index.ts`, under a single `"."` key in `exports`. Never a list of separate files.
- No relative import leaves a package, which `tests/source_boundary.test.ts` checks. A package that reached back into the repository would work here and break for anybody who installed it, because the path it reached along would not be there.
- A package whose entry point is TypeScript is read by Node.js only while npm links it: Node.js resolves the link to a real path outside `node_modules`, where it will still strip types. Installed as a real folder, the same package is refused with `ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`, so esbuild is the only way in for anybody who installed it. `tests/workspace_packages.test.ts` pins both halves.
- A package sets `"sideEffects": false`, so esbuild drops what a bundle does not use. Without it, one entry point means every bundle carries every module: importing `ToolNaming` alone dragged 8 kilobytes of `UntrustedContent` into the `npx webmcp_everywhere` command.
- A package ships its `README.md` and its `src/`, named by `files`, and never its `CONTEXT.md`. This file rules the folder for whoever edits it here; the README is for whoever installs it.
- Whatever depends on a package declares it: `src/`, `tools/` and `tests/` import both packages, so the root `package.json` names both in `devDependencies` even though the workspace would link them anyway.
- Every package stays `"private": true` until somebody decides it is published, because the decision is which name is taken on npmjs and it is not undone.

## Background
- The workspace, what it buys and what it costs, is [issue #11](https://github.com/jeromeetienne/webmcp_everywhere/issues/11). Milestone 1 moved one folder in and changed nothing that is built or published, milestone 2 moved the adapter contract in so an author outside this repository installs it rather than copying it, and milestone 4 is where the split is meant to stop.
- Neither package is on npmjs. Whether they go there is the decision milestone 2 left open, and until it is taken an adapter author installs them out of a clone.

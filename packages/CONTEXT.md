# Directory Context: `/packages`

## Purpose
The npm workspace: one folder per package, each with its own `package.json`, each importable by its `@webmcp_everywhere/` name rather than by a relative path out of `src/`.

## Key Exports & Entry Points
- `adapter_toolkit/`: the page helpers every adapter shares, waiting and driving — see its own CONTEXT.md.
- Command to link every package: `npm install`, which the root `package.json` `workspaces` field drives.

## Rules
- A package names one entry point, `./src/index.ts`, under a single `"."` key in `exports`. Never a list of separate files.
- No relative import leaves a package, which `tests/source_boundary.test.ts` checks. A package that reached back into the repository would work here and break for anybody who installed it, because the path it reached along would not be there.
- A package whose entry point is TypeScript is read by esbuild only. Node.js refuses to strip types under `node_modules`, so anything a runner or a tool imports at runtime stays in `src/` or `tools/` until it has a build step.
- Whatever depends on a package declares it: `src/site_adapters/` imports `@webmcp_everywhere/adapter_toolkit`, so the root `package.json` names that package in `devDependencies` even though the workspace would link it anyway.
- Every package stays `"private": true` until somebody decides it is published, because the decision is which name is taken on npmjs and it is not undone.

## Background
- The workspace, what it buys and what it costs, is [issue #11](https://github.com/jeromeetienne/webmcp_everywhere/issues/11). Milestone 1 moved one folder in and changed nothing that is built or published; milestone 4 is where the split is meant to stop.

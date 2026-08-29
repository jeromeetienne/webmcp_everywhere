# Directory Context: `/packages`

## Purpose
The npm workspace: one folder per package, each with its own `package.json`. Two hold what an adapter is written against and are imported by their `@webmcp_everywhere/` names; one holds what npmjs carries and what a user installs.

## Key Exports & Entry Points
- `adapter_format/`: what an adapter is, how its tools are named, and how page content is framed — see its own CONTEXT.md.
- `adapter_toolkit/`: the page helpers every adapter shares, waiting and driving — see its own CONTEXT.md.
- `npm_package/`: what npmjs carries and what a user installs — see its own CONTEXT.md.
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
- **There are three packages, and that is a decision rather than a stage.** `WorkspacePackagesTest.DECIDED_PACKAGES` holds the list, so a fourth folder here fails a check until somebody adds it there with the reason. Growing the workspace is meant to be something somebody decided, not something that happened.

## Background
- The workspace, what it buys and what it costs, is [issue #11](https://github.com/jeromeetienne/webmcp_everywhere/issues/11), milestone by milestone. The commits on `make_the_repository_a_workspace` say what each one landed.
- **Why the split stopped at three, decided in milestone 4.** `src/chrome_extension/`, `src/native_messaging_host/` and `src/site_adapters/` stayed folders: nothing installs any of them, one build reads all of them, one version covers all of them, and each move rewrites every document naming a path. The one measurable pull was `npm_package/src/` reaching into `src/native_messaging_host/` three times for two files, which is legal, checked and cheap because that package publishes bundles rather than source.
- **What would reopen it.** A folder becomes a package when somebody outside this repository has to install it, or when two packages need the same file and neither can hold it — so if `src/native_messaging_host/` were published, or a second package needed `HostStateFiles`, it should move. Not for tidiness.
- **One package per adapter is the interesting one, and is not justified yet.** What would justify it is somebody publishing an adapter of their own on npmjs, which needs the decision milestone 2 left open and then somebody doing it. Until then a folder per adapter is the same boundary with none of the cost, and an adapter written elsewhere already needs no folder here.

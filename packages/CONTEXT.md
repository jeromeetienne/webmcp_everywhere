# Directory Context: `/packages`

## Purpose
The npm workspace: one folder per package, each with its own `package.json`, each named below.

## Key Exports & Entry Points
- `site_adapter/`: everything an adapter is written against — the format it conforms to, and the page helpers it shares — see its own CONTEXT.md.
- `native_messaging_host/`: the program that holds the HTTP port the extension cannot — see its own CONTEXT.md.
- `webmcp_everywhere/`: what npmjs carries and what a user installs — see its own CONTEXT.md.
- `<package>/tools/` and `<package>/tests/`: the tooling and the runners whose subject is that package.
- Command to link every package: `npm install`, which the root `package.json` `workspaces` field drives.

## Rules
- **A folder is a package when it has a `package.json` of its own, whether or not npmjs ever carries it.** `WorkspacePackagesTest.DECIDED_PACKAGES` holds the list, so a fourth folder here fails a check until somebody adds it there with the reason. Growing the workspace is meant to be something somebody decided, not something that happened.
- A package folder is named after what the package publishes, minus the `@webmcp_everywhere/` scope, so a name on npmjs and a folder on disk are the same word.
- A package offers one thing to be imported: one entry point, `./src/index.ts`, under a single `"."` key in `exports`. Never a list of separate files. A package may also be a command through `bin`, or a program started by its path as `native_messaging_host` is; what it offers an importer still goes through the one entry point.
- **A package's `tools/` and `tests/` folders are not product code**: no `files` list names either, so neither reaches a user, and nothing under `src/` may import from either.
- No relative import leaves the product code of a package that publishes its own source, because a package that reached back into the repository would work here and break for anybody who installed it. `webmcp_everywhere` publishes bundles rather than source, so its `src/` is not held to that. `tests/repository_layout/source_boundary.test.ts` checks both rules, reading each `files` list.
- A package that ships to a user carries no default path into the repository: every caller passes the paths in. The file naming a working copy's own paths is `working_copy_layout.ts`, in that package's `tools/`.
- A package whose entry point is TypeScript is read by Node.js only while npm links it, because the link resolves to a real path outside `node_modules`. Installed as a real folder it is refused with `ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`, so esbuild is the only way in for anybody who installed it. `tests/repository_layout/workspace_packages.test.ts` pins both halves.
- A package sets `"sideEffects": false`, so esbuild drops what a bundle does not use. Without it, one entry point means every bundle carries every module: importing `HostStateFiles` takes the `npx webmcp_everywhere` command from 45 kilobytes to 649.
- A package ships its `README.md` and its `src/`, named by `files`, and never its `CONTEXT.md`. This file rules the folder for whoever edits it here; the README is for whoever reads the package anywhere else.
- Whatever depends on a package declares it: `contribs/`, and every `tools/` and `tests/` folder, import packages by name, so the root `package.json` names them in `devDependencies`.
- Every package stays `"private": true` except `webmcp_everywhere`, which [issue #12](https://github.com/jeromeetienne/webmcp_everywhere/issues/12) put on npmjs. Publishing takes a name and is not undone, so a second publishable package is refused by `tests/repository_layout/workspace_packages.test.ts` until somebody decides otherwise.

## Background
- Each `tools/` and `tests/` folder moved in from the top of the repository in [issue #28](https://github.com/jeromeetienne/webmcp_everywhere/issues/28).
- The workspace, what it buys and what it costs, is [issue #11](https://github.com/jeromeetienne/webmcp_everywhere/issues/11), milestone by milestone. The commits on `make_the_repository_a_workspace` say what each one landed.
- **What makes a folder a package was rewritten in [issue #19](https://github.com/jeromeetienne/webmcp_everywhere/issues/19)**, which replaced the earlier rule — a folder becomes a package when somebody outside this repository has to install it — with the one above.
- **Two packages for one subject is what [issue #23](https://github.com/jeromeetienne/webmcp_everywhere/issues/23) undid.** `adapter_format` and `adapter_toolkit` are now the two halves of `site_adapter`, `src/format/` and `src/toolkit/`. That issue says why keeping them apart was bookkeeping.
- **One package per adapter is the open question, and is not justified yet.** What would justify it is somebody publishing an adapter of their own on npmjs. Until then a folder per adapter is the same boundary with none of the cost, and an adapter written elsewhere already needs no folder here.

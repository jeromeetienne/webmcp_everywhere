# Directory Context: `/packages/adapter_toolkit`

## Purpose
The page helpers an adapter would otherwise write for itself, in one place: waiting for a page to catch up, and the two interactions a framework only notices when they are done a particular way. Every helper here was written at least twice, in at least two adapters, before it moved in.

## Key Exports & Entry Points
- `src/index.ts`: the whole of `@webmcp_everywhere/adapter_toolkit`, and the only entry point `package.json` names.
- `src/page_waiting.ts`: `PageWaiting` — `pause`, `waitUntil`, and `waitUntilChanged`. Changes nothing on the page.
- `src/page_driving.ts`: `PageDriving` — `writeIntoInputField` and `pressEnter`. Changes the page, always.

## Rules
- **Every helper in `src/page_driving.ts` changes the page, and no helper in `src/page_waiting.ts` does.** `tools/adapter_validation/permission_audit.ts` reads a handler that names `PageDriving` as acting, whatever the tool declared, so a helper filed on the wrong side either lets an acting tool call itself read-only or makes the audit refuse an honest read-only one.
- A helper moves in at its second caller, never at its first. A four-argument helper with one caller is harder to read than the code it replaced, and nothing yet says which of its arguments the second caller would have wanted.
- This package imports nothing, not `@webmcp_everywhere/adapter_format`, not anything under `src/`, and not any adapter. It is bundled into a main-world content script on every covered page, so it stays small enough that its size never becomes a reason to argue about it.
- **Only esbuild reads this package. Node.js never imports it.** `package.json` names `./src/index.ts`, and Node.js refuses to strip types for a file under `node_modules`, so a runner importing this package by name would fail with `ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING` the moment it was installed rather than linked. Everything reaching a browser goes through `tools/build_extension.ts` or `tools/load_adapter.ts`, and both bundle.
- No relative import leaves this folder, which `tests/repository_layout/source_boundary.test.ts` checks. One that reached back into the repository would work here and break for anybody who installed the package.
- `"private": true` until the decision in milestone 2 of [issue #11](https://github.com/jeromeetienne/webmcp_everywhere/issues/11) is taken. Nothing is published from here yet, and an accidental publish should fail rather than take the name.
- A helper here works on any site. Anything that knows a selector, a storage key, or a route of one particular site stays in that site's own folder under `src/site_adapters/`.
- A timeout is reported, never thrown. An interaction that changed nothing is an outcome a tool has to describe, not a fault.

## Background
- The folder was made in milestone two of [issue #9](https://github.com/jeromeetienne/webmcp_everywhere/issues/9). Before it, `waitUntil` existed three times and the native input value setter twice, each written slightly differently, and every new adapter author rediscovered both.
- It became a package, and the first one, in milestone 1 of [issue #11](https://github.com/jeromeetienne/webmcp_everywhere/issues/11), which also records the live test showing that npm workspaces and Node.js type stripping work together with no build step.
- Why writing to `element.value` does nothing on a React page, and why the native setter works, is recorded in `src/page_driving.ts` beside the helper.

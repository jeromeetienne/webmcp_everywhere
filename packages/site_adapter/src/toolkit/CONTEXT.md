# Directory Context: `/packages/site_adapter/src/toolkit`

## Purpose
The library half of `@webmcp_everywhere/site_adapter`: the page helpers an adapter would otherwise write for itself, in one place — waiting for a page to catch up, and the two interactions a framework only notices when they are done a particular way. Every helper here was written at least twice, in at least two adapters, before it moved in. Unlike `../format/`, this half is meant to grow.

## Key Exports & Entry Points
- `page_waiting.ts`: `PageWaiting` — `pause`, `waitUntil`, and `waitUntilChanged`. Changes nothing on the page.
- `page_driving.ts`: `PageDriving` — `writeIntoInputField` and `pressEnter`. Changes the page, always.
- Both reach the outside through `../index.ts`, never by their own path.

## Rules
- **Every helper in `page_driving.ts` changes the page, and no helper in `page_waiting.ts` does.** `tools/adapter_validation/permission_audit.ts` reads a handler that names `PageDriving` as acting, whatever the tool declared, so a helper filed on the wrong side either lets an acting tool call itself read-only or makes the audit refuse an honest read-only one.
- A helper moves in at its second caller, never at its first. A four-argument helper with one caller is harder to read than the code it replaced, and nothing yet says which of its arguments the second caller would have wanted.
- **Nothing here imports `../format/`.** These helpers know about pages, not about what an adapter is, and the one time they would need a type from the format is the moment to ask whether the helper belongs in an adapter instead.
- This half is bundled into a main-world content script on every covered page, so it stays small enough that its size never becomes a reason to argue about it.
- A helper here works on any site. Anything that knows a selector, a storage key, or a route of one particular site stays in that site's own folder under `contribs/site_adapters/`.
- A timeout is reported, never thrown. An interaction that changed nothing is an outcome a tool has to describe, not a fault.
- Adding a helper here is not a reason to bump `ADAPTER_FORMAT_VERSION`. That version belongs to `../format/`, and an adapter declares conformance to the format, not to this library.

## Background
- The folder was made in milestone two of [issue #9](https://github.com/jeromeetienne/webmcp_everywhere/issues/9). Before it, `waitUntil` existed three times and the native input value setter twice, each written slightly differently, and every new adapter author rediscovered both.
- It became a package, and the first one, in milestone 1 of [issue #11](https://github.com/jeromeetienne/webmcp_everywhere/issues/11), which also records the live test showing that npm workspaces and Node.js type stripping work together with no build step. It stopped being a package of its own in [issue #23](https://github.com/jeromeetienne/webmcp_everywhere/issues/23) — the reasoning is in `../../CONTEXT.md`.
- Why writing to `element.value` does nothing on a React page, and why the native setter works, is recorded in `page_driving.ts` beside the helper.

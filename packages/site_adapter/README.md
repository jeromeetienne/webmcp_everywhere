# `@webmcp_everywhere/site_adapter`

Everything a [WebMCP Everywhere](https://github.com/jeromeetienne/webmcp_everywhere) site adapter is written against, in one package. It has two halves, and they are not the same kind of thing:

- **The format**, in `src/format/` — the `Adapter` shape every adapter exports, the version every adapter declares, the naming that qualifies `read_page` into `example_com__read_page`, and the framing every tool result passes through before an agent reads it. This is a contract. Taking anything out of it breaks every adapter that exists, so it is meant to stop changing.
- **The toolkit**, in `src/toolkit/` — the page work an adapter would otherwise write for itself. This is a helper library. It is meant to grow, one helper at a time, and adding to it breaks nothing.

Both are exported from the one entry point, because an adapter needs both.

## The format

`ADAPTER_FORMAT_VERSION` is the string every adapter carries in `metadata.adapterFormatVersion`, and it always equals this package's own version. `npm run load-adapter` refuses an adapter carrying any other.

Importing this package also brings in the ambient declarations for `document.modelContext`, so `document.modelContext.registerTool` typechecks in your own folder.

## The toolkit

- `PageWaiting.waitUntil` and `PageWaiting.waitUntilChanged` — the waiting a tool needs before it reads back what it just changed. Neither changes anything on the page.
- `PageDriving.writeIntoInputField` and `PageDriving.pressEnter` — the two interactions a framework only notices when they are done a particular way. Assigning to `element.value` does nothing on a React page; `writeIntoInputField` goes through the native value setter the page's own listener is watching.

**Every helper in `PageDriving` changes the page, and no helper in `PageWaiting` does.** The review checks `npm run load-adapter` runs read a handler naming `PageDriving` as an acting tool whatever its `permissionClass` field says, so reach for `PageWaiting` in a read-only handler and for `PageDriving` everywhere else.

## Installing it

The package is not on npmjs yet, so it is installed out of a clone of the repository:

```bash
git clone https://github.com/jeromeetienne/webmcp_everywhere.git
npm install ../webmcp_everywhere/packages/site_adapter
```

```ts
import { ADAPTER_FORMAT_VERSION, PageDriving, PageWaiting } from '@webmcp_everywhere/site_adapter';
import type { Adapter } from '@webmcp_everywhere/site_adapter';
```

**This package ships as TypeScript and is read by esbuild, never by Node.js.** `npm run load-adapter` bundles your adapter before anything runs it, which is what makes that work. Node.js refuses to strip types for a file inside `node_modules`, so importing this package straight into a Node.js program fails with `ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`.

How to write an adapter, start to finish: [write_a_site_adapter.md](https://github.com/jeromeetienne/webmcp_everywhere/blob/main/docs/write_a_site_adapter.md).

# `@webmcp_everywhere/adapter_toolkit`

The page helpers every [WebMCP Everywhere](https://github.com/jeromeetienne/webmcp_everywhere) adapter shares, so that an adapter in a folder of your own does not have to write them again:

- `PageWaiting.waitUntil` and `PageWaiting.waitUntilChanged` — the waiting a tool needs before it reads back what it just changed. Neither changes anything on the page.
- `PageDriving.writeIntoInputField` and `PageDriving.pressEnter` — the two interactions a framework only notices when they are done a particular way. Assigning to `element.value` does nothing on a React page; `writeIntoInputField` goes through the native value setter the page's own listener is watching.

Install it beside [`@webmcp_everywhere/adapter_format`](https://github.com/jeromeetienne/webmcp_everywhere/tree/main/packages/adapter_format). Neither package is on npmjs yet, so both are installed out of a clone of the repository:

```bash
git clone https://github.com/jeromeetienne/webmcp_everywhere.git
npm install ../webmcp_everywhere/packages/adapter_toolkit ../webmcp_everywhere/packages/adapter_format
```

```ts
import { PageDriving, PageWaiting } from '@webmcp_everywhere/adapter_toolkit';
```

**Every helper in `PageDriving` changes the page, and no helper in `PageWaiting` does.** The review checks `npm run load-adapter` runs read a handler naming `PageDriving` as an acting tool whatever its `permissionClass` field says, so reach for `PageWaiting` in a read-only handler and for `PageDriving` everywhere else.

**This package ships as TypeScript and is read by esbuild, never by Node.js**, the same as `@webmcp_everywhere/adapter_format`.

How to write an adapter, start to finish: [write_a_site_adapter.md](https://github.com/jeromeetienne/webmcp_everywhere/blob/main/docs/write_a_site_adapter.md).

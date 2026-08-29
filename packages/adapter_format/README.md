# `@webmcp_everywhere/adapter_format`

What a [WebMCP Everywhere](https://github.com/jeromeetienne/webmcp_everywhere) adapter is: the `Adapter` shape every adapter exports, the naming that qualifies `read_page` into `example_com__read_page`, and the framing every tool result passes through before an agent reads it.

Install this beside [`@webmcp_everywhere/adapter_toolkit`](https://github.com/jeromeetienne/webmcp_everywhere/tree/main/packages/adapter_toolkit) when you write an adapter in a folder of your own. Neither package is on npmjs yet, so both are installed out of a clone of the repository:

```bash
git clone https://github.com/jeromeetienne/webmcp_everywhere.git
npm install ../webmcp_everywhere/packages/adapter_format ../webmcp_everywhere/packages/adapter_toolkit
```

Then import both by name:

```ts
import { ADAPTER_FORMAT_VERSION } from '@webmcp_everywhere/adapter_format';
import { PageWaiting } from '@webmcp_everywhere/adapter_toolkit';
import type { Adapter } from '@webmcp_everywhere/adapter_format';
```

Importing this package also brings in the ambient declarations for `document.modelContext`, so `document.modelContext.registerTool` typechecks in your own folder.

`ADAPTER_FORMAT_VERSION` is the string every adapter carries in `metadata.adapterFormatVersion`, and it always equals this package's own version. `npm run load-adapter` refuses an adapter carrying any other.

**This package ships as TypeScript and is read by esbuild, never by Node.js.** `npm run load-adapter` bundles your adapter before anything runs it, which is what makes that work. Node.js refuses to strip types for a file inside `node_modules`, so importing this package straight into a Node.js program fails with `ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`.

How to write an adapter, start to finish: [write_a_site_adapter.md](https://github.com/jeromeetienne/webmcp_everywhere/blob/main/docs/write_a_site_adapter.md).

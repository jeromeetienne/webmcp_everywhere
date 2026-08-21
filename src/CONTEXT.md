# Directory Context: `/src`

## Purpose
Everything that ships: the adapter format, the adapters written against it, the browser extension that loads them, and the bridge that lets an ordinary agent call them.

## Key Exports & Entry Points
- `adapter_format/`: The type, the schema, the namespacing, and the review checks that define what an adapter is — see its own CONTEXT.md.
- `site_adapters/`: One folder per target site — see its own CONTEXT.md.
- `chrome_extension/`: The Manifest Version 3 extension that matches, injects, and enforces — see its own CONTEXT.md.
- `native_messaging_host/`: The native messaging host that holds the HTTP port the extension cannot, and serves Model Context Protocol to any agent — see its own CONTEXT.md.
- `devtools_protocol_bridge/`: A stdio Model Context Protocol bridge that reaches a page over the Chrome DevTools Protocol. Used for testing only; the native host is the real path — see its own CONTEXT.md.

## Rules
- Nothing under `src/` reaches the network at runtime except `native_messaging_host/` and `devtools_protocol_bridge/`, which listen on or talk to the loopback interface only. Adapters read and drive their own page and nothing else.
- `adapter_format/` never imports from `chrome_extension/` or `site_adapters/`, except `validate_all_adapters.ts`, which is a build-time check and is never bundled into a content script.
- Anything an adapter needs at runtime must be cheap. Validation belongs in the build, because bundling the schema library into a main-world content script cost about 150 kilobytes on every page for no protection at all.

## Background
- The whole layout implements [issue #1](https://github.com/jeromeetienne/webmcp_everywhere/issues/1); the slice being built is [issue #2](https://github.com/jeromeetienne/webmcp_everywhere/issues/2).

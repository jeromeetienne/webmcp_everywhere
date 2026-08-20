# Directory Context: `/src`

## Purpose
Everything that ships: the adapter format, the adapters written against it, the browser extension that loads them, and the bridge that lets an ordinary agent call them.

## Key Exports & Entry Points
- `adapter_format/`: The type, the schema, the namespacing, and the review checks that define what an adapter is — see its own CONTEXT.md.
- `adapters/`: One folder per target site — see its own CONTEXT.md.
- `extension/`: The Manifest Version 3 extension that matches, injects, and enforces — see its own CONTEXT.md.
- `bridge/`: The Model Context Protocol server that re-exposes a page's WebMCP tools to agents that do not speak WebMCP — see its own CONTEXT.md.

## Rules
- Nothing under `src/` reaches the network at runtime except `bridge/`, which talks only to a local Chrome. Adapters read and drive their own page and nothing else.
- `adapter_format/` never imports from `extension/` or `adapters/`, except `validate_all_adapters.ts`, which is a build-time check and is never bundled into a content script.
- Anything an adapter needs at runtime must be cheap. Validation belongs in the build, because bundling the schema library into a main-world content script cost about 150 kilobytes on every page for no protection at all.

## Background
- The whole layout implements [issue #1](https://github.com/jeromeetienne/webmcp_everywhere/issues/1); the slice being built is [issue #2](https://github.com/jeromeetienne/webmcp_everywhere/issues/2).

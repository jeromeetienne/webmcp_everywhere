# Directory Context: `/src`

## Purpose
Everything that ships and has no `package.json` of its own: the adapters, the browser extension that loads them, and the native messaging host that serves them to an agent. What an adapter is written against is in `packages/`. Build tooling lives in `tools/`, verification lives in `tests/`, and the product code that has a `package.json` of its own lives in `packages/`.

## Key Exports & Entry Points
- `site_adapters/`: One folder per target site — see its own CONTEXT.md.
- `chrome_extension/`: The Manifest Version 3 extension that matches, injects, and enforces — see its own CONTEXT.md.
- `native_messaging_host/`: The native messaging host that holds the HTTP port the extension cannot, and serves Model Context Protocol to any agent — see its own CONTEXT.md.

## Rules
- Nothing here imports from `tools/` or from `tests/`. `node --test tests/repository_layout/source_boundary.test.ts` refuses any relative import that leaves `src/`, which is what keeps build tooling and verification code from drifting back in. A workspace package is reached by its `@webmcp_everywhere/` name instead, never by a relative path into `packages/`.
- Nothing under `src/` reaches the network at runtime except `native_messaging_host/`, which listens on the loopback interface only. Adapters read and drive their own page and nothing else.
- The two things every adapter is written against are packages rather than folders here: `@webmcp_everywhere/adapter_format` for the shape and the framing, `@webmcp_everywhere/adapter_toolkit` for waiting and driving. Neither imports anything from `src/`, so an adapter can be checked without a browser and an author outside this repository can install both.
- Anything an adapter needs at runtime must be cheap. Validation belongs in `tools/adapter_validation/`, because bundling the schema library into a main-world content script cost about 150 kilobytes on every page for no protection at all.

## Background
- The whole layout implements [issue #1](https://github.com/jeromeetienne/webmcp_everywhere/issues/1); the slice being built is [issue #2](https://github.com/jeromeetienne/webmcp_everywhere/issues/2).

# Directory Context: `/src`

## Purpose
Everything that ships, and nothing else: the adapter format, the adapters written against it, the browser extension that loads them, and the native messaging host that serves them to an agent. Build tooling lives in `tools/`, verification lives in `tests/`.

## Key Exports & Entry Points
- `adapter_format/`: The type, the namespacing, and the framing of untrusted page content — see its own CONTEXT.md.
- `site_adapters/`: One folder per target site — see its own CONTEXT.md.
- `chrome_extension/`: The Manifest Version 3 extension that matches, injects, and enforces — see its own CONTEXT.md.
- `native_messaging_host/`: The native messaging host that holds the HTTP port the extension cannot, and serves Model Context Protocol to any agent — see its own CONTEXT.md.

## Rules
- Nothing here imports from `tools/` or from `tests/`. `npm run verify:boundary` refuses any relative import that leaves `src/`, which is what keeps build tooling and verification code from drifting back in.
- Nothing under `src/` reaches the network at runtime except `native_messaging_host/`, which listens on the loopback interface only. Adapters read and drive their own page and nothing else.
- `adapter_format/` never imports from `chrome_extension/` or from `site_adapters/`, so an adapter can be checked without a browser.
- Anything an adapter needs at runtime must be cheap. Validation belongs in `tools/adapter_validation/`, because bundling the schema library into a main-world content script cost about 150 kilobytes on every page for no protection at all.

## Background
- The whole layout implements [issue #1](https://github.com/jeromeetienne/webmcp_everywhere/issues/1); the slice being built is [issue #2](https://github.com/jeromeetienne/webmcp_everywhere/issues/2).

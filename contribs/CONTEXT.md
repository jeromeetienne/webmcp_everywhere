# Directory Context: `/contribs`

## Purpose
What the community writes: the adapters, and the browser extension that loads them. Neither has a `package.json` of its own. What an adapter is written against, the native messaging host that serves an agent, and the package npmjs carries all have one and live in `packages/`. Build tooling lives in `tools/`, and verification lives in `tests/`.

## Key Exports & Entry Points
- `site_adapters/`: One folder per target site — see its own CONTEXT.md.
- `chrome_extension/`: The Manifest Version 3 extension that matches, injects, and enforces — see its own CONTEXT.md.

## Rules
- Nothing here imports from `tools/` or from `tests/`. `node --test tests/repository_layout/source_boundary.test.ts` refuses any relative import that leaves `contribs/`, which is what keeps build tooling and verification code from drifting back in. A workspace package is reached by its `@webmcp_everywhere/` name instead, never by a relative path into `packages/`.
- Nothing under `contribs/` reaches the network at runtime. Adapters read and drive their own page and nothing else, and the one program that listens on a socket is `packages/native_messaging_host/`, on the loopback interface only.
- The two things every adapter is written against are packages rather than folders here: `@webmcp_everywhere/adapter_format` for the shape and the framing, `@webmcp_everywhere/adapter_toolkit` for waiting and driving. Neither imports anything from `contribs/`, so an adapter can be checked without a browser and an author outside this repository can install both.
- Anything an adapter needs at runtime must be cheap. Validation belongs in `tools/adapter_validation/`, because bundling the schema library into a main-world content script cost about 150 kilobytes on every page for no protection at all.

## Background
- The whole layout implements [issue #1](https://github.com/jeromeetienne/webmcp_everywhere/issues/1); the slice being built is [issue #2](https://github.com/jeromeetienne/webmcp_everywhere/issues/2).
- This folder was called `src/` until [issue #19](https://github.com/jeromeetienne/webmcp_everywhere/issues/19) moved the native messaging host into `packages/`. What was left is what the community writes, and `contribs/` says that where `src/` did not.

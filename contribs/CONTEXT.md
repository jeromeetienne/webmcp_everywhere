# Directory Context: `/contribs`

## Purpose
What the community writes: the adapters, and the browser extension that loads them. Neither has a `package.json` of its own. What an adapter is written against, the native messaging host that serves an agent, and the package npmjs carries all have one and live in `packages/`. The tooling and the runners for each of the two folders here sit inside it, in a `tools/` and a `tests/` folder; what is left at the top of the repository, in `tools/` and `tests/`, is what belongs to no one subject.

## Key Exports & Entry Points
- `site_adapters/`: One folder per target site, each holding its own runner, plus the `tools/` that act on all of them — see its own CONTEXT.md.
- `chrome_extension/`: The Manifest Version 3 extension that matches, injects, and enforces, plus the `tools/` that build and launch it and the `tests/` that check it — see its own CONTEXT.md.

## Rules
- **No product file here imports from a `tools/` or a `tests/` folder, including the ones now sitting inside these folders.** `node --test tests/repository_layout/source_boundary.test.ts` refuses that, and refuses any relative import that leaves `contribs/`, which together are what keep build tooling and verification code from drifting back into the product. A workspace package is reached by its `@webmcp_everywhere/` name instead, never by a relative path into `packages/`.
- Nothing under `contribs/` reaches the network at runtime. Adapters read and drive their own page and nothing else, and the one program that listens on a socket is `packages/native_messaging_host/`, on the loopback interface only.
- Everything every adapter is written against is one package rather than a folder here: `@webmcp_everywhere/site_adapter`, holding both the shape and the framing an adapter conforms to and the waiting and driving helpers it shares. It imports nothing from `contribs/`, so an adapter can be checked without a browser and an author outside this repository can install it.
- Anything an adapter needs at runtime must be cheap. Validation belongs in `packages/site_adapter/tools/`, because bundling the schema library into a main-world content script cost about 150 kilobytes on every page for no protection at all.

## Background
- The whole layout implements [issue #1](https://github.com/jeromeetienne/webmcp_everywhere/issues/1); the slice being built is [issue #2](https://github.com/jeromeetienne/webmcp_everywhere/issues/2).
- This folder was called `src/` until [issue #19](https://github.com/jeromeetienne/webmcp_everywhere/issues/19) moved the native messaging host into `packages/`. What was left is what the community writes, and `contribs/` says that where `src/` did not.

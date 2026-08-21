# Directory Context: `/src/chrome_extension`

## Purpose
The Manifest Version 3 extension: it matches a page against the bundled adapters, injects into the main world, enforces the permission classes, and shows the user what an agent can currently do.

## Key Exports & Entry Points
- `manifest.json`: The extension itself. Load this folder, not `dist/`.
- `page_injection/`: The two content scripts and the request and reply shapes that cross between them — see its own CONTEXT.md.
- `native_host_link/`: The background script and everything that answers the native messaging host — see its own CONTEXT.md.
- `user_interface/`: The popup a person opens from the toolbar — see its own CONTEXT.md.
- `shared_state/`: The state that more than one execution context reads — see its own CONTEXT.md.
- `dist/`: The build output. Every entry point bundles to a flat file here, whichever subfolder its source sits in, because `manifest.json` names flat paths.
- Command to build this folder: `npm run build`

## Rules
- `shared_state/` imports from none of the other three subfolders. It is a leaf, because every other subfolder runs in a different execution context and two of them read the same state.
- `page_injection/` and `native_host_link/` never import each other, apart from the request and reply types in `page_query.ts`. They talk through `chrome.runtime` messages, not through shared code.
- `user_interface/` imports only from `shared_state/`.
- Every entry point in `tools/build_extension.ts` keeps its folder in the source path and only its base name in the output name. Letting esbuild derive the output path recreates the subfolders inside `dist/` and breaks every path in `manifest.json`.

## Background
- Main-world injection is required and was proven to work in [issue #2](https://github.com/jeromeetienne/webmcp_everywhere/issues/2); the isolated world cannot see `document.modelContext` at all.
- Issue #1 expects a content security policy to stop adapters reaching the network. It cannot: a main-world script runs under the page's own policy, not the extension's. The build-time check in `tools/adapter_validation/permission_audit.ts` is what enforces the rule instead.

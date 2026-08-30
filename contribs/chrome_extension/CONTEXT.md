# Directory Context: `/contribs/chrome_extension`

## Purpose
The Manifest Version 3 extension: it decides which adapter's scripts are registered for which sites, matches a page against an adapter, injects into the main world, enforces the permission classes, and shows the user what an agent can currently do.

## Key Exports & Entry Points
- `manifest.json`: The extension itself. Load this folder, not `dist/`.
- `page_injection/`: The page injection scripts and the request and reply shapes that cross between them — see its own CONTEXT.md.
- `native_host_link/`: The background script and everything that answers the native messaging host — see its own CONTEXT.md.
- `user_interface/`: The popup a person opens from the toolbar — see its own CONTEXT.md.
- `shared_state/`: The state that more than one execution context reads — see its own CONTEXT.md.
- `tools/`: Everything that builds this extension, launches a Chrome with it, and puts it into a given state — see its own CONTEXT.md.
- `tests/`: The runners covering what this extension enforces against code and content this repository did not write — see its own CONTEXT.md.
- `dist/`: The build output. Every entry point bundles to a flat file here, whichever subfolder its source sits in, because `manifest.json` names flat paths.
- Command to build this folder: `npm run build`

## Rules
- `shared_state/` imports from none of the other three subfolders. It is a leaf, because every other subfolder runs in a different execution context and two of them read the same state.
- `page_injection/` and `native_host_link/` never import each other, apart from the request and reply types in `page_query.ts`. They talk through `chrome.runtime` messages, not through shared code.
- `user_interface/` imports only from `shared_state/`.
- None of the four source subfolders imports from `tools/` or from `tests/`; both of those import freely from the four. `tests/repository_layout/source_boundary.test.ts` refuses the other direction.
- `manifest.json` names no site, in no field. Which adapter runs where is decided at run time by `shared_state/injection_registrar.ts`, from the adapter's own `matchPatterns` and the user's per-adapter switch. A site added back to the manifest asks every user for it at install time and makes the extension store review the extension again for each new adapter, which is the failure [issue #9](https://github.com/jeromeetienne/webmcp_everywhere/issues/9) removed.
- Every entry point in `contribs/chrome_extension/tools/build_extension.ts` keeps its folder in the source path and only its base name in the output name. Letting esbuild derive the output path recreates the subfolders inside `dist/` and breaks every path in `manifest.json`.

## Background
- Main-world injection is required and was proven to work in [issue #2](https://github.com/jeromeetienne/webmcp_everywhere/issues/2); the isolated world cannot see `document.modelContext` at all.
- Issue #1 expects a content security policy to stop adapters reaching the network. It cannot: a main-world script runs under the page's own policy, not the extension's. The check in `packages/site_adapter/tools/permission_audit.ts`, which runs before an adapter is bundled or installed, is what enforces the rule instead.
- `host_permissions` is `*://*/*` rather than the `optional_host_permissions` milestone 3 of [issue #9](https://github.com/jeromeetienne/webmcp_everywhere/issues/9) asked for. `chrome.permissions.request` needs a user gesture and a dialogue, neither of which exists in the headless Chrome every verification runner uses, so an optional host permission could be neither granted nor checked here. [permissions_and_trust.md](../../docs/permissions_and_trust.md) says so in the open.

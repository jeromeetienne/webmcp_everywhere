# The WebMCP Everywhere Chrome extension

This is the Manifest Version 3 extension. It decides which adapter's scripts are registered for which sites, matches a page against an adapter, injects the adapter into the page's main world, enforces the permission classes, and shows you in its popup what an agent can currently do.

The extension is the only place that decides what a page is allowed to do. An adapter cannot grant itself anything, and an agent reaches a page only through here.

## What is in here

- `manifest.json` — the extension itself. When you load an unpacked extension, load this folder and not `dist/`.
- `page_injection/` — the scripts injected into the page, and the request and reply shapes that cross between them.
- `native_host_link/` — the background service worker and everything that answers the native messaging host.
- `user_interface/` — the popup you open from the toolbar, where you turn each adapter on and grant acting permission.
- `shared_state/` — the state that more than one execution context reads, including the generated adapter list.
- `dist/` — the build output. Every entry point bundles to a flat file here.
- `tools/` — everything that builds this extension and puts a browser into the state a check needs.
- `tests/` — the runners covering what this extension enforces against code and content this repository did not write.

`manifest.json` names no site, in any field. Which adapter runs where is decided while the browser is running, from the adapter's own match patterns and your own per-adapter switch. That is why adding an adapter asks nothing of anybody who already has the extension.

## Building it

```bash
npm run build
```

```bash
npm run chrome
```

The first bundles the extension into `dist/`. The second launches a throwaway Chrome with the extension already loaded.

## Reading further

- The rules for editing this folder are in [CONTEXT.md](CONTEXT.md), and each subfolder has its own.
- The four parts of WebMCP Everywhere and how a tool call travels between them: [architecture_overview.md](../../docs/architecture_overview.md).
- Why acting tools are withheld until you opt in: [permissions_and_trust.md](../../docs/permissions_and_trust.md).
- What is defended, and what plainly is not: [security_model.md](../../docs/security_model.md).

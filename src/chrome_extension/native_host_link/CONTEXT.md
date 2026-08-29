# Directory Context: `/src/chrome_extension/native_host_link`

## Purpose
The background script and everything that answers the native messaging host: it aggregates the tools every adapted tab offers, routes a call to the right tab, refuses an acting tool once a page has tried to issue instructions, and decides which adapter's scripts are registered for which sites.

## Key Exports & Entry Points
- `background_service_worker.ts`: The background script named in `manifest.json`. Named `BackgroundServiceWorker` rather than `ServiceWorker`, which is already a Document Object Model interface.
- `native_bridge.ts`: `NativeBridge` — answers the native host, aggregating tools across every adapted tab.

## Rules
- The bridge answers three synthetic tools itself — `webmcp_everywhere__list_pages`, `webmcp_everywhere__open_page`, and `webmcp_everywhere__close_page` — and they are declared in `WebmcpNativeHost.BUILT_IN_TOOLS` on the host side, so a name added in one place must be added in the other.
- `openPage` and `closePage` act on a page some adapter in `AdapterRegistry` covers and on no other page, so an agent can never use the bridge as a general browser driver.
- Read the framing off a result with `NativeBridge._asFramed`. `executeTool` returns a JSON string, so reading `.webmcpEverywhere` straight off a result silently finds nothing and leaves the watch unarmed.
- A tool offered from two tabs gains a tab suffix in both, never in just one, so the ambiguity is visible rather than resolved to whichever tab came first.
- This folder imports only the request and reply types from `page_injection/page_query.ts`, never its runtime code. A content script and the background script run in different execution contexts, and bundling one into the other duplicates state.
- The background script re-runs `InjectionRegistrar.apply` on every `chrome.storage.onChanged` and on every set of adapters the native messaging host reports. The manifest names no site, so this is the only thing that decides where an adapter runs.
- The host is told nothing about what may run. It reports the adapters it read from a folder, and the decision stays here, where the user's switches are.

## Background
- The wire format and the host on the other end live in [`/src/native_messaging_host`](../../native_messaging_host/CONTEXT.md).

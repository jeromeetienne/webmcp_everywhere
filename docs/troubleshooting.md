# When something does not work

Almost every failure in this project is silent. Chrome does not report a flag it ignored, an extension whose content scripts never ran, or a native messaging host manifest it refused. This document lists what each silence actually means.

## Nothing at all happens on the page

**`document.modelContext` is undefined.** The profile is missing `enable-webmcp-testing@1` in its `Local State`, under `browser.enabled_labs_experiments`. `npm run chrome` writes it before launch. Chrome must also be version 149 or later — the WebMCP origin trial runs from Chrome 149 to Chrome 156.

**The extension is installed but the content scripts never ran.** The profile is missing `extensions.ui.developer_mode` in its `Preferences`. This failure has no error message anywhere: the extension appears on `chrome://extensions`, and nothing runs.

**Zero extensions are installed and the log says nothing.** Chrome was launched with `--load-extension`. Chrome 151 ignores it silently. Install with the Chrome DevTools Protocol method `Extensions.loadUnpacked` instead, which is what `npm run chrome` does.

**The extension runs, but not on this site.** The adapter's match pattern is missing from [`src/chrome_extension/manifest.json`](https://github.com/jeromeetienne/webmcp_everywhere/blob/main/src/chrome_extension/manifest.json). It has to be in `host_permissions` and in **both** `content_scripts` entries, the `MAIN` one and the `ISOLATED` one. A registered adapter whose pattern is missing there never runs.

**The adapter is not registered.** Adapters are added to [`src/chrome_extension/shared_state/adapter_registry.ts`](https://github.com/jeromeetienne/webmcp_everywhere/blob/main/src/chrome_extension/shared_state/adapter_registry.ts) by hand. There is no automatic discovery.

## Every check passes but you are testing old code

**The throwaway profile was kept.** Chrome does not re-read an unpacked extension it has already installed. `LaunchChrome` deletes the profile before every launch for exactly this reason; keeping it silently runs the previous build.

**The extension was not rebuilt.** Chrome loads `build/chrome_extension/`, not [`src/`](https://github.com/jeromeetienne/webmcp_everywhere/tree/main/src). Run `npm run build`.

## An agent cannot reach the endpoint

**401 with "a bearer token is required".** Read the token out of `~/.webmcp_everywhere/endpoint.json` and send it as `Authorization: Bearer`.

**405 with "this host is stateless, so it serves POST only".** The host serves `POST /mcp` and nothing else. `GET /health` is the one unauthenticated path, and it reports only whether the extension is connected.

**Nothing is listening at all.** Chrome starts the native messaging host, and only when the extension connects to it. If the extension is not installed or its background service worker is not running, no host is started and `~/.webmcp_everywhere/endpoint.json` may be stale from an earlier run. Check `~/.webmcp_everywhere/host.log`.

**The manifest names the wrong path.** The native messaging host manifest carries the launcher's absolute path. Moving the repository breaks it. Run `npm run install:host` again.

**Chrome refuses the host manifest.** The field names in the manifest are Chrome's, not this project's: `name`, `description`, `path`, `type`, and `allowed_origins`. Chrome refuses a manifest with any other spelling and reports nothing useful when it does. The same applies to an unreplaced `{{placeholder}}`, which is why the installation treats one as an error.

**The identifier does not match.** The host manifest's `allowed_origins` names one extension identifier. The identifier is pinned by the `key` field in [`manifest.json`](https://github.com/jeromeetienne/webmcp_everywhere/blob/main/src/chrome_extension/manifest.json), because an unpacked extension without a key gets an identifier derived from wherever its folder happens to sit.

## The connection dies for no reason

**Something wrote to standard output.** Standard output belongs entirely to the native messaging channel. One stray line corrupts the stream and Chrome closes the connection with no useful error. Everything the host says has to go through `WebmcpNativeHost._log`, which writes to standard error and to `~/.webmcp_everywhere/host.log`.

**No Node.js new enough was found.** [`bin/webmcp_native_host.sh`](https://github.com/jeromeetienne/webmcp_everywhere/blob/main/bin/webmcp_native_host.sh) needs Node.js 22.18.0 or later, because it runs TypeScript with no build step; an older Node.js refuses the host program with `ERR_UNKNOWN_FILE_EXTENSION`. The script searches the shell's own `node`, then `/opt/homebrew/bin/node`, `/usr/local/bin/node`, and `/usr/bin/node`. Chrome gives the host a very small environment, which is why the fixed paths are there at all.

**Every request after the first answers 500.** A single shared stateless Model Context Protocol transport serves exactly one request and then rejects everything after it, which looks to a client like the host crashed. A fresh server and transport are built for every request.

## A tool fails or is missing

**"the extension did not answer in time".** The host waits twenty seconds. Either the background service worker is not running, or a page is not answering.

**"no tool named X is available on any open page".** The tool list is rebuilt on every call, so this means no open tab is currently offering that name. Call `webmcp_everywhere__list_pages` to see what is actually there. A name that carried a tab suffix belongs to a tab that may have closed.

**A tool name gained a `__tab<number>` suffix.** Two tabs are offering the same tool. Both names are suffixed, never just one, so the ambiguity is visible rather than resolved to whichever tab came first. See [tool_naming_and_tab_identity.md](tool_naming_and_tab_identity.md).

**An acting tool is refused with a message about instructions.** A page returned content shaped like an attempt to give the agent orders, and `InjectionWatch` has refused every acting tool until a person clears it in the popup. Reading still works. See [security_model.md](security_model.md).

**An acting tool is refused with "needs the user to opt in".** Nobody has opted in for that origin. Do it from the popup, or with `npm run grant`.

**Every tool is missing and the report says the adapter yielded.** The site registered WebMCP tools of its own, and the adapter's `yieldCondition` returned `true`. That is the adapter working correctly.

**The error text is `UnknownError` and says nothing.** Chrome 151 replaces a thrown handler error with a fixed `UnknownError` text, so a message thrown from inside a tool reaches no agent. This is why an adapter returns a refusal object rather than throwing.

**A tool call aborted part way through.** The runtime re-registered while the call was in flight. Registration re-runs only when the matching adapter actually changes, and it waits until `getTools` stops listing the old names before registering again.

## The build refuses

**`REJECTED ... adapters may never reach the network`.** A handler names `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `navigator.sendBeacon`, or a dynamic import.

**`REJECTED ... declares readOnly but ... so it is acting`.** `PermissionAudit` read the handler's source and found it clicking, submitting, dispatching an event, removing an element, assigning to `value`, `checked`, `innerHTML`, or `textContent`, navigating, changing session history, or writing to storage. Either fix the declaration or stop mutating.

A read-only handler that only *reads* `location` fails this too. The audit cannot tell reading it from assigning to it. Read the address through a helper outside the handler.

**`REJECTED ... adapter targets format version ...`.** The adapter's `metadata.adapterFormatVersion` does not equal the `ADAPTER_FORMAT_VERSION` this runtime speaks.

**`REJECTED ... is registered by both ... and ...`.** Two adapters produce the same qualified tool name.

## Types and imports

**`npm run verify:boundary` fails.** Something in [`src/`](https://github.com/jeromeetienne/webmcp_everywhere/tree/main/src) has a relative import that leaves [`src/`](https://github.com/jeromeetienne/webmcp_everywhere/tree/main/src). Imports run one way only: [`tests/`](https://github.com/jeromeetienne/webmcp_everywhere/tree/main/tests) → [`tools/`](https://github.com/jeromeetienne/webmcp_everywhere/tree/main/tools) → [`src/`](https://github.com/jeromeetienne/webmcp_everywhere/tree/main/src).

**`npm run typecheck` fails on an `enum`, a `namespace`, a parameter property, or a decorator.** Node.js runs the files in [`tools/`](https://github.com/jeromeetienne/webmcp_everywhere/tree/main/tools), [`tests/`](https://github.com/jeromeetienne/webmcp_everywhere/tree/main/tests), and [`src/native_messaging_host/`](https://github.com/jeromeetienne/webmcp_everywhere/tree/main/src/native_messaging_host) directly and only strips types, so those files stay within erasable syntax.

## Telling an adapter fault from a delivery fault

When `npm run verify:host` fails and you cannot tell where the fault is, narrow it.

1. Run the adapter's own runner — `npm run verify` or `npm run verify:caniuse`. It reaches the page directly, with neither the extension nor the native messaging host in the way. If it passes, the adapter is fine.
2. Run `npm run verify:bridge`. The stdio bridge reaches the page over the Chrome DevTools Protocol, still bypassing the extension and the host. If it passes, WebMCP registration on the page is fine.
3. What is left is the extension or the native messaging host. Read `~/.webmcp_everywhere/host.log`, and read the extension's errors on `chrome://extensions`.

## Useful places to look

- `~/.webmcp_everywhere/host.log` — everything the native messaging host has to say.
- `~/.webmcp_everywhere/endpoint.json` — the address and the token.
- `chrome://extensions` — where the unpacked extension shows up, where you reload it, and where you read its errors.
- The popup — which adapter matched, which tools are live, which are held and why, and any injection sighting.

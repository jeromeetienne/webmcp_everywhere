# Directory Context: `/src/native_messaging_host`

## Purpose
The native messaging host: Chrome starts it on demand, it holds the HTTP port the extension cannot, and it serves the extension's tools to any agent that speaks Model Context Protocol.

## Key Exports & Entry Points
- `webmcp_native_host.ts`: `WebmcpNativeHost` — the program named in the installed host manifest.
- `native_messaging_codec.ts`: `NativeMessagingCodec` — Chrome's four-byte length-prefixed framing.
- Command to check this folder: `npm run verify:host`

## Rules
- The launcher that `tools/install_native_host.ts` writes points straight at `webmcp_native_host.ts`, because Node.js runs TypeScript with no build step. Renaming or moving this file means running `npm run install:host` again, or Chrome starts a path that no longer exists.
- Never write to standard output except native messages. Standard output is the channel to Chrome, and one stray line corrupts it and closes the connection with no useful error. Use `WebmcpNativeHost._log`, which writes to standard error and to `~/.webmcp_everywhere/host.log`.
- Build a fresh Model Context Protocol server and transport for every HTTP request. A single shared stateless transport serves one request and then answers 500 to everything after it, which looks to a client like the host crashed.
- Every request carries a bearer token. A loopback port is reachable by every process on the machine, so an unauthenticated one would hand any local program control of the browser.
- The host decides nothing about permissions. It forwards to the extension, which is the only place that knows which tabs have adapters and what the user allowed.

## Background
- A Chrome extension cannot listen on a port. Measured on Chrome 151: `chrome.sockets` and `chrome.sockets.tcpServer` are undefined and no server interface exists at all, only outbound `fetch` and `WebSocket`. That is why this program exists — see [issue #2](https://github.com/jeromeetienne/webmcp_everywhere/issues/2).
- The extension identifier is pinned by a key in the manifest because the host manifest has to name it, and an unpacked extension without a key gets an identifier derived from its path.

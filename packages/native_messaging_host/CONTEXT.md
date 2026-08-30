# Directory Context: `/packages/native_messaging_host`

## Purpose
The native messaging host: Chrome starts it on demand, it holds the HTTP port the extension cannot, it serves the extension's tools to any agent that speaks Model Context Protocol, and it reads the folder of adapters installed from outside this repository.

## Key Exports & Entry Points
- `src/index.ts`: what the name `@webmcp_everywhere/native_messaging_host` offers to an importer.
- `src/webmcp_native_host.ts`: `WebmcpNativeHost` — the program named in the installed host manifest.
- `src/native_messaging_codec.ts`: `NativeMessagingCodec` — Chrome's four-byte length-prefixed framing.
- `src/host_state_files.ts`: `HostStateFiles` — the bearer token and `endpoint.json` in the state directory.
- `src/loaded_adapter_store.ts`: `LoadedAdapterStore` — the folder of adapters `npm run load-adapter` writes, read once per connection.
- `src/webmcp_native_host_types.ts`: the messages the extension and the host exchange.
- Commands to check this folder: `node --test tests/native_messaging_host/native_host.test.ts` and `node --test tests/native_messaging_host/endpoint_file.test.ts`.

## Rules
- This package is a program and an entry point at once, and the two are reached differently. `bin/native_messaging_host.sh` and `tools/package_release.ts` name `src/webmcp_native_host.ts` by path, because a program Chrome starts is a path, and the launcher works that path out from its own location rather than holding one. Everything imported goes through `src/index.ts` under the single `"."` key. Moving `src/webmcp_native_host.ts` means editing the launcher; moving the repository means running `npm run install:host` again.
- Never write to standard output except native messages: it is the channel to Chrome, and one stray line corrupts it and closes the connection with no useful error. Use `WebmcpNativeHost._log`, which writes to standard error and to `~/.webmcp_everywhere/host.log`.
- Build a fresh Model Context Protocol server and transport for every HTTP request. A single shared stateless transport serves one request, then answers 500 to everything after it, which looks like the host crashed.
- Every request carries a bearer token, which lives in `~/.webmcp_everywhere/token` and is never republished in `endpoint.json`: a never-changing token beside an address that could go stale made the whole file read as authoritative. A loopback port is reachable by every process on the machine, so an unauthenticated one would hand any local program control of the browser.
- The host decides nothing about permissions: it forwards to the extension, the only place that knows which tabs have adapters and what the user allowed. It reads the loaded adapters and reports them, and decides nothing about whether any of them runs either.
- The host reads the loaded adapters because a folder on disk is something a Node.js program can read and an extension cannot. It never checks them: `npm run load-adapter` did that before writing the file, in the one moment where refusing means the code never arrives.
- The port never walks, and only its holder writes `endpoint.json`: a host serves `WEBMCP_EVERYWHERE_HOST_PORT`, default 8765, and no other, writes the file when it takes the port, and removes it when it stops. So a recorded address stays right, and the file is there exactly while a live one is.
- Stop the host on both signals, not one. The parent process identifier changing is the only one that catches a killed Chrome whose pipe stayed open elsewhere.
- A host that cannot have the port stands by rather than exiting, and only a starting host asks for it over `POST /stand_down`. Either rule broken alone makes two browsers trade the port without end.

## Background
- A Chrome extension cannot listen on a port: measured on Chrome 151, no server interface exists, only outbound `fetch` and `WebSocket`. That is why this program exists — see [issue #2](https://github.com/jeromeetienne/webmcp_everywhere/issues/2).
- It became a package in [issue #19](https://github.com/jeromeetienne/webmcp_everywhere/issues/19), on the rule that a folder is a package when it has a `package.json` of its own.
- The entry point is TypeScript, so Node.js reads it only while npm links it, which `packages/CONTEXT.md` writes out. Nothing changes here: the launcher resolves a real path in the working copy, and a release ships the esbuild bundle.
- The extension identifier is pinned by a key in the manifest because the host manifest has to name it, and an unpacked extension without a key gets an identifier derived from its path.
- `bin/native_messaging_host.sh` stays tracked in git. [Issue #4](https://github.com/jeromeetienne/webmcp_everywhere/issues/4) asked for it to leave, because the file then held absolute paths true only on the machine that generated it, so a checkout or a branch switch rewrote what Chrome would start. It works every path out from its own location now, which makes it source rather than a generated file.

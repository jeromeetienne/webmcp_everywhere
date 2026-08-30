# `@webmcp_everywhere/native_messaging_host`

The native messaging host of [WebMCP Everywhere](https://github.com/jeromeetienne/webmcp_everywhere): the Node.js program Chrome starts as a child process when the extension asks for it.

A Chrome extension cannot listen on a port — measured on Chrome 151, Manifest Version 3 exposes no server interface at all, only outbound `fetch` and `WebSocket` — so this program holds the socket instead. It serves the extension's tools over Model Context Protocol on `http://127.0.0.1:8765/mcp`, it forwards every tool call to the extension rather than deciding anything about permissions itself, and it reads the folder of adapters `npm run load-adapter` writes. Why it exists at all: [why_a_native_messaging_host.md](https://github.com/jeromeetienne/webmcp_everywhere/blob/main/docs/why_a_native_messaging_host.md).

This package is two things at once:

- **A program, reached by its path.** `bin/webmcp_native_host.sh` names `src/webmcp_native_host.ts` and Chrome starts that launcher, and `npm run package:release` bundles the same file into the `webmcp_native_host.mjs` a release carries.
- **An entry point, imported by name.** `src/index.ts` offers `HostStateFiles` for the bearer token and `endpoint.json`, `LoadedAdapterStore` for the folder of loaded adapters, and the shapes an agent's address and health answer take.

**This package is not on npmjs and nothing installs it.** It is `"private": true`, and what reaches a user is the bundle inside [`webmcp_everywhere`](https://www.npmjs.com/package/webmcp_everywhere), which `npx webmcp_everywhere` installs. To run the host from a working copy instead, follow [build_and_install.md](https://github.com/jeromeetienne/webmcp_everywhere/blob/main/docs/build_and_install.md).

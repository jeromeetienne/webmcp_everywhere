# Why there is a native messaging host

An agent reaches WebMCP Everywhere over HTTP, at an address written into `~/.webmcp_everywhere/endpoint.json`. The program holding that port is a Node.js program that Chrome starts, not the extension. This document says why.

## Chrome's three words

Three of the words used here are Chrome's, not this project's. They are defined in [Chrome's native messaging documentation](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging).

- **Native messaging** — the way a Chrome extension exchanges messages with a program on your machine. Chrome starts the program as a child process and passes messages to it on standard input, reading the answers from standard output. Each message is JSON with a four-byte length in front of it. The extension asks for this with the `nativeMessaging` permission and opens the connection with `chrome.runtime.connectNative`.
- **Native messaging host** — the program at the other end. It is an ordinary application on your machine, in this repository a Node.js program. Chrome starts it; you do not.
- **Native messaging host manifest file** — the JSON file that tells Chrome which program to start and which extensions may connect to it. Chrome reads it from a directory named `NativeMessagingHosts`, and the file is named after the host name it declares.

The word "host" is a poor fit and the confusion it causes is Chrome's, not yours. In networking a host is a machine, and a program that accepts connections is a server; this is neither. It is an application that Chrome launches and talks to. The name cannot be avoided, because Chrome fixes it in the directory name, in the permission, and in the manifest, so this repository writes Chrome's full term everywhere and never shortens it to "native host".

## The measurement

A Chrome extension cannot listen on a port. This was measured on Chrome 151, not assumed.

- `chrome.sockets` is undefined.
- `chrome.sockets.tcpServer` is undefined.
- Manifest Version 3 exposes no server interface at all. The only network operations available to an extension are outbound: `fetch` and `WebSocket`.

An agent speaking Model Context Protocol over HTTP has to connect to something. Nothing inside the extension can accept that connection. So something native has to hold the socket.

## Why Chrome starting it is the point

The alternative to native messaging is a program you launch yourself and keep running. That would mean one more thing to install, one more thing to start before the browser is useful, and one more thing to notice has died.

Native messaging removes all three. The extension calls `chrome.runtime.connectNative`, and Chrome starts the program. There is nothing to launch by hand and nothing left running afterwards.

Nothing left running afterwards takes two checks, not one. The channel closing is the first: `WebmcpNativeHost` exits the process when standard input reaches its end. That alone is not enough, because standard input does not always reach its end. Killing a Chrome leaves the write end of the pipe open in whichever of its processes also holds it, and a host has been seen holding the port for hours after its browser was gone, while `endpoint.json` named a later host that had already stopped. So the host also watches the process that started it, which is the browser: the operating system reparents an orphan, so the parent process identifier changes the moment the browser exits, whatever the browser was killed with. Either check stops the host, and stopping takes `endpoint.json` with it.

The cost is that Chrome, not you, decides how the program starts. Chrome gives it a very small environment, so [`bin/webmcp_native_host.sh`](https://github.com/jeromeetienne/webmcp_everywhere/blob/main/bin/webmcp_native_host.sh) names no absolute path of its own: it works the repository root out from its own location and searches a short list of places for a Node.js new enough to run TypeScript directly.

## The other cost, and the way back

The larger cost is that registering the program means writing a file into a browser you installed, and from then on Google Chrome starts a program out of this working copy with your full rights. That is the native messaging design rather than a defect in it, but being opted into it silently would be a defect, so `npm run install:host` prints every path it is about to write and the program those files name before writing any of them, `npm run uninstall:host` removes every one of those files, and no other command in this repository writes into the everyday Chrome at all. See [build_and_install.md](build_and_install.md) and [issue #4](https://github.com/jeromeetienne/webmcp_everywhere/issues/4).

What has not been done is measure the alternative live. Turning the connection around — you start the program yourself, and the extension opens a `WebSocket` out to it — would leave Chrome untouched entirely. The reasons above for preferring native messaging are real, but they are an argument rather than a measurement, and three things would have to be established before the alternative could honestly be chosen: what it costs to have the program no longer start on demand, how the program authenticates the extension once `allowed_origins` is no longer doing it, and whether a `WebSocket` from an extension service worker survives that service worker being stopped and restarted.

## Why not the Chrome DevTools Protocol

There is a second path to the browser in this repository, and it is not the product. [`tests/devtools_protocol_bridge/webmcp_bridge.ts`](https://github.com/jeromeetienne/webmcp_everywhere/blob/main/tests/devtools_protocol_bridge/webmcp_bridge.ts) is a Model Context Protocol server on standard input and output that reaches a page over the Chrome DevTools Protocol. It was the first path that worked, written before the extension and the native messaging host existed.

It is kept because it is the smallest way to tell an adapter fault apart from a delivery fault when `node --test tests/native_host.test.ts` fails. It is not the product for three reasons.

1. **The debugging port is unauthenticated.** Chrome's remote debugging port is reachable by every process on the machine and asks for nothing. Anything running as you can drive the whole browser through it. That is acceptable for a throwaway profile in a verification run and wrong for a browser you actually use.
2. **It needs a purpose-launched Chrome.** Your everyday Chrome is not listening on a debugging port, and starting it with one would open the hole above.
3. **It bypasses the extension.** The extension is the only place that knows which tabs have adapters and what the user has allowed. A path that goes around it goes around every decision the user made.

The native messaging host closes the first of those. It requires a bearer token on every request, compared with a timing-safe comparison, and it writes that token to `~/.webmcp_everywhere/token` for you to read. A loopback port is reachable by every process on the machine, so an unauthenticated one would hand any local program control of the browser — exactly the hole the Chrome DevTools Protocol opens.

## What the native messaging host does not do

It decides nothing about permissions. It has no idea which tabs exist, which of them an adapter covers, or what the user has allowed on any origin. It receives a Model Context Protocol request, forwards it to the extension as a native message, waits for the answer, and returns it.

Three tools are the exception, and only in the sense that the host declares them. `webmcp_everywhere__list_pages`, `webmcp_everywhere__open_page`, and `webmcp_everywhere__close_page` are listed in `WebmcpNativeHost.BUILT_IN_TOOLS` so an agent reads them first, and they are answered by `NativeBridge` inside the extension. Because the same names are written in two places, a name added in one has to be added in the other.

Two of those three act on the browser rather than on a page, and both are deliberately narrow: `openPage` and `closePage` act only on a page some adapter in `AdapterRegistry` covers, and on no other page. An agent that could open any address at all would be a general browser driver, which is what this project exists not to be.

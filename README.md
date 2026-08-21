# WebMCP Everywhere

A browser extension that carries community-maintained WebMCP adapters — small scripts that register tools into sites that never shipped their own. Install it, point any agent at one local endpoint, and that agent gains real tools on the sites you already have open.

The idea and its reasoning are in [issue #1](https://github.com/jeromeetienne/webmcp_everywhere/issues/1). The first vertical slice is planned in [issue #2](https://github.com/jeromeetienne/webmcp_everywhere/issues/2).

## What works today

Two sites are covered.

- Ten tools on `https://demo.playwright.dev/todomvc/` — three read-only and seven acting. See [the adapter's own README.md](src/site_adapters/demo_playwright_dev/README.md).
- Seven tools on `https://caniuse.com/` — five read-only and two acting, turning the browser support tables into exact answers. See [the adapter's own README.md](src/site_adapters/caniuse_com/README.md).

On a fresh install only the read-only tools are offered; the acting ones stay withheld until you opt in for that origin. Tools from every open tab are aggregated behind one endpoint, and two tabs on the same site are told apart. Codex drives the sites through them, with no screenshots and no Document Object Model guesswork.

## How an agent reaches the browser

```
any agent ──HTTP MCP──> native messaging host ──native messaging──> extension ──> document.modelContext
                        (Chrome starts it on demand)
```

The native messaging host exists because **a Chrome extension cannot listen on a port**. Measured on Chrome 151: `chrome.sockets` and `chrome.sockets.tcpServer` are undefined, and Manifest Version 3 exposes no server interface at all — only outbound `fetch` and `WebSocket`. Something native has to hold the socket, and Chrome starts that program itself when the extension connects, so nothing needs launching by hand.

Every request travels through the extension, which is the only place that knows which tabs have adapters and what you have allowed. The host itself decides nothing about permissions.

## Glossary

Three of the words in this repository are Chrome's, not ours. They are defined in [Chrome's native messaging documentation](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging).

- **Native messaging** — the way a Chrome extension exchanges messages with a program on your machine. Chrome starts the program as a child process and passes messages to it on standard input, reading the answers from standard output. Each message is JSON with a four-byte length in front of it. The extension asks for this with the `nativeMessaging` permission and opens the connection with `chrome.runtime.connectNative`.
- **Native messaging host** — the program at the other end. It is an ordinary application on your machine, in this repository a Node.js program. Chrome starts it; you do not.
- **Native messaging host manifest file** — the JSON file that tells Chrome which program to start and which extensions may connect to it. Chrome reads it from a directory named `NativeMessagingHosts`, and the file is named after the host name it declares.

The word "host" is a poor fit and the confusion it causes is Chrome's, not yours. In networking a host is a machine, and a program that accepts connections is a server; this is neither. It is simply an application that Chrome launches and talks to. The name cannot be avoided, because Chrome fixes it in the directory name, in the permission, and in the manifest, so this repository uses Chrome's full term everywhere and never shortens it to "native host".

## Try it

You need Google Chrome 149 or later; the WebMCP origin trial runs from Chrome 149 to Chrome 156.

```bash
npm install
npm run build           # checks every adapter, then bundles the extension
npm run install:host    # registers the native messaging host with Chrome
npm run chrome          # launches a throwaway Chrome with the extension installed
npm run verify:host     # 10 checks over the real delivery path
```

The native messaging host writes where it is listening, and the token an agent must present, to `~/.webmcp_everywhere/endpoint.json`.

Point Codex at it:

```bash
export WEBMCP_EVERYWHERE_TOKEN=$(jq -r .token ~/.webmcp_everywhere/endpoint.json)
export WEBMCP_EVERYWHERE_URL=$(jq -r .url ~/.webmcp_everywhere/endpoint.json)
codex exec -c "mcp_servers.webmcp_everywhere={url=\"$WEBMCP_EVERYWHERE_URL\", bearer_token_env_var=\"WEBMCP_EVERYWHERE_TOKEN\"}" -c approvals_reviewer="auto_review" "Add a todo called buy milk, mark it done, and tell me how many are left."
```

Acting tools are withheld until you opt in, from the extension's popup or with `npm run grant`.

To call the tools by hand, without an agent in the way, open the Model Context Protocol Inspector. It starts already pointed at the host, with the url and the token read from `endpoint.json`:

```bash
npm run mcp:inspector:start
npm run mcp:inspector:stop
```

## The other two paths

Both exist for testing and neither is the product.

```bash
npm run verify          # 14 checks driving the TodoMVC page over the Chrome DevTools Protocol
npm run verify:caniuse  # 14 checks driving https://caniuse.com/ the same way
npm run verify:bridge   # 4 checks through the stdio Model Context Protocol bridge
```

The Chrome DevTools Protocol path needs a browser launched with a debugging port, which is unauthenticated and reachable by every process on the machine. That is fine for a throwaway profile and wrong for anything else, which is why the native messaging host exists.

## Launching Chrome

`npm run chrome` uses a throwaway profile and never touches your everyday Chrome. It handles four steps that are each silent when they go wrong:

1. `enable-webmcp-testing@1` goes into the profile's `Local State`, or `document.modelContext` is simply absent.
2. `extensions.ui.developer_mode` goes into `Preferences`, or the extension installs but its content scripts never run.
3. Chrome launches with `--enable-unsafe-extension-debugging`.
4. The extension is installed with `Extensions.loadUnpacked` over the Chrome DevTools Protocol.

**Do not reach for `--load-extension`.** Chrome 151 ignores it, leaving zero extensions installed and nothing in the log.

## Layout

`src/` holds the product and nothing else. Everything that builds it is in `tools/`, everything that checks it is in `tests/`, and everything the build writes is in `build/`.

- `src/adapter_format/` — what an adapter is, how its tools are named, and how page content is framed.
- `src/site_adapters/` — one folder per target site.
- `src/chrome_extension/` — the Manifest Version 3 extension.
- `src/native_messaging_host/` — the native messaging host and its HTTP endpoint.
- `tools/` — build, launch, and install, plus the adapter checks the build runs and the Chrome DevTools Protocol connection.
- `tests/` — the verification runners, and the stdio bridge one of them checks.
- `build/chrome_extension/` — what `npm run build` writes, and what Chrome loads. Git-ignored.

Each folder has its own `CONTEXT.md`.

## What this is not

There is no registry, no signing, no review pipeline, no telemetry, and no automated repair. Prompt injection is untouched: tool outputs are page content handed straight into an agent's context, unbounded and unlabelled. None of that can be designed honestly until one adapter has been written and has broken at least once.

## Useful links

- `chrome://extensions` — the Chrome extensions page, where the unpacked extension shows up, and where you reload it and read its errors.
- `chrome://extensions/shortcuts` — the keyboard shortcuts of the installed extensions.
- [Chrome Extensions documentation](https://developer.chrome.com/docs/extensions) — the official documentation for Chrome extensions.
- [Manifest Version 3 reference](https://developer.chrome.com/docs/extensions/reference/manifest) — every field the extension manifest accepts.
- [Native messaging documentation](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging) — how the Chrome extension talks to the native messaging host.

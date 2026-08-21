# WebMCP Everywhere

A browser extension that carries community-maintained WebMCP adapters — small scripts that register tools into sites that never shipped their own. Install it, point any agent at one local endpoint, and that agent gains real tools on the sites you already have open.

The idea and its reasoning are in [issue #1](https://github.com/jeromeetienne/webmcp_everywhere/issues/1). The first vertical slice is planned in [issue #2](https://github.com/jeromeetienne/webmcp_everywhere/issues/2).

## What works today

Ten tools on `https://demo.playwright.dev/todomvc/` — three read-only and seven acting. On a fresh install only the read-only tools are offered; the acting ones stay withheld until you opt in for that origin. Tools from every open tab are aggregated behind one endpoint, and two tabs on the same site are told apart. Codex drives the site through them, with no screenshots and no Document Object Model guesswork.

## How an agent reaches the browser

```
any agent ──HTTP MCP──> native host ──native messaging──> extension ──> document.modelContext
                        (Chrome starts it on demand)
```

The native host exists because **a Chrome extension cannot listen on a port**. Measured on Chrome 151: `chrome.sockets` and `chrome.sockets.tcpServer` are undefined, and Manifest Version 3 exposes no server interface at all — only outbound `fetch` and `WebSocket`. Something native has to hold the socket, and Chrome starts that program itself when the extension connects, so nothing needs launching by hand.

Every request travels through the extension, which is the only place that knows which tabs have adapters and what you have allowed. The host itself decides nothing about permissions.

## Try it

You need Google Chrome 149 or later; the WebMCP origin trial runs from Chrome 149 to Chrome 156.

```bash
npm install
npm run build           # checks every adapter, then bundles the extension
npm run install:host    # registers the native host with Chrome
npm run chrome          # launches a throwaway Chrome with the extension installed
npm run verify:host     # 8 checks over the real delivery path
```

The host writes where it is listening, and the token an agent must present, to `~/.webmcp_everywhere/endpoint.json`.

Point Codex at it:

```bash
export WEBMCP_TOKEN=$(jq -r .token ~/.webmcp_everywhere/endpoint.json)
export WEBMCP_URL=$(jq -r .url ~/.webmcp_everywhere/endpoint.json)
codex exec -c "mcp_servers.webmcp_everywhere={url=\"$WEBMCP_URL\", bearer_token_env_var=\"WEBMCP_TOKEN\"}" -c approvals_reviewer="auto_review" "Add a todo called buy milk, mark it done, and tell me how many are left."
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
npm run verify          # 14 checks driving the page over the Chrome DevTools Protocol
npm run verify:bridge   # 4 checks through the stdio Model Context Protocol bridge
```

The Chrome DevTools Protocol path needs a browser launched with a debugging port, which is unauthenticated and reachable by every process on the machine. That is fine for a throwaway profile and wrong for anything else, which is why the native host exists.

## Launching Chrome

`npm run chrome` uses a throwaway profile and never touches your everyday Chrome. It handles four steps that are each silent when they go wrong:

1. `enable-webmcp-testing@1` goes into the profile's `Local State`, or `document.modelContext` is simply absent.
2. `extensions.ui.developer_mode` goes into `Preferences`, or the extension installs but its content scripts never run.
3. Chrome launches with `--enable-unsafe-extension-debugging`.
4. The extension is installed with `Extensions.loadUnpacked` over the Chrome DevTools Protocol.

**Do not reach for `--load-extension`.** Chrome 151 ignores it, leaving zero extensions installed and nothing in the log.

## Layout

- `src/adapter_format/` — what an adapter is, and the checks it must pass before a build will bundle it.
- `src/site_adapters/` — one folder per target site.
- `src/chrome_extension/` — the Manifest Version 3 extension.
- `src/native_messaging_host/` — the native messaging host and its HTTP endpoint.
- `src/devtools_protocol_bridge/` — the stdio bridge, used for testing.
- `tools/` — build, launch, install, and verification.

Each folder has its own `CONTEXT.md`.

## What this is not

There is no registry, no signing, no review pipeline, no telemetry, and no automated repair. Prompt injection is untouched: tool outputs are page content handed straight into an agent's context, unbounded and unlabelled. None of that can be designed honestly until one adapter has been written and has broken at least once.

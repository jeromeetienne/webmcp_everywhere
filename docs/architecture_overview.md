# The architecture of WebMCP Everywhere

WebMCP Everywhere gives an agent real tools on sites that never shipped their own. A site adapter registers tools into a page through the WebMCP browser interface, `document.modelContext`. A Chrome extension carries the adapters and decides what an agent is allowed to call. A native messaging host holds an HTTP port and serves Model Context Protocol to any agent. The agent is anything that speaks Model Context Protocol.

## The four parts

```mermaid
flowchart LR
	agent["any agent<br/>speaks Model Context Protocol"]
	host["native messaging host<br/>src/native_messaging_host/"]
	extension["Chrome extension<br/>src/chrome_extension/"]
	adapter["site adapter<br/>src/site_adapters/"]
	page["the web page<br/>document.modelContext"]

	agent -->|"HTTP, bearer token"| host
	host -->|"Chrome native messaging"| extension
	extension -->|"chrome.runtime message"| adapter
	adapter -->|"registerTool, executeTool"| page
```

- **The site adapter** knows one site. It reads that site's pages and drives them, and it exposes what it can do as a list of tools. It is ordinary TypeScript, it runs inside the page, and it reaches nothing but that page. One folder per site under [`src/site_adapters/`](https://github.com/jeromeetienne/webmcp_everywhere/tree/main/src/site_adapters).
- **The Chrome extension** is a Manifest Version 3 extension. It carries every adapter this build was made with, it injects the matching adapter into a page, it holds the user's decision about what an agent may do on each origin, and it is the only part that knows which tabs currently have adapters running. It lives in [`src/chrome_extension/`](https://github.com/jeromeetienne/webmcp_everywhere/tree/main/src/chrome_extension).
- **The native messaging host** is an ordinary Node.js program on your machine. Chrome starts it as a child process when the extension asks for it. It holds the HTTP port that the extension itself cannot hold, and it serves the extension's tools over Model Context Protocol. It lives in [`src/native_messaging_host/`](https://github.com/jeromeetienne/webmcp_everywhere/tree/main/src/native_messaging_host).
- **The agent** is whatever you point at the endpoint. Codex and the Model Context Protocol Inspector are the two used while building this.

## Why each part exists

**The site adapter exists because most sites have not shipped WebMCP tools.** A site that has shipped its own is better served by its own: every adapter sets a `yieldCondition`, and an adapter stands down and registers nothing when the site already speaks WebMCP for itself. Long-term success for this project is a shrinking adapter count, not a growing one.

**The extension exists because an adapter has to reach `document.modelContext`, and because somebody has to enforce a decision the user made.** `document.modelContext` exists only in a page's main world, so the code that registers a tool has to run there, and code running there has no extension privileges at all. The extension is also the only place that knows the full picture: which tabs are open, which of them an adapter covers, and what the user has allowed on each origin.

**The native messaging host exists because a Chrome extension cannot listen on a port.** That is the whole reason, and it is measured rather than assumed — see [why_a_native_messaging_host.md](why_a_native_messaging_host.md). Something native has to hold the socket, and Chrome starts that program itself, so nothing needs launching by hand.

## The execution contexts

Four separate execution contexts are involved, and none of them can reach into another one directly. Most of the design follows from this.

```mermaid
flowchart TB
	subgraph browser["Google Chrome"]
		subgraph tab["one browser tab"]
			main["main world<br/>content_main.ts, the adapter<br/>sees document.modelContext<br/>has no chrome.* privileges"]
			isolated["isolated world<br/>content_isolated.ts<br/>sees chrome.* privileges<br/>cannot see document.modelContext"]
		end
		worker["background service worker<br/>background_service_worker.ts, native_bridge.ts<br/>sees every tab, opens the native messaging connection"]
		popup["popup<br/>popup.ts<br/>where a person grants and withdraws"]
	end
	process["native messaging host process<br/>webmcp_native_host.ts<br/>a Node.js program Chrome started"]

	main <-->|"custom Document Object Model events"| isolated
	isolated <-->|"chrome.runtime messages"| worker
	popup <-->|"chrome.storage.local"| worker
	worker <-->|"Chrome native messaging, four-byte length-prefixed JSON"| process
```

- The **main world** is the page's own JavaScript context. `document.modelContext` is visible only here, so [`content_main.ts`](https://github.com/jeromeetienne/webmcp_everywhere/blob/main/src/chrome_extension/page_injection/content_main.ts) and the adapter itself run here. Nothing here can touch `chrome.*`, so a grant has to arrive as a message.
- The **isolated world** is the ordinary content script context. Extension privileges are reachable here and `document.modelContext` is not. [`content_isolated.ts`](https://github.com/jeromeetienne/webmcp_everywhere/blob/main/src/chrome_extension/page_injection/content_isolated.ts) runs here and is the only bridge between the extension and the page. It sends plain data into the page — a grant, or a request naming a tool — never code, and it never takes instructions from the page.
- The **background service worker** sees every tab. It opens the native messaging connection and it aggregates the tools from every adapted tab into the one list an agent sees.
- The **native messaging host process** is not in the browser at all. Chrome started it and talks to it on standard input and standard output.

## What travels between them

| Boundary | Mechanism | What crosses |
| --- | --- | --- |
| agent → native messaging host | HTTP POST to `/mcp` with a bearer token | Model Context Protocol `tools/list` and `tools/call` |
| native messaging host → extension | Chrome native messaging, four-byte little-endian length followed by UTF-8 JSON | `{ id, kind: 'listTools' \| 'callTool', name, args }` |
| background service worker → isolated world | `chrome.tabs.sendMessage` | `{ kind: 'page:listTools' \| 'page:callTool', name, args }` |
| isolated world → main world | custom Document Object Model events, `PageQuery` | the request, and the grant |
| main world → page | `document.modelContext.registerTool` and `executeTool` | the tool registration, and the invocation |

## Where the decisions are made

Only one part of this decides anything about permission, and it is the extension. The native messaging host forwards; it holds no policy of its own. This matters because the host is the part reachable from outside the browser.

The user's decision is checked twice, in two different places, on purpose.

1. At registration, in the main world: a tool the user has not allowed is never registered, so it is not in the page to call.
2. At invocation, in the isolated world: the grant is read again before the tool is run, so enforcement sits on the path the agent's request actually travels rather than resting on registration alone.

The full account is in [permissions_and_trust.md](permissions_and_trust.md).

## Where the code is

| Folder | What it holds |
| --- | --- |
| [`src/adapter_format/`](https://github.com/jeromeetienne/webmcp_everywhere/tree/main/src/adapter_format) | What an adapter is, how its tools are named, and how page content is framed before an agent reads it |
| [`src/site_adapters/`](https://github.com/jeromeetienne/webmcp_everywhere/tree/main/src/site_adapters) | One folder per target site |
| [`src/chrome_extension/`](https://github.com/jeromeetienne/webmcp_everywhere/tree/main/src/chrome_extension) | The Manifest Version 3 extension: the two content scripts, the background service worker, the popup, and the shared state |
| [`src/native_messaging_host/`](https://github.com/jeromeetienne/webmcp_everywhere/tree/main/src/native_messaging_host) | The native messaging host and Chrome's message framing |
| [`tools/`](https://github.com/jeromeetienne/webmcp_everywhere/tree/main/tools) | Everything that builds, installs, or launches, plus the adapter checks the build runs |
| [`tests/`](https://github.com/jeromeetienne/webmcp_everywhere/tree/main/tests) | The verification runners, and the stdio Model Context Protocol bridge one of them checks |
| [`data/`](https://github.com/jeromeetienne/webmcp_everywhere/tree/main/data) | The native messaging host manifest template Chrome reads |
| `build/chrome_extension/` | What the build writes, and what Chrome loads. Git-ignored, so it is not in the repository |

Every one of those folders carries its own `CONTEXT.md` with the rules for editing it.

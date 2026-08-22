# WebMCP Everywhere

A browser extension that carries community-maintained WebMCP adapters — small scripts that register tools into sites that never shipped their own. Install it, point any agent at one local endpoint, and that agent gains real tools on the sites you already have open.

The idea and its reasoning are in [issue #1](https://github.com/jeromeetienne/webmcp_everywhere/issues/1). The first vertical slice is planned in [issue #2](https://github.com/jeromeetienne/webmcp_everywhere/issues/2).

## What works today

Three sites are covered.

- Ten tools on `https://demo.playwright.dev/todomvc/` — three read-only and seven acting. See [the adapter's own README.md](src/site_adapters/demo_playwright_dev/README.md).
- Seven tools on `https://caniuse.com/` — five read-only and two acting, turning the browser support tables into exact answers. See [the adapter's own README.md](src/site_adapters/caniuse_com/README.md).
- Thirteen tools on `https://www.openstreetmap.org/` — six read-only and seven acting, aimed at a mapper: the tags on a feature, the areas containing a point, what changed in the view, and routing used as a test of the road network. See [the adapter's own README.md](src/site_adapters/openstreetmap_org/README.md).

On a fresh install only the read-only tools are offered; the acting ones stay withheld until you opt in for that origin. Tools from every open tab are aggregated behind one endpoint, and two tabs on the same site are told apart. Codex drives the sites through them, with no screenshots and no Document Object Model guesswork.

## Try it

You need Google Chrome 149 or later and Node.js 22.18.0 or later; the WebMCP origin trial runs from Chrome 149 to Chrome 156.

```bash
npm install
```

Checks every adapter, then bundles the extension
```bash
npm run build
```

Registers the native messaging host with Chrome
```bash
npm run install:host
```

Launches a throwaway Chrome with the extension installed
```bash
npm run chrome
```

That opens the TodoMVC demonstration. Pass an address to open a different covered site.

```bash
npm run chrome -- "https://www.openstreetmap.org/#map=15/48.8584/2.2945"
```

Checks the real delivery path
```bash
npm run verify:host
```

The native messaging host writes where it is listening, and the token an agent must present, to `~/.webmcp_everywhere/endpoint.json`.

### Point Codex at it

Define the environment variables
```bash
export WEBMCP_EVERYWHERE_TOKEN=$(jq -r .token ~/.webmcp_everywhere/endpoint.json)
export WEBMCP_EVERYWHERE_URL=$(jq -r .url ~/.webmcp_everywhere/endpoint.json)
```

Declare the http mcp server to codex
```bash
codex mcp add webmcp_everywhere --url "$WEBMCP_EVERYWHERE_URL" --bearer-token-env-var WEBMCP_EVERYWHERE_TOKEN
```

Launch codex
```
codex
```

Inside codex, you can inspect the MCP servers available by `/mcp`
```
/mcp
```

### How to enable write permissions
Acting tools are withheld until you opt in, from the extension's popup or with `npm run grant`, which takes the origin to opt in.

```bash
npm run grant -- https://www.openstreetmap.org
```

### Asking for one thing, without registering anything

`codex mcp add` above writes the server into `~/.codex/config.toml` and leaves it there. The other way is to declare it for a single run and change nothing on disk, which is what a script, a demonstration, or somebody else's machine wants.

`codex exec` runs one prompt and exits. Three parts do the work.

- `-c "mcp_servers.webmcp_everywhere={…}"` declares the server for this run only.
- `-c approvals_reviewer="auto_review"` routes Codex's approval requests through automatic review, so the run does not stop to ask permission for each command. This is Codex approving its own actions; it has nothing to do with the acting tool opt-in above, which is still needed before an agent may change anything on a site.
- The last argument is the prompt.

```bash
codex exec -c "mcp_servers.webmcp_everywhere={url=\"$WEBMCP_EVERYWHERE_URL\", bearer_token_env_var=\"WEBMCP_EVERYWHERE_TOKEN\"}" -c approvals_reviewer="auto_review" "Add a todo called buy milk, mark it done, and tell me how many are left."
```

On OpenStreetMap, ask for something a mapper would ask for:

```bash
codex exec -c "mcp_servers.webmcp_everywhere={url=\"$WEBMCP_EVERYWHERE_URL\", bearer_token_env_var=\"WEBMCP_EVERYWHERE_TOKEN\"}" -c approvals_reviewer="auto_review" "What changed on the map around where I am looking, and who made the biggest change?"
```


## How it works

An agent reaches the browser through a native messaging host, because a Chrome extension cannot listen on a port.

```
any agent ──HTTP Model Context Protocol──> native messaging host ──native messaging──> extension ──> document.modelContext
                        (Chrome starts it on demand)
```

Everything else is explained in **[the documentation in `docs/`](docs/README.md)**.

| Document | What it answers |
| --- | --- |
| [architecture_overview.md](docs/architecture_overview.md) | The four parts, and how a tool call travels between them |
| [why_a_native_messaging_host.md](docs/why_a_native_messaging_host.md) | Why a Chrome extension cannot hold the port itself |
| [tool_call_lifecycle.md](docs/tool_call_lifecycle.md) | One tool call, followed end to end |
| [tool_naming_and_tab_identity.md](docs/tool_naming_and_tab_identity.md) | How a tool gets its name, and how two tabs are told apart |
| [adapter_format.md](docs/adapter_format.md) | What a site adapter is, and what the build checks |
| [write_a_site_adapter.md](docs/write_a_site_adapter.md) | How to cover a new site |
| [permissions_and_trust.md](docs/permissions_and_trust.md) | Why acting tools are withheld, and where that is enforced |
| [security_model.md](docs/security_model.md) | What is defended, and what plainly is not |
| [testing_and_verification.md](docs/testing_and_verification.md) | The three paths to the browser, and which runner covers which |
| [build_and_install.md](docs/build_and_install.md) | What each command writes, and every environment variable |
| [troubleshooting.md](docs/troubleshooting.md) | The failures that report nothing |

## Layout

`src/` holds the product and nothing else. Everything that builds it is in `tools/`, everything that checks it is in `tests/`, and everything the build writes is in `build/`.

- `src/adapter_format/` — what an adapter is, how its tools are named, and how page content is framed.
- `src/site_adapters/` — one folder per target site.
- `src/chrome_extension/` — the Manifest Version 3 extension.
- `src/native_messaging_host/` — the native messaging host and its HTTP endpoint.
- `tools/` — build, launch, and install, plus the adapter checks the build runs and the Chrome DevTools Protocol connection.
- `tests/` — the verification runners, and the stdio bridge one of them checks.
- `docs/` — how all of it works.
- `build/chrome_extension/` — what `npm run build` writes, and what Chrome loads. Git-ignored.

Each folder has its own `CONTEXT.md`.

## Testing it

```bash
npm test                # every check, with Chrome hidden
```

```bash
npm run test:visible    # the same checks, with Chrome on screen
```

Every check drives a real Chrome and asserts against state read back out of a live page. The individual runners, and which one to reach for when, are in [testing_and_verification.md](docs/testing_and_verification.md).

## What this is not

There is no registry, no signing, no review pipeline, no telemetry, and no automated repair. Prompt injection is untouched: tool outputs are page content handed straight into an agent's context. What is and is not defended is set out honestly in [security_model.md](docs/security_model.md). None of the rest can be designed honestly until one adapter has been written and has broken at least once.

## Useful links

- `chrome://extensions` — where the unpacked extension shows up, where you reload it, and where you read its errors.
- `chrome://extensions/shortcuts` — the keyboard shortcuts of the installed extensions.
- [Chrome Extensions documentation](https://developer.chrome.com/docs/extensions) — the official documentation for Chrome extensions.
- [Manifest Version 3 reference](https://developer.chrome.com/docs/extensions/reference/manifest) — every field the extension manifest accepts.
- [Native messaging documentation](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging) — how the Chrome extension talks to the native messaging host.

# WebMCP Everywhere

A browser extension that carries community-maintained WebMCP adapters — small scripts that register tools into sites that never shipped their own. Install it, point any agent at one local endpoint, and that agent gains real tools on the sites you already have open.

The idea and its reasoning are in [issue #1](https://github.com/jeromeetienne/webmcp_everywhere/issues/1). The first vertical slice is planned in [issue #2](https://github.com/jeromeetienne/webmcp_everywhere/issues/2).

## What works today

**An adapter written by anybody, in a folder of their own, runs in the browser with no rebuild of this extension and no merge here.** Write the adapter, run `npm run load-adapter -- <your folder>`, switch it on in the popup, and your agent has its tools. That is the whole point of the project, and it is the thing [issue #8](https://github.com/jeromeetienne/webmcp_everywhere/issues/8) exists about.

Three sites are covered by adapters bundled into this build, as examples of what an adapter looks like rather than as a catalogue.

- Ten tools on `https://demo.playwright.dev/todomvc/` — three read-only and seven acting. See [the adapter's own README.md](src/site_adapters/demo_playwright_dev/README.md).
- Seven tools on `https://caniuse.com/` — five read-only and two acting, turning the browser support tables into exact answers. See [the adapter's own README.md](src/site_adapters/caniuse_com/README.md).
- Thirteen tools on `https://www.openstreetmap.org/` — six read-only and seven acting, aimed at a mapper: the tags on a feature, the areas containing a point, what changed in the view, and routing used as a test of the road network. See [the adapter's own README.md](src/site_adapters/openstreetmap_org/README.md).

A site changes and an adapter breaks. [A run every night](.github/workflows/live_checks.yml) drives each of these against its real site and writes what it found here, so a stale adapter is visible before somebody's agent gets a wrong answer. "Author last checked" is the date in the adapter's own `metadata.targetSiteVerifiedOn`, which the extension's popup shows as well.

<!-- adapter_freshness begin -->
| Adapter | Site | Read-only | Acting | Sensitive | Author last checked | Last nightly run |
| --- | --- | --- | --- | --- | --- | --- |
| `caniuse_com` | Can I use... | 5 | 2 | 0 | 2026-08-21 | passing |
| `demo_playwright_dev` | Playwright TodoMVC demonstration | 3 | 7 | 0 | 2026-08-20 | passing |
| `openstreetmap_org` | OpenStreetMap | 6 | 7 | 0 | 2026-08-21 | passing |

Last nightly run: 2026-08-29.
<!-- adapter_freshness end -->

On a fresh install only the read-only tools are offered; the acting ones stay withheld until you opt in for that origin. An adapter loaded from a folder is switched off until you switch it on, because nobody here reviewed it. Tools from every open tab are aggregated behind one endpoint, and two tabs on the same site are told apart. Codex drives the sites through them, with no screenshots and no Document Object Model guesswork.

## Try it

You need Google Chrome 149 or later; the WebMCP origin trial runs from Chrome 149 to Chrome 156. To use it you need Node.js 20 or later, and to work on it, Node.js 22.18.0 or later.

**To use it**, one command does everything that can be done for you:

```bash
npx webmcp_everywhere
```

It copies the extension and the native messaging host into `~/.webmcp_everywhere/installation`, registers the host with Chrome, and ends by naming the one step only you can take, because Chrome loads an unpacked extension by hand. `npx webmcp_everywhere status` says at any time whether tools are reaching your agent and which step to fix when they are not, and `npx webmcp_everywhere uninstall` takes it all back out. The archive on [the latest release](https://github.com/jeromeetienne/webmcp_everywhere/releases/latest) holds the same folder for anybody who would rather not use npm: unzip it and run `node webmcp_everywhere.mjs` inside it, which is the same command doing the same thing.

**To write an adapter**, or to change anything here, work from the repository, which is everything below.

```bash
npm install
```

Checks every adapter, then bundles the extension
```bash
npm run build
```

Registers the native messaging host with Chrome. It writes a file into the Chrome you installed, so it prints every path it is about to write, and the program those files name, before writing any of them.
```bash
npm run install:host
```

Takes that registration back out of Chrome, whenever you want it gone
```bash
npm run uninstall:host
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
node --test tests/native_host.test.ts
```

Checks an adapter folder and installs it, with no rebuild of the extension
```bash
npm run load-adapter -- ~/my_adapters/example_com
```

Takes an installed adapter back out again
```bash
npm run unload-adapter -- example_com
```

Packages a folder somebody can install without cloning anything
```bash
npm run package:release
```

The native messaging host writes where it is listening to `~/.webmcp_everywhere/endpoint.json`, and the token an agent must present to `~/.webmcp_everywhere/token`. Two files, because the two facts have different lifetimes: the token is made once and never changes, while the address is true only while a host is holding that port. So `endpoint.json` is there while a host is really listening and gone when none is, and a missing file means no browser is running rather than an address that no longer works. The address itself is always `http://127.0.0.1:8765/mcp`, so an agent registered once stays registered.

### Point Codex at it

Define the environment variables
```bash
export WEBMCP_EVERYWHERE_TOKEN=$(cat ~/.webmcp_everywhere/token)
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

If codex got trouble to route your queries to `webmcp_everywhere`, say the following
```
use only mcp webmcp_everywhere
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
| [adapter_format.md](docs/adapter_format.md) | What a site adapter is, and what the checks refuse |
| [write_a_site_adapter.md](docs/write_a_site_adapter.md) | How to cover a new site, in your own folder or in this repository |
| [permissions_and_trust.md](docs/permissions_and_trust.md) | Why acting tools are withheld, and what you agree to by loading an adapter |
| [security_model.md](docs/security_model.md) | What is defended, and what plainly is not |
| [testing_and_verification.md](docs/testing_and_verification.md) | The three paths to the browser, and which runner covers which |
| [build_and_install.md](docs/build_and_install.md) | What each command writes, how a release is packaged, and every environment variable |
| [troubleshooting.md](docs/troubleshooting.md) | The failures that report nothing |

## Layout

`src/` holds the product and nothing else. Everything that builds it is in `tools/`, everything that checks it is in `tests/`, and everything the build writes is in `build/`. `packages/` is the npm workspace: product code with a `package.json` of its own, imported by its name rather than by a relative path.

- `packages/adapter_toolkit/` — the page helpers every adapter shares: waiting on the page, and driving it. Imported as `@webmcp_everywhere/adapter_toolkit`.
- `src/adapter_format/` — what an adapter is, how its tools are named, and how page content is framed.
- `src/site_adapters/` — one folder per target site this build ships.
- `src/chrome_extension/` — the Manifest Version 3 extension.
- `src/native_messaging_host/` — the native messaging host, its HTTP endpoint, and the folder of loaded adapters it reads.
- `tools/` — build, launch, install, the commands that write a new adapter and register it, the commands that load and unload an adapter written elsewhere, plus the adapter checks and the Chrome DevTools Protocol connection.
- `tests/` — the verification runners, and the stdio bridge one of them checks. One runner per adapted site in `tests/site_adapters/`.
- `docs/` — how all of it works.
- `.github/` — the checks GitHub runs on a pull request, and the issue and pull request templates.
- `build/chrome_extension/` — what `npm run build` writes, and what Chrome loads. Git-ignored.

Each folder has its own `CONTEXT.md`.

## Testing it

```bash
npm test                # every check, with Chrome hidden
```

```bash
npm run test:visible    # the same checks, with Chrome on screen
```

```bash
npm run test:no_browser # only the checks that start no browser
```

Almost every check drives a real Chrome and asserts against state read back out of a live page. The four exceptions are the ones `npm run test:no_browser` names: `tests/adapter_registry_sync.test.ts`, whose subject is whether the registry still matches the adapter folders, `tests/endpoint_file.test.ts`, whose subject is the native messaging host process and the file it writes rather than any page, `tests/native_host_install.test.ts`, whose subject is the host manifest file that registers this project with Chrome, and `tests/source_boundary.test.ts`, which reads the source folder off disk. Those four are what continuous integration runs on a pull request, because the rest need a Chrome with the WebMCP origin trial and the live public site. The individual runners, and which one to reach for when, are in [testing_and_verification.md](docs/testing_and_verification.md).

## What this is not

There is no registry, no signing, no review pipeline, no telemetry, and no automated repair. An adapter you load from a folder was reviewed by two automatic checks and by nobody else — [permissions_and_trust.md](docs/permissions_and_trust.md) says plainly what you are agreeing to when you load one. Prompt injection is untouched: tool outputs are page content handed straight into an agent's context. What is and is not defended is set out honestly in [security_model.md](docs/security_model.md). None of the rest can be designed honestly until adapters written by other people have existed and broken.

## Writing an adapter

The point of this project is that other people write the adapters. There are two places one can live, and the first is the ordinary one.

**Your own folder, your own repository.** Nothing is merged here and nothing is rebuilt. Write the adapter, then:

```bash
npm run load-adapter -- ~/my_adapters/example_com
```

Turn on **Allow User Scripts** for this extension at `chrome://extensions`, switch the adapter on in the popup, and it runs.

**Contributed here, bundled into this build.** For the two or three adapters that exist to show what an adapter looks like. One command writes the folder, the verification runner, the two documents, and the registration, all of it already passing the build.

```bash
npm run new-adapter -- https://example.com
```

[docs/write_a_site_adapter.md](docs/write_a_site_adapter.md) is the guide to both. [CONTRIBUTING.md](CONTRIBUTING.md) says what a pull request must carry, how to judge whether a site is worth an adapter at all, and which checks run where.

The plan that took the maintainer off the critical path is [issue #9](https://github.com/jeromeetienne/webmcp_everywhere/issues/9), and what was missing before it is [issue #8](https://github.com/jeromeetienne/webmcp_everywhere/issues/8).

## Licence

[MIT](LICENSE).

## Useful links

- `chrome://extensions` — where the unpacked extension shows up, where you reload it, and where you read its errors.
- `chrome://extensions/shortcuts` — the keyboard shortcuts of the installed extensions.
- [Chrome Extensions documentation](https://developer.chrome.com/docs/extensions) — the official documentation for Chrome extensions.
- [Manifest Version 3 reference](https://developer.chrome.com/docs/extensions/reference/manifest) — every field the extension manifest accepts.
- [Native messaging documentation](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging) — how the Chrome extension talks to the native messaging host.

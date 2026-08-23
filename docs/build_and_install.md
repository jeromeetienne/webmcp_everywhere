# Building, installing, and launching

Three commands, each doing one thing.

```bash
npm run build           # checks every adapter, then bundles the extension
npm run install:host    # registers the native messaging host with Chrome
npm run chrome          # launches a throwaway Chrome with the extension installed
```

You need Google Chrome 149 or later; the WebMCP origin trial runs from Chrome 149 to Chrome 156. You need Node.js 22.18.0 or later, because Node.js strips TypeScript types on its own from that version and the whole repository is run without a build step.

## `npm run build`

[`tools/build_extension.ts`](https://github.com/jeromeetienne/webmcp_everywhere/blob/main/tools/build_extension.ts) does four things, in this order.

**One: it checks every adapter.** [`tools/adapter_validation/validate_all_adapters.ts`](https://github.com/jeromeetienne/webmcp_everywhere/blob/main/tools/adapter_validation/validate_all_adapters.ts) is bundled for Node.js and run as a child process. It prints one line per adapter naming how many tools it carries in each permission class, and it exits non-zero if any adapter fails. The build then stops with "adapter review checks failed, refusing to build". An adapter that reaches the network, mislabels an acting tool as read-only, or collides with another adapter's tool name never reaches a browser. What each check is, and why it runs here rather than in the page, is in [adapter_format.md](adapter_format.md).

**Two: it empties `build/chrome_extension/`.** Nothing is ever written into [`src/`](https://github.com/jeromeetienne/webmcp_everywhere/tree/main/src).

**Three: it copies the two static files.** [`manifest.json`](https://github.com/jeromeetienne/webmcp_everywhere/blob/main/src/chrome_extension/manifest.json) and [`user_interface/popup.html`](https://github.com/jeromeetienne/webmcp_everywhere/blob/main/src/chrome_extension/user_interface/popup.html), each keeping its path. Chrome loads an unpacked extension from the folder that holds [`manifest.json`](https://github.com/jeromeetienne/webmcp_everywhere/blob/main/src/chrome_extension/manifest.json), so both have to sit beside the bundles rather than stay behind in [`src/`](https://github.com/jeromeetienne/webmcp_everywhere/tree/main/src).

**Four: it bundles the four entry points with esbuild.**

| Source | Output | Where it runs |
| --- | --- | --- |
| [`page_injection/content_main.ts`](https://github.com/jeromeetienne/webmcp_everywhere/blob/main/src/chrome_extension/page_injection/content_main.ts) | `dist/content_main.js` | the page's main world |
| [`page_injection/content_isolated.ts`](https://github.com/jeromeetienne/webmcp_everywhere/blob/main/src/chrome_extension/page_injection/content_isolated.ts) | `dist/content_isolated.js` | the isolated world |
| [`native_host_link/background_service_worker.ts`](https://github.com/jeromeetienne/webmcp_everywhere/blob/main/src/chrome_extension/native_host_link/background_service_worker.ts) | `dist/background_service_worker.js` | the background service worker |
| [`user_interface/popup.ts`](https://github.com/jeromeetienne/webmcp_everywhere/blob/main/src/chrome_extension/user_interface/popup.ts) | `dist/popup.js` | the popup |

Everything is bundled as an immediately invoked function expression with its imports inlined, because content scripts cannot be ECMAScript modules.

Each entry point keeps its folder in the source path and only its base name in the output name. Letting esbuild derive the output path recreates the subfolders inside `dist/` and breaks every path in [`manifest.json`](https://github.com/jeromeetienne/webmcp_everywhere/blob/main/src/chrome_extension/manifest.json).

The result, which is what Chrome loads:

```
build/chrome_extension/
	manifest.json
	user_interface/popup.html
	dist/content_main.js
	dist/content_isolated.js
	dist/background_service_worker.js
	dist/popup.js
```

That folder is git-ignored.

## `npm run install:host`

[`tools/install_native_host.ts`](https://github.com/jeromeetienne/webmcp_everywhere/blob/main/tools/install_native_host.ts) writes the native messaging host manifest file, the JSON file that tells Chrome which program to start and which extension may connect to it.

Both halves have to be right: the manifest points at an executable file, and it names the extension identifier.

**The launcher** is [`bin/webmcp_native_host.sh`](https://github.com/jeromeetienne/webmcp_everywhere/blob/main/bin/webmcp_native_host.sh), resolved to an absolute path. Chrome starts it with a very small environment, so the script holds no absolute path of its own: it works the repository root out from its own location with `BASH_SOURCE`, and it searches for a Node.js rather than naming one — the shell's own `node` first, then `/opt/homebrew/bin/node`, `/usr/local/bin/node`, and `/usr/bin/node` — refusing any older than 22.18.0. The whole program is one `exec`, because Chrome talks to the process it starts on standard input and standard output and any extra process in between would break that.

**The extension identifier** comes from `GenerateExtensionKey.currentIdentifier()`, which derives it from the `key` field pinned in [`manifest.json`](https://github.com/jeromeetienne/webmcp_everywhere/blob/main/src/chrome_extension/manifest.json). The identifier is pinned with a key rather than left to Chrome because an unpacked extension without one gets an identifier derived from wherever its folder happens to sit, and the host manifest has to name a fixed identifier.

**The manifest itself** is [`data/native_messaging_template/com.webmcp_everywhere.host.json`](https://github.com/jeromeetienne/webmcp_everywhere/blob/main/data/native_messaging_template/com.webmcp_everywhere.host.json), with `{{hostName}}`, `{{launcherPath}}`, and `{{extensionIdentifier}}` filled in. It lives there as a JSON document rather than as string literals, so the shape Chrome reads can be looked at and edited as the document it is. Every placeholder has to be replaced; an unreplaced one is an error rather than something written out to Chrome, which would refuse the manifest with no useful message.

The rendered manifest is written into every Chrome `NativeMessagingHosts` directory found — on macOS `~/Library/Application Support/Google/Chrome/NativeMessagingHosts`, on Linux `~/.config/google-chrome/NativeMessagingHosts`, plus the same directory inside any user data directory passed in, which is how a throwaway profile gets one.

Because the manifest names the launcher's absolute path, **moving the repository means running `npm run install:host` again.**

## `npm run chrome`

[`tools/launch_chrome.ts`](https://github.com/jeromeetienne/webmcp_everywhere/blob/main/tools/launch_chrome.ts) launches a throwaway Chrome with the extension installed. It uses a throwaway profile in the system temporary directory and never touches your everyday Chrome.

It handles four steps that are each silent when they go wrong.

1. **`enable-webmcp-testing@1` goes into the profile's `Local State`**, under `browser.enabled_labs_experiments`. Without it `document.modelContext` is simply absent.
2. **`extensions.ui.developer_mode` goes into `Preferences`.** Without it the extension installs but its content scripts never run, which is a failure with no error message anywhere.
3. **Chrome launches with `--enable-unsafe-extension-debugging`**, alongside `--user-data-dir`, `--remote-debugging-port`, `--no-first-run`, `--no-default-browser-check`, `--disable-sync`, and `--headless=new` unless the visibility is `visible`.
4. **The extension is installed with `Extensions.loadUnpacked`** over the Chrome DevTools Protocol, and then the target page is opened.

Two more things it does. It installs the native messaging host manifest into the throwaway profile, so the host works there. And **it deletes the profile before every launch**: Chrome does not re-read an unpacked extension it has already installed, so keeping the profile silently runs the previous build, and every check still passes while testing old code.

**Do not reach for `--load-extension`.** Chrome 151 ignores it, leaving zero extensions installed and nothing in the log.

The launch refuses to start at all if `build/chrome_extension/dist/content_main.js` is missing, with "the extension is not built; run npm run build first".

## What the native messaging host writes

When Chrome starts the host, it writes three files under `~/.webmcp_everywhere/`.

- **`endpoint.json`** — the address it is serving on, and the process identifier of the host holding the port.
- **`token`** — the bearer token an agent must present, and the only place it is kept. It is made once and never changes, so an agent registered with it goes on working across restarts.
- **`host.log`** — everything the host has to say. It goes here and to standard error, never to standard output, which belongs entirely to the native messaging channel.

**`endpoint.json` exists only while a host is really listening.** The host writes it at the moment it takes the port, and removes it when it stops. So a missing file means no host is running, rather than a host you have to guess at, and a file that is there names an address you can use. A host that cannot get the port writes nothing at all rather than an address it does not hold.

**The address never changes.** The host serves on port 8765 and on no other. It used to step to the next free port when 8765 was taken, which wrote a different address into `endpoint.json` every time and left an agent registered with `codex mcp add`, which records the address it was given and keeps it, pointing at nothing. A host that cannot have port 8765 now waits for it and takes it the moment it is free.

**One browser at a time.** The port is one address on one machine, so only one browser can be behind it. The browser whose host started last takes the port, and the host it took it from stays running and waits, so closing the newer browser hands the endpoint back to the older one within a few seconds. Both events are recorded in `host.log`.

**The token is never copied into `endpoint.json`.** It used to be, and that is what made the stale-address failure so hard to see: a correct, never-changing token sat on the line beside an address that could be stale, so the whole file read as authoritative and readers followed it to a port nothing was listening on. Each file now carries one fact with one lifetime.

Point an agent at it by reading one value out of each file:

```bash
export WEBMCP_EVERYWHERE_TOKEN=$(cat ~/.webmcp_everywhere/token)
```

```bash
export WEBMCP_EVERYWHERE_URL=$(jq -r .url ~/.webmcp_everywhere/endpoint.json)
```

## Environment variables

Every variable this project reads is named `WEBMCP_EVERYWHERE_` followed by what it changes, so one prefix covers all of them and nothing of this project's can collide with anything else in your shell. Every variable is optional and every one has a working default.

| Variable | Values | Default | What it changes |
| --- | --- | --- | --- |
| `WEBMCP_EVERYWHERE_CHROME_VISIBILITY` | `visible` or `hidden` | `hidden`, except `npm run chrome`, which shows a window | Whether a launched Chrome puts a window on the screen. Hidden runs Chrome with `--headless=new`, which still installs the extension, still runs the content scripts, and still starts the native messaging host. |
| `WEBMCP_EVERYWHERE_HOST_PORT` | a port number | `8765` | The one port the native messaging host serves Model Context Protocol over HTTP on. It never moves to another port; a host that cannot have this one waits for it. |
| `WEBMCP_EVERYWHERE_STATE_DIR` | a directory | `~/.webmcp_everywhere` | Where the native messaging host keeps `endpoint.json`, `token`, and `host.log`. `node --test tests/endpoint_file.test.ts` sets it to a throwaway directory so its hosts never touch the one you are really using. |
| `WEBMCP_EVERYWHERE_BRIDGE_PORT` | a port number | `9333` | Which Chrome debugging port the stdio Model Context Protocol bridge attaches to. |
| `WEBMCP_EVERYWHERE_BRIDGE_PAGE` | part of a page address | `todomvc` | Which open page the stdio bridge attaches to, matched on the address. |

Any other value for `WEBMCP_EVERYWHERE_CHROME_VISIBILITY` is refused by name rather than ignored, so a typo fails the run instead of silently showing a window.

## Erasable syntax

Node.js runs the files in [`tools/`](https://github.com/jeromeetienne/webmcp_everywhere/tree/main/tools), [`tests/`](https://github.com/jeromeetienne/webmcp_everywhere/tree/main/tests), and [`src/native_messaging_host/`](https://github.com/jeromeetienne/webmcp_everywhere/tree/main/src/native_messaging_host) directly, stripping types without a build step. So those files stay within erasable syntax: no `enum`, no runtime `namespace`, no parameter properties, no decorators. `npm run typecheck` checks it.

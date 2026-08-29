# Building, installing, and launching

Nine commands, each doing one thing.

```bash
npm run build           # checks every adapter, then bundles the extension
npm run install:host    # registers the native messaging host with Chrome
npm run chrome          # launches a throwaway Chrome with the extension installed
npm run load-adapter    # checks an adapter folder, and installs it without a rebuild
npm run unload-adapter  # takes an installed adapter back out again
npm run package:release # packages a folder somebody can install without cloning anything
npm run pack:npm        # packs that folder into the tarball npm publishes
npm run check:versions  # refuses a release whose version numbers disagree
npm run uninstall:host  # takes the registration back out of Chrome
```

You need Google Chrome 149 or later; the WebMCP origin trial runs from Chrome 149 to Chrome 156. You need Node.js 22.18.0 or later, because Node.js strips TypeScript types on its own from that version and the whole repository is run without a build step.

## Which way in to choose

Three ways, and only the third is what this document is about.

- **`npx webmcp_everywhere`** installs the published package. It copies the extension and the bundled native messaging host into `~/.webmcp_everywhere/installation`, registers the host with Chrome, and ends by saying whether tools are reaching an agent. Nothing is built and nothing is cloned, and Node.js 20 or later is enough. Ask again at any time with `npx webmcp_everywhere status`, and take it all back out with `npx webmcp_everywhere uninstall`. This is what somebody who only wants to use it should run.
- **The archive on [the latest release](https://github.com/jeromeetienne/webmcp_everywhere/releases/latest)** holds the same folder, for anybody who would rather not use npm. Unzip it and run `node webmcp_everywhere.mjs` inside it, which is the same command doing the same thing.
- **This repository** is for writing an adapter, or changing anything here. Node.js runs the TypeScript with no build step, the launcher walks up from its own location to find `src/`, and `npm run install:host` registers this working copy rather than an installation. The nine commands above are all of it.

Only one of these may be registered with Chrome at a time. The host manifest names one launcher, and installing either way overwrites what the other wrote.

## `npm run build`

[`tools/build_extension.ts`](https://github.com/jeromeetienne/webmcp_everywhere/blob/main/tools/build_extension.ts) does four things, in this order.

**One: it checks every adapter.** [`tools/adapter_validation/validate_all_adapters.ts`](https://github.com/jeromeetienne/webmcp_everywhere/blob/main/tools/adapter_validation/validate_all_adapters.ts) is bundled for Node.js and run as a child process. It prints one line per adapter naming how many tools it carries in each permission class, and it exits non-zero if any adapter fails. The build then stops with "adapter review checks failed, refusing to build". An adapter that reaches the network, mislabels an acting tool as read-only, or collides with another adapter's tool name never reaches a browser. What each check is, and why it runs here rather than in the page, is in [adapter_format.md](adapter_format.md).

**Two: it empties `build/chrome_extension/`.** Nothing is ever written into [`src/`](https://github.com/jeromeetienne/webmcp_everywhere/tree/main/src).

**Three: it copies the two static files.** [`manifest.json`](https://github.com/jeromeetienne/webmcp_everywhere/blob/main/src/chrome_extension/manifest.json) and [`user_interface/popup.html`](https://github.com/jeromeetienne/webmcp_everywhere/blob/main/src/chrome_extension/user_interface/popup.html), each keeping its path. Chrome loads an unpacked extension from the folder that holds [`manifest.json`](https://github.com/jeromeetienne/webmcp_everywhere/blob/main/src/chrome_extension/manifest.json), so both have to sit beside the bundles rather than stay behind in [`src/`](https://github.com/jeromeetienne/webmcp_everywhere/tree/main/src).

**Four: it bundles the five entry points with esbuild.**

| Source | Output | Where it runs |
| --- | --- | --- |
| [`page_injection/content_main.ts`](https://github.com/jeromeetienne/webmcp_everywhere/blob/main/src/chrome_extension/page_injection/content_main.ts) | `dist/content_main.js` | the page's main world, for an adapter bundled into this build |
| [`page_injection/external_adapter_main.ts`](https://github.com/jeromeetienne/webmcp_everywhere/blob/main/src/chrome_extension/page_injection/external_adapter_main.ts) | `dist/external_adapter_main.js` | the page's main world, for an adapter loaded from a folder |
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
	dist/external_adapter_main.js
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

### It says what it is about to do, before it does it

This command writes a file into a browser you installed, and from then on Google Chrome will start a program out of this working copy, as a separate operating system process, outside the browser sandbox, with your full rights. That is the native messaging design rather than a defect in it, but it is not a thing to be opted into silently, so the command prints every path it is about to write, the program those files name, and how to undo all of it, before it writes anything.

`InstallNativeHost.plan` is what makes that possible. It works out the identifier, the launcher, and every manifest path, and writes none of them. `InstallNativeHost.run` calls it and then writes exactly the files it named, so what was announced and what happened cannot drift apart.

**Only `npm run install:host` writes into the everyday Chrome.** Every other command in this repository passes `isEverydayChromeCovered: false` and covers a throwaway user data directory alone.

## `npm run uninstall:host`

[`tools/uninstall_native_host.ts`](https://github.com/jeromeetienne/webmcp_everywhere/blob/main/tools/uninstall_native_host.ts) removes the manifest from exactly the directories the installation writes it into. Both commands take that list from `InstallNativeHost.manifestDirectories`, because two lists that have to agree are one list.

For each directory it prints whether a manifest was there, and what program that manifest told Chrome to start. That last part matters for the manifest nobody can find on their own: a working copy that has since been moved or deleted leaves its manifest behind, still naming a program that no longer exists, and printing the dead path is how a person recognises what they are looking at.

Afterwards Google Chrome no longer starts the native messaging host for this extension. Two things are deliberately left alone, and the command says so rather than doing them quietly.

- **The extension itself**, which is removed from `chrome://extensions` like any other.
- **The state directory** `~/.webmcp_everywhere`, which holds your bearer token, the endpoint file, and the log. The token is made once and never changes, so removing it would invalidate an agent registered with `codex mcp add`. The command prints the `rm -rf` line for it and leaves the decision to you.

## `npm run chrome`

[`tools/launch_chrome.ts`](https://github.com/jeromeetienne/webmcp_everywhere/blob/main/tools/launch_chrome.ts) launches a throwaway Chrome with the extension installed. It uses a throwaway profile in the system temporary directory and never touches your everyday Chrome.

It handles five steps that are each silent when they go wrong.

1. **`enable-webmcp-testing@1` goes into the profile's `Local State`**, under `browser.enabled_labs_experiments`. Without it `document.modelContext` is simply absent.
2. **`extensions.ui.developer_mode` goes into `Preferences`.** Without it the extension installs but its content scripts never run, which is a failure with no error message anywhere.
3. **Chrome launches with `--enable-unsafe-extension-debugging`**, alongside `--user-data-dir`, `--remote-debugging-port`, `--no-first-run`, `--no-default-browser-check`, `--disable-sync`, and `--headless=new` unless the visibility is `visible`.
4. **The extension is installed with `Extensions.loadUnpacked`** over the Chrome DevTools Protocol.
5. **The launch waits until the extension has registered its first content script**, and only then opens the target page. The manifest names no site any more, so nothing runs on a page until the background service worker has called `chrome.scripting.registerContentScripts`, and a page opened during that moment gets no adapter at all — the tool list comes back empty and every check after it fails for a reason that looks nothing like the cause.

Two more things it does. It installs the native messaging host manifest **into the throwaway profile and nowhere else**, so the host works there while the everyday Chrome is left exactly as it was. A Chrome started with a custom `--user-data-dir` reads host manifests from inside that directory and never looks at the everyday Chrome's, so covering the everyday one would modify a browser you installed in order to run a check that does not use it. And **it deletes the profile before every launch**: Chrome does not re-read an unpacked extension it has already installed, so keeping the profile silently runs the previous build, and every check still passes while testing old code.

**Do not reach for `--load-extension`.** Chrome 151 ignores it, leaving zero extensions installed and nothing in the log.

The launch refuses to start at all if `build/chrome_extension/dist/content_main.js` is missing, with "the extension is not built; run npm run build first".

## `npm run load-adapter` and `npm run unload-adapter`

These two are what make an adapter usable without rebuilding anything. Nothing here has to be merged into this repository, and the extension is not rebuilt.

```bash
npm run load-adapter -- ~/my_adapters/example_com
```

[`tools/load_adapter.ts`](https://github.com/jeromeetienne/webmcp_everywhere/blob/main/tools/load_adapter.ts) does four things, in this order.

**One: it finds the adapter.** The folder must hold exactly one `*_adapter.ts` or `*_adapter.js` file. Two of them, or none, is refused by name.

**Two: it runs the same review checks a bundled adapter faces.** `AdapterSchema` for the adapter's shape and `PermissionAudit` for its source, bundled for Node.js and run as a child process, exactly as `npm run build` does. An adapter that reaches the network, mislabels an acting tool as read-only, or declares a tool name that collides is refused, and the refusal names what was found.

**Three: it prints every tool with its permission class**, so the person running the command reads what they are about to allow before anything is installed.

**Four: it bundles the adapter for the browser and writes it** to `~/.webmcp_everywhere/adapters/<site slug>.json`, alongside its match patterns, its tool list, its author, and the folder it came from.

The checks run here, in Node.js, rather than in the browser. A Chrome extension may not run code it did not ship, and code already in the page can simply not call a checker — so refusing before installation is the only moment where refusing means anything. What each check is is in [adapter_format.md](adapter_format.md); what it is worth is in [security_model.md](security_model.md).

Installing an adapter does not run it. Two more things have to be true first, and both are decisions a person makes deliberately:

- **Switch the adapter on in the popup.** A loaded adapter is off by default, because nobody at this repository reviewed it.
- **Turn on "Allow User Scripts" for this extension** at `chrome://extensions`. `chrome.userScripts` is the one interface Chrome offers for running code an extension did not ship, and Chrome keeps it hidden until you turn it on. Until then the popup lists the adapter as withheld and says exactly this.

[`tools/unload_adapter.ts`](https://github.com/jeromeetienne/webmcp_everywhere/blob/main/tools/unload_adapter.ts) is the way back, and it takes a site slug rather than a folder:

```bash
npm run unload-adapter -- example_com
```

Run with no site slug, it prints what is installed instead of guessing.

Writing the adapter in the first place is [write_a_site_adapter.md](write_a_site_adapter.md). What you are agreeing to by loading one is [permissions_and_trust.md](permissions_and_trust.md).

## `npm run package:release`

Everything above assumes a working copy on disk: the launcher walks up from its own location to find [`src/`](https://github.com/jeromeetienne/webmcp_everywhere/tree/main/src), and Node.js runs the TypeScript with no build step. That is right for somebody writing an adapter and wrong for everybody else, because it means cloning a repository to use a browser extension.

```bash
npm run package:release
```

[`tools/package_release.ts`](https://github.com/jeromeetienne/webmcp_everywhere/blob/main/tools/package_release.ts) writes `build/release/` and an archive beside it, holding:

| What | Why it is there |
| --- | --- |
| `chrome_extension/` | The built extension, loaded at `chrome://extensions` |
| `webmcp_native_host.mjs` | The host, bundled with its dependencies inlined, so no `node_modules` is needed |
| `webmcp_native_host.sh` | The launcher, which finds the bundle beside itself and searches for a Node.js |
| `install_the_native_messaging_host.mjs` | The installer, which announces every file before writing it |
| `native_messaging_template/` | The host manifest template, because the release carries no repository |
| `README.md` and `LICENSE` | What to do with the folder, and under what terms |

Node.js is still needed, because bundling removes the repository rather than the runtime. The launcher searches for one exactly as the repository's does, since Chrome starts it with a very small environment.

`node --test tests/packaged_release.test.ts` copies that folder out of the repository, registers its host with a throwaway Chrome, and asks the endpoint for its tools. It is the only check that proves the host works with nothing above it, and the release workflow attaches no archive until it has passed.

That runner needs port 8765, which serves one browser at a time on purpose, so it skips with its reason when your everyday Chrome already owns the port. Continuous integration has no other browser, which is where it really runs.

## What the native messaging host writes

When Chrome starts the host, it writes three files under `~/.webmcp_everywhere/`.

- **`endpoint.json`** — the address it is serving on, and the process identifier of the host holding the port.
- **`token`** — the bearer token an agent must present, and the only place it is kept. It is made once and never changes, so an agent registered with it goes on working across restarts.
- **`host.log`** — everything the host has to say. It goes here and to standard error, never to standard output, which belongs entirely to the native messaging channel.

A fourth thing lives in that directory but is not written by the host. **`adapters/`** holds one JSON file per adapter installed with `npm run load-adapter`. The host reads that folder and reports what it finds to the extension the moment the extension connects, which is how an adapter that is in no build reaches a browser.

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
| `WEBMCP_EVERYWHERE_CHROME_PATH` | a path | the first Chrome found | Which Chrome to launch. Without it the paths are tried in order: the macOS one, then `/usr/bin/google-chrome`, `google-chrome-stable`, `/opt/google/chrome/chrome`, and Chromium. |
| `WEBMCP_EVERYWHERE_CHROME_VISIBILITY` | `visible` or `hidden` | `hidden`, except `npm run chrome`, which shows a window | Whether a launched Chrome puts a window on the screen. Hidden runs Chrome with `--headless=new`, which still installs the extension, still runs the content scripts, and still starts the native messaging host. |
| `WEBMCP_EVERYWHERE_HOST_PORT` | a port number | `8765` | The one port the native messaging host serves Model Context Protocol over HTTP on. It never moves to another port; a host that cannot have this one waits for it. |
| `WEBMCP_EVERYWHERE_STATE_DIR` | a directory | `~/.webmcp_everywhere` | Where the native messaging host keeps `endpoint.json`, `token`, and `host.log`. `node --test tests/endpoint_file.test.ts` sets it to a throwaway directory so its hosts never touch the one you are really using. |
| `WEBMCP_EVERYWHERE_ADAPTERS_DIR` | a directory | `adapters/` inside the state directory | Where `npm run load-adapter` writes an installed adapter, and where the native messaging host reads them from. |
| `WEBMCP_EVERYWHERE_BRIDGE_PORT` | a port number | `9333` | Which Chrome debugging port the stdio Model Context Protocol bridge attaches to. |
| `WEBMCP_EVERYWHERE_BRIDGE_PAGE` | part of a page address | `todomvc` | Which open page the stdio bridge attaches to, matched on the address. |

Any other value for `WEBMCP_EVERYWHERE_CHROME_VISIBILITY` is refused by name rather than ignored, so a typo fails the run instead of silently showing a window.

## Erasable syntax

Node.js runs the files in [`tools/`](https://github.com/jeromeetienne/webmcp_everywhere/tree/main/tools), [`tests/`](https://github.com/jeromeetienne/webmcp_everywhere/tree/main/tests), and [`src/native_messaging_host/`](https://github.com/jeromeetienne/webmcp_everywhere/tree/main/src/native_messaging_host) directly, stripping types without a build step. So those files stay within erasable syntax: no `enum`, no runtime `namespace`, no parameter properties, no decorators. `npm run typecheck` checks it.

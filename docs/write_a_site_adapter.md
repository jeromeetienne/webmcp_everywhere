# Writing a site adapter

This is the task-shaped guide to covering a new site. Read [adapter_format.md](adapter_format.md) first for what an adapter is; this document is the order to do things in.

The worked example throughout is the Playwright TodoMVC adapter in [`src/site_adapters/demo_playwright_dev/`](https://github.com/jeromeetienne/webmcp_everywhere/tree/main/src/site_adapters/demo_playwright_dev).

## Two places an adapter can live, and how to choose

An adapter is the same TypeScript either way. What differs is where the folder sits and how it reaches a browser.

**Your own folder, outside this repository.** You write the adapter, run `npm run load-adapter -- <your folder>`, switch it on in the popup, and your agent has its tools. Nothing is merged here, nothing is rebuilt, and nobody waits for a review. This is the ordinary way, and it is what the whole of milestone 3 of [issue #9](https://github.com/jeromeetienne/webmcp_everywhere/issues/9) exists to make possible: the maintainer of this repository is not on your critical path.

**A folder under [`src/site_adapters/`](https://github.com/jeromeetienne/webmcp_everywhere/tree/main/src/site_adapters), contributed here.** The adapter ships inside the extension, is on by default, and is maintained by this repository. This is for the two or three adapters that exist to show what an adapter looks like, not for the catalogue — [CONTRIBUTING.md](../CONTRIBUTING.md) says what this repository takes and what it does not.

Steps two, five, and six below are the same either way. Steps one, three, and four differ, and each says how.

## Before writing anything: probe the live site

Every rule in all three existing adapters is a failure that a probe found first. None of them was written by reading the site's source.

Open the site, open the developer tools, and find out three things.

1. **Where the site keeps its real state.** TodoMVC keeps every todo in `localStorage` under `react-todos`, so the adapter reads the list from there and reads the Document Object Model only for what is on screen. Can I use... publishes its whole feature index on `window.Caniuse.rawData` before it renders anything.
2. **What the visible page will not tell you.** The Can I use... support table sits behind three nested shadow roots and is drawn lazily, so it is empty exactly when it is needed; the adapter reads `model.fullData` off the feature's `ciu-feature` element instead. TodoMVC's filter links hide items rather than re-order them, so a position in the list means something different under each filter.
3. **What the site ignores.** TodoMVC is React, so assigning to `input.value` does nothing at all. Text has to be written through the native `HTMLInputElement` value setter, then an `input` event, then a `keydown` for Enter. That one is already solved for you: it is `PageDriving.writeIntoInputField` in [`packages/adapter_toolkit/`](https://github.com/jeromeetienne/webmcp_everywhere/tree/main/packages/adapter_toolkit).

Write down what you found. It goes into the folder's `CONTEXT.md` as a rule, and the date goes into the adapter's `metadata.targetSiteVerifiedOn`.

## Step one: run the scaffold

`npm run new-adapter` writes an adapter into this repository, which is what a contributed adapter needs.

```bash
npm run new-adapter -- https://example.com
```

Writing an adapter of your own outside this repository needs no scaffold. Copy one of the folders under [`src/site_adapters/`](https://github.com/jeromeetienne/webmcp_everywhere/tree/main/src/site_adapters) into a folder of your own and edit it. The rules are the same, and `npm run load-adapter` refuses the same things `npm run build` does. What the folder must hold is one `*_adapter.ts` or `*_adapter.js` file exporting an adapter, and nothing else is required.

What it does need is the two packages that adapter imports, installed into your own folder:

```bash
npm install ../webmcp_everywhere/packages/adapter_format ../webmcp_everywhere/packages/adapter_toolkit
```

Then you import them by name, exactly as an adapter in this repository does:

```ts
import { ADAPTER_FORMAT_VERSION } from '@webmcp_everywhere/adapter_format';
import { PageDriving, PageWaiting } from '@webmcp_everywhere/adapter_toolkit';
import type { Adapter } from '@webmcp_everywhere/adapter_format';
```

**Neither package is on npmjs yet, so those two paths mean you do need a clone of this repository** — one clone, once, to install from. Putting them on npmjs is the decision left open in milestone 2 of [issue #11](https://github.com/jeromeetienne/webmcp_everywhere/issues/11); when it is taken, the command above becomes `npm install @webmcp_everywhere/adapter_format @webmcp_everywhere/adapter_toolkit` and the clone goes away. What has already gone is copying `PageWaiting` and `PageDriving` into your folder by hand, which is what this guide used to tell you to do.

For a contributed adapter, the scaffold writes five things, all of them already passing `npm run build`:

- `src/site_adapters/example_com/example_adapter.ts` — the adapter, with one read-only tool that already works, and the page-reading class beside it.
- `src/site_adapters/example_com/CONTEXT.md` — the rules for editing this adapter, waiting to be replaced by yours.
- `src/site_adapters/example_com/README.md` — what an agent can do on this site, waiting to be written.
- `tests/site_adapters/example.test.ts` — the verification runner, with two checks that already pass against the live site.
- The registration: the adapter list in `adapter_registry.ts`. The extension manifest names no site at all — which adapter runs where is decided in the browser, when the user switches an adapter on.

The folder is named after the origin in `snake_case`, and that name is also the adapter's `siteSlug`; the two have to agree, because every tool name is namespaced by the slug. The scaffold takes both from the address you gave it.

The rest of the file names come from the first label of the host — `example.com` gives `example_adapter.ts`, `ExamplePage`, and `example.test.ts`. Pass a second argument when the site is better known by another name, which is why TodoMVC's files are named after TodoMVC rather than after `demo`.

```bash
npm run new-adapter -- https://demo.playwright.dev/todomvc/ todomvc
```

## Step two: write the adapter

One file, holding two exports: the adapter object itself, and a class holding the page-reading and page-driving helpers. Split that one file in two once it passes about six hundred lines, as the OpenStreetMap adapter does: `<site>_page.ts` for the class and the result types, `<site>_adapter.ts` for the adapter object and its tools.

The rules that apply while writing it:

- **Use [`@webmcp_everywhere/adapter_toolkit`](https://github.com/jeromeetienne/webmcp_everywhere/tree/main/packages/adapter_toolkit) rather than writing the same helper again.** `PageWaiting.waitUntil` and `PageWaiting.waitUntilChanged` are the waiting every adapter needs; `PageDriving.writeIntoInputField` and `PageDriving.pressEnter` are the two interactions a framework only notices when they are done a particular way. What stays in your own folder is this site's own figures, such as how long it takes to settle.
- **Every adapter imports [`@webmcp_everywhere/adapter_format`](https://github.com/jeromeetienne/webmcp_everywhere/tree/main/packages/adapter_format) and [`@webmcp_everywhere/adapter_toolkit`](https://github.com/jeromeetienne/webmcp_everywhere/tree/main/packages/adapter_toolkit), and nothing else.** Never another adapter, never anything under [`chrome_extension/`](https://github.com/jeromeetienne/webmcp_everywhere/tree/main/src/chrome_extension). An adapter in a folder of your own imports those two packages and nothing else outside that folder. A contributed adapter, which sits in this repository's workspace, imports exactly the same two names — so an adapter written outside and an adapter written here are the same file.
- **Never reach the network.** `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `navigator.sendBeacon`, and a dynamic import are each refused, by `npm run build` and by `npm run load-adapter` alike.
- **Set a `yieldCondition`.** An adapter that cannot stand down when the site ships its own tools is not finished.
- **Declare the permission class honestly.** The build reads your handler's source and disagrees with a wrong one. A handler that names `PageDriving` at all is acting, because every helper in that file changes the page.
- **A read-only handler must not name `location`.** The audit cannot tell reading it from assigning to it. Read the address through a helper outside the handler, which is what the scaffolded `_address` is for.
- **Return a refusal, never throw.** Chrome 151 replaces a thrown handler error with a fixed `UnknownError` text, so a thrown message reaches no agent. A tool that cannot serve a reasonable request returns a refusal object naming the tool to call next.
- **Put an acting tool back the way it found it.** A TodoMVC tool that needs a hidden todo shows every todo, acts, and restores the filter, so the page never looks different from how the user left it.
- **Leave `metadata.adapterFormatVersion` alone.** It names the version of the format the build accepts, which is `ADAPTER_FORMAT_VERSION` in [`@webmcp_everywhere/adapter_format`](https://github.com/jeromeetienne/webmcp_everywhere/tree/main/packages/adapter_format) and always equals that package's own version, and the scaffold already wrote the right one. `version` beside it is the adapter's own, and that one is yours.

## Step three: keep the registration in step

**Your own folder, outside this repository.** There is nothing to keep in step. The match patterns in your adapter are the whole of it, and they travel with the adapter when it is loaded.

**A contributed adapter.** The scaffold registered it. The one thing that changes it afterwards is editing `matchPatterns`.

```bash
npm run sync:adapters
```

That rewrites the adapter list in [`adapter_registry.ts`](https://github.com/jeromeetienne/webmcp_everywhere/blob/main/src/chrome_extension/shared_state/adapter_registry.ts) from the folders that exist. The file is committed, so the change still arrives as a diff a reviewer reads. `node --test tests/adapter_registry_sync.test.ts` refuses a working copy where the file and the folders disagree, and continuous integration runs it, so forgetting the command costs a failed check rather than an adapter that is registered and never runs.

## Step four: install it, or build it

**Your own folder, outside this repository.**

```bash
npm run load-adapter -- ~/my_adapters/example_com
```

It runs the same checks the build runs, prints every tool with its permission class, and writes the adapter to `~/.webmcp_everywhere/adapters/`. A failing check prints `REJECTED` with the reason and installs nothing.

Installing it does not run it. Two more things have to be true, and both are yours to decide:

- **Turn on "Allow User Scripts" for this extension** at `chrome://extensions`. Chrome hides the one interface for running code an extension did not ship until you do.
- **Switch the adapter on in the popup.** A loaded adapter is off by default, because nobody at this repository reviewed it.

`npm run unload-adapter -- example_com` is the way back out.

**A contributed adapter.**

```bash
npm run build
```

The build runs every check over every adapter before it bundles anything, and prints one line per adapter naming how many tools it carries in each permission class. A failing check prints `REJECTED` with the reason and stops the build. What each check is, and why it runs before a browser ever sees the adapter, is in [adapter_format.md](adapter_format.md).

## Step five: check it against the live site

The scaffold wrote your runner in [`tests/site_adapters/`](https://github.com/jeromeetienne/webmcp_everywhere/tree/main/tests/site_adapters), with two checks in it that already pass. Every tool you add gets a check beside them.

```bash
node --test tests/site_adapters/example.test.ts
```

The rules for a runner are in [`tests/site_adapters/CONTEXT.md`](https://github.com/jeromeetienne/webmcp_everywhere/blob/main/tests/site_adapters/CONTEXT.md). The two that matter most:

- **Assert against state read back out of the live page.** Nothing is mocked, and a check that cannot fail is not a check.
- **Each runner launches its own throwaway Chrome**, so it needs no browser to be up first.

`node --test tests/site_adapters/todomvc.test.ts`, `caniuse.test.ts`, and `openstreetmap.test.ts` are the three worth reading before writing a fourth. Continuous integration never runs any of them, because they drive the real public site; running yours, and saying in the pull request when it last passed, is part of the contribution.

When a check fails, `node --test tests/devtools_protocol_bridge/webmcp_bridge.test.ts` and the stdio Model Context Protocol bridge are the smallest way to tell an adapter fault apart from a delivery fault — see [testing_and_verification.md](testing_and_verification.md).

## Step six: fill in the two documents

Both belong in an adapter that lives in a folder of your own as much as in one contributed here — the next person to read your adapter is you, six months later. The scaffold wrote both, and both say what to replace.

**`CONTEXT.md`** — the rules for editing this adapter. Every fact you established by probing becomes one rule here, in the present tense. An adapter whose `CONTEXT.md` still holds only the scaffold's rules has not been checked against its site.

**`README.md`** — what an agent can do with this site, and the workflows worth asking for. Write the workflows before the tool table: they are the reason a person can tell what a site is good for without reading the tool list.

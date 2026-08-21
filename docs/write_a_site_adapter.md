# Writing a site adapter

This is the task-shaped guide to covering a new site. Read [adapter_format.md](adapter_format.md) first for what an adapter is; this document is the order to do things in.

The worked example throughout is the Playwright TodoMVC adapter in `src/site_adapters/demo_playwright_dev/`.

## Before writing anything: probe the live site

Every rule in both existing adapters is a failure that a probe found first. Neither adapter was written by reading the site's source.

Open the site, open the developer tools, and find out three things.

1. **Where the site keeps its real state.** TodoMVC keeps every todo in `localStorage` under `react-todos`, so the adapter reads the list from there and reads the Document Object Model only for what is on screen. Can I use... publishes its whole feature index on `window.Caniuse.rawData` before it renders anything.
2. **What the visible page will not tell you.** The Can I use... support table sits behind three nested shadow roots and is drawn lazily, so it is empty exactly when it is needed; the adapter reads `model.fullData` off the feature's `ciu-feature` element instead. TodoMVC's filter links hide items rather than re-order them, so a position in the list means something different under each filter.
3. **What the site ignores.** TodoMVC is React, so assigning to `input.value` does nothing at all. Text has to be written through the native `HTMLInputElement` value setter, then an `input` event, then a `keydown` for Enter.

Write down what you found. It goes into the folder's `CONTEXT.md` as a rule, and the date goes into the adapter's `metadata.targetSiteVerifiedOn`.

## Step one: make the folder

One folder per origin under `src/site_adapters/`, named after the origin in `snake_case`, matching the adapter's `siteSlug`.

```
src/site_adapters/example_com/
	CONTEXT.md          the rules for editing this adapter
	README.md           what an agent can do with this site, and the workflows worth asking for
	example_adapter.ts  the adapter
```

## Step two: write the adapter

One file, holding two exports: the adapter object itself, and a class holding the page-reading and page-driving helpers.

```ts
import type { Adapter } from '../../adapter_format/adapter_types.js';

export class ExampleAdapter {
	static readonly SETTLE_TIMEOUT = 2000;

	static _readState(): SomeShape {
		// read the site's own storage or its own published data, not the rendered page
	}
}

export const exampleAdapter: Adapter = {
	siteSlug: 'example_com',
	siteName: 'Example',
	matchPatterns: ['https://example.com/*'],
	metadata: {
		author: 'your name',
		version: '1.0.0',
		adapterFormatVersion: '1.0.0',
		targetSiteVerifiedOn: '2026-08-21',
	},
	yieldCondition: (firstPartyToolNames) => firstPartyToolNames.length > 0,
	tools: [
		// ...
	],
};
```

The rules that apply while writing it:

- **Import types from `../../adapter_format/` and nothing else.** Never another adapter, never anything under `chrome_extension/`.
- **Never reach the network.** `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `navigator.sendBeacon`, and a dynamic import each fail the build.
- **Set a `yieldCondition`.** An adapter that cannot stand down when the site ships its own tools is not finished.
- **Declare the permission class honestly.** The build reads your handler's source and disagrees with a wrong one.
- **A read-only handler must not name `location`.** The audit cannot tell reading it from assigning to it. Read the address through a helper outside the handler.
- **Return a refusal, never throw.** Chrome 151 replaces a thrown handler error with a fixed `UnknownError` text, so a thrown message reaches no agent. A tool that cannot serve a reasonable request returns a refusal object naming the tool to call next.
- **Put an acting tool back the way it found it.** A TodoMVC tool that needs a hidden todo shows every todo, acts, and restores the filter, so the page never looks different from how the user left it.

## Step three: register it in the two places

Both are by hand, and a build that silently picked up a new file would be a build that silently shipped one.

**`src/chrome_extension/shared_state/adapter_registry.ts`** — import the adapter and add it to `AdapterRegistry.ADAPTERS`.

**`src/chrome_extension/manifest.json`** — add the match pattern to `host_permissions` and to **both** `content_scripts` entries, the `MAIN` one and the `ISOLATED` one. A registered adapter whose pattern is missing there never runs.

## Step four: build

```bash
npm run build
```

The build runs every check over every adapter before it bundles anything, and prints one line per adapter naming how many tools it carries in each permission class. A failing check prints `REJECTED` with the reason and stops the build. What each check is, and why it lives at build time, is in [adapter_format.md](adapter_format.md).

## Step five: check it against the live site

Write a verification runner in `tests/`, named `verify_<site>.test.ts`, following the shape the existing ones use. `npm run verify` covers TodoMVC and `npm run verify:caniuse` covers Can I use...; both are worth reading before writing a third.

The rules for a runner are in `tests/CONTEXT.md`. The two that matter most:

- **Assert against state read back out of the live page.** Nothing is mocked, and a check that cannot fail is not a check.
- **Each runner launches its own throwaway Chrome**, so it needs no browser to be up first.

When a check fails, `npm run verify:bridge` and the stdio Model Context Protocol bridge are the smallest way to tell an adapter fault apart from a delivery fault — see [testing_and_verification.md](testing_and_verification.md).

## Step six: write the two documents

**`CONTEXT.md`** — the rules for editing this adapter, in the standard folder template. Every fact you established by probing becomes one rule here, in the present tense.

**`README.md`** — what an agent can do with this site, and the workflows worth asking for. Both existing adapters have one; they are the reason a person can tell what a site is good for without reading the tool list.

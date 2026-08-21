# Directory Context: `/src/site_adapters/caniuse_com`

## Purpose
The adapter for `https://caniuse.com/`, which turns the browser support tables into tools an agent can query instead of reading off the screen.

## Key Exports & Entry Points
- `README.md`: What Codex can do with this site, and the workflows worth asking for.
- `caniuse_adapter.ts`: `caniuseAdapter`, the adapter itself, and `CaniuseAdapter`, the class holding the page-reading helpers.
- Command to exercise this folder: `npm run verify:caniuse`

## Rules
- Read a feature's support values from the `model.fullData` property of that feature's `ciu-feature` element, never from the rendered support table. The table sits behind three nested shadow roots and is drawn lazily, so it is empty exactly when it is needed.
- Read the feature index and the browsers from `window.Caniuse.rawData`, which the page publishes before it renders anything. The index carries an identifier and a title only; support values are never in it.
- Never read `window.initialFeatData`. It holds only the feature the page was loaded on and it is not updated when the page routes to another one, so it is silently stale after the first navigation.
- Move the page with `history.pushState` followed by a `popstate` event, never with `location.assign`. A real navigation tears down the script context and the pending tool call dies with it.
- Return a `ToolRefusal` when the request is reasonable but this page cannot serve it yet, per the refusal rule in the parent [CONTEXT.md](../CONTEXT.md).
- Read the page's address through `CaniuseAdapter._currentUrl`, not `location.href` inside a handler. `PermissionAudit` reads handler source and cannot tell reading `location` apart from assigning to it, so a read-only handler that names it is rejected.

## Background
- Every fact above was established by probing the live site on 2026-08-21, and every rule is a failure that the probe or the verification found first. The support percentages this adapter computes were checked against the ones the page prints for `css-grid`, `flexbox`, `css-variables`, `avif`, and `webgpu`.
- The `UnknownError` behaviour was measured on Chrome 151 while verifying this adapter, and it applies to every adapter in this repository, not only this one.
- This site was chosen as the second target because it holds nothing belonging to the user, so its two acting tools change only what is displayed and a mistake costs nothing.

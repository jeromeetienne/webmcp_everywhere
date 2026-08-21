# The Can I use... adapter

This adapter gives `https://caniuse.com/` a set of Model Context Protocol tools that the page never shipped. With the adapter loaded, Codex answers browser support questions by calling named tools and reading exact numbers, instead of taking screenshots of a coloured table and guessing at which square means what.

This document is about what you can ask Codex to do with the page. It does not explain how to build, install, or connect anything — the repository README.md at the top of the project covers that.

## The tools Codex sees

Five tools only read the page:

- `search_features` — search all 1356 features the site covers and get back their identifiers and titles. This needs nothing to be on the page, because the whole feature index is already in it.
- `list_page_features` — which features the page is currently showing, and whether the support data for each one has finished loading.
- `list_browsers` — every browser the site tracks, with the version that is current today and the share of global browsing it holds.
- `get_feature_support` — everything the site knows about one feature: what it is, its specification, its standardisation status, its Baseline availability, the share of global browsing that supports it, and, for every browser, the version from which support has held unbroken.
- `check_support` — whether one named browser, in one named version, supports one named feature.

Two tools change what the page is showing:

- `show_feature` — move the page to one feature so that the reading tools can answer for it.
- `search_on_page` — type a search into the page's own search field, so the page shows every matching feature and loads the support data for all of them at once.

Neither acting tool changes anything that belongs to you. The site holds nothing of yours, so the worst an acting tool here can do is show you a different page.

## The one thing to understand about this page

A feature has to be on the page before its support data can be read. The site publishes its whole feature index up front, so `search_features` finds anything by name immediately, but it publishes the support values one feature at a time as the page shows them.

So the shape of almost every request is two steps: find the identifier, bring the feature onto the page, then read it. Codex does this on its own — a reading tool that is asked for a feature that is not on the page replies with a refusal that names `show_feature` and the identifier to pass it.

Before you have opted in to the acting tools for this origin, the reading tools still work on whatever feature the page is already showing, and `search_features` still searches everything.

## Workflows worth asking for

### Answer one support question

- "From which version of Safari can I use container queries?"
- "Does Internet Explorer 11 support CSS Grid, and does it need a prefix?"
- "What share of the world can use `dialog` today?"

Codex searches for the identifier, brings the feature onto the page, and reads the answer. The number it gives you is the number the site prints, not an estimate off a screenshot.

### Decide whether a feature is safe to ship

- "Can I ship subgrid without a fallback?"
- "We support the last two versions of every major browser. Is `:has()` safe for us?"
- "What is the oldest Safari I have to care about if I want to use `text-wrap: balance`?"

This is the request worth trying, because it needs a judgement rather than a lookup. Codex reads the support table and the usage percentages and applies the rule you gave it in words.

### Compare several related features at once

- "Compare container queries, subgrid, and `:has()` — which is safest to use today?"
- "Search for everything about container queries and tell me which parts are widely available."

`search_on_page` brings the whole result set onto the page in one call and loads the support data for all of them, so a comparison costs one acting call rather than one per feature.

### Check a codebase against real support data

Codex has the page through these tools and your files through its own tools, so it can hold both at once.

- "Read my CSS and tell me which features in it are not yet Baseline widely available."
- "Our browserslist says we support Samsung Internet 15. Which features in this file break there?"
- "Write me a support table, as Markdown, for the five features this component uses."

### Ask what changed

- "When did CSS Grid become widely available?"
- "Which browsers still only partially support this?"
- "Read me the notes attached to this feature's support values."

The numbered notes under a support table explain the awkward cases, and `get_feature_support` returns them with the values that point at them, so Codex reads the exception rather than missing it.

## What this adapter is not for

- It does not reach the network, so it can only read features the page has already loaded. That is why `show_feature` exists, and why a reading tool refuses rather than fetching.
- It does not know your project. It reports what browsers do, not what your users use. Give it your own support rule in words and it will apply it, but it will not invent one.
- It does not search descriptions. `search_features` matches identifiers and titles only. When a search comes up empty, `search_on_page` uses the site's own search, which also matches keywords.

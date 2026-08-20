# Directory Context: `/src/adapters/demo_playwright_dev`

## Purpose
The adapter for the Playwright TodoMVC demonstration at `https://demo.playwright.dev/todomvc/`, the first site this project covers.

## Key Exports & Entry Points
- `todomvc_adapter.ts`: `todoMvcAdapter`, the adapter itself, and `TodomvcAdapter`, the class holding the page-driving helpers.
- Command to exercise this folder: `npm run verify`

## Rules
- Never assign to `input.value`. The page is React and ignores it. Write through the native `HTMLInputElement` value setter, then dispatch an `input` event, then a `keydown` for Enter.
- Identify a todo by the `id` the application stores, never by its position in the list. The filter links hide items rather than re-order them, so a position means something different under each filter.
- An acting tool that needs a hidden todo shows every todo, acts, and puts the filter back. It never leaves the page looking different from how the user left it.
- Read the full list from the application's own storage, and read the Document Object Model only for what is on screen.

## Background
- Every selector and interaction here was verified against the live site on 2026-08-20, not taken from the TodoMVC source. The double-click editing flow, the fragment-based filters, and the delete button were each confirmed by probing, and the results are in [issue #2](https://github.com/jeromeetienne/webmcp_everywhere/issues/2).
- TodoMVC is a deliberate first target: its whole state is its own local storage, so an acting tool that misfires harms nobody, which is why acting tools were built here first rather than on a site that matters.

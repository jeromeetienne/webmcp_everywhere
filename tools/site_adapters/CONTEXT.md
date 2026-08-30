# Directory Context: `/tools/site_adapters`

## Purpose
Everything that acts on the adapter folders under [`/contribs/site_adapters`](../../contribs/site_adapters/CONTEXT.md), and on an adapter folder written anywhere else: write a new one, list them all, install one, remove it again, and say which ones the nightly run checks.

## Key Exports & Entry Points
- `new_adapter.ts`: `NewAdapter` — scaffolds an adapter folder with its runner and its two documents. `npm run new-adapter`
- `sync_adapter_registry.ts`: `SyncAdapterRegistry` — writes the adapter list in `contribs/chrome_extension/shared_state/adapter_registry.ts` from the folders. `npm run sync:adapters`
- `load_adapter.ts` and `unload_adapter.ts`: `LoadAdapter` and `UnloadAdapter` — check an adapter folder from anywhere and install it, or take it back out. `npm run load-adapter`, `npm run unload-adapter`
- `adapter_freshness.ts`: `AdapterFreshness` — the job matrix the nightly workflow reads, and the results table it writes into `README.md`. `node tools/site_adapters/adapter_freshness.ts`

## Rules
- A tool writing into a hand-written file writes only between its own markers: `sync_adapter_registry.ts` in `adapter_registry.ts`, `adapter_freshness.ts` in `README.md`. Neither writes a whole file it did not generate.
- `new_adapter.ts` writes no knowledge of any site. Every adapter earns its rules by probing the live site, and a scaffold that guessed a selector teaches the opposite.
- `load_adapter.ts` runs the same checks the build runs, in [`../site_adapter/`](../site_adapter/CONTEXT.md), and prints every tool with its permission class first: installing somebody else's code into your own logged-in sessions is done on purpose.
- Every way of installing something has a way back, as easy to find: `unload_adapter.ts` is the way back from `load_adapter.ts`.
- Anything reading an adapter bundles it with esbuild and runs the bundle, never parses source: adapters import with a `.js` extension, which Node.js cannot resolve from `.ts`.
- `new_adapter.ts` writes the import of `tests/libs/live_page_harness.ts` into every runner it scaffolds, so moving that file means editing this generator as well.

## Background
- Loading an adapter with no rebuild, and the nightly checks that keep the table in `README.md` honest, are [issue #9](https://github.com/jeromeetienne/webmcp_everywhere/issues/9).
- What an adapter has to look like, and what the scaffold leaves for the author to find out, is in [adapter_format.md](../../docs/adapter_format.md).

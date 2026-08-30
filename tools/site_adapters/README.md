# The site adapter tools

This folder holds everything that acts on an adapter folder: write a new one, install one into your browser, take it back out, keep the committed adapter list in step with the folders, and say which adapters the nightly run checks.

It works on the adapter folders under [`/contribs/site_adapters`](../../contribs/site_adapters/README.md) and on an adapter folder written anywhere else on your machine.

## What is in here

- `new_adapter.ts` — scaffolds an adapter folder, its verification runner, and its two documents. It writes no knowledge of any site: every adapter earns its rules by probing the live site. `npm run new-adapter`
- `load_adapter.ts` — checks an adapter folder from anywhere, prints every tool with its permission class, and installs it with no rebuild. `npm run load-adapter`
- `unload_adapter.ts` — takes an installed adapter back out. `npm run unload-adapter`
- `sync_adapter_registry.ts` — writes the adapter list in `contribs/chrome_extension/shared_state/adapter_registry.ts` from the folders. `npm run sync:adapters`
- `adapter_freshness.ts` — the job list the nightly workflow reads, and the results table it writes into the repository `README.md`.

## Running it

```bash
npm run new-adapter -- https://example.com/
```

```bash
npm run load-adapter
```

```bash
npm run unload-adapter
```

```bash
npm run sync:adapters
```

Installing somebody else's adapter puts their code into your own logged-in sessions, so `npm run load-adapter` prints every tool and its permission class first and waits for you.

## Reading further

- The rules for editing this folder are in [CONTEXT.md](CONTEXT.md).
- The task-shaped guide to covering a site: [write_a_site_adapter.md](../../docs/write_a_site_adapter.md).
- What an adapter must look like: [adapter_format.md](../../docs/adapter_format.md).

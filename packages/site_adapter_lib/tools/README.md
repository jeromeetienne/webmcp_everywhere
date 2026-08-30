# The site adapter checks

An adapter has to pass the checks in this folder before `npm run build` will bundle it, and before `npm run load-adapter` will install it into a browser. The checks are the same either way, whoever wrote the adapter.

The folder sits inside [`/packages/site_adapter_lib`](../README.md), because what is checked here is the adapter format that package defines.

## What is in here

- `adapter_schema.ts` — the shape an adapter must match, checked against the adapter format version that `@webmcp_everywhere/site_adapter_lib` declares.
- `permission_audit.ts` — reads the source of every tool handler and disagrees with an adapter that declares a handler read-only when the handler changes the page.
- `validate_all_adapters.ts` — the runner that applies both to every registered adapter.

The permission audit is a lint and not a proof: it reads only the handler's own source, so a handler that calls a mutating helper of its own can defeat it. The rule that nothing under `contribs/` reaches the network is the defence that does not depend on reading source.

## Running it

The checks run as the first step of the build:

```bash
npm run build
```

They run again, on their own, when an adapter is installed from a folder anywhere on your machine:

```bash
npm run load-adapter
```

## Reading further

- The rules for editing this folder are in [CONTEXT.md](CONTEXT.md).
- What an adapter must look like: [adapter_format.md](../../../docs/adapter_format.md).
- What a permission class means and what you agree to by loading somebody else's adapter: [permissions_and_trust.md](../../../docs/permissions_and_trust.md).

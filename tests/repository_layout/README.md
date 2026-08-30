# The repository layout verification runners

These runners check the repository against itself: that the committed adapter list still matches the adapter folders, that no import crosses a boundary it must not, and that the workspace packages are what they say they are.

None of them starts a browser, so all three are in `npm run test:no_browser` and are the fastest checks in the repository to run.

## What is in here

- `adapter_registry_sync.test.ts` — 5 checks that the adapter list and the verification runners match the folders under `contribs/site_adapters/`, and that the extension manifest names no site.
- `source_boundary.test.ts` — refuses a relative import that leaves `contribs/`, or that leaves a package under `packages/`.
- `workspace_packages.test.ts` — 6 checks over the three packages: what each one offers, which one is published, and how the two an adapter author installs behave once packed.

A runner here reads the repository off disk rather than naming its contents in a list, so a folder added tomorrow is checked without this folder being edited.

## Running it

```bash
node --test tests/repository_layout/*.test.ts
```

If `adapter_registry_sync.test.ts` fails after you added an adapter folder, the fix is usually to write the adapter list again:

```bash
npm run sync:adapters
```

## Reading further

- The rules for editing this folder are in [CONTEXT.md](CONTEXT.md).
- Why the adapter list is generated and committed rather than read at run time: [write_a_site_adapter.md](../../docs/write_a_site_adapter.md).

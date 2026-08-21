# Directory Context: `/tools/adapter_validation`

## Purpose
The checks an adapter must pass before `npm run build` will bundle it: the schema it must match, the permission audit that disagrees with a wrong declaration, and the runner that applies both to every registered adapter.

## Key Exports & Entry Points
- `adapter_schema.ts`: `AdapterSchema`, plus `ADAPTER_FORMAT_VERSION`.
- `permission_audit.ts`: `PermissionAudit` — reads handler source and disagrees with a wrong declaration.
- `validate_all_adapters.ts`: The runner. Bundled by `tools/build_extension.ts` and run in Node.js, never bundled into a page.
- Command to check this folder: `npm run build`

## Rules
- Nothing in `src/` imports from here. This code exists so the schema library never reaches a content script, and an import from `src/` would undo that.
- This folder reads types that assume a browser, and esbuild bundles it before Node.js runs it. The single `tsconfig.json` at the repository root covers it, because that file carries both the DOM library and the Node.js types.
- `validate_all_adapters.ts` imports the adapter registry from `src/chrome_extension/` on purpose, and is the only file here that reaches into the extension.

## Background
- These three files lived in `src/adapter_format/` until the source folder was cut down to product code only. The reason they must stay out of a page is in [`/src/CONTEXT.md`](../../src/CONTEXT.md): bundling the schema library into a main-world content script cost about 150 kilobytes on every page for no protection at all.
- The permission audit is a lint, not a proof: it reads only the handler's own source, so a handler that calls a mutating helper defeats it. The no-network rule is the defence that does not depend on reading source.

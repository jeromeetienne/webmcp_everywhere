# Directory Context: `/tools/site_adapter`

## Purpose
The checks an adapter must pass before `npm run build` will bundle it or `npm run load-adapter` will install it: the schema it must match, the permission audit that disagrees with a wrong declaration, and the runner that applies both to every registered adapter. The folder is named after [`/packages/site_adapter`](../../packages/site_adapter/CONTEXT.md) because what is checked here is the format that package defines, whoever wrote the adapter.

## Key Exports & Entry Points
- `adapter_schema.ts`: `AdapterSchema`. The version it checks against is `ADAPTER_FORMAT_VERSION`, in [`packages/site_adapter/`](../../packages/site_adapter/CONTEXT.md), which always equals that package's own version.
- `permission_audit.ts`: `PermissionAudit` — reads handler source and disagrees with a wrong declaration.
- `validate_all_adapters.ts`: The runner. Bundled by `tools/chrome_extension/build_extension.ts` and run in Node.js, never bundled into a page.
- Command to check this folder: `npm run build`

## Rules
- Nothing in `contribs/` imports from here. This code exists so the schema library never reaches a content script, and an import from `contribs/` would undo that.
- This folder reads types that assume a browser, and esbuild bundles it before Node.js runs it. The single `tsconfig.json` at the repository root covers it, because that file carries both the DOM library and the Node.js types.
- `validate_all_adapters.ts` imports the adapter registry from `contribs/chrome_extension/` on purpose, and is the only file here that reaches into the extension.

## Background
- This folder was called `adapter_validation/` until [issue #26](https://github.com/jeromeetienne/webmcp_everywhere/issues/26) named every folder in `tools/` after the folder under `packages/` or `contribs/` whose subject it acts on. If [issue #24](https://github.com/jeromeetienne/webmcp_everywhere/issues/24) renames `packages/site_adapter`, this folder follows that rename.
- These three files lived beside the adapter format until the folder holding the product was cut down to product code only. The reason they must stay out of a page is in [`/contribs/CONTEXT.md`](../../contribs/CONTEXT.md): bundling the schema library into a main-world content script cost about 150 kilobytes on every page for no protection at all.
- The permission audit is a lint, not a proof: it reads only the handler's own source, so a handler that calls a mutating helper defeats it. The no-network rule is the defence that does not depend on reading source.
- The one mutating helper the audit does see is `PageDriving`, because every helper in `packages/site_adapter/src/toolkit/page_driving.ts` changes the page. That is a rule of [the toolkit half of that package](../../packages/site_adapter/src/toolkit/CONTEXT.md), and this pattern is only sound while it holds.

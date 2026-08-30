# Directory Context: `/tools`

## Purpose
The build and launch code with no one subject under `packages/` or `contribs/` to sit in: the connection to a running Chrome that everything driving a browser goes through, and the reports saying what a machine and each site can do.

## Key Exports & Entry Points
- `chrome_devtools_protocol/`: The connection to a running Chrome — see its own CONTEXT.md.
- `environment_reports/`: What a machine and each site can do, so a failing live check names the right cause — see its own CONTEXT.md.

## Rules
- **A tool lives inside the folder it acts on.** `contribs/chrome_extension/tools/`, `contribs/site_adapters/tools/`, `packages/site_adapter_lib/tools/`, and `packages/webmcp_everywhere/tools/`. Only a tool whose subject is neither a package nor a `contribs/` folder stays here.
- A file stays here when more than one subject reads it. `chrome_devtools_protocol/` is read by `contribs/chrome_extension/tools/` and by the runners of four subjects.
- No `.ts` file sits loose at the top of `tools/`. Every file lives in the folder for its subject.
- Nothing here ships. A file a user runs belongs in `packages/webmcp_everywhere/src/`, where it is bundled; a file name inside a packaged release is spelled once, in that package's `release_layout.ts`.
- Imports run one way only: a `tools/` folder may import from product code, and no product file may import from a `tools/` or a `tests/` folder, wherever that folder sits. `tests/repository_layout/source_boundary.test.ts` checks both directions.
- Every way of installing something has a way back, as easy to find: `contribs/site_adapters/tools/unload_adapter.ts`, `npm run uninstall:host`, `npx webmcp_everywhere uninstall`.
- Only `npm run install:host` may write into the everyday Chrome; everything else passes `isEverydayChromeCovered: false`. Why an installation announces every file first, and why installing and uninstalling share one directory list, is in [packages/webmcp_everywhere/CONTEXT.md](../packages/webmcp_everywhere/CONTEXT.md).
- Node.js runs these files directly, so they stay within erasable syntax: no `enum`, no runtime `namespace`, no parameter properties, no decorators.

## Background
- **Moving each tool folder inside the folder it acts on is [issue #28](https://github.com/jeromeetienne/webmcp_everywhere/issues/28).** [Issue #26](https://github.com/jeromeetienne/webmcp_everywhere/issues/26) had already named each folder here after its subject, which is what made the move obvious: a folder named after its subject belongs inside its subject. `tests/` was regrouped the same way first, in [issue #25](https://github.com/jeromeetienne/webmcp_everywhere/issues/25), and moved inside its subjects in the same issue #28.
- A module anything imports carries no `import.meta.filename === process.argv[1]` test. A bundle shares one `import.meta.filename` across every module inlined into it, so such a test fires for all at once; the `*_entry.ts` files exist for that.
- Loading an adapter with no rebuild, the nightly checks and the packaged release are [issue #9](https://github.com/jeromeetienne/webmcp_everywhere/issues/9). The package on npmjs is [issue #12](https://github.com/jeromeetienne/webmcp_everywhere/issues/12); what ships moving out of here is milestone 3 of [issue #11](https://github.com/jeromeetienne/webmcp_everywhere/issues/11).

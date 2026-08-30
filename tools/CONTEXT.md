# Directory Context: `/tools`

## Purpose
Everything that builds, launches, packages, or loads the product in a working copy, grouped one folder per subject, and nothing a user ever runs. What a user runs is `packages/webmcp_everywhere/`; what checks all of it is `tests/`.

## Key Exports & Entry Points
- `chrome_extension/`: Everything that turns [`/contribs/chrome_extension`](../contribs/chrome_extension/CONTEXT.md) into a running extension and puts it into a given state — build it, key it, launch a Chrome with it, grant acting, allow user scripts — see its own CONTEXT.md.
- `site_adapters/`: Everything that acts on the adapter folders under [`/contribs/site_adapters`](../contribs/site_adapters/CONTEXT.md) — write one, list them, install one, remove one, say which the nightly run checks — see its own CONTEXT.md.
- `site_adapter/`: The checks an adapter must pass, which are the checks against the format [`/packages/site_adapter`](../packages/site_adapter/CONTEXT.md) defines — see its own CONTEXT.md.
- `webmcp_everywhere/`: Everything that builds and installs what [`/packages/webmcp_everywhere`](../packages/webmcp_everywhere/CONTEXT.md) publishes, and where a working copy keeps the files a release carries beside itself — see its own CONTEXT.md.
- `chrome_devtools_protocol/`: The connection to a running Chrome, which everything driving a browser goes through — see its own CONTEXT.md.
- `environment_reports/`: What a machine and each site can do, so a failing live check names the right cause — see its own CONTEXT.md.

## Rules
- **A folder here is named after the folder under `packages/` or `contribs/` whose subject it acts on, keeping that folder's basename.** A folder whose subject is neither — `chrome_devtools_protocol/`, `environment_reports/` — keeps its own subject name.
- A folder appears when a tool needs it, never before: no tool has `packages/native_messaging_host` as its subject, so `tools/native_messaging_host/` does not exist.
- No `.ts` file sits loose at the top of `tools/`. Every file lives in the folder for its subject.
- Every way of installing something has a way back, as easy to find: `site_adapters/unload_adapter.ts`, `npm run uninstall:host`, `npx webmcp_everywhere uninstall`.
- A module anything imports carries no `import.meta.filename === process.argv[1]` test. A bundle shares one `import.meta.filename` across every module inlined into it, so such a test fires for all at once; the `*_entry.ts` files exist for that.
- Only `npm run install:host` may write into the everyday Chrome from here; everything else passes `isEverydayChromeCovered: false`. Why an installation announces every file first, and why installing and uninstalling share one directory list, is in [packages/webmcp_everywhere/CONTEXT.md](../packages/webmcp_everywhere/CONTEXT.md).
- Nothing here ships. A file a user runs belongs in `packages/webmcp_everywhere/src/`, where it is bundled; a file name inside a packaged release is spelled once, in that package's `release_layout.ts`.
- Nothing in `contribs/` or in `packages/` imports from here, which `tests/repository_layout/source_boundary.test.ts` checks. Node.js runs these files directly, so they stay within erasable syntax: no `enum`, no runtime `namespace`, no parameter properties, no decorators.

## Background
- **Naming a folder here after the source folder it acts on is [issue #26](https://github.com/jeromeetienne/webmcp_everywhere/issues/26).** It replaced [issue #22](https://github.com/jeromeetienne/webmcp_everywhere/issues/22), which grouped the same files under names invented for `tools/` alone — `build/`, `browser_control/`, `working_copy_installation/` — names appearing nowhere else in the repository. `tests/` was regrouped the same way first, in [issue #25](https://github.com/jeromeetienne/webmcp_everywhere/issues/25).
- Loading an adapter with no rebuild, the nightly checks and the packaged release are [issue #9](https://github.com/jeromeetienne/webmcp_everywhere/issues/9). The package on npmjs is [issue #12](https://github.com/jeromeetienne/webmcp_everywhere/issues/12); what ships moving out of here is milestone 3 of [issue #11](https://github.com/jeromeetienne/webmcp_everywhere/issues/11).

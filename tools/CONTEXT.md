# Directory Context: `/tools`

## Purpose
Everything that builds, launches, packages, or loads the product in a working copy, and nothing a user ever runs. What a user runs is `packages/npm_package/`; what checks all of it is `tests/`.

## Key Exports & Entry Points
- `build_extension.ts`, `package_release.ts`, `version_agreement.ts`: bundle the extension; build the four things `packages/npm_package/` cannot commit, and archive what it publishes; refuse a release whose tag, package and extension disagree. `npm run build`, `npm run package:release`, `npm run pack:npm`, `npm run check:versions`
- `new_adapter.ts`, `sync_adapter_registry.ts`, `load_adapter.ts`, `unload_adapter.ts`: scaffold an adapter folder with its runner and its documents, write the adapter list from the folders, and check an adapter folder from anywhere and install it or remove it. `npm run new-adapter`, `npm run sync:adapters`, `npm run load-adapter`, `npm run unload-adapter`
- `launch_chrome.ts`: the recipe for a Chrome that works, wherever it lives, and the waits on the registrar. `npm run chrome`
- `install_native_host_entry.ts`, `uninstall_native_host_entry.ts`, `working_copy_layout.ts`: register the host with Chrome for this working copy and take that back out. The installation itself ships, so it lives in `packages/npm_package/src/`; `working_copy_layout.ts` names this working copy's launcher, template and extension manifest, once. `npm run install:host`, `npm run uninstall:host`
- `generate_extension_key.ts`: generates the key pair that pins the extension identifier, once, by hand. Reading one back is `ExtensionIdentifier` in the package, because that half ships.
- `adapter_validation/`, `chrome_devtools_protocol/`, `environment_reports/`: the checks an adapter must pass, the connection to a running Chrome, and what a machine and each site can do — each has its own CONTEXT.md.

## Rules
- A tool writing into a hand-written file writes only between its own markers: `sync_adapter_registry.ts` in `adapter_registry.ts`, `adapter_freshness.ts` in `README.md`. Neither writes a whole file it did not generate, and nothing goes into `manifest.json`.
- `new_adapter.ts` writes no knowledge of any site. Every adapter earns its rules by probing the live site, and a scaffold that guessed a selector teaches the opposite.
- `load_adapter.ts` runs the same checks the build runs, and prints every tool with its permission class first: installing somebody else's code into your own logged-in sessions is done on purpose.
- Every way of installing something has a way back, as easy to find: `unload_adapter.ts`, `npm run uninstall:host`, `npx webmcp_everywhere uninstall`.
- A module anything imports carries no `import.meta.filename === process.argv[1]` test. A bundle shares one `import.meta.filename` across every module inlined into it, so such a test fires for all at once; the `*_entry.ts` files exist for that.
- The repository is not the published package: the root `package.json` is private, and what npm publishes is `packages/npm_package/`, whose manifest is committed there rather than written here. `package_release.ts` builds four things into that folder and nothing else.
- Nothing here ships. A file a user runs belongs in `packages/npm_package/src/`, where it is bundled; a file name inside a packaged release is spelled once, in that package's `release_layout.ts`.
- Anything reading an adapter bundles it with esbuild and runs the bundle, never parses source: adapters import with a `.js` extension, which Node.js cannot resolve from `.ts`.
- Only `npm run install:host` may write into the everyday Chrome from here; everything else passes `isEverydayChromeCovered: false`. Why an installation announces every file first, and why installing and uninstalling share one directory list, is in [packages/npm_package/CONTEXT.md](../packages/npm_package/CONTEXT.md).
- Nothing in `src/` or in `packages/` imports from here, which `tests/repository_layout/source_boundary.test.ts` checks. Node.js runs these files directly, so they stay within erasable syntax: no `enum`, no runtime `namespace`, no parameter properties, no decorators.
- Every step `LaunchChrome` takes prevents a silent failure, none is safe to drop, and all are named in [build_and_install.md](../docs/build_and_install.md).

## Background
- Every rule about launching Chrome is a failure that happened in [issue #2](https://github.com/jeromeetienne/webmcp_everywhere/issues/2) and none reports an error. The everyday Chrome and the announcement come from [issue #4](https://github.com/jeromeetienne/webmcp_everywhere/issues/4).
- Loading an adapter with no rebuild, the nightly checks and the packaged release are [issue #9](https://github.com/jeromeetienne/webmcp_everywhere/issues/9). The package on npmjs is [issue #12](https://github.com/jeromeetienne/webmcp_everywhere/issues/12); what ships moving out of here is milestone 3 of [issue #11](https://github.com/jeromeetienne/webmcp_everywhere/issues/11).

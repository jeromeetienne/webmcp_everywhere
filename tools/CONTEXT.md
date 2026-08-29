# Directory Context: `/tools`

## Purpose
Everything that builds, installs, launches, packages, or loads the product. What checks it is in `tests/`.

## Key Exports & Entry Points
- `build_extension.ts`, `package_release.ts`, `npm_command_entry.ts`, `version_agreement.ts`: bundle the extension; wrap it plus a bundled host into a folder needing no repository, with the manifest npm publishes it with; the command `npx webmcp_everywhere` starts; refuse a release whose tag, package and extension name different versions. `npm run build`, `npm run package:release`, `npm run pack:npm`, `npm run check:versions`
- `new_adapter.ts`, `sync_adapter_registry.ts`, `load_adapter.ts`, `unload_adapter.ts`: scaffold an adapter folder with its runner and its documents, write the adapter list from the folders, and check an adapter folder from anywhere and install it or remove it. `npm run new-adapter`, `npm run sync:adapters`, `npm run load-adapter`, `npm run unload-adapter`
- `launch_chrome.ts`: the recipe for a Chrome that works, wherever it lives, and the waits on the registrar. `npm run chrome`
- `install_native_host.ts`, `uninstall_native_host.ts`, `packaged_release_installation.ts`, `installation_status.ts`: register the host with Chrome and take that back out; copy a packaged release somewhere npm will not empty it and register that; ask the running system whether the extension is really there. `npm run install:host`, `npm run uninstall:host`
- `adapter_validation/`, `chrome_devtools_protocol/`, `environment_reports/`: the checks an adapter must pass, the connection to a running Chrome, and what a machine and each site can do — each has its own CONTEXT.md.

## Rules
- A tool writing into a hand-written file writes only between its own markers: `sync_adapter_registry.ts` in `adapter_registry.ts`, `adapter_freshness.ts` in `README.md`. Neither writes a whole file it did not generate, and nothing goes into `manifest.json`.
- `new_adapter.ts` writes no knowledge of any site. Every adapter earns its rules by probing the live site, and a scaffold that guessed a selector teaches the opposite.
- `load_adapter.ts` runs the same checks the build runs, and prints every tool with its permission class first: installing somebody else's code into your own logged-in sessions is done on purpose.
- Every way of installing something has a way back, as easy to find: `unload_adapter.ts`, `uninstall_native_host.ts`, `npx webmcp_everywhere uninstall`.
- A module anything imports carries no `import.meta.filename === process.argv[1]` test. A bundle shares one `import.meta.filename` across every module inlined into it, so such a test fires for all of them at once; the `*_entry.ts` files exist for that.
- The repository is not the published package: the root `package.json` is private, and `package_release.ts` writes the `build/release/package.json` npm publishes. Nothing registers Chrome against a folder npm may empty, so the command copies the release into the state directory first and names the copy.
- A file name inside a packaged release is spelled once, in `release_layout.ts`. Four programs need those names, and the fourth is where a stale one hides.
- Anything reading an adapter bundles it with esbuild and runs the bundle, never parses source: adapters import with a `.js` extension, which Node.js cannot resolve from `.ts`.
- Only `npm run install:host` and the installed `npx webmcp_everywhere` may write into the everyday Chrome; everything else passes `isEverydayChromeCovered: false`. `InstallNativeHost.plan` names every file before `run` writes one, and installing and uninstalling share the one `manifestDirectories`: a missed directory leaves Chrome starting a program the user asked it to stop.
- A packaged release carries its own launcher, bundled host and manifest template. One reaching for `src/` would pass every check here and fail for every user.
- Nothing in `src/` or in `packages/` imports from here, and nothing here writes into either, which `tests/source_boundary.test.ts` checks. Node.js runs these files directly, so they stay within erasable syntax: no `enum`, no runtime `namespace`, no parameter properties, no decorators.
- Every step `LaunchChrome` takes prevents a silent failure, none is safe to drop, and all are named in [build_and_install.md](../docs/build_and_install.md): the manifest names no site, so a page opened before the registrar has run carries no adapter.

## Background
- Every rule about launching Chrome is a failure that happened in [issue #2](https://github.com/jeromeetienne/webmcp_everywhere/issues/2) and none reports an error. The everyday Chrome and the announcement come from [issue #4](https://github.com/jeromeetienne/webmcp_everywhere/issues/4).
- Loading an adapter with no rebuild, the nightly checks and the packaged release are [issue #9](https://github.com/jeromeetienne/webmcp_everywhere/issues/9). The package on npmjs is [issue #12](https://github.com/jeromeetienne/webmcp_everywhere/issues/12).

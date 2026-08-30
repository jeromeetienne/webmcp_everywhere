# Directory Context: `/tests/repository_layout`

## Purpose
The runners that check the repository against itself: that the committed adapter registry still matches the folders, that no import crosses a boundary it must not, and that the workspace packages are what they say they are.

## Key Exports & Entry Points
- `adapter_registry_sync.test.ts`: `AdapterRegistrySyncTest` — 5 checks that the registry and the runners match the folders under `contribs/site_adapters/`, and the manifest names no site.
- `source_boundary.test.ts`: `SourceBoundaryTest` — refuses a relative import that leaves `contribs/`, or that leaves a package under `packages/`.
- `workspace_packages.test.ts`: `WorkspacePackagesTest` — 6 checks over the three packages: what each offers, which one is published, and how the two an author installs behave once packed.
- Command to check this folder: `node --test tests/repository_layout/*.test.ts`

## Rules
- Nothing here starts a browser, and all three are named by `npm run test:no_browser`.
- Nothing here mocks anything: `workspace_packages.test.ts` really packs each package and really installs the tarball, because npm links a workspace package with a symbolic link and an author outside this repository gets a real folder instead.
- A runner here reads the repository off disk rather than naming its contents in a list, so a folder added tomorrow is checked without this folder being edited. `SourceBoundaryTest._collectProductRoots` reads `packages/`; `AdapterRegistrySyncTest` reads `contribs/site_adapters/`.
- `WorkspacePackagesTest.DECIDED_PACKAGES` is the one deliberate exception to the rule above: it is a fixed list, so a fourth package fails until somebody adds it there with the reason.

## Background
- Why the workspace stopped at three packages, and what would reopen that, is in [packages/CONTEXT.md](../../packages/CONTEXT.md) and [issue #11](https://github.com/jeromeetienne/webmcp_everywhere/issues/11).
- The registry is generated and committed so a new adapter still arrives as a diff a reviewer reads — see [write_a_site_adapter.md](../../docs/write_a_site_adapter.md).

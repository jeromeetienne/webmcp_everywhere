## What this changes

<!-- One or two sentences. What is different after this is merged, and why. -->

## Every pull request

- [ ] `npm run typecheck` passes.
- [ ] `npm run build` passes, which is where every adapter review check runs.
- [ ] `npm run test:no_browser` passes.
- [ ] Every rule in the `CONTEXT.md` of each folder touched still holds, and any rule this change makes untrue has been rewritten in the same pull request.

## A pull request that adds or changes an adapter

Leave this section out if this pull request touches no adapter.

- [ ] The adapter is one folder under `src/site_adapters/`, named after the origin in `snake_case`, matching its own `siteSlug`.
- [ ] A verification runner under `tests/site_adapters/`, named after the adapter file with `_adapter` dropped, which asserts against state read back out of the live page.
- [ ] `node --test tests/site_adapters/<the runner>.test.ts` passes against the live site. Say below when you last ran it, because continuous integration does not run it on a pull request.
- [ ] The folder's `CONTEXT.md`, holding every fact the live site taught you, as a rule in the present tense.
- [ ] The folder's `README.md`, saying what an agent can do on this site and which workflows are worth asking for.
- [ ] `metadata.targetSiteVerifiedOn` is the date you last checked the adapter against the live site.
- [ ] The adapter is registered in `src/chrome_extension/shared_state/adapter_registry.ts`, and its match patterns are in all three lists in `src/chrome_extension/manifest.json`: `host_permissions`, the `MAIN` `content_scripts` entry, and the `ISOLATED` one.

**When the live check last passed, and on which Chrome version:**

<!-- For example: 2026-08-29, Chrome 151.0.7710.0. Continuous integration cannot run this, so this line is the only record of it. -->

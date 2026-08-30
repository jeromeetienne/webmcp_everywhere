# The three GitHub Actions workflows

These three files are everything this repository asks GitHub to run on its own. One answers a pull request, one drives every adapter against its real site every night, and one packages a release and publishes it.

They are split this way because a live check must never decide a merge. Driving a real Chrome against a real public site is slow, it needs Chrome 149 or later with the WebMCP origin trial, and it reports a site that changed and a broken adapter in exactly the same way. So the pull request answer starts no browser at all, and the checks that do start one run nightly, where a failure marks an adapter stale instead of refusing somebody's work.

## What is in here

- `checks_without_a_browser.yml` — the check a pull request gets an answer from. On every pull request and every push to `main` it runs `npm run typecheck`, `npm run build` and `npm run test:no_browser` on the oldest supported Node.js. It starts no browser.
- `live_checks.yml` — every adapter against its real site, at 04:20 UTC every night, one job per adapter. The job list comes from the folders under `contribs/site_adapters/`, never from a list written in the workflow. A final job writes what the night found into the freshness table in the repository `README.md` and commits it.
- `release.yml` — on a `v*` tag, it checks that the tag, the package and the extension name one version, packages the release, copies that package out of the repository and drives it in a real Chrome, and only then attaches the archive to the GitHub release and publishes the package to npmjs.

## Running it

You do not run these files on your own machine. Each check they run is an `npm` script, so run the script instead:

```bash
npm run typecheck
```

```bash
npm run build
```

```bash
npm run test:no_browser
```

`live_checks.yml` and `release.yml` both accept `workflow_dispatch`, so either can be started by hand from the Actions tab without waiting for the night or cutting a tag.

## Reading further

- The rules for editing these files are in [CONTEXT.md](../CONTEXT.md), one folder up.
- Which verification runner covers what, and why the browser checks are separate: [testing_and_verification.md](../../docs/testing_and_verification.md).
- What a contributor has to do before opening a pull request: [CONTRIBUTING.md](../../CONTRIBUTING.md).
- A check that reports nothing, and what each such failure means: [troubleshooting.md](../../docs/troubleshooting.md).

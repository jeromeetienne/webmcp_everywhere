# Directory Context: `/.github`

## Purpose
Everything GitHub itself reads: the three workflows, the issue forms, and the pull request template. Nothing here is code, nothing here is imported, and the release workflow is the only thing here that reaches a user.

## Key Exports & Entry Points
- `workflows/checks_without_a_browser.yml`: The check every pull request gets an answer from. It runs `npm run typecheck`, `npm run build`, and `npm run test:no_browser` on the oldest supported Node.js.
- `workflows/live_checks.yml`: Every adapter against its real site, nightly, one job per adapter. It writes the freshness table into the repository `README.md` and commits it.
- `workflows/release.yml`: Packages a release, drives it in a real Chrome, and only then attaches the archive to the GitHub release and publishes the package to npmjs, for a `v*` tag.
- `ISSUE_TEMPLATE/request_an_adapter.yml`: Asks a candidate site the three questions [issue #5](https://github.com/jeromeetienne/webmcp_everywhere/issues/5) judges candidates by.
- `ISSUE_TEMPLATE/an_adapter_has_stopped_working.yml`: Asks for the site, the tool, what the tool returned, and whether the read-only tools still work.
- `pull_request_template.md`: The checkboxes [CONTRIBUTING.md](../CONTRIBUTING.md) describes in prose.

## Rules
- No workflow that answers a pull request starts a browser. A live runner is slow, needs Chrome 149 or later with the WebMCP origin trial, and reports a site that changed the same way it reports a broken adapter, so it must never decide a merge. `live_checks.yml` runs those nightly instead, and a failure there marks the adapter stale.
- `live_checks.yml` takes its job list from the folders under `src/site_adapters/`, never from a list written in the workflow. Adding an adapter has to stay one folder, and a workflow naming each adapter by hand would make it one folder and one hand edit somebody forgets.
- Every job that drives a browser carries a `timeout-minutes`. A run that hangs holds a runner until the six-hour limit, which happened, cost twenty minutes of a stuck job, and had to be cancelled by hand.
- `release.yml` publishes nothing that has not been started. Both the archive and the npmjs package wait on `tests/installation/packaged_release.test.ts` having copied the release out of the repository and driven it in a real Chrome.
- `release.yml` runs `npm run check:versions` before anything slow. A package on npmjs, an extension in `chrome://extensions` and a tag naming different versions make every later report about that build unreadable.
- Publishing to npmjs needs an `NPM_TOKEN` secret and `id-token: write`, which is what attaches provenance. With no such secret the job says so and succeeds, rather than failing every release over a decision nobody has taken yet.
- The workflow names the three checks through `npm` scripts, never by repeating their commands. A check that is worth running in continuous integration is worth a contributor being able to run it the same way on their own machine.
- The workflow pins Node.js to `22.18.0`, the oldest version `package.json` says this repository runs on, because that claim is only true while something checks it.
- What a contributor must do is stated once, in [CONTRIBUTING.md](../CONTRIBUTING.md). `pull_request_template.md` is the same list as checkboxes, and nothing here explains a rule that document already explains.
- Every label an issue form names has to exist in the repository, or it is silently dropped. The two in use are `adapter request` and `adapter broken`.

## Background
- This folder did not exist until [issue #9](https://github.com/jeromeetienne/webmcp_everywhere/issues/9), milestone one. Before it, a contributor opening a pull request received no answer from any check at all, which is the failure [issue #8](https://github.com/jeromeetienne/webmcp_everywhere/issues/8) names. The nightly and release workflows are milestone four of the same issue.
- A GitHub `ubuntu-latest` runner carries Chrome 151 already, inside the WebMCP origin trial's range, and every adapted site answers it. That was measured before these workflows were written rather than assumed, and it is why no workflow here installs a browser.
- The split between the checks that need a browser and the checks that do not is described for a person in [docs/testing_and_verification.md](../docs/testing_and_verification.md), and the runners themselves are ruled by [tests/CONTEXT.md](../tests/CONTEXT.md).

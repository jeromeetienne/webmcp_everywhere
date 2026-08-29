# Directory Context: `/.github`

## Purpose
Everything GitHub itself reads: the continuous integration workflow, the issue forms, and the pull request template. Nothing here is code, nothing here is imported, and nothing here ships to a user.

## Key Exports & Entry Points
- `workflows/checks_without_a_browser.yml`: The check every pull request gets an answer from. It runs `npm run typecheck`, `npm run build`, and `npm run test:no_browser` on the oldest supported Node.js.
- `ISSUE_TEMPLATE/request_an_adapter.yml`: Asks a candidate site the three questions [issue #5](https://github.com/jeromeetienne/webmcp_everywhere/issues/5) judges candidates by.
- `ISSUE_TEMPLATE/an_adapter_has_stopped_working.yml`: Asks for the site, the tool, what the tool returned, and whether the read-only tools still work.
- `pull_request_template.md`: The checkboxes [CONTRIBUTING.md](../CONTRIBUTING.md) describes in prose.

## Rules
- No workflow here starts a browser. Everything under `tests/` except `endpoint_file.test.ts`, `native_host_install.test.ts`, and `source_boundary.test.ts` drives a real Chrome against a real public site, which is slow, needs Chrome 149 or later with the WebMCP origin trial, and reports a site that changed the same way it reports a broken adapter. Those runners are checked nightly, one job per adapter, and a failure there marks the adapter stale rather than refusing a merge.
- The workflow names the three checks through `npm` scripts, never by repeating their commands. A check that is worth running in continuous integration is worth a contributor being able to run it the same way on their own machine.
- The workflow pins Node.js to `22.18.0`, the oldest version `package.json` says this repository runs on, because that claim is only true while something checks it.
- What a contributor must do is stated once, in [CONTRIBUTING.md](../CONTRIBUTING.md). `pull_request_template.md` is the same list as checkboxes, and nothing here explains a rule that document already explains.
- Every label an issue form names has to exist in the repository, or it is silently dropped. The two in use are `adapter request` and `adapter broken`.

## Background
- This folder did not exist until [issue #9](https://github.com/jeromeetienne/webmcp_everywhere/issues/9), milestone one. Before it, a contributor opening a pull request received no answer from any check at all, which is the failure [issue #8](https://github.com/jeromeetienne/webmcp_everywhere/issues/8) names.
- The split between the checks that need a browser and the checks that do not is described for a person in [docs/testing_and_verification.md](../docs/testing_and_verification.md), and the runners themselves are ruled by [tests/CONTEXT.md](../tests/CONTEXT.md).

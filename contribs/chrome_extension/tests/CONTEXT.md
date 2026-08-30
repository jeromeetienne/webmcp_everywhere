# Directory Context: `/contribs/chrome_extension/tests`

## Purpose
The runners covering what [the extension this folder sits in](../CONTEXT.md) enforces against code and content this repository did not write: hostile content on a page, and an adapter somebody else wrote. Both subjects reach the browser through the extension, which is the only place that decides what a page is allowed to do.

## Key Exports & Entry Points
- `injection_defence.test.ts`: `InjectionDefenceTest` — attacks through hostile page content: the framing around every result, invisible characters, instruction-shaped text costing the page its acting rights, and the bound on how much one page can send.
- `loaded_adapter.test.ts`: `LoadedAdapterTest` — 5 checks that an adapter written outside here, importing the package by name, is refused when dishonest and otherwise run with no rebuild.
- Command to check this folder: `node --test --test-concurrency=1 contribs/chrome_extension/tests/*.test.ts`

## Rules
- Both drive a real Chrome, and neither is named by `npm run test:no_browser`: hostile content only means anything on a page, and a loaded adapter only means anything once it registers tools.
- `loaded_adapter.test.ts` writes its adapter folder into the system temporary directory, installs the package into it out of this clone, and removes what it installed: an adapter left in `~/.webmcp_everywhere/adapters/` would run in the browser of whoever ran the checks.
- An attack is written as page content and never as a stubbed message. A check that reached past the page would prove nothing about what a real site can do.
- The subject is the enforcement, not the framing. `shared_state/injection_watch.ts` and `page_injection/adapter_runtime.ts` are what refuse acting and clear the warning; `page_injection/external_adapter_main.ts` is what runs an outside adapter. The framing itself comes from `packages/site_adapter/src/format/untrusted_content.ts`, which these runners read through the extension rather than call.

## Background
- What the framing is for and what it does not promise is [security_model.md](../../../docs/security_model.md); what a permission class means is [permissions_and_trust.md](../../../docs/permissions_and_trust.md).
- Loading an adapter with no rebuild is [issue #9](https://github.com/jeromeetienne/webmcp_everywhere/issues/9); the format an outside adapter is written against is [`@webmcp_everywhere/site_adapter`](../../../packages/site_adapter/CONTEXT.md).
- This folder was `tests/code_from_outside/` until [issue #25](https://github.com/jeromeetienne/webmcp_everywhere/issues/25) named every runner folder after the source folder it checks, and `tests/chrome_extension/` until [issue #28](https://github.com/jeromeetienne/webmcp_everywhere/issues/28) moved each such folder inside the folder it checks.

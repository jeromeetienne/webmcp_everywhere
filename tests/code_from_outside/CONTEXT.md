# Directory Context: `/tests/code_from_outside`

## Purpose
The runners covering what arrives from outside this repository and what the extension lets it do: hostile content on a page, and an adapter somebody else wrote.

## Key Exports & Entry Points
- `injection_defence.test.ts`: `InjectionDefenceTest` — attacks through hostile page content: the framing around every result, invisible characters, instruction-shaped text costing the page its acting rights, and the bound on how much one page can send.
- `loaded_adapter.test.ts`: `LoadedAdapterTest` — 5 checks that an adapter written outside here, importing both packages, is refused when dishonest and otherwise run with no rebuild.
- Command to check this folder: `node --test --test-concurrency=1 tests/code_from_outside/*.test.ts`

## Rules
- Both drive a real Chrome, and neither is named by `npm run test:no_browser`: hostile content only means anything on a page, and a loaded adapter only means anything once it registers tools.
- `loaded_adapter.test.ts` writes its adapter folder into the system temporary directory, installs both packages into it out of this clone, and removes what it installed: an adapter left in `~/.webmcp_everywhere/adapters/` would run in the browser of whoever ran the checks.
- An attack is written as page content and never as a stubbed message. A check that reached past the page would prove nothing about what a real site can do.

## Background
- What the framing is for and what it does not promise is [security_model.md](../../docs/security_model.md); what a permission class means is [permissions_and_trust.md](../../docs/permissions_and_trust.md).
- Loading an adapter with no rebuild is [issue #9](https://github.com/jeromeetienne/webmcp_everywhere/issues/9); the format an outside adapter is written against is [`@webmcp_everywhere/adapter_format`](../../packages/adapter_format/CONTEXT.md).

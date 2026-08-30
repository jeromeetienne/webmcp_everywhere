# The extension verification runners

These runners cover what [`/contribs/chrome_extension`](../README.md) enforces against code and content this repository did not write: a hostile page, and an adapter somebody else wrote. Both reach the browser through the extension, which is the only place that decides what a page is allowed to do.

Both drive a real Chrome. Neither is in `npm run test:no_browser`, because hostile page content only means something on a real page, and a loaded adapter only means something once it registers its tools.

## What is in here

- `injection_defence.test.ts` — attacks through hostile page content: the framing around every tool result, invisible characters, text shaped like an instruction costing the page its acting rights, and the limit on how much one page can send.
- `loaded_adapter.test.ts` — 5 checks that an adapter written outside this repository, importing the package by its name, is refused when it is dishonest and otherwise runs with no rebuild.

`loaded_adapter.test.ts` writes its adapter folder into the system temporary directory and removes what it installed, so no adapter is left behind in the browser of whoever ran the checks.

## Running it

```bash
node --test --test-concurrency=1 contribs/chrome_extension/tests/*.test.ts
```

## Reading further

- The rules for editing this folder are in [CONTEXT.md](CONTEXT.md).
- What is defended and what plainly is not: [security_model.md](../../../docs/security_model.md).
- What a permission class means: [permissions_and_trust.md](../../../docs/permissions_and_trust.md).

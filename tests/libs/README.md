# The files the verification runners share

This folder holds the files under `tests/` that carry no check of their own and that more than one runner folder needs. No file here ends in `.test.ts`, so `node --test` does not try to run any of them.

## What is in here

- `live_page_harness.ts` — launches a real Chrome with the extension installed and drives one adapted page in it, from the opt-in through to calling a tool. Every site verification runner uses it, so none of them writes its own launch, opt-in, reload, tool list, or tool call.
- `host_call_types.ts` — the shapes a check sends to the native messaging host and reads back.

Nothing here stands anything in for anything else. The harness launches the real Chrome, installs the real extension, loads the real page, and calls a tool through `document.modelContext` exactly as an agent does.

## Running it

No command runs this folder: nothing here holds a check. The runners that use it are under `tests/site_adapters/` and `tests/native_messaging_host/`.

## Reading further

- The rules for editing this folder are in [CONTEXT.md](CONTEXT.md).
- The shape every runner follows: [testing_and_verification.md](../../docs/testing_and_verification.md).

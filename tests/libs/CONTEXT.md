# Directory Context: `/tests/libs`

## Purpose
The files under `tests/` that hold no check and that the runner folders share: the shapes a check sends to the native messaging host, and the live browser every site runner works against.

## Key Exports & Entry Points
- `host_call_types.ts`: `HostEndpoint`, `HttpOutcome`, `JsonRpcResponse`, `ToolCallOutcome` and `FramedResultOf` — what a check sends to the native messaging host and reads back.
- `live_page_harness.ts`: `LivePageHarness` — launches a real Chrome with the extension installed and drives one adapted page in it, from the opt-in through to calling a tool.
- No command runs this folder: nothing here holds a check.

## Rules
- No file here ends in `.test.ts`, because `node --test` finds runners by that ending and a file here holds no check.
- Nothing here mocks anything. `LivePageHarness` launches the real Chrome, installs the real extension, loads the real page, and calls a tool through `document.modelContext` exactly as an agent does.
- `tools/new_adapter.ts` writes the import of `live_page_harness.ts` into every runner it scaffolds, so moving or renaming this file means editing that generator as well. A generated runner that cannot import the harness does not run at all.
- A file belongs here once a second runner folder needs it. One used by a single folder sits in that folder instead, beside what it serves.

## Background
- Every site runner used to carry its own copy of launching Chrome, writing the opt-in, reloading the page, listing the tools and calling one, differing only in the site slug and the address. `LivePageHarness` is those five things written once — see [testing_and_verification.md](../../docs/testing_and_verification.md).
- The address and the token are two fields from two files because the native messaging host keeps them apart on purpose — see [`/src/native_messaging_host`](../../src/native_messaging_host/CONTEXT.md).

# Directory Context: `/tests/site_adapters/libs`

## Purpose
The result shapes a site verification runner compares what an adapter's tools report against. These files hold no check.

## Key Exports & Entry Points
- `todomvc_result_types.ts`: What the TodoMVC adapter's tools return, as types.
- `openstreetmap_result_types.ts`: What the OpenStreetMap adapter's tools return, as types.
- No command runs this folder: nothing here holds a check.

## Rules
- One file per site, named `<site>_result_types.ts` after the runner beside it. A site whose runner needs no shapes of its own gets no file here, which is why `caniuse.test.ts` has none.
- Nothing here is shared between sites. Shapes that cross to the native messaging host, which every runner shares, live in `tests/libs/host_call_types.ts` instead.
- `todomvc_result_types.ts` is imported from outside this folder as well, by `tests/chrome_extension/injection_defence.test.ts` and by `tests/devtools_protocol_bridge/webmcp_bridge.test.ts`, because both attack or drive the same TodoMVC page.

## Background
- These files sat beside the runners until [issue #20](https://github.com/jeromeetienne/webmcp_everywhere/issues/20) moved every file holding no check into a `libs/` folder, so that a listing of `tests/site_adapters/` is a listing of the sites checked.
- What a runner does with these shapes: [testing_and_verification.md](../../../docs/testing_and_verification.md).

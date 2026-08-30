# Directory Context: `/tests/native_messaging_host`

## Purpose
The runners covering the path [`/packages/native_messaging_host`](../../packages/native_messaging_host/CONTEXT.md) serves: in at the HTTP endpoint, across native messaging to the extension, into the page and back — and the file that tells an agent where that endpoint is.

## Key Exports & Entry Points
- `native_host.test.ts`: 10 checks over the delivery path, endpoint to page, including the bearer token, the permission classes, two tabs on one site, and opening and closing a page.
- `endpoint_file.test.ts`: `EndpointFileTest` — 10 checks that `endpoint.json` always names a host really listening, across two hosts contending for the port, a killed browser, and a stranger holding the port.
- Command to check this folder: `node --test --test-concurrency=1 tests/native_messaging_host/*.test.ts`

## Rules
- `endpoint_file.test.ts` starts no browser and is named by `npm run test:no_browser`; `native_host.test.ts` drives a real Chrome. They cover the same path from two ends, so a failure in one narrows the other.
- Nothing is stood in for. The hosts `endpoint_file.test.ts` starts are the real program, over a real pipe, holding a real port, writing the real file into a throwaway `WEBMCP_EVERYWHERE_STATE_DIR` so the checks never disturb the host you are really using.
- The one rule `endpoint_file.test.ts` holds to: whenever `endpoint.json` is there, the address in it answers, and the process named in it is the process answering.

## Background
- The host program these two check is [`/packages/native_messaging_host`](../../packages/native_messaging_host/CONTEXT.md), and why it exists at all is [why_a_native_messaging_host.md](../../docs/why_a_native_messaging_host.md).
- The fault that hid longest was a host whose standard input never reached its end, which is why the host watches its parent process as well — [issue #2](https://github.com/jeromeetienne/webmcp_everywhere/issues/2).
- This folder was `tests/delivery_path/` until [issue #25](https://github.com/jeromeetienne/webmcp_everywhere/issues/25), which also says why `native_host.test.ts` sits here rather than with the extension: it enters at the HTTP endpoint, and splitting it from `endpoint_file.test.ts` would lose the pairing above.

# The delivery path verification runners

These runners cover the path [`/packages/native_messaging_host`](../../packages/native_messaging_host/README.md) serves: in at the HTTP endpoint, across native messaging to the extension, into the page, and back out again — and the file that tells an agent where that endpoint is.

The two cover the same path from two ends, so a failure in one narrows down the other.

## What is in here

- `native_host.test.ts` — 10 checks over the whole delivery path, endpoint to page: the bearer token, the permission classes, two tabs on one site, and opening and closing a page. This one drives a real Chrome.
- `endpoint_file.test.ts` — 10 checks that `endpoint.json` always names a host that is really listening, across two hosts contending for the port, a killed browser, and a stranger holding the port. This one starts no browser and is in `npm run test:no_browser`.

Nothing is stood in for. The hosts `endpoint_file.test.ts` starts are the real program, over a real pipe, holding a real port, writing the real file into a throwaway state directory so your own running host is never disturbed.

## Running it

```bash
node --test --test-concurrency=1 tests/native_messaging_host/*.test.ts
```

## Reading further

- The rules for editing this folder are in [CONTEXT.md](CONTEXT.md).
- Why the native messaging host exists at all: [why_a_native_messaging_host.md](../../docs/why_a_native_messaging_host.md).
- One tool call followed from the agent's request to the page and back: [tool_call_lifecycle.md](../../docs/tool_call_lifecycle.md).

# The Chrome DevTools Protocol connection

This folder holds the one WebSocket connection to a Chrome running on this machine, spoken over the Chrome DevTools Protocol. Everything in this repository that has to drive a real browser — launch it, put it into a given state, or read something back out of it — goes through here.

Nothing in this folder ships to a user, and nothing a user runs reaches a browser this way. The product reaches the browser through the native messaging host, in [`/packages/native_messaging_host`](../../packages/native_messaging_host/README.md), because the debugging port this folder speaks to is unauthenticated and every process on the machine can reach it.

## What is in here

- `cdp_client.ts` — connects to the browser or to one page, sends a command, and waits for the answer. Every command carries a deadline.
- `service_worker_evaluation.ts` — waits for the extension's background service worker and evaluates an expression inside it. A Manifest Version 3 service worker is stopped while idle, so this finds the worker again and retries rather than holding on to it.

## Running it

There is no command for this folder on its own. It is a library. The commands that use it are `npm run chrome`, `npm run grant`, and every verification runner under `tests/` that drives a browser.

## Reading further

- The rules for editing this folder are in [CONTEXT.md](CONTEXT.md).
- Why the Chrome DevTools Protocol path is not the product: [why_a_native_messaging_host.md](../../docs/why_a_native_messaging_host.md).

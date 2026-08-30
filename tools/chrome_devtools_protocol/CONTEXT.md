# Directory Context: `/tools/chrome_devtools_protocol`

## Purpose
One WebSocket connection to a locally running Chrome, spoken over the Chrome DevTools Protocol. Everything that has to drive a real browser — launching it, granting a permission, or checking it — goes through here.

## Key Exports & Entry Points
- `cdp_client.ts`: `CdpClient` — connects to the browser or to one page, sends a command, and waits for the answer.
- `service_worker_evaluation.ts`: `ServiceWorkerEvaluation` — waits for the extension's background service worker, and evaluates an expression inside it.

## Rules
- This connects to a local Chrome on the loopback interface and to nothing else.
- `Page.addScriptToEvaluateOnNewDocument` is dropped when the client that added it disconnects, so add the script and navigate on one connection.
- Every command carries a deadline, and a socket that closes rejects everything still waiting on it. A command with neither made a continuous integration run hang for twenty minutes with nothing to read, and it had to be cancelled by hand.
- Nothing that evaluates in the background service worker assumes the worker is running. A Manifest V3 service worker is stopped while idle and started again on demand, so `ServiceWorkerEvaluation` finds the target again and retries rather than holding a reference.
- Nothing in `contribs/` imports from here. The debugging port this speaks to is unauthenticated and reachable by every process on the machine, which is why the product reaches the browser through the native messaging host instead.

## Background
- This file sat inside the folder holding the product until that folder was cut down to product code only. It is shared by `contribs/chrome_extension/tools/launch_chrome.ts`, `contribs/chrome_extension/tools/grant_acting.ts`, and several verification runners in `tests/`, which is why it lives in `tools/` rather than in `tests/`.

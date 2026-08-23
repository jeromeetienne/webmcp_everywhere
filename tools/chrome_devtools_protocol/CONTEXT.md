# Directory Context: `/tools/chrome_devtools_protocol`

## Purpose
One WebSocket connection to a locally running Chrome, spoken over the Chrome DevTools Protocol. Everything that has to drive a real browser — launching it, granting a permission, or checking it — goes through here.

## Key Exports & Entry Points
- `cdp_client.ts`: `CdpClient` — connects to the browser or to one page, sends a command, and waits for the answer.

## Rules
- This connects to a local Chrome on the loopback interface and to nothing else.
- `Page.addScriptToEvaluateOnNewDocument` is dropped when the client that added it disconnects, so add the script and navigate on one connection.
- Nothing in `src/` imports from here. The debugging port this speaks to is unauthenticated and reachable by every process on the machine, which is why the product reaches the browser through the native messaging host instead.

## Background
- This file sat in `src/devtools_protocol_bridge/` until the source folder was cut down to product code only. It is shared by `tools/launch_chrome.ts`, `tools/grant_acting.ts`, and several verification runners in `tests/`, which is why it lives in `tools/` rather than in `tests/`.

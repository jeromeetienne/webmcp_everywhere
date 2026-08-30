# Directory Context: `/contribs/chrome_extension/user_interface`

## Purpose
The popup a person opens from the toolbar: it shows which adapter matched the current tab, which tools an agent can currently call, and lets a person grant acting, switch one adapter on or off, pull the kill switch, and clear an injection sighting.

## Key Exports & Entry Points
- `popup.html`: The page `manifest.json` opens as `default_popup`. Its one script tag points at `../dist/popup.js`, because every entry point bundles to a flat `dist/` at the top of the extension folder.
- `popup.ts`: Reads the current tab, asks the background script for the adapters, renders the page, and writes the settings back.

## Rules
- This folder imports only from `shared_state/`. It never imports a content script or the background script.
- Every state a person can change here is written through `ExtensionStorage`, never straight to `chrome.storage`, so one file holds the shape of a grant.
- The adapter list names every loaded adapter's author and the folder it came from, and says why a withheld adapter is withheld. A person switching on somebody else's code needs to see whose code it is.

## Background
- Clearing an injection sighting is deliberately a person's action, not an automatic timeout — see the injection rules in [`../shared_state/CONTEXT.md`](../shared_state/CONTEXT.md).

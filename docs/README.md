# The WebMCP Everywhere documentation

This folder explains how WebMCP Everywhere works. The repository README.md says what the project is and how to start it; every explanation lives here.

Read them in this order the first time.

1. [architecture_overview.md](architecture_overview.md) — the four parts of WebMCP Everywhere and how a tool call travels between them. Read this first; every other document assumes it.
2. [why_a_native_messaging_host.md](why_a_native_messaging_host.md) — why a Chrome extension cannot hold the port itself, and why the Chrome DevTools Protocol path is not the product.
3. [tool_call_lifecycle.md](tool_call_lifecycle.md) — one tool call followed from the agent's request to the page and back, through every execution context it crosses.
4. [tool_naming_and_tab_identity.md](tool_naming_and_tab_identity.md) — how a tool gets its name, and how two tabs on the same site are told apart.
5. [adapter_format.md](adapter_format.md) — what a site adapter is, and the checks every adapter must pass before it reaches a browser.
6. [write_a_site_adapter.md](write_a_site_adapter.md) — the task-shaped guide to covering a site, in a folder of your own or in this repository.
7. [permissions_and_trust.md](permissions_and_trust.md) — why acting tools are withheld until you opt in, where that decision is made, and what you agree to when you load an adapter nobody here reviewed.
8. [security_model.md](security_model.md) — what is defended, and what plainly is not.
9. [testing_and_verification.md](testing_and_verification.md) — the three paths to the browser, and which verification runner covers which.
10. [build_and_install.md](build_and_install.md) — what the build writes, what the installation registers with Chrome, and how a throwaway Chrome is launched.
11. [troubleshooting.md](troubleshooting.md) — the failures that report nothing, and what each one actually means.

## What is not here

The rules a person has to follow when editing the code are in the `CONTEXT.md` file of each folder, not in this documentation. A `CONTEXT.md` file says what must hold now for the code in that folder; a document here says how the whole thing works and why it was built this way.

What each adapter can do on its own site is in that adapter's own README.md, next to the adapter.

- [The Playwright TodoMVC adapter](../src/site_adapters/demo_playwright_dev/README.md)
- [The Can I use... adapter](../src/site_adapters/caniuse_com/README.md)
- [The OpenStreetMap adapter](../src/site_adapters/openstreetmap_org/README.md)

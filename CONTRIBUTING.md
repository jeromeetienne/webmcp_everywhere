# Contributing to WebMCP Everywhere

The point of this project is that other people write the adapters. This repository keeps the engine and a small number of example adapters, and the catalogue is meant to grow from other people's work rather than from the maintainer.

## You do not need this repository to write an adapter

Read this before anything else, because it is the shortest path and most contributors want it rather than a pull request.

An adapter can live in a folder of your own, in a repository of your own, with your name on it. You write it, run `npm run load-adapter -- <your folder>`, switch it on in the extension's popup, and your agent has its tools. Nothing is merged here, nothing is rebuilt, and nobody waits for a review — not even you waiting for the maintainer. [docs/write_a_site_adapter.md](docs/write_a_site_adapter.md) is the guide, and [docs/permissions_and_trust.md](docs/permissions_and_trust.md) says what a person is agreeing to when they load one.

That is the ordinary way to cover a site. Everything below is about the smaller number of changes that do belong in this repository.

## What this project takes

- **A fix or an improvement to the engine**: the adapter format, the extension, the native messaging host, the build, the loading commands, or the verification runners. This is the main one now that an adapter needs no merge here.
- **An adapter for a site nobody has covered**, where it earns its place as an example of a technique the three existing adapters do not show. The bundled adapters are examples, not a catalogue; an adapter that covers a site well but shows nothing new is better as a repository of your own. Read [Before you write an adapter](#before-you-write-an-adapter) first either way, because two of the three questions there have already dropped sites that looked like good candidates, and they apply to an adapter of your own just as much.
- **A repair to one of the adapters in this repository, whose site changed under it.** Sites change and adapters break. Open [an adapter has stopped working](https://github.com/jeromeetienne/webmcp_everywhere/issues/new?template=an_adapter_has_stopped_working.yml) or send the repair.
- **A correction to the documentation.** Anything in `docs/` that is wrong or out of date is worth a pull request on its own.

## The licence of what you send

This project is under the MIT licence, in [LICENSE](LICENSE). By sending a pull request you agree that your contribution is published under the same licence. There is no separate agreement to sign.

## Before you write an adapter

A site is worth an adapter only where a browser session gives an agent something no public interface will. The three questions below are the ones every candidate in [issue #5](https://github.com/jeromeetienne/webmcp_everywhere/issues/5) was judged against.

1. **What does a browser session give here that a public interface will not?** The three answers that have counted so far are the view you are actually looking at, the session you are actually signed in to, and the queries the site already composes for you. A site with a free public interface is still a candidate, but only for the part that interface does not serve.
2. **Does the site already ship its own WebMCP tools?** A site that does is the outcome this project wants, not a gap to fill. An adapter for it would be refused, and its yield condition would stand it down anyway.
3. **Do the terms of the site forbid navigating it with an automated tool?** An adapter navigates the site automatically. Where the terms forbid that, the site is not a candidate at all.

You do not have to open an issue before sending a pull request. Opening [request an adapter for a site](https://github.com/jeromeetienne/webmcp_everywhere/issues/new?template=request_an_adapter.yml) is the cheap way to find out that a site is not a candidate before you spend a day on it.

## How to write one for this repository

Start with the scaffold, which writes the folder, the runner, the two documents, and the registration, all of it already passing the build and the live check.

```bash
npm run new-adapter -- https://example.com
```

For an adapter of your own, outside this repository, there is no scaffold: copy one of the three folders below into a folder of your own, edit it, and load it with `npm run load-adapter`.

[docs/write_a_site_adapter.md](docs/write_a_site_adapter.md) is the guide, in the order to do things in. Read [docs/adapter_format.md](docs/adapter_format.md) first for what an adapter is.

The three existing adapters are examples, and each carries a `README.md` and a `CONTEXT.md` beside it. Read at least one of them before writing your own.

- [The Playwright TodoMVC adapter](contribs/site_adapters/demo_playwright_dev/README.md) — the smallest one, and the one every engine milestone was written against.
- [The Can I use... adapter](contribs/site_adapters/caniuse_com/README.md) — reads data the rendered page does not show.
- [The OpenStreetMap adapter](contribs/site_adapters/openstreetmap_org/README.md) — the largest one, split across several files.

## What a pull request must carry

The pull request template asks for these as checkboxes. A pull request that adds an adapter carries all of them; a pull request that changes the engine carries the first group only.

**Every pull request**

- `npm run typecheck` passes.
- `npm run build` passes, which is where every adapter review check runs.
- `npm run test:no_browser` passes.
- Every rule in the `CONTEXT.md` of each folder you touched still holds. A rule your change makes untrue is rewritten in the same pull request.

**A pull request that adds an adapter**

- The adapter, as one folder under `contribs/site_adapters/`.
- A verification runner under the adapter folder's own `tests/` that asserts against state read back out of the live page.
- That runner passing against the live site, with the date and the Chrome version written into the pull request. Continuous integration cannot run it, so that line is the only record of it.
- The folder's `CONTEXT.md` and the folder's `README.md`.
- The registration, which `npm run sync:adapters` writes for you and which is committed alongside your folder.

`npm run new-adapter` writes all five, so the folder is the only thing you add by hand. The registration used to be four hand edits, and forgetting one of them registered an adapter that never ran; `node --test tests/repository_layout/adapter_registry_sync.test.ts` now refuses a working copy where the committed registry and the folders disagree.

## Running the checks

You need Google Chrome 149 or later and Node.js 22.18.0 or later. The WebMCP origin trial runs from Chrome 149 to Chrome 156.

Install the dependencies once.

```bash
npm install
```

The checks that need no browser. These are the ones continuous integration runs, and they answer in about a minute.

```bash
npm run typecheck
```

```bash
npm run build
```

```bash
npm run test:no_browser
```

The checks that drive a real Chrome against the real live site. Everything else in `tests/` is one of these, and they are the ones that actually prove an adapter works.

```bash
npm test
```

```bash
npm run test:visible
```

One runner alone, which is what you want while writing an adapter.

```bash
node --test contribs/site_adapters/demo_playwright_dev/tests/todomvc.test.ts
```

Which runner covers what, and which one to reach for when a check fails, is in [docs/testing_and_verification.md](docs/testing_and_verification.md).

## What continuous integration runs, and what it does not

Continuous integration runs `npm run typecheck`, `npm run build`, and `npm run test:no_browser`, on every pull request. See [.github/workflows/checks_without_a_browser.yml](.github/workflows/checks_without_a_browser.yml).

It does not run anything that starts a browser on a pull request. Those runners drive the real public site, so they are slow, they need Chrome 149 or later with the WebMCP origin trial, and they report a site that changed and a broken adapter in the same way. **Running the live check for your adapter is your job, and saying in the pull request when you last ran it is part of the contribution.**

Two other workflows run away from pull requests. [live_checks.yml](.github/workflows/live_checks.yml) drives every adapter against its real site every night and writes the freshness table into [README.md](README.md), so a stale adapter is visible before somebody's agent gets a wrong answer; it refuses no merge, because the usual cause is the site. [release.yml](.github/workflows/release.yml) packages a release, drives it in a real Chrome, and only then attaches the archive to the release for a `v*` tag.

## Following the conventions of the repository

- **Every folder has a `CONTEXT.md`** holding the rules for editing that folder. Read the one for any folder you touch, before you touch it. It is short, and every rule in it is a failure somebody already had.
- **The `.test.ts` ending marks a file that holds checks.** A file with no check keeps a plain name.
- **`contribs/` and every package under `packages/` hold the product and nothing else.** The tooling and the runners for a folder sit in a `tools/` or a `tests/` folder inside it; no product file imports from either, and `node --test tests/repository_layout/source_boundary.test.ts` refuses that as well as a relative import that leaves the folder it is written in.
- **No adapter may reach the network**, wherever it lives. `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `navigator.sendBeacon`, and a dynamic import are each refused, by `npm run build` and by `npm run load-adapter` alike.
- **Use `@webmcp_everywhere/site_adapter_lib` rather than writing the same page helper again.** Waiting for a page and writing into an input field are already solved in its `src/toolkit/` half, and a helper any second site would need belongs there rather than in your own folder. An adapter outside this repository installs that one package rather than copying anything out of it.
- **Match the code that is already there** for indentation, naming, and the way a file is laid out. There is no style document; the existing files are the style, and the adapter nearest to what you are writing is the one to copy.
- **Never wrap a paragraph in a document at a fixed column.** One paragraph is one line.

## Prove the assumption before you build on it

Before writing code that rests on something outside this repository behaving a particular way — a Chrome interface, a site's markup, a transport — name the one assumption that would make the work impossible, and settle it with the smallest live check against the real thing. Not a headless stand-in for the real transport, not an empty page standing in for a real one. A check that did not exercise the actual constraint has not passed, whatever it printed.

Milestone 3 of [issue #9](https://github.com/jeromeetienne/webmcp_everywhere/issues/9) is the worked example: six live probes established what Chrome actually allows — that `chrome.userScripts` is absent until a per-extension switch is on, that `chrome.permissions.request` never settles without a user gesture — before any of the loading code was written, and one of those probes changed the design.

## Where this project is going

[Issue #8](https://github.com/jeromeetienne/webmcp_everywhere/issues/8) lists what was missing before somebody who is not the maintainer could write an adapter and use it without waiting for a merge here. [Issue #9](https://github.com/jeromeetienne/webmcp_everywhere/issues/9) is the plan for it, and milestones 1 to 3 of it are done. Reading both is the fastest way to see what is worth working on.

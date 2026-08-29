# WebMCP Everywhere

A browser extension carrying community-maintained WebMCP adapters — small scripts that register tools
into sites that never shipped their own. Install it, point any agent at one local address, and that
agent gains real tools on the sites you already have open.

You need Google Chrome 149 or later, and Node.js 20 or later. The WebMCP origin trial runs from Chrome
149 to Chrome 156.

## Install it

```bash
npx webmcp_everywhere
```

If you unzipped this folder from a release rather than installing from npm, run the same command out of
the folder instead:

```bash
node webmcp_everywhere.mjs
```

Either way it copies this folder to `~/.webmcp_everywhere/installation`, and registers the native
messaging host so that an agent can reach the browser. It names every path before it writes one. The
copy is the point: whatever folder you ran it from may be moved, unzipped again, or emptied by npm, and
Chrome keeps an absolute path for both an unpacked extension and a native messaging host.

From then on Chrome starts `webmcp_native_host.sh` out of the installation folder, as a separate
operating system process outside the browser sandbox, with your rights.

One step is left, and only you can take it. Chrome loads an unpacked extension by hand:

1. Open `chrome://extensions` and turn on **Developer mode**.
2. Choose **Load unpacked**, and select `~/.webmcp_everywhere/installation/chrome_extension`.

Then point your agent at `http://127.0.0.1:8765/mcp`, with the bearer token from
`~/.webmcp_everywhere/token`.

## Check it is working

```bash
npx webmcp_everywhere status
```

It asks the running system rather than looking for the extension in Chrome's own files, so it answers
about what an agent would really receive: whether a browser is holding the port, whether the extension
is connected to it, and which adapters are offering tools in which tabs. It exits 1 when no tools are
reaching your agent, and says which step to go and fix. Installing ends with the same answer.

## Take it back out

```bash
npx webmcp_everywhere uninstall
```

That removes the registration and the installation folder, and prints what it removed. Your bearer token
and any adapters you loaded are left alone. Remove the extension itself at `chrome://extensions`.

## What it does, and what it does not

Read the security model and the permissions before you let an agent act on a site: https://github.com/jeromeetienne/webmcp_everywhere/blob/main/docs/security_model.md

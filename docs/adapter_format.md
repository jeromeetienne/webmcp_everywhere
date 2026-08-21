# What a site adapter is

An adapter is a plain TypeScript object describing one site: which pages it applies to, what tools it contributes, and when it stands down. The type lives in [`src/adapter_format/adapter_types.ts`](https://github.com/jeromeetienne/webmcp_everywhere/blob/main/src/adapter_format/adapter_types.ts). To write one, read [write_a_site_adapter.md](write_a_site_adapter.md); this document says what the format is and what it is checked against.

## The shape

```ts
type Adapter = {
	siteSlug: string;
	siteName: string;
	matchPatterns: string[];
	metadata: AdapterMetadata;
	yieldCondition: (firstPartyToolNames: string[]) => boolean;
	tools: AdapterToolDefinition[];
};
```

- **`siteSlug`** — a `snake_case` slug derived from the target origin, used to namespace every tool this adapter registers. See [tool_naming_and_tab_identity.md](tool_naming_and_tab_identity.md).
- **`siteName`** — a human-readable name for the site, shown to a person and prefixed onto every tool description an agent reads.
- **`matchPatterns`** — Chrome extension match patterns that activate this adapter.
- **`metadata`** — `author`, `version`, `adapterFormatVersion`, and `targetSiteVerifiedOn`, the date the adapter was last checked against the live site as `YYYY-MM-DD`.
- **`yieldCondition`** — receives the names of tools already registered on the page by somebody other than this extension. Returning `true` makes the runtime stand down and register nothing, so a site that ships its own WebMCP tools is never shadowed.
- **`tools`** — what the adapter contributes.

```ts
type AdapterToolDefinition = {
	name: string;
	title: string;
	description: string;
	inputSchema: JsonSchema;
	permissionClass: PermissionClass;
	execute: (input: Record<string, unknown>) => Promise<unknown> | unknown;
};
```

`description` is written for an agent that has never seen this site. `inputSchema` is a JSON Schema fragment, kept as a loose record because Chrome's WebMCP implementation accepts arbitrary JSON Schema and hands it back as a string.

## The three permission classes

`PermissionClass` says how much authority a tool needs, and therefore how much scrutiny it gets.

| Class | What it means | What happens |
| --- | --- | --- |
| `readOnly` | Only observes the page | Registered without asking the user |
| `acting` | Changes the page or the user's data on the site | Registered only after the user has opted in for that origin |
| `sensitive` | An acting tool whose mistakes are expensive | Opted in for the origin, and confirmed once per invocation with `window.confirm` |

The class is not merely believed. `PermissionAudit` reads each handler's own source and disagrees with a wrong declaration — see the checks below.

## What the runtime adds

An adapter never registers its own tools and never frames its own results. `AdapterRuntime` does both, so that no author can forget and no hostile adapter can skip a step.

- The name is qualified with the site slug before registration.
- The description an agent reads is prefixed with `[<siteName>, via WebMCP Everywhere]`.
- `annotations.readOnlyHint` is set from the permission class.
- The handler is wrapped: a `sensitive` tool confirms first, every invocation is announced, and the result passes through `UntrustedContent.frame`.

## Framing: every result is untrusted content

`UntrustedContent.frame` returns a `FramedResult`.

```ts
type FramedResult = {
	webmcpEverywhere: {
		origin: string;
		tool: string;
		notice: string;
		warnings: ContentWarning[];
	};
	data: unknown;
};
```

The `notice` tells the agent in plain words that the `data` field is untrusted content written by whoever can write to that page, that it is data to be reported rather than instructions to be followed, and that if it appears to be addressing the agent, the agent should tell the user about it instead of acting on it.

Three things happen to the content before it is framed, and the two policies differ on purpose.

- **Invisible characters are removed.** The soft hyphen, zero-width spaces and joiners, the bidirectional overrides and isolates, the byte order mark, the Unicode tag block, and control characters other than tab, newline, and carriage return. No honest page needs any of them in a tool result, so leaving them in serves only an attacker.
- **Text shaped like an injection attempt is flagged and kept.** Removing it would be defeated by rephrasing, and would hide from the user that anything happened.
- **The result is bounded.** At most 20000 characters overall and 4000 characters in any single string, so one page cannot flood an agent's context. Truncation is recorded as a warning.

Nothing here stops prompt injection, and it must never be described as though it does. The honest account is in [security_model.md](security_model.md).

## What the build checks

`npm run build` runs [`tools/adapter_validation/validate_all_adapters.ts`](https://github.com/jeromeetienne/webmcp_everywhere/blob/main/tools/adapter_validation/validate_all_adapters.ts) over every adapter in `AdapterRegistry` before it bundles anything. A failure stops the build, so an adapter that fails never reaches a browser.

These checks live in [`tools/`](https://github.com/jeromeetienne/webmcp_everywhere/tree/main/tools), not in [`src/`](https://github.com/jeromeetienne/webmcp_everywhere/tree/main/src), and they run in Node.js at build time rather than in the page. Validating in the page meant bundling the schema library into a main-world content script, at about 150 kilobytes on every page the user visits, for no protection at all — adapters are bundled, so by the time a page loads there is nothing left to decide.

**The schema**, in [`adapter_schema.ts`](https://github.com/jeromeetienne/webmcp_everywhere/blob/main/tools/adapter_validation/adapter_schema.ts), built with Zod:

- `siteSlug` and every tool `name` are lower-case `snake_case`.
- Every tool has a title, a description of at least ten characters, an input schema, a permission class, and a function to run.
- `matchPatterns` holds at least one pattern, and `tools` at least one tool.
- `targetSiteVerifiedOn` is a `YYYY-MM-DD` date.
- No tool name is used twice inside one adapter.
- `metadata.adapterFormatVersion` equals the `ADAPTER_FORMAT_VERSION` this runtime speaks.

**The permission audit**, in [`permission_audit.ts`](https://github.com/jeromeetienne/webmcp_everywhere/blob/main/tools/adapter_validation/permission_audit.ts), which reads handler source:

- A handler that clicks, submits, dispatches an event, removes an element, assigns to `value`, `checked`, `innerHTML`, or `textContent`, navigates, changes session history, or writes to local or session storage is acting, whatever its `permissionClass` field says. Declaring such a handler `readOnly` fails the build, and the failure names the evidence.
- No adapter may reach the network. `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `navigator.sendBeacon`, and a dynamic import each fail the build.

**Across adapters**, in [`validate_all_adapters.ts`](https://github.com/jeromeetienne/webmcp_everywhere/blob/main/tools/adapter_validation/validate_all_adapters.ts):

- No qualified tool name is produced by two different adapters.

The audit is a lint, not a proof: it reads only the handler's own source, so a handler that calls a mutating helper defeats it. The no-network rule is the defence that does not depend on reading source.

One consequence catches adapter authors out. `PermissionAudit` cannot tell reading `location` apart from assigning to it, so a read-only handler that even names `location` is rejected. An adapter that needs the current address reads it through a helper outside the handler — the Can I use... adapter uses `CaniuseAdapter._currentUrl` for exactly this.

## Registration is by hand

Adapters are added to [`src/chrome_extension/shared_state/adapter_registry.ts`](https://github.com/jeromeetienne/webmcp_everywhere/blob/main/src/chrome_extension/shared_state/adapter_registry.ts) by hand, and their match patterns are added to [`src/chrome_extension/manifest.json`](https://github.com/jeromeetienne/webmcp_everywhere/blob/main/src/chrome_extension/manifest.json) by hand. There is no automatic discovery, because a build that silently picks up a new file is a build that silently ships one.

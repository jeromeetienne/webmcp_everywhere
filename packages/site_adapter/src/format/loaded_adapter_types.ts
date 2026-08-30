///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	LoadedAdapterTypes — an adapter that came from a folder rather than from this build
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

import type { AdapterMetadata, PermissionClass } from './adapter_types.ts';

/**
 * One tool of a loaded adapter, described without its handler.
 *
 * The handler cannot cross from the native messaging host to the extension: it is a function, and
 * native messaging carries JSON. It travels inside the bundled source instead, and this is what the
 * popup shows the user before they switch the adapter on.
 */
export type LoadedToolSummary = {
	/** The unqualified tool name. */
	name: string;
	/** The short human-readable name. */
	title: string;
	/** What the tool does. */
	description: string;
	/** How much authority the tool needs, as the review checks in the host confirmed it, not as declared. */
	permissionClass: PermissionClass;
};

/**
 * An adapter read from a folder outside this repository, checked and bundled by the native messaging host.
 *
 * Everything here has already passed the same checks `npm run build` runs over a bundled adapter: the
 * schema, the permission audit, and the refusal of any network egress. The extension never decides
 * whether an adapter is acceptable by reading its code, because it cannot run code to find out; the
 * host, which is Node.js and already runs those checks, decides and sends only what passed.
 */
export type LoadedAdapter = {
	/** The `snake_case` slug that namespaces every tool this adapter registers. */
	siteSlug: string;
	/** The human-readable name of the site. */
	siteName: string;
	/** The match patterns that activate it. */
	matchPatterns: string[];
	/** Provenance and versioning, as the adapter declares it. */
	metadata: AdapterMetadata;
	/** The tools it contributes, for the popup to show before the user switches it on. */
	tools: LoadedToolSummary[];
	/** The folder it was read from, so the user can see whose code this is. */
	sourceFolder: string;
	/**
	 * The adapter, bundled into one immediately invoked function expression that assigns itself to
	 * `globalThis.__webmcpEverywhereLoadedAdapter`. The extension registers this as a user script and
	 * never reads it.
	 */
	source: string;
};

/** The name a loaded adapter's bundle assigns itself to in the page's main world. */
export const LOADED_ADAPTER_GLOBAL = '__webmcpEverywhereLoadedAdapter';

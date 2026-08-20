///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	AdapterTypes — the shape of a WebMCP Everywhere adapter
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/**
 * How much authority a tool needs, and therefore how much scrutiny it gets.
 *
 * - `readOnly` only observes the page and is registered without asking the user.
 * - `acting` changes the page or the user's data on the site, and is registered only after the user
 *   has opted in for that origin.
 * - `sensitive` is an acting tool whose mistakes are expensive, and is confirmed once per invocation.
 */
export type PermissionClass = 'readOnly' | 'acting' | 'sensitive';

/**
 * A JSON Schema fragment describing a tool's input. Kept as a loose record because the WebMCP
 * implementation in Chrome accepts arbitrary JSON Schema and hands it back as a string.
 */
export type JsonSchema = Record<string, unknown>;

/**
 * One tool an adapter contributes to a page.
 */
export type AdapterToolDefinition = {
	/**
	 * The unqualified tool name, in `snake_case`, unique inside this adapter. The runtime prefixes it
	 * with the adapter's `siteSlug` before registering, so this name never has to be globally unique.
	 */
	name: string;
	/** A short human-readable name shown in user interfaces that display tools. */
	title: string;
	/** What the tool does, written for an agent that has never seen this site. */
	description: string;
	/** JSON Schema for the tool's input object. Use an empty properties object for tools taking no input. */
	inputSchema: JsonSchema;
	/** How much authority this tool needs. Verified by the review checks, not merely trusted. */
	permissionClass: PermissionClass;
	/**
	 * The page interaction itself. Receives the parsed input object and returns any JSON-serialisable
	 * value. Must never reach the network; adapters read and drive their own page only.
	 */
	execute: (input: Record<string, unknown>) => Promise<unknown> | unknown;
};

/**
 * Provenance and versioning for one adapter, shown to a user deciding whether to trust it.
 */
export type AdapterMetadata = {
	/** Who wrote this adapter. */
	author: string;
	/** The adapter's own version, independent of the target site. */
	version: string;
	/** Which version of the adapter format this adapter is written against. */
	adapterFormatVersion: string;
	/** The date the adapter was last verified against the live site, as `YYYY-MM-DD`. */
	targetSiteVerifiedOn: string;
};

/**
 * A complete adapter: which pages it applies to, what tools it contributes, and when it stands down.
 */
export type Adapter = {
	/**
	 * A `snake_case` slug derived from the target origin, used to namespace every tool this adapter
	 * registers. Two sites that both want a `search` tool depend on this to avoid colliding.
	 */
	siteSlug: string;
	/** A human-readable name for the site this adapter targets. */
	siteName: string;
	/** Match patterns, in Chrome extension match pattern syntax, that activate this adapter. */
	matchPatterns: string[];
	/** Provenance and versioning. */
	metadata: AdapterMetadata;
	/**
	 * Decides whether the site already speaks WebMCP for itself. Receives the names of tools that were
	 * already registered on the page by someone other than this extension. Returning `true` makes the
	 * runtime stand down and register nothing, so a first-party tool surface is never shadowed.
	 */
	yieldCondition: (firstPartyToolNames: string[]) => boolean;
	/** The tools this adapter contributes. */
	tools: AdapterToolDefinition[];
};

/**
 * Which tools the user has allowed on a given origin. Read-only tools are always allowed and are not
 * listed here.
 */
export type OriginGrant = {
	/** The origin the grant applies to, for example `https://demo.playwright.dev`. */
	origin: string;
	/**
	 * Whether the extension is switched on at all. Kept separate from `actingAllowed` because the kill
	 * switch has to withdraw read-only tools too, and collapsing the two loses that.
	 */
	globallyEnabled: boolean;
	/** Whether the user has opted in to acting tools on this origin. */
	actingAllowed: boolean;
};

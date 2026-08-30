///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	CaniuseTypes — the shapes the Can I use... tools read and return
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/** One entry of the feature index the page carries for every feature it knows about. */
export type CaniuseFeatureIndexEntry = {
	/** The feature identifier, which is also the last segment of the feature's uniform resource locator. */
	id: string;
	/** The feature's human-readable title. */
	title: string;
};

/** How widely a feature is available, as the Baseline project scores it. */
export type CaniuseBaselineStatus = {
	/** `high` for widely available, `low` for newly available, `false` for limited availability. */
	status: string | false;
	/** The date the feature became newly available, as `YYYY-MM-DD`. */
	lowDate?: string;
	/** The date the feature became widely available, as `YYYY-MM-DD`. */
	highDate?: string;
};

/** One browser, as the page describes it. */
export type CaniuseAgent = {
	/** The browser's human-readable name, such as `Chrome`. */
	browser: string;
	/** `desktop` or `mobile`. */
	type: string;
	/** The version of this browser that is current today. */
	current_version: string;
	/** The share of global browsing this browser holds, one entry per version, as a percentage. */
	usage_global: Record<string, number>;
	/** Every version of this browser, oldest first. `era` is `0` for the current version. */
	version_list: Array<{ version: string; era: number; global_usage: number; release_date: number | null }>;
};

/** The complete record the page holds for one feature. */
export type CaniuseFeatureData = {
	/** The feature identifier. */
	id: string;
	/** The feature's human-readable title. */
	title: string;
	/** A paragraph describing what the feature is. */
	description: string;
	/** The uniform resource locator of the feature's specification. */
	spec: string;
	/** The standardisation status code, such as `cr`, expanded by `statuses` in the page's own data. */
	status: string;
	/** How widely available the feature is. */
	baseline_status: CaniuseBaselineStatus | false;
	/** Whether the feature is discouraged from being used. */
	discouraged?: boolean;
	/** The support value for every version of every browser, keyed by browser and then by version. */
	stats: Record<string, Record<string, string>>;
	/** The notes that apply to the whole feature, as one block of text. */
	notes: string;
	/** The numbered notes that individual support values point at. */
	notes_by_num: Record<string, string>;
	/** The categories the feature belongs to, such as `CSS`. */
	baseCategories: string[];
	/** Other search terms that find this feature on the site, separated by commas. */
	keywords: string;
};

/** The whole dataset the page loads before it renders anything. */
export type CaniuseRawData = {
	/** Every feature the site knows about, keyed by feature identifier. */
	feats: Record<string, CaniuseFeatureIndexEntry>;
	/** The human-readable label for every standardisation status code. */
	statuses: Record<string, string>;
	/** Every browser, keyed by browser identifier. */
	agents: Record<string, CaniuseAgent>;
};

/** One support value, taken apart into the things an agent has to reason about. */
export type SupportReading = {
	/** The raw value as the site stores it, such as `a x #2`. */
	raw: string;
	/** The one-letter code: `y`, `a`, `n`, `p`, or `u`. */
	code: string;
	/** What that code means, written out. */
	meaning: string;
	/** Whether the feature works only under a vendor prefix in this version. */
	prefixRequired: boolean;
	/** Whether the feature works only after a flag is switched on in this version. */
	behindFlag: boolean;
	/** The numbered notes this value points at, to be looked up in `notesByNumber`. */
	noteNumbers: string[];
};

/**
 * A tool's answer when the agent asked for something reasonable that this page cannot serve yet.
 *
 * This is returned rather than thrown. Chrome replaces a thrown handler error with the fixed text
 * `UnknownError: Tool was executed but the invocation failed`, so an agent never sees the message,
 * and a refusal whose whole value is the instruction it carries would be lost. Measured on
 * Chrome 151 while verifying this adapter.
 */
export type ToolRefusal = {
	/** Always `true`, so an agent can test for a refusal without matching on text. */
	refused: true;
	/** What went wrong, in one sentence. */
	reason: string;
	/** The tool to call next to make the request answerable. */
	remedy: string;
};

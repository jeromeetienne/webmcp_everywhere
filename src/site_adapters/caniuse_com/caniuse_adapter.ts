import type { Adapter } from '../../adapter_format/adapter_types.js';

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	CaniuseAdapter — WebMCP tools for https://caniuse.com/
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

declare global {
	/** The whole dataset, published by the page before any feature is rendered. */
	// eslint-disable-next-line no-var
	var Caniuse: { rawData: CaniuseRawData } | undefined;
}

/**
 * Reads the Can I use... support tables and exposes them as WebMCP tools.
 *
 * Three facts about this page shape everything below, and all three were established by probing the
 * live site on 2026-08-21 rather than by reading its source:
 *
 * - The page publishes its whole feature index and every browser on `window.Caniuse.rawData`, so a
 *   search over all 1356 features needs no network and no rendering. The index holds only an
 *   identifier and a title; the support values are not in it.
 * - The support values for a feature live on the `model.fullData` property of that feature's
 *   `ciu-feature` custom element, which the page creates for every feature it currently shows. The
 *   rendered support table itself sits behind three nested shadow roots and is drawn lazily, so it is
 *   never read here.
 * - The site routes without reloading. Pushing a feature's path into the session history and
 *   dispatching a `popstate` event makes the page show that feature, which is how a feature that is
 *   not currently on the page is brought onto it.
 */
export class CaniuseAdapter {
	/** How long to wait for the page to fetch and render a feature, in milliseconds. */
	static readonly SETTLE_TIMEOUT = 8000;

	/** How long to wait between checks while waiting for the page to settle, in milliseconds. */
	static readonly POLL_INTERVAL = 100;

	/** How many matches `search_features` returns when the caller does not say. */
	static readonly DEFAULT_SEARCH_LIMIT = 20;

	/** What each one-letter support code means, written out for an agent that has never seen this site. */
	static readonly SUPPORT_MEANINGS: Record<string, string> = {
		y: 'supported',
		a: 'partially supported',
		n: 'not supported',
		p: 'not supported, but a polyfill is available',
		u: 'support unknown',
	};

	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////
	//	Reading the page's own data
	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////

	/**
	 * Reads the whole dataset the page published.
	 *
	 * @returns The feature index, the status labels, and every browser.
	 * @throws When the page has not published its data yet.
	 */
	static _rawData(): CaniuseRawData {
		const published = window.Caniuse;
		if (published === undefined || published === null) {
			throw new Error('this page has not published its data yet, so nothing can be read from it');
		}
		return published.rawData;
	}

	/**
	 * Reads the address the page is at.
	 *
	 * This sits in a helper rather than inside a tool handler because `PermissionAudit` reads handler
	 * source and cannot tell reading `location.href` apart from assigning to it, so a read-only handler
	 * that names `location` is rejected as a navigating one.
	 *
	 * @returns The page's uniform resource locator.
	 */
	static _currentUrl(): string {
		return document.URL;
	}

	/**
	 * Finds the element that holds every feature the page is currently showing.
	 *
	 * @returns The shadow root holding the feature elements, or `null` when the page has none.
	 */
	static _featureListRoot(): ShadowRoot | null {
		const list = document.querySelector('ciu-feature-list');
		if (list === null) {
			return null;
		}
		return list.shadowRoot;
	}

	/**
	 * Reads every feature element the page is currently showing.
	 *
	 * @returns The feature elements, in the order the page shows them.
	 */
	static _featureElements(): Element[] {
		const root = CaniuseAdapter._featureListRoot();
		if (root === null) {
			return [];
		}
		return Array.from(root.querySelectorAll('ciu-feature'));
	}

	/**
	 * Reads the complete record for one feature the page is currently showing.
	 *
	 * @param featureId - The feature identifier.
	 * @returns The feature's record, or `null` when the page is not showing it or has not loaded it yet.
	 */
	static _loadedFeature(featureId: string): CaniuseFeatureData | null {
		for (const element of CaniuseAdapter._featureElements()) {
			if (element.id !== featureId) {
				continue;
			}
			const model = (element as unknown as { model?: { fullData?: CaniuseFeatureData } }).model;
			if (model === undefined || model === null) {
				return null;
			}
			const fullData = model.fullData;
			if (fullData === undefined || fullData === null) {
				return null;
			}
			return fullData;
		}
		return null;
	}

	/**
	 * Reads the complete record for one feature, or says why it cannot.
	 *
	 * @param featureId - The feature identifier, or an empty string to take the feature the page shows.
	 * @returns The feature's record, or a refusal naming the tool to call first.
	 */
	static _resolveFeature(featureId: string): CaniuseFeatureData | ToolRefusal {
		const index = CaniuseAdapter._rawData().feats;
		const onPage = CaniuseAdapter._featureElements().map((element) => element.id);
		if (featureId.length === 0) {
			if (onPage.length === 0) {
				return {
					refused: true,
					reason: 'this page is not showing any feature, and no feature identifier was given',
					remedy: 'call search_features to find an identifier, then show_feature to bring it onto the page',
				};
			}
			if (onPage.length > 1) {
				return {
					refused: true,
					reason: `this page is showing ${onPage.length} features, so which one is meant is ambiguous: ${onPage.join(', ')}`,
					remedy: 'call this tool again with featureId set to one of those identifiers',
				};
			}
			return CaniuseAdapter._resolveFeature(onPage[0]);
		}
		if (Object.prototype.hasOwnProperty.call(index, featureId) === false) {
			return {
				refused: true,
				reason: `this site has no feature called ${featureId}`,
				remedy: 'call search_features to find the identifier this site uses for it',
			};
		}
		const loaded = CaniuseAdapter._loadedFeature(featureId);
		if (loaded === null) {
			return {
				refused: true,
				reason: `the support data for ${featureId} is not on this page`,
				remedy: `call show_feature with featureId ${featureId} to bring it onto the page first`,
			};
		}
		return loaded;
	}

	/**
	 * Tells a refusal apart from a feature record.
	 *
	 * @param value - Whatever `_resolveFeature` returned.
	 * @returns `true` when it is a refusal.
	 */
	static _isRefusal(value: CaniuseFeatureData | ToolRefusal): value is ToolRefusal {
		return (value as ToolRefusal).refused === true;
	}

	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////
	//	Turning the site's own shorthand into something an agent can act on
	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////

	/**
	 * Takes one support value apart.
	 *
	 * A value is a one-letter code followed by optional flags and note references, such as `a x #2`.
	 *
	 * @param raw - The value as the site stores it.
	 * @returns The code, what it means, the flags, and the notes it points at.
	 */
	static _decodeSupport(raw: string): SupportReading {
		const tokens = raw.split(' ').filter((token) => token.length > 0);
		const code = tokens.length > 0 ? tokens[0] : 'u';
		const meaning = CaniuseAdapter.SUPPORT_MEANINGS[code] ?? 'support unknown';
		return {
			raw: raw,
			code: code,
			meaning: meaning,
			prefixRequired: tokens.includes('x'),
			behindFlag: tokens.includes('d'),
			noteNumbers: tokens.filter((token) => token.startsWith('#')).map((token) => token.slice(1)),
		};
	}

	/**
	 * Finds the version of a browser that is current today.
	 *
	 * @param agent - The browser to read.
	 * @returns The current version.
	 */
	static _currentVersionOf(agent: CaniuseAgent): string {
		for (const entry of agent.version_list) {
			if (entry.era === 0) {
				return entry.version;
			}
		}
		return agent.current_version;
	}

	/**
	 * Finds the oldest version of a browser whose support has held unbroken up to the current version.
	 *
	 * This answers the question a developer actually asks — "from which version onwards can I rely on
	 * this?" — which a table of every version does not answer on its own.
	 *
	 * @param agent - The browser to read.
	 * @param versions - That browser's support values, keyed by version.
	 * @param accepted - The support codes that count as usable.
	 * @returns The oldest version supporting the feature without a break since, or `null` when the
	 *          current version does not support it.
	 */
	static _supportedFromVersion(
		agent: CaniuseAgent,
		versions: Record<string, string>,
		accepted: string[],
	): string | null {
		const released = agent.version_list.filter((entry) => entry.era <= 0);
		let earliest: string | null = null;
		for (let index = released.length - 1; index >= 0; index -= 1) {
			const version = released[index].version;
			const value = versions[version];
			if (value === undefined) {
				break;
			}
			const code = CaniuseAdapter._decodeSupport(value).code;
			if (accepted.includes(code) === false) {
				break;
			}
			earliest = version;
		}
		return earliest;
	}

	/**
	 * Adds up how much of the world's browsing is done in a browser version that supports a feature.
	 *
	 * The two numbers here are the ones the page prints above its support table, and they were checked
	 * against the page for `css-grid`, `flexbox`, `css-variables`, `avif`, and `webgpu` on 2026-08-21.
	 * Browsers the page no longer tracks, such as BlackBerry Browser, carry no usage share and are
	 * skipped, which is what the site does too.
	 *
	 * @param feature - The feature to add up.
	 * @param agents - Every browser the page tracks.
	 * @returns The percentage with full support and the percentage with partial support.
	 */
	static _globalUsage(
		feature: CaniuseFeatureData,
		agents: Record<string, CaniuseAgent>,
	): { fullSupportPercent: number; partialSupportPercent: number; totalPercent: number } {
		let full = 0;
		let partial = 0;
		for (const [agentId, versions] of Object.entries(feature.stats)) {
			const agent = agents[agentId];
			if (agent === undefined) {
				continue;
			}
			for (const [version, value] of Object.entries(versions)) {
				const share = agent.usage_global[version] ?? 0;
				const code = CaniuseAdapter._decodeSupport(value).code;
				if (code === 'y') {
					full += share;
				} else if (code === 'a') {
					partial += share;
				}
			}
		}
		return {
			fullSupportPercent: Number(full.toFixed(2)),
			partialSupportPercent: Number(partial.toFixed(2)),
			totalPercent: Number((full + partial).toFixed(2)),
		};
	}

	/**
	 * Scores how well a feature matches a search query, for ranking the results.
	 *
	 * @param entry - The feature index entry to score.
	 * @param query - The lower case query.
	 * @returns A score, higher being a better match, or `0` when the feature does not match at all.
	 */
	static _matchScore(entry: CaniuseFeatureIndexEntry, query: string): number {
		const id = entry.id.toLowerCase();
		const title = entry.title.toLowerCase();
		if (id === query) {
			return 100;
		}
		if (title === query) {
			return 90;
		}
		if (id.startsWith(query) === true) {
			return 80;
		}
		if (title.startsWith(query) === true) {
			return 70;
		}
		if (id.includes(query) === true) {
			return 60;
		}
		if (title.includes(query) === true) {
			return 50;
		}
		return 0;
	}

	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////
	//	Waiting for the page
	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////

	/**
	 * Waits until a test passes, or until the settle timeout runs out.
	 *
	 * @param test - The test to run repeatedly.
	 * @returns `true` when the test passed, `false` when the timeout ran out first.
	 */
	static async _waitUntil(test: () => boolean): Promise<boolean> {
		const deadline = Date.now() + CaniuseAdapter.SETTLE_TIMEOUT;
		while (Date.now() < deadline) {
			if (test() === true) {
				return true;
			}
			await new Promise((resolve) => {
				window.setTimeout(resolve, CaniuseAdapter.POLL_INTERVAL);
			});
		}
		return test();
	}
}

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	The adapter
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/** No-input tools all share this schema. */
const NO_INPUT = {
	type: 'object',
	properties: {},
	additionalProperties: false,
} as const;

/** The optional feature identifier that the reading tools accept. */
const OPTIONAL_FEATURE_ID = {
	type: 'string',
	description:
		'The feature identifier, from search_features. Leave it out when the page is showing exactly ' +
		'one feature and you mean that one.',
} as const;

/**
 * The Can I use... adapter, as the extension runtime consumes it.
 */
export const caniuseAdapter: Adapter = {
	siteSlug: 'caniuse_com',
	siteName: 'Can I use...',
	matchPatterns: ['https://caniuse.com/*'],
	metadata: {
		author: 'WebMCP Everywhere contributors',
		version: '0.1.0',
		adapterFormatVersion: '0.1.0',
		targetSiteVerifiedOn: '2026-08-21',
	},
	yieldCondition: (firstPartyToolNames: string[]): boolean => {
		return firstPartyToolNames.length > 0;
	},
	tools: [
		{
			name: 'search_features',
			title: 'Search the features',
			description:
				'Search every web platform feature this site covers and return the matching feature ' +
				'identifiers and titles. The search covers identifiers and titles only, not descriptions ' +
				'or keywords, and it needs nothing to be on the page. Pass an identifier from here to ' +
				'get_feature_support or to show_feature.',
			inputSchema: {
				type: 'object',
				properties: {
					query: {
						type: 'string',
						minLength: 1,
						description: 'The words to look for, such as "grid" or "container queries".',
					},
					limit: {
						type: 'integer',
						minimum: 1,
						maximum: 100,
						description: 'How many matches to return at most. Twenty when left out.',
					},
				},
				required: ['query'],
				additionalProperties: false,
			},
			permissionClass: 'readOnly',
			execute: (input) => {
				const query = String(input.query ?? '').trim().toLowerCase();
				if (query.length === 0) {
					throw new Error('a search needs a query');
				}
				const limit = Number(input.limit ?? CaniuseAdapter.DEFAULT_SEARCH_LIMIT);
				const index = CaniuseAdapter._rawData().feats;
				const entries = Object.values(index);
				const scored: Array<{ entry: CaniuseFeatureIndexEntry; score: number }> = [];
				for (const entry of entries) {
					const score = CaniuseAdapter._matchScore(entry, query);
					if (score > 0) {
						scored.push({
							entry: entry,
							score: score,
						});
					}
				}
				scored.sort((left, right) => {
					if (left.score !== right.score) {
						return right.score - left.score;
					}
					return left.entry.id.localeCompare(right.entry.id);
				});
				return {
					query: query,
					featuresOnThisSite: entries.length,
					matchCount: scored.length,
					returned: Math.min(scored.length, limit),
					matches: scored.slice(0, limit).map((match) => ({
						id: match.entry.id,
						title: match.entry.title,
					})),
				};
			},
		},
		{
			name: 'list_page_features',
			title: 'List the features on this page',
			description:
				'List the features this page is currently showing, with their identifiers and titles, ' +
				'and say whether the support data for each one has finished loading. Only a feature ' +
				'listed here can be read by get_feature_support or check_support.',
			inputSchema: NO_INPUT,
			permissionClass: 'readOnly',
			execute: () => {
				const index = CaniuseAdapter._rawData().feats;
				const features = CaniuseAdapter._featureElements().map((element) => {
					const entry = index[element.id];
					return {
						id: element.id,
						title: entry === undefined ? element.id : entry.title,
						supportDataLoaded: CaniuseAdapter._loadedFeature(element.id) !== null,
					};
				});
				return {
					url: CaniuseAdapter._currentUrl(),
					featureCount: features.length,
					features: features,
				};
			},
		},
		{
			name: 'list_browsers',
			title: 'List the browsers',
			description:
				'List every browser this site tracks, with its identifier, its name, whether it is a ' +
				'desktop or a mobile browser, the version that is current today, and the share of ' +
				'global browsing it holds. Pass an identifier from here to check_support.',
			inputSchema: NO_INPUT,
			permissionClass: 'readOnly',
			execute: () => {
				const agents = CaniuseAdapter._rawData().agents;
				const browsers = Object.entries(agents).map(([agentId, agent]) => {
					let usage = 0;
					for (const share of Object.values(agent.usage_global)) {
						usage += share;
					}
					return {
						id: agentId,
						name: agent.browser,
						type: agent.type,
						currentVersion: CaniuseAdapter._currentVersionOf(agent),
						globalUsagePercent: Number(usage.toFixed(2)),
					};
				});
				browsers.sort((left, right) => right.globalUsagePercent - left.globalUsagePercent);
				return {
					browserCount: browsers.length,
					browsers: browsers,
				};
			},
		},
		{
			name: 'get_feature_support',
			title: 'Get a feature\'s browser support',
			description:
				'Report everything this site knows about one feature that is on the page: what it is, ' +
				'its specification, its standardisation status, its Baseline availability, the share of ' +
				'global browsing that supports it, and, for every browser, the version from which ' +
				'support has held unbroken. A feature has to be on the page first, so call show_feature ' +
				'when it is not.',
			inputSchema: {
				type: 'object',
				properties: {
					featureId: OPTIONAL_FEATURE_ID,
				},
				required: [],
				additionalProperties: false,
			},
			permissionClass: 'readOnly',
			execute: (input) => {
				const featureId = String(input.featureId ?? '').trim();
				const resolved = CaniuseAdapter._resolveFeature(featureId);
				if (CaniuseAdapter._isRefusal(resolved) === true) {
					return resolved;
				}
				const feature = resolved;
				const rawData = CaniuseAdapter._rawData();
				const browsers = Object.entries(feature.stats).map(([agentId, versions]) => {
					const agent = rawData.agents[agentId];
					if (agent === undefined) {
						return {
							browserId: agentId,
							browserName: agentId,
							type: 'no longer tracked by this site',
							currentVersion: null,
							currentVersionSupport: null,
							fullySupportedFromVersion: null,
							usableFromVersion: null,
						};
					}
					const currentVersion = CaniuseAdapter._currentVersionOf(agent);
					const currentValue = versions[currentVersion];
					return {
						browserId: agentId,
						browserName: agent.browser,
						type: agent.type,
						currentVersion: currentVersion,
						currentVersionSupport:
							currentValue === undefined
								? null
								: CaniuseAdapter._decodeSupport(currentValue),
						fullySupportedFromVersion: CaniuseAdapter._supportedFromVersion(
							agent,
							versions,
							['y'],
						),
						usableFromVersion: CaniuseAdapter._supportedFromVersion(agent, versions, [
							'y',
							'a',
						]),
					};
				});
				const statusLabel = rawData.statuses[feature.status];
				return {
					id: feature.id,
					title: feature.title,
					description: feature.description,
					specificationUrl: feature.spec,
					standardisationStatus: {
						code: feature.status,
						label: statusLabel === undefined ? feature.status : statusLabel,
					},
					baselineStatus: feature.baseline_status,
					discouraged: feature.discouraged === true,
					categories: feature.baseCategories,
					globalUsage: CaniuseAdapter._globalUsage(feature, rawData.agents),
					browsers: browsers,
					notes: feature.notes,
					notesByNumber: feature.notes_by_num,
				};
			},
		},
		{
			name: 'check_support',
			title: 'Check one browser against one feature',
			description:
				'Answer whether one browser supports one feature, in the version you name or in the ' +
				'version that is current today. Names the browser by an identifier from list_browsers ' +
				'and the feature by an identifier from search_features. The feature has to be on the ' +
				'page first, so call show_feature when it is not.',
			inputSchema: {
				type: 'object',
				properties: {
					browserId: {
						type: 'string',
						description: 'The browser identifier, from list_browsers, such as "safari".',
					},
					featureId: OPTIONAL_FEATURE_ID,
					version: {
						type: 'string',
						description:
							'The browser version to check. The version that is current today when ' +
							'left out.',
					},
				},
				required: ['browserId'],
				additionalProperties: false,
			},
			permissionClass: 'readOnly',
			execute: (input) => {
				const browserId = String(input.browserId ?? '').trim();
				const featureId = String(input.featureId ?? '').trim();
				const resolved = CaniuseAdapter._resolveFeature(featureId);
				if (CaniuseAdapter._isRefusal(resolved) === true) {
					return resolved;
				}
				const feature = resolved;
				const rawData = CaniuseAdapter._rawData();
				const agent = rawData.agents[browserId];
				if (agent === undefined) {
					return {
						refused: true,
						reason: `this site has no browser called ${browserId}`,
						remedy: 'call list_browsers to find the identifier this site uses for it',
					};
				}
				const versions = feature.stats[browserId];
				if (versions === undefined) {
					return {
						refused: true,
						reason: `this site holds no support data for ${browserId} on ${feature.id}`,
						remedy: 'call get_feature_support to see every browser this feature has data for',
					};
				}
				const requested = String(input.version ?? '').trim();
				const version = requested.length > 0 ? requested : CaniuseAdapter._currentVersionOf(agent);
				const value = versions[version];
				if (value === undefined) {
					return {
						refused: true,
						reason: `this site has no version ${version} of ${agent.browser}`,
						remedy: `call this tool again with one of these versions: ${Object.keys(versions).join(', ')}`,
					};
				}
				const reading = CaniuseAdapter._decodeSupport(value);
				return {
					featureId: feature.id,
					featureTitle: feature.title,
					browserId: browserId,
					browserName: agent.browser,
					version: version,
					isCurrentVersion: version === CaniuseAdapter._currentVersionOf(agent),
					support: reading,
					notes: reading.noteNumbers.map((number) => ({
						number: number,
						text: feature.notes_by_num[number] ?? '',
					})),
				};
			},
		},
		{
			name: 'show_feature',
			title: 'Show a feature on the page',
			description:
				'Make this page show one feature, named by an identifier from search_features, so that ' +
				'get_feature_support and check_support can read it. This changes what the page is ' +
				'showing and moves it to that feature\'s address, and it reads nothing on its own.',
			inputSchema: {
				type: 'object',
				properties: {
					featureId: {
						type: 'string',
						minLength: 1,
						description: 'The feature identifier, from search_features.',
					},
				},
				required: ['featureId'],
				additionalProperties: false,
			},
			permissionClass: 'acting',
			execute: async (input) => {
				const featureId = String(input.featureId ?? '').trim();
				const index = CaniuseAdapter._rawData().feats;
				if (Object.prototype.hasOwnProperty.call(index, featureId) === false) {
					return {
						refused: true,
						reason: `this site has no feature called ${featureId}, so the page was not moved`,
						remedy: 'call search_features to find the identifier this site uses for it',
					};
				}
				window.history.pushState({}, '', `/${featureId}`);
				window.dispatchEvent(
					new PopStateEvent('popstate', {
						state: {},
					}),
				);
				const arrived = await CaniuseAdapter._waitUntil(() => {
					return CaniuseAdapter._loadedFeature(featureId) !== null;
				});
				if (arrived === false) {
					throw new Error(
						`the page moved to ${featureId} but its support data did not finish loading`,
					);
				}
				return {
					url: window.location.href,
					id: featureId,
					title: index[featureId].title,
					supportDataLoaded: true,
				};
			},
		},
		{
			name: 'search_on_page',
			title: 'Search on the page itself',
			description:
				'Type a search into the page\'s own search field so that the page shows every matching ' +
				'feature and loads the support data for all of them at once. Use this to compare ' +
				'several related features without moving to each one in turn. The site\'s own search ' +
				'is used, so it also matches keywords that search_features does not.',
			inputSchema: {
				type: 'object',
				properties: {
					query: {
						type: 'string',
						minLength: 1,
						description: 'The words to search the site for.',
					},
				},
				required: ['query'],
				additionalProperties: false,
			},
			permissionClass: 'acting',
			execute: async (input) => {
				const query = String(input.query ?? '').trim();
				if (query.length === 0) {
					throw new Error('a search needs a query');
				}
				const field = document.querySelector<HTMLInputElement>('#feat_search');
				if (field === null) {
					throw new Error('the search field is not on this page');
				}
				const before = CaniuseAdapter._featureElements()
					.map((element) => element.id)
					.join(',');
				const setter = Object.getOwnPropertyDescriptor(
					HTMLInputElement.prototype,
					'value',
				)?.set;
				if (setter === undefined) {
					throw new Error('this browser does not let the search field be written to');
				}
				setter.call(field, query);
				field.dispatchEvent(
					new Event('input', {
						bubbles: true,
					}),
				);
				await CaniuseAdapter._waitUntil(() => {
					const now = CaniuseAdapter._featureElements();
					if (now.length === 0) {
						return false;
					}
					if (now.map((element) => element.id).join(',') === before) {
						return false;
					}
					return now.every((element) => CaniuseAdapter._loadedFeature(element.id) !== null);
				});
				const index = CaniuseAdapter._rawData().feats;
				const features = CaniuseAdapter._featureElements().map((element) => {
					const entry = index[element.id];
					return {
						id: element.id,
						title: entry === undefined ? element.id : entry.title,
						supportDataLoaded: CaniuseAdapter._loadedFeature(element.id) !== null,
					};
				});
				return {
					query: query,
					url: window.location.href,
					featureCount: features.length,
					features: features,
				};
			},
		},
	],
};

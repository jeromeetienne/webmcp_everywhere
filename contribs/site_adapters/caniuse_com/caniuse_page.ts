import { PageWaiting } from '@webmcp_everywhere/site_adapter';
import type {
	CaniuseAgent,
	CaniuseFeatureData,
	CaniuseFeatureIndexEntry,
	CaniuseRawData,
	SupportReading,
	ToolRefusal,
} from './caniuse_types.js';

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	CaniusePage — reads the data https://caniuse.com/ publishes to its own page
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

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
export class CaniusePage {
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
		const root = CaniusePage._featureListRoot();
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
		for (const element of CaniusePage._featureElements()) {
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
		const index = CaniusePage._rawData().feats;
		const onPage = CaniusePage._featureElements().map((element) => element.id);
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
			return CaniusePage._resolveFeature(onPage[0]);
		}
		if (Object.prototype.hasOwnProperty.call(index, featureId) === false) {
			return {
				refused: true,
				reason: `this site has no feature called ${featureId}`,
				remedy: 'call search_features to find the identifier this site uses for it',
			};
		}
		const loaded = CaniusePage._loadedFeature(featureId);
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
		const meaning = CaniusePage.SUPPORT_MEANINGS[code] ?? 'support unknown';
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
			const code = CaniusePage._decodeSupport(value).code;
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
				const code = CaniusePage._decodeSupport(value).code;
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
	 * The loop is `PageWaiting.waitUntil`. What this adds is the two figures that belong to this site
	 * and nowhere else: how long a feature takes to arrive, and how often it is worth looking.
	 *
	 * @param test - The test to run repeatedly.
	 * @returns `true` when the test passed, `false` when the timeout ran out first.
	 */
	static async _waitUntil(test: () => boolean): Promise<boolean> {
		return await PageWaiting.waitUntil(test, CaniusePage.SETTLE_TIMEOUT, CaniusePage.POLL_INTERVAL);
	}
}

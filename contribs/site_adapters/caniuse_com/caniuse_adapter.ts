import { PageDriving } from '@webmcp_everywhere/adapter_toolkit';
import type { Adapter } from '@webmcp_everywhere/adapter_format';
import type { CaniuseFeatureData, CaniuseFeatureIndexEntry, ToolRefusal } from './caniuse_types.js';
import { CaniusePage } from './caniuse_page.js';

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	caniuseAdapter — the WebMCP tool surface for https://caniuse.com/
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
				const limit = Number(input.limit ?? CaniusePage.DEFAULT_SEARCH_LIMIT);
				const index = CaniusePage._rawData().feats;
				const entries = Object.values(index);
				const scored: Array<{ entry: CaniuseFeatureIndexEntry; score: number }> = [];
				for (const entry of entries) {
					const score = CaniusePage._matchScore(entry, query);
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
				const index = CaniusePage._rawData().feats;
				const features = CaniusePage._featureElements().map((element) => {
					const entry = index[element.id];
					return {
						id: element.id,
						title: entry === undefined ? element.id : entry.title,
						supportDataLoaded: CaniusePage._loadedFeature(element.id) !== null,
					};
				});
				return {
					url: CaniusePage._currentUrl(),
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
				const agents = CaniusePage._rawData().agents;
				const browsers = Object.entries(agents).map(([agentId, agent]) => {
					let usage = 0;
					for (const share of Object.values(agent.usage_global)) {
						usage += share;
					}
					return {
						id: agentId,
						name: agent.browser,
						type: agent.type,
						currentVersion: CaniusePage._currentVersionOf(agent),
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
				const resolved = CaniusePage._resolveFeature(featureId);
				if (CaniusePage._isRefusal(resolved) === true) {
					return resolved;
				}
				const feature = resolved;
				const rawData = CaniusePage._rawData();
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
					const currentVersion = CaniusePage._currentVersionOf(agent);
					const currentValue = versions[currentVersion];
					return {
						browserId: agentId,
						browserName: agent.browser,
						type: agent.type,
						currentVersion: currentVersion,
						currentVersionSupport:
							currentValue === undefined
								? null
								: CaniusePage._decodeSupport(currentValue),
						fullySupportedFromVersion: CaniusePage._supportedFromVersion(
							agent,
							versions,
							['y'],
						),
						usableFromVersion: CaniusePage._supportedFromVersion(agent, versions, [
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
					globalUsage: CaniusePage._globalUsage(feature, rawData.agents),
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
				const resolved = CaniusePage._resolveFeature(featureId);
				if (CaniusePage._isRefusal(resolved) === true) {
					return resolved;
				}
				const feature = resolved;
				const rawData = CaniusePage._rawData();
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
				const version = requested.length > 0 ? requested : CaniusePage._currentVersionOf(agent);
				const value = versions[version];
				if (value === undefined) {
					return {
						refused: true,
						reason: `this site has no version ${version} of ${agent.browser}`,
						remedy: `call this tool again with one of these versions: ${Object.keys(versions).join(', ')}`,
					};
				}
				const reading = CaniusePage._decodeSupport(value);
				return {
					featureId: feature.id,
					featureTitle: feature.title,
					browserId: browserId,
					browserName: agent.browser,
					version: version,
					isCurrentVersion: version === CaniusePage._currentVersionOf(agent),
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
				const index = CaniusePage._rawData().feats;
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
				const arrived = await CaniusePage._waitUntil(() => {
					return CaniusePage._loadedFeature(featureId) !== null;
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
				const before = CaniusePage._featureElements()
					.map((element) => element.id)
					.join(',');
				PageDriving.writeIntoInputField(field, query);
				await CaniusePage._waitUntil(() => {
					const now = CaniusePage._featureElements();
					if (now.length === 0) {
						return false;
					}
					if (now.map((element) => element.id).join(',') === before) {
						return false;
					}
					return now.every((element) => CaniusePage._loadedFeature(element.id) !== null);
				});
				const index = CaniusePage._rawData().feats;
				const features = CaniusePage._featureElements().map((element) => {
					const entry = index[element.id];
					return {
						id: element.id,
						title: entry === undefined ? element.id : entry.title,
						supportDataLoaded: CaniusePage._loadedFeature(element.id) !== null,
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


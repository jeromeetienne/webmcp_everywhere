///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	CaniuseTest — drives the Can I use... adapter in a real Chrome on the real site
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

import NodeTest from 'node:test';
import { LivePageHarness } from '../libs/live_page_harness.ts';
import type { CdpClient } from '../../tools/chrome_devtools_protocol/cdp_client.ts';

const TARGET_URL = 'https://caniuse.com/css-grid';

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	Types
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/** What `search_features` returns. */
type SearchFeaturesResult = {
	/** How many features the site covers in total. */
	featuresOnThisSite: number;
	/** How many features matched. */
	matchCount: number;
	/** The matches that were returned. */
	matches: Array<{ id: string; title: string }>;
};

/** What `list_page_features` and `search_on_page` both return. */
type PageFeaturesResult = {
	/** The address the page is at. */
	url: string;
	/** How many features the page is showing. */
	featureCount: number;
	/** The features the page is showing. */
	features: Array<{ id: string; title: string; supportDataLoaded: boolean }>;
};

/** What `list_browsers` returns. */
type ListBrowsersResult = {
	/** How many browsers the site tracks. */
	browserCount: number;
	/** The browsers, most used first. */
	browsers: Array<{ id: string; name: string; type: string; currentVersion: string; globalUsagePercent: number }>;
};

/** What `get_feature_support` returns. */
type FeatureSupportResult = {
	/** The feature identifier. */
	id: string;
	/** The feature's title. */
	title: string;
	/** How widely browsing supports the feature. */
	globalUsage: { fullSupportPercent: number; partialSupportPercent: number; totalPercent: number };
	/** One entry per browser the site holds data for. */
	browsers: Array<{
		/** The browser identifier. */
		browserId: string;
		/** The version that is current today. */
		currentVersion: string | null;
		/** How the current version supports the feature. */
		currentVersionSupport: { code: string; meaning: string } | null;
		/** The oldest version whose full support has held unbroken since. */
		fullySupportedFromVersion: string | null;
	}>;
};

/** What `check_support` returns. */
type CheckSupportResult = {
	/** The browser's name. */
	browserName: string;
	/** The version that was checked. */
	version: string;
	/** How that version supports the feature. */
	support: { code: string; meaning: string; prefixRequired: boolean; behindFlag: boolean };
};

/** What `show_feature` returns. */
type ShowFeatureResult = {
	/** The address the page moved to. */
	url: string;
	/** The feature identifier now on the page. */
	id: string;
	/** Whether the support data finished loading. */
	supportDataLoaded: boolean;
};

/** What a tool returns instead of throwing when it cannot serve a reasonable request. */
type RefusalResult = {
	/** Always `true` on a refusal. */
	refused: true;
	/** What went wrong. */
	reason: string;
	/** The tool to call next. */
	remedy: string;
};

/**
 * The live browser every check works against, prepared once before the first of them.
 *
 * Nothing here is mocked and nothing is read out of a fixture. Chrome is launched, the extension is
 * installed, `https://caniuse.com/` is loaded, and every assertion calls a tool through
 * `document.modelContext` and compares the answer against what the page itself shows.
 */
const harness = new LivePageHarness({
	siteSlug: 'caniuse_com',
	origin: 'https://caniuse.com',
	url: TARGET_URL,
	urlFragment: 'caniuse.com',
});

/**
 * Reads Can I use... out of its own rendering, for the numbers a tool's claim is checked against.
 *
 * Everything else these checks need — the browser, the opt-in, the tool list, the tool call — is the
 * same for every site and lives in `LivePageHarness`.
 */
class CaniuseTest {
	/**
	 * Reads the usage percentage the page itself prints above a feature's support table.
	 *
	 * This is the independent number every usage check is compared against, so it is read out of the
	 * page's own rendering rather than out of the data the adapter reads.
	 *
	 * @param page - A client attached to the page.
	 * @param featureId - The feature whose printed percentage to read.
	 * @returns The printed line, with its whitespace collapsed.
	 */
	static async _usagePrintedOnPage(page: CdpClient, featureId: string): Promise<string> {
		return await page.evaluate<string>(`
			(() => {
				const root = document.querySelector('ciu-feature-list').shadowRoot;
				const feature = Array.from(root.querySelectorAll('ciu-feature')).find((element) => element.id === ${JSON.stringify(featureId)});
				if (feature === undefined) { throw new Error('the page is not showing ' + ${JSON.stringify(featureId)}); }
				const usage = feature.shadowRoot.querySelector('ciu-feature-usage');
				if (usage === null || usage.shadowRoot === null) { throw new Error('the page prints no usage line yet'); }
				return usage.shadowRoot.textContent.replace(/\\s+/g, ' ').trim();
			})()
		`);
	}
}

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	Checks
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

NodeTest.describe('The Can I use... adapter, on the live site', () => {
	NodeTest.before(async () => {
		await harness.launch();
	});

	NodeTest.after(() => {
		harness.close();
	});

	NodeTest.describe('with the acting tools withheld', () => {
		NodeTest.test('the five reading tools register with no opt-in', async (t) => {
			const { page } = harness.requireContext();
			const names = await harness.toolNames(page);
			const expected = [
				'search_features',
				'list_page_features',
				'list_browsers',
				'get_feature_support',
				'check_support',
			].map((name) => `caniuse_com__${name}`);
			LivePageHarness.assertSameSet(names, expected);
			t.diagnostic(`${names.length} registered: ${names.join(', ')}`);
		});

		NodeTest.test('the two acting tools are withheld until the user opts in', async (t) => {
			const { page } = harness.requireContext();
			const names = await harness.toolNames(page);
			for (const withheld of ['caniuse_com__show_feature', 'caniuse_com__search_on_page']) {
				if (names.includes(withheld) === true) {
					throw new Error(`${withheld} was registered without an opt-in`);
				}
			}
			t.diagnostic('show_feature and search_on_page are both absent');
		});

		NodeTest.test('search_features finds a feature across the whole site index', async (t) => {
			const { page } = harness.requireContext();
			const result = await harness.callTool<SearchFeaturesResult>(page, 'search_features', {
				query: 'subgrid',
			});
			const found = result.matches.find((match) => match.id === 'css-subgrid');
			if (found === undefined) {
				throw new Error(`css-subgrid was not among ${result.matches.map((m) => m.id).join(', ')}`);
			}
			if (result.featuresOnThisSite < 1000) {
				throw new Error(`the index held only ${result.featuresOnThisSite} features`);
			}
			t.diagnostic(
				`${result.matchCount} matches out of ${result.featuresOnThisSite} features, including ${found.id}`,
			);
		});

		NodeTest.test('list_browsers reports every browser with its share of global browsing', async (t) => {
			const { page } = harness.requireContext();
			const result = await harness.callTool<ListBrowsersResult>(page, 'list_browsers', {});
			const chrome = result.browsers.find((browser) => browser.id === 'chrome');
			if (chrome === undefined) {
				throw new Error('chrome was not in the list');
			}
			if (chrome.globalUsagePercent <= 0) {
				throw new Error('chrome was reported as holding no share of global browsing');
			}
			t.diagnostic(
				`${result.browserCount} browsers, ${chrome.name} at ${chrome.globalUsagePercent}% on version ${chrome.currentVersion}`,
			);
		});

		NodeTest.test('list_page_features reports the feature the page was opened on', async (t) => {
			const { page } = harness.requireContext();
			const result = await harness.callTool<PageFeaturesResult>(page, 'list_page_features', {});
			const ids = result.features.map((feature) => feature.id);
			if (ids.includes('css-grid') === false) {
				throw new Error(`the page showed ${ids.join(', ')} rather than css-grid`);
			}
			t.diagnostic(`${result.featureCount} on the page: ${ids.join(', ')}`);
		});

		NodeTest.test('get_feature_support agrees with the percentage the page prints', async (t) => {
			const { page } = harness.requireContext();
			const result = await harness.callTool<FeatureSupportResult>(page, 'get_feature_support', {
				featureId: 'css-grid',
			});
			const shown = await CaniuseTest._usagePrintedOnPage(page, 'css-grid');
			const computed = `${result.globalUsage.fullSupportPercent.toFixed(2)}%`;
			if (shown.includes(computed) === false) {
				throw new Error(`the tool computed ${computed} but the page prints "${shown}"`);
			}
			t.diagnostic(`${result.id} at ${computed}, and the page prints "${shown}"`);
		});

		NodeTest.test('get_feature_support names the version support has held from', async (t) => {
			const { page } = harness.requireContext();
			const result = await harness.callTool<FeatureSupportResult>(page, 'get_feature_support', {
				featureId: 'css-grid',
			});
			const chrome = result.browsers.find((browser) => browser.browserId === 'chrome');
			if (chrome === undefined) {
				throw new Error('chrome was not in the support list');
			}
			if (chrome.fullySupportedFromVersion !== '57') {
				throw new Error(
					`Chrome was reported as fully supporting CSS Grid from ${chrome.fullySupportedFromVersion}, not 57`,
				);
			}
			if (chrome.currentVersionSupport?.code !== 'y') {
				throw new Error('the current version of Chrome was not reported as supporting CSS Grid');
			}
			t.diagnostic(
				`Chrome ${chrome.fullySupportedFromVersion} onwards, and ${chrome.currentVersion} is ${chrome.currentVersionSupport.meaning}`,
			);
		});

		NodeTest.test('check_support reads one old version rather than the current one', async (t) => {
			const { page } = harness.requireContext();
			const result = await harness.callTool<CheckSupportResult>(page, 'check_support', {
				browserId: 'ie',
				featureId: 'css-grid',
				version: '11',
			});
			if (result.support.code !== 'a') {
				throw new Error(`Internet Explorer 11 was reported as ${result.support.code}, not partial support`);
			}
			if (result.support.prefixRequired === false) {
				throw new Error('Internet Explorer 11 was reported as needing no vendor prefix');
			}
			t.diagnostic(`${result.browserName} ${result.version}: ${result.support.meaning}, prefix required`);
		});

		NodeTest.test('a reading tool refuses a feature that is not on the page', async (t) => {
			const { page } = harness.requireContext();
			const result = await harness.callTool<RefusalResult>(page, 'get_feature_support', {
				featureId: 'webgpu',
			});
			if (result.refused !== true) {
				throw new Error('it answered for a feature the page is not showing');
			}
			if (result.remedy.includes('show_feature') === false) {
				throw new Error(`the refusal did not point at show_feature: ${result.remedy}`);
			}
			t.diagnostic(`it refused — "${result.reason}" — and said to ${result.remedy}`);
		});
	});

	NodeTest.describe('with the acting tools granted', () => {
		NodeTest.before(async () => {
			await harness.setGrant(true, true);
			await harness.reload();
		});

		NodeTest.test('the acting tools register once the user opts in', async (t) => {
			const { page } = harness.requireContext();
			const names = await harness.toolNames(page);
			for (const wanted of ['caniuse_com__show_feature', 'caniuse_com__search_on_page']) {
				if (names.includes(wanted) === false) {
					throw new Error(`${wanted} is still withheld after the opt-in`);
				}
			}
			t.diagnostic(`${names.length} registered, including show_feature and search_on_page`);
		});

		NodeTest.test('show_feature brings a feature onto the page without reloading it', async (t) => {
			const { page } = harness.requireContext();
			await page.evaluate('window.__verifyCaniuseMarker = "alive", "set"');
			const result = await harness.callTool<ShowFeatureResult>(page, 'show_feature', {
				featureId: 'webgpu',
			});
			if (result.supportDataLoaded === false) {
				throw new Error('the support data did not finish loading');
			}
			const marker = await page.evaluate<string>('window.__verifyCaniuseMarker ?? "gone"');
			if (marker !== 'alive') {
				throw new Error('the page reloaded, so the tool call survived only by luck');
			}
			t.diagnostic(`the page moved to ${result.url} and kept its script context`);
		});

		NodeTest.test('get_feature_support then answers for the feature show_feature brought on', async (t) => {
			const { page } = harness.requireContext();
			const result = await harness.callTool<FeatureSupportResult>(page, 'get_feature_support', {
				featureId: 'webgpu',
			});
			const shown = await CaniuseTest._usagePrintedOnPage(page, 'webgpu');
			const computed = `${result.globalUsage.fullSupportPercent.toFixed(2)}%`;
			if (shown.includes(computed) === false) {
				throw new Error(`the tool computed ${computed} but the page prints "${shown}"`);
			}
			t.diagnostic(`${result.title} at ${computed}, and the page prints "${shown}"`);
		});

		NodeTest.test('search_on_page loads several features at once', async (t) => {
			const { page } = harness.requireContext();
			const result = await harness.callTool<PageFeaturesResult>(page, 'search_on_page', {
				query: 'container queries',
			});
			if (result.featureCount < 2) {
				throw new Error(`only ${result.featureCount} feature came onto the page`);
			}
			const unloaded = result.features.filter((feature) => feature.supportDataLoaded === false);
			if (unloaded.length > 0) {
				throw new Error(`${unloaded.length} of them never loaded their support data`);
			}
			t.diagnostic(`${result.featureCount} features, all loaded: ${result.features.map((f) => f.id).join(', ')}`);
		});

		NodeTest.test('show_feature refuses a feature identifier the site does not have', async (t) => {
			const { page } = harness.requireContext();
			const before = await harness.callTool<PageFeaturesResult>(page, 'list_page_features', {});
			const result = await harness.callTool<RefusalResult>(page, 'show_feature', {
				featureId: 'https://example.com/not-a-feature',
			});
			if (result.refused !== true) {
				throw new Error('it accepted an identifier that is not a feature');
			}
			const after = await harness.callTool<PageFeaturesResult>(page, 'list_page_features', {});
			if (after.url !== before.url) {
				throw new Error(`it refused but still moved the page from ${before.url} to ${after.url}`);
			}
			t.diagnostic(`it refused — "${result.reason}" — and left the page at ${after.url}`);
		});
	});
});

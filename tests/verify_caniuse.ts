///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	VerifyCaniuse — drives the Can I use... adapter in a real Chrome on the real site
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

import { CdpClient } from '../tools/chrome_devtools_protocol/cdp_client.ts';
import { LaunchChrome } from '../tools/launch_chrome.ts';
import type { CheckResult, FramedResultOf } from './verify_types.ts';

const TARGET_URL = 'https://caniuse.com/css-grid';

const ORIGIN = 'https://caniuse.com';

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

/** How the whole suite went. */
export type CaniuseOutcome = {
	/** How many checks passed. */
	passed: number;
	/** How many checks failed. */
	failed: number;
	/** Every check, in the order it ran. */
	results: CheckResult[];
};

/**
 * Runs every check for the Can I use... adapter against the live site in a real Chrome.
 *
 * Nothing here is mocked and nothing is read out of a fixture. Chrome is launched, the extension is
 * installed, `https://caniuse.com/` is loaded, and every assertion calls a tool through
 * `document.modelContext` and compares the answer against what the page itself shows.
 */
export class VerifyCaniuse {
	/**
	 * Runs the whole suite.
	 *
	 * @returns The outcome.
	 */
	static async run(): Promise<CaniuseOutcome> {
		const launched = await LaunchChrome.run({
			url: TARGET_URL,
		});
		const extensionId = await VerifyCaniuse._extensionId(launched.port);

		const results: CheckResult[] = [];

		/**
		 * Runs one check and records whether it passed.
		 *
		 * @param name - What is being checked.
		 * @param check - The check, returning a detail line. Throwing means failure.
		 * @returns Nothing.
		 */
		const test = async (name: string, check: () => Promise<string>): Promise<void> => {
			try {
				const detail = await check();
				results.push({
					name: name,
					ok: true,
					detail: detail,
				});
				console.log(`  PASS  ${name}\n        ${detail}`);
			} catch (error) {
				results.push({
					name: name,
					ok: false,
					detail: String((error as Error)?.message ?? error),
				});
				console.log(`  FAIL  ${name}\n        ${(error as Error)?.message ?? error}`);
			}
		};

		await VerifyCaniuse._setGrant(launched.port, extensionId, false, true);
		let page = await VerifyCaniuse._reload(launched.port, TARGET_URL);

		console.log('\nThe Can I use... adapter, on the live site\n');

		await test('the five reading tools register with no opt-in', async () => {
			const names = await VerifyCaniuse._toolNames(page);
			const expected = [
				'search_features',
				'list_page_features',
				'list_browsers',
				'get_feature_support',
				'check_support',
			].map((name) => `caniuse_com__${name}`);
			VerifyCaniuse._assertSameSet(names, expected);
			return `${names.length} registered: ${names.join(', ')}`;
		});

		await test('the two acting tools are withheld until the user opts in', async () => {
			const names = await VerifyCaniuse._toolNames(page);
			for (const withheld of ['caniuse_com__show_feature', 'caniuse_com__search_on_page']) {
				if (names.includes(withheld) === true) {
					throw new Error(`${withheld} was registered without an opt-in`);
				}
			}
			return 'show_feature and search_on_page are both absent';
		});

		await test('search_features finds a feature across the whole site index', async () => {
			const result = await VerifyCaniuse._callTool<SearchFeaturesResult>(page, 'search_features', {
				query: 'subgrid',
			});
			const found = result.matches.find((match) => match.id === 'css-subgrid');
			if (found === undefined) {
				throw new Error(`css-subgrid was not among ${result.matches.map((m) => m.id).join(', ')}`);
			}
			if (result.featuresOnThisSite < 1000) {
				throw new Error(`the index held only ${result.featuresOnThisSite} features`);
			}
			return `${result.matchCount} matches out of ${result.featuresOnThisSite} features, including ${found.id}`;
		});

		await test('list_browsers reports every browser with its share of global browsing', async () => {
			const result = await VerifyCaniuse._callTool<ListBrowsersResult>(page, 'list_browsers', {});
			const chrome = result.browsers.find((browser) => browser.id === 'chrome');
			if (chrome === undefined) {
				throw new Error('chrome was not in the list');
			}
			if (chrome.globalUsagePercent <= 0) {
				throw new Error('chrome was reported as holding no share of global browsing');
			}
			return `${result.browserCount} browsers, ${chrome.name} at ${chrome.globalUsagePercent}% on version ${chrome.currentVersion}`;
		});

		await test('list_page_features reports the feature the page was opened on', async () => {
			const result = await VerifyCaniuse._callTool<PageFeaturesResult>(page, 'list_page_features', {});
			const ids = result.features.map((feature) => feature.id);
			if (ids.includes('css-grid') === false) {
				throw new Error(`the page showed ${ids.join(', ')} rather than css-grid`);
			}
			return `${result.featureCount} on the page: ${ids.join(', ')}`;
		});

		await test('get_feature_support agrees with the percentage the page prints', async () => {
			const result = await VerifyCaniuse._callTool<FeatureSupportResult>(page, 'get_feature_support', {
				featureId: 'css-grid',
			});
			const shown = await VerifyCaniuse._usagePrintedOnPage(page, 'css-grid');
			const computed = `${result.globalUsage.fullSupportPercent.toFixed(2)}%`;
			if (shown.includes(computed) === false) {
				throw new Error(`the tool computed ${computed} but the page prints "${shown}"`);
			}
			return `${result.id} at ${computed}, and the page prints "${shown}"`;
		});

		await test('get_feature_support names the version support has held from', async () => {
			const result = await VerifyCaniuse._callTool<FeatureSupportResult>(page, 'get_feature_support', {
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
			return `Chrome ${chrome.fullySupportedFromVersion} onwards, and ${chrome.currentVersion} is ${chrome.currentVersionSupport.meaning}`;
		});

		await test('check_support reads one old version rather than the current one', async () => {
			const result = await VerifyCaniuse._callTool<CheckSupportResult>(page, 'check_support', {
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
			return `${result.browserName} ${result.version}: ${result.support.meaning}, prefix required`;
		});

		await test('a reading tool refuses a feature that is not on the page', async () => {
			const result = await VerifyCaniuse._callTool<RefusalResult>(page, 'get_feature_support', {
				featureId: 'webgpu',
			});
			if (result.refused !== true) {
				throw new Error('it answered for a feature the page is not showing');
			}
			if (result.remedy.includes('show_feature') === false) {
				throw new Error(`the refusal did not point at show_feature: ${result.remedy}`);
			}
			return `it refused — "${result.reason}" — and said to ${result.remedy}`;
		});

		await VerifyCaniuse._setGrant(launched.port, extensionId, true, true);
		page.close();
		page = await VerifyCaniuse._reload(launched.port, TARGET_URL);

		await test('the acting tools register once the user opts in', async () => {
			const names = await VerifyCaniuse._toolNames(page);
			for (const wanted of ['caniuse_com__show_feature', 'caniuse_com__search_on_page']) {
				if (names.includes(wanted) === false) {
					throw new Error(`${wanted} is still withheld after the opt-in`);
				}
			}
			return `${names.length} registered, including show_feature and search_on_page`;
		});

		await test('show_feature brings a feature onto the page without reloading it', async () => {
			await page.evaluate('window.__verifyCaniuseMarker = "alive", "set"');
			const result = await VerifyCaniuse._callTool<ShowFeatureResult>(page, 'show_feature', {
				featureId: 'webgpu',
			});
			if (result.supportDataLoaded === false) {
				throw new Error('the support data did not finish loading');
			}
			const marker = await page.evaluate<string>('window.__verifyCaniuseMarker ?? "gone"');
			if (marker !== 'alive') {
				throw new Error('the page reloaded, so the tool call survived only by luck');
			}
			return `the page moved to ${result.url} and kept its script context`;
		});

		await test('get_feature_support then answers for the feature show_feature brought on', async () => {
			const result = await VerifyCaniuse._callTool<FeatureSupportResult>(page, 'get_feature_support', {
				featureId: 'webgpu',
			});
			const shown = await VerifyCaniuse._usagePrintedOnPage(page, 'webgpu');
			const computed = `${result.globalUsage.fullSupportPercent.toFixed(2)}%`;
			if (shown.includes(computed) === false) {
				throw new Error(`the tool computed ${computed} but the page prints "${shown}"`);
			}
			return `${result.title} at ${computed}, and the page prints "${shown}"`;
		});

		await test('search_on_page loads several features at once', async () => {
			const result = await VerifyCaniuse._callTool<PageFeaturesResult>(page, 'search_on_page', {
				query: 'container queries',
			});
			if (result.featureCount < 2) {
				throw new Error(`only ${result.featureCount} feature came onto the page`);
			}
			const unloaded = result.features.filter((feature) => feature.supportDataLoaded === false);
			if (unloaded.length > 0) {
				throw new Error(`${unloaded.length} of them never loaded their support data`);
			}
			return `${result.featureCount} features, all loaded: ${result.features.map((f) => f.id).join(', ')}`;
		});

		await test('show_feature refuses a feature identifier the site does not have', async () => {
			const before = await VerifyCaniuse._callTool<PageFeaturesResult>(page, 'list_page_features', {});
			const result = await VerifyCaniuse._callTool<RefusalResult>(page, 'show_feature', {
				featureId: 'https://example.com/not-a-feature',
			});
			if (result.refused !== true) {
				throw new Error('it accepted an identifier that is not a feature');
			}
			const after = await VerifyCaniuse._callTool<PageFeaturesResult>(page, 'list_page_features', {});
			if (after.url !== before.url) {
				throw new Error(`it refused but still moved the page from ${before.url} to ${after.url}`);
			}
			return `it refused — "${result.reason}" — and left the page at ${after.url}`;
		});

		page.close();

		const passed = results.filter((result) => result.ok === true).length;
		const failed = results.length - passed;
		console.log(`\n${passed} passed, ${failed} failed\n`);
		return {
			passed: passed,
			failed: failed,
			results: results,
		};
	}

	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////
	//	Helpers
	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////

	/**
	 * Finds the identifier Chrome gave the installed extension.
	 *
	 * @param port - The remote debugging port.
	 * @returns The extension identifier.
	 * @throws When the extension's service worker is not running.
	 */
	static async _extensionId(port: number): Promise<string> {
		for (let attempt = 0; attempt < 40; attempt += 1) {
			const targets = await CdpClient.listTargets(port);
			const worker = targets.find(
				(target) =>
					target.type === 'service_worker' &&
					target.url.includes('dist/background_service_worker.js'),
			);
			if (worker !== undefined) {
				return new URL(worker.url).host;
			}
			await VerifyCaniuse._pause(250);
		}
		throw new Error('the extension service worker never started');
	}

	/**
	 * Writes the user's settings straight into extension storage, standing in for the popup.
	 *
	 * @param port - The remote debugging port.
	 * @param extensionId - The installed extension's identifier.
	 * @param actingAllowed - Whether acting tools are allowed on this origin.
	 * @param globallyEnabled - Whether the extension is on at all.
	 * @returns Nothing.
	 */
	static async _setGrant(
		port: number,
		extensionId: string,
		actingAllowed: boolean,
		globallyEnabled: boolean,
	): Promise<void> {
		const targets = await CdpClient.listTargets(port);
		const worker = targets.find((target) =>
			target.url.includes(`${extensionId}/dist/background_service_worker.js`),
		);
		if (worker === undefined) {
			throw new Error('the extension service worker is not running');
		}
		const client = new CdpClient(port);
		await client.connect(worker.webSocketDebuggerUrl);
		const settings = {
			globallyEnabled: globallyEnabled,
			actingAllowedByOrigin: {
				[ORIGIN]: actingAllowed,
			},
		};
		await client.evaluate(
			`chrome.storage.local.set({ webmcp_everywhere_settings: ${JSON.stringify(settings)} }).then(() => 'ok')`,
		);
		client.close();
	}

	/**
	 * Loads the target page again, so the runtime re-reads the grant.
	 *
	 * @param port - The remote debugging port.
	 * @param url - The page to load.
	 * @returns A client attached to the reloaded page.
	 */
	static async _reload(port: number, url: string): Promise<CdpClient> {
		const page = await CdpClient.connectToPage(port, 'caniuse.com');
		await page.navigate(url, 6000);
		return page;
	}

	/**
	 * Lists the tool names currently registered on the page.
	 *
	 * @param page - A client attached to the page.
	 * @returns The registered names.
	 */
	static async _toolNames(page: CdpClient): Promise<string[]> {
		const json = await page.evaluate<string>(
			'document.modelContext.getTools().then((tools) => JSON.stringify(tools.map((tool) => tool.name)))',
		);
		return JSON.parse(json) as string[];
	}

	/**
	 * Calls one registered tool the way an agent would, and parses its reply.
	 *
	 * @param page - A client attached to the page.
	 * @param shortName - The unqualified tool name, such as `search_features`.
	 * @param input - The tool's input.
	 * @returns The tool's parsed result.
	 * @throws When the tool is not registered, or when the tool itself threw. A tool that throws makes
	 *         `executeTool` reject, which makes the evaluation throw, carrying the tool's own message.
	 */
	static async _callTool<ResultType = unknown>(
		page: CdpClient,
		shortName: string,
		input: Record<string, unknown> = {},
	): Promise<ResultType> {
		const qualifiedName = `caniuse_com__${shortName}`;
		const expression = `
			(async () => {
				const tools = await document.modelContext.getTools();
				const tool = tools.find((candidate) => candidate.name === ${JSON.stringify(qualifiedName)});
				if (tool === undefined) { throw new Error('tool not registered: ' + ${JSON.stringify(qualifiedName)}); }
				return await document.modelContext.executeTool(tool, ${JSON.stringify(JSON.stringify(input))});
			})()
		`;
		const raw = await page.evaluate<string>(expression);
		const framed = JSON.parse(raw) as FramedResultOf<ResultType>;
		if (framed?.webmcpEverywhere === undefined) {
			throw new Error(`${shortName} returned an unframed result, so the untrusted content check was skipped`);
		}
		return framed.data;
	}

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

	/**
	 * Waits.
	 *
	 * @param milliseconds - How long to wait.
	 * @returns Nothing.
	 */
	static async _pause(milliseconds: number): Promise<void> {
		await new Promise((resolve) => {
			setTimeout(resolve, milliseconds);
		});
	}

	/**
	 * Asserts two lists hold the same names.
	 *
	 * @param actual - What was found.
	 * @param expected - What was wanted.
	 * @returns Nothing.
	 * @throws When the two lists differ.
	 */
	static _assertSameSet(actual: string[], expected: string[]): void {
		const sortedActual = [...actual].sort().join(', ');
		const sortedExpected = [...expected].sort().join(', ');
		if (sortedActual !== sortedExpected) {
			throw new Error(`expected ${sortedExpected} but found ${sortedActual}`);
		}
	}
}

const outcome = await VerifyCaniuse.run();
process.exit(outcome.failed === 0 ? 0 : 1);

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	ReportSiteReachability — says which adapted sites answer this machine
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

import { CdpClient } from '../chrome_devtools_protocol/cdp_client.ts';
import { LaunchChrome } from '../../contribs/chrome_extension/tools/launch_chrome.ts';
import { SyncAdapterRegistry } from '../../contribs/site_adapters/tools/sync_adapter_registry.ts';

const __filename = import.meta.filename;
const __dirname = import.meta.dirname;

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	Types
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/** What one adapted site did when this machine asked for it. */
export type SiteReachability = {
	/** The adapter's site slug. */
	siteSlug: string;
	/** The address that was loaded. */
	url: string;
	/** The address the browser ended on, which differs when the site redirected. */
	landedOn: string;
	/** The title of the page that came back. */
	title: string;
	/** How many characters of text the page carries, which separates a real page from a refusal. */
	textLength: number;
	/** The tool names the adapter registered there, empty when it registered none. */
	registeredTools: string[];
	/** What went wrong, empty when nothing did. */
	problem: string;
};

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	ReportSiteReachability
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/**
 * Loads every adapted site in a real Chrome and says what came back.
 *
 * A nightly check that runs an adapter's runner reports one thing when the adapter broke and the
 * same thing when the site refused the machine the check runs on. Those are opposite conclusions,
 * and telling them apart needs the site asked directly rather than through a runner. A site that
 * serves a laptop and refuses a data centre address is the case this exists for.
 *
 * @returns One entry per adapter in the registry.
 */
export class ReportSiteReachability {
	/** How long to wait after loading before reading the page, in milliseconds. */
	static readonly SETTLE = 8000;

	/**
	 * Loads each adapted site in turn and reports what it did.
	 *
	 * @returns One entry per adapter in the registry.
	 */
	static async run(): Promise<SiteReachability[]> {
		const results: SiteReachability[] = [];
		const adapters = await SyncAdapterRegistry.discover();
		const launched = await LaunchChrome.run({
			url: 'about:blank',
		});

		for (const adapter of adapters) {
			const url = ReportSiteReachability._addressOf(adapter.matchPatterns[0]);
			const entry: SiteReachability = {
				siteSlug: adapter.siteSlug,
				url: url,
				landedOn: '',
				title: '',
				textLength: 0,
				registeredTools: [],
				problem: '',
			};
			let page: CdpClient | null = null;
			try {
				page = await CdpClient.connectToPage(launched.port, '');
				await page.navigate(url, ReportSiteReachability.SETTLE);
				entry.landedOn = await page.evaluate<string>('window.location.href');
				entry.title = await page.evaluate<string>('document.title');
				entry.textLength = await page.evaluate<number>('(document.body?.innerText ?? "").length');
				const names = await page.evaluate<string>(
					'typeof document.modelContext === "undefined" ? "[]" : ' +
						'document.modelContext.getTools().then((tools) => JSON.stringify(tools.map((tool) => tool.name)))',
				);
				entry.registeredTools = JSON.parse(names) as string[];
			} catch (error) {
				entry.problem = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
			} finally {
				page?.close();
			}
			results.push(entry);
		}

		return results;
	}

	/**
	 * Prints the results as lines a person reads in a job log.
	 *
	 * @param results - What each site did.
	 * @returns Nothing.
	 */
	static print(results: SiteReachability[]): void {
		for (const entry of results) {
			console.log(`${entry.siteSlug}`);
			console.log(`  asked for   ${entry.url}`);
			console.log(`  landed on   ${entry.landedOn === '' ? 'nowhere' : entry.landedOn}`);
			console.log(`  title       ${entry.title === '' ? '(none)' : entry.title}`);
			console.log(`  text length ${entry.textLength}`);
			console.log(`  tools       ${entry.registeredTools.length}`);
			if (entry.problem !== '') {
				console.log(`  problem     ${entry.problem}`);
			}
		}
	}

	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////
	//	Helpers
	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////

	/**
	 * Turns a match pattern into an address that can be loaded.
	 *
	 * @param matchPattern - A pattern such as `https://www.openstreetmap.org/*`.
	 * @returns The same address with the trailing wildcard removed.
	 */
	static _addressOf(matchPattern: string): string {
		return matchPattern.replace(/\*$/, '');
	}
}

if (import.meta.filename === process.argv[1]) {
	const results = await ReportSiteReachability.run();
	ReportSiteReachability.print(results);
	process.exit(0);
}

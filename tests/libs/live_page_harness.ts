///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	LivePageHarness — the live browser every site verification runner works against
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

import { CdpClient } from '../../tools/chrome_devtools_protocol/cdp_client.ts';
import { GrantActing } from '../../tools/chrome_extension/grant_acting.ts';
import { LaunchChrome } from '../../tools/chrome_extension/launch_chrome.ts';
import type { FramedResultOf } from './host_call_types.ts';

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	Types
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/** The live browser a runner works against, prepared once before the first of its checks. */
export type LivePage = {
	/** The remote debugging port Chrome is listening on. */
	port: number;
	/** A client attached to the page under test. */
	page: CdpClient;
};

/** Which site a runner drives, and how long that site takes to settle. */
export type LivePageHarnessOptions = {
	/** The adapter's site slug, which every one of its tool names starts with. */
	siteSlug: string;
	/** The origin the acting opt-in is written for. */
	origin: string;
	/** The page to open. */
	url: string;
	/** Text the page target's uniform resource locator contains, used to find it again after a reload. */
	urlFragment: string;
	/** How long to wait after a navigation before reading the page, in milliseconds. */
	settleMs?: number;
};

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	LivePageHarness
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/**
 * Launches a real Chrome with the extension installed, and drives one adapted page in it.
 *
 * Every site verification runner needs the same five things: a browser, the user's opt-in written into
 * extension storage, a page loaded fresh so the runtime re-reads that opt-in, the names of the tools
 * the adapter registered, and a way to call one of those tools the way an agent would. Each runner used
 * to carry its own copy of all five, differing only in the site slug and the address.
 *
 * Nothing here is mocked. Chrome is launched, the extension is installed, the real page is loaded, and
 * a tool call goes through `document.modelContext` exactly as it does for an agent.
 */
export class LivePageHarness {
	/** How long to wait after a navigation when the caller names no other figure, in milliseconds. */
	static readonly DEFAULT_SETTLE = 6000;

	/** The adapter's site slug, which every one of its tool names starts with. */
	siteSlug: string;

	/** The origin the acting opt-in is written for. */
	origin: string;

	/** The page to open. */
	url: string;

	/** Text the page target's uniform resource locator contains. */
	urlFragment: string;

	/** How long to wait after a navigation before reading the page, in milliseconds. */
	settleMs: number;

	/** The remote debugging port of the launched Chrome, or null before `launch`. */
	port: number | null;

	/** The client attached to the page under test, or null before `reload` has attached one. */
	page: CdpClient | null;

	/**
	 * @param options - Which site to drive, and how long it takes to settle.
	 */
	constructor(options: LivePageHarnessOptions) {
		this.siteSlug = options.siteSlug;
		this.origin = options.origin;
		this.url = options.url;
		this.urlFragment = options.urlFragment;
		this.settleMs = options.settleMs ?? LivePageHarness.DEFAULT_SETTLE;
		this.port = null;
		this.page = null;
	}

	/**
	 * Launches Chrome, writes the opt-in, and loads the page fresh.
	 *
	 * The opt-in is written before the page is loaded, because the runtime reads it once at registration.
	 * Writing it afterwards would leave the page showing the tools of the previous state.
	 *
	 * @param actingAllowed - Whether acting tools are opted in on this origin before the first check.
	 * @returns The live browser.
	 */
	async launch(actingAllowed = false): Promise<LivePage> {
		const launched = await LaunchChrome.run({
			url: this.url,
		});
		this.port = launched.port;
		await this.setGrant(actingAllowed, true);
		await this.reload();
		return this.requireContext();
	}

	/**
	 * Closes the page and forgets the browser.
	 *
	 * @returns Nothing.
	 */
	close(): void {
		this.page?.close();
		this.page = null;
		this.port = null;
	}

	/**
	 * Returns the live browser, refusing to continue when there is none.
	 *
	 * @returns The port and the page.
	 * @throws When `launch` never prepared them.
	 */
	requireContext(): LivePage {
		if (this.port === null || this.page === null) {
			throw new Error('the browser was never launched');
		}
		return {
			port: this.port,
			page: this.page,
		};
	}

	/**
	 * Writes the user's settings straight into extension storage, standing in for the popup.
	 *
	 * @param actingAllowed - Whether acting tools are allowed on this origin.
	 * @param globallyEnabled - Whether the extension is switched on at all.
	 * @returns Nothing.
	 */
	async setGrant(actingAllowed: boolean, globallyEnabled: boolean): Promise<void> {
		if (this.port === null) {
			throw new Error('the browser was never launched');
		}
		await GrantActing.run({
			port: this.port,
			origin: this.origin,
			actingAllowed: actingAllowed,
			globallyEnabled: globallyEnabled,
		});
	}

	/**
	 * Loads the page again, so the runtime re-reads the grant, and attaches to it.
	 *
	 * @param url - The address to load, or nothing to load this harness's own.
	 * @returns A client attached to the reloaded page.
	 */
	async reload(url?: string): Promise<CdpClient> {
		if (this.port === null) {
			throw new Error('the browser was never launched');
		}
		this.page?.close();
		const page = await CdpClient.connectToPage(this.port, this.urlFragment);
		await page.navigate(url ?? this.url, this.settleMs);
		this.page = page;
		return page;
	}

	/**
	 * Names every tool currently registered on the page, by any adapter.
	 *
	 * @param page - A client attached to the page.
	 * @returns The registered names.
	 */
	async toolNames(page: CdpClient): Promise<string[]> {
		const json = await page.evaluate<string>(
			'document.modelContext.getTools().then((tools) => JSON.stringify(tools.map((tool) => tool.name)))',
		);
		return JSON.parse(json) as string[];
	}

	/**
	 * Calls one registered tool the way an agent would, and takes the result out of its frame.
	 *
	 * The lookup happens inside the page. A `RegisteredTool` carries a live `window` reference, so it
	 * cannot be serialised across the Chrome DevTools Protocol boundary; only its name can cross.
	 *
	 * @param page - A client attached to the page.
	 * @param shortName - The unqualified tool name, such as `list_todos`.
	 * @param input - The tool's input.
	 * @returns The tool's parsed result.
	 * @throws When the tool is not registered, when its result was never framed, or when the tool itself
	 *         threw. A tool that throws makes `executeTool` reject, which makes the evaluation throw,
	 *         carrying the tool's own message.
	 */
	async callTool<ResultType = unknown>(
		page: CdpClient,
		shortName: string,
		input: Record<string, unknown> = {},
	): Promise<ResultType> {
		const qualifiedName = `${this.siteSlug}__${shortName}`;
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

	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////
	//	Helpers
	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////

	/**
	 * Waits.
	 *
	 * @param milliseconds - How long to wait.
	 * @returns Nothing.
	 */
	static async pause(milliseconds: number): Promise<void> {
		await new Promise((resolve) => {
			setTimeout(resolve, milliseconds);
		});
	}

	/**
	 * Asserts two lists hold the same names, whatever order they arrived in.
	 *
	 * @param actual - What was found.
	 * @param expected - What was wanted.
	 * @returns Nothing.
	 * @throws When the two lists differ.
	 */
	static assertSameSet(actual: string[], expected: string[]): void {
		const sortedActual = [...actual].sort().join(', ');
		const sortedExpected = [...expected].sort().join(', ');
		if (sortedActual !== sortedExpected) {
			throw new Error(`expected ${sortedExpected} but found ${sortedActual}`);
		}
	}
}

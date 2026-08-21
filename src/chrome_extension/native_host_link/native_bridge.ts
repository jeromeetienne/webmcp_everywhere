import { AdapterRegistry } from '../shared_state/adapter_registry.js';
import { ExtensionStorage } from '../shared_state/extension_storage.js';
import { InjectionWatch } from '../shared_state/injection_watch.js';
import type { PageToolSummary } from '../page_injection/page_query.js';
import type { ContentWarning } from '../../adapter_format/untrusted_content.js';

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	NativeBridge — answers the native host on behalf of every adapted tab
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/** One tab that has an adapter running in it. */
export type AdaptedPage = {
	/** The tab's identifier. */
	tabId: number;
	/** The tab's uniform resource locator. */
	url: string;
	/** The tab's title. */
	title: string;
	/** The site slug of the adapter running there. */
	siteSlug: string;
	/** The tools currently registered in that tab. */
	tools: PageToolSummary[];
};

/** A tool as the bridge offers it to an agent, remembering which tab it came from. */
export type ExposedTool = {
	/** The name the agent sees, which may carry a tab suffix when two tabs offer the same tool. */
	exposedName: string;
	/** The name the page knows it by. */
	pageName: string;
	/** The tab it lives in. */
	tabId: number;
	/** What the tool does, with the page it belongs to named. */
	description: string;
	/** A short human-readable name. */
	title: string;
	/** The tool's input schema. */
	inputSchema: Record<string, unknown>;
	/** Whether the tool only observes. */
	readOnly: boolean;
};

/**
 * The extension's side of the native messaging connection.
 *
 * The agent never reaches a page directly. It asks the native host, the host asks this, and this asks
 * whichever tab owns the tool. Everything the agent can do therefore passes through the extension,
 * which is the only place that knows what the user has allowed.
 */
export class NativeBridge {
	/** The native messaging host this connects to. Must match the installed host manifest. */
	static readonly HOST_NAME = 'com.webmcp_everywhere.host';

	/** The synthetic tool the bridge answers itself, so an agent can see what pages are available. */
	static readonly LIST_PAGES_TOOL = 'webmcp_everywhere__list_pages';

	/** The synthetic tool the bridge answers itself, so an agent can open a page an adapter covers. */
	static readonly OPEN_PAGE_TOOL = 'webmcp_everywhere__open_page';

	/** The synthetic tool the bridge answers itself, so an agent can close a page it no longer needs. */
	static readonly CLOSE_PAGE_TOOL = 'webmcp_everywhere__close_page';

	/** How long to wait for a freshly opened page to register its tools, in milliseconds. */
	static readonly OPEN_PAGE_TIMEOUT = 10000;

	/** How long to wait between two attempts to read a freshly opened page's tools, in milliseconds. */
	static readonly OPEN_PAGE_POLL_DELAY = 250;

	/** The open connection to the host, or null when it is not connected. */
	static _port: chrome.runtime.Port | null = null;

	/** How long to wait before trying to reconnect after the host goes away, in milliseconds. */
	static _reconnectDelay = 1000;

	/**
	 * Opens the connection to the native host and keeps it open.
	 *
	 * @returns Nothing.
	 */
	static connect(): void {
		try {
			NativeBridge._port = chrome.runtime.connectNative(NativeBridge.HOST_NAME);
		} catch {
			NativeBridge._scheduleReconnect();
			return;
		}

		NativeBridge._port.onMessage.addListener((message) => {
			void NativeBridge._onRequest(message);
		});

		NativeBridge._port.onDisconnect.addListener(() => {
			NativeBridge._port = null;
			NativeBridge._scheduleReconnect();
		});

		NativeBridge._reconnectDelay = 1000;
	}

	/**
	 * Lists every tab an adapter is running in, along with the tools registered there.
	 *
	 * @returns One entry per adapted tab. Tabs that do not answer are left out rather than failing the call.
	 */
	static async listPages(): Promise<AdaptedPage[]> {
		const tabs = await chrome.tabs.query({});
		const pages: AdaptedPage[] = [];

		for (const tab of tabs) {
			if (tab.id === undefined || tab.url === undefined) {
				continue;
			}
			const adapter = AdapterRegistry.findForUrl(tab.url);
			if (adapter === null) {
				continue;
			}
			const tools = await NativeBridge._askTab(tab.id, {
				kind: 'page:listTools',
			});
			if (tools === null) {
				continue;
			}
			pages.push({
				tabId: tab.id,
				url: tab.url,
				title: tab.title ?? '',
				siteSlug: adapter.siteSlug,
				tools: (tools.result ?? []) as PageToolSummary[],
			});
		}

		return pages;
	}

	/**
	 * Opens a page in a new tab and waits until its adapter has registered its tools.
	 *
	 * Only a page some adapter covers may be opened. An agent that could open any uniform resource
	 * locator at all would be a general browser driver, which is exactly what this project exists not to
	 * be: the adapters are the whole of the surface the user has agreed to.
	 *
	 * @param url - The page to open.
	 * @returns The tab that was opened, once its tools are registered.
	 * @throws When no adapter covers that page, or the page never registers its tools.
	 */
	static async openPage(url: string): Promise<AdaptedPage> {
		const adapter = AdapterRegistry.findForUrl(url);
		if (adapter === null) {
			const covered = AdapterRegistry.ADAPTERS.flatMap((candidate) => candidate.matchPatterns);
			throw new Error(
				`no adapter covers ${url}; WebMCP Everywhere can open these pages only: ${covered.join(', ')}`,
			);
		}

		const tab = await chrome.tabs.create({
			url: url,
			active: false,
		});
		if (tab.id === undefined) {
			throw new Error(`the browser opened ${url} without giving it a tab identifier`);
		}

		const deadline = Date.now() + NativeBridge.OPEN_PAGE_TIMEOUT;
		while (Date.now() < deadline) {
			const tools = await NativeBridge._askTab(tab.id, {
				kind: 'page:listTools',
			});
			if (tools !== null) {
				const opened = await chrome.tabs.get(tab.id);
				return {
					tabId: tab.id,
					url: opened.url ?? url,
					title: opened.title ?? '',
					siteSlug: adapter.siteSlug,
					tools: (tools.result ?? []) as PageToolSummary[],
				};
			}
			await NativeBridge._wait(NativeBridge.OPEN_PAGE_POLL_DELAY);
		}

		throw new Error(`${url} opened in tab ${tab.id} but registered no tools within the time allowed`);
	}

	/**
	 * Closes one adapted tab.
	 *
	 * Only a tab an adapter covers may be closed, so an agent can put back a page it opened without ever
	 * reaching the rest of the user's browser.
	 *
	 * @param tabId - The tab to close.
	 * @returns Which tab was closed and what was on it.
	 * @throws When the tab is gone, no adapter covers it, or a page has tried to issue instructions.
	 */
	static async closePage(tabId: number): Promise<{ tabId: number; url: string; title: string }> {
		if ((await InjectionWatch.isActingBlocked()) === true) {
			throw new Error(await InjectionWatch.refusalMessage());
		}

		let tab: chrome.tabs.Tab;
		try {
			tab = await chrome.tabs.get(tabId);
		} catch {
			throw new Error(`there is no tab ${tabId}`);
		}

		if (tab.url === undefined || AdapterRegistry.findForUrl(tab.url) === null) {
			throw new Error(`tab ${tabId} is not a page WebMCP Everywhere has an adapter for`);
		}

		await chrome.tabs.remove(tabId);
		return {
			tabId: tabId,
			url: tab.url,
			title: tab.title ?? '',
		};
	}

	/**
	 * Builds the tool list an agent sees, across every adapted tab.
	 *
	 * A name is offered unchanged when only one tab has it. When several tabs have the same tool — two
	 * windows on the same site — every one of them gains a tab suffix, so the ambiguity is visible
	 * rather than silently resolved to whichever tab happened to be first.
	 *
	 * @returns The exposed tools.
	 */
	static async listTools(): Promise<ExposedTool[]> {
		const pages = await NativeBridge.listPages();
		const countByName = new Map<string, number>();
		for (const page of pages) {
			for (const tool of page.tools) {
				countByName.set(tool.name, (countByName.get(tool.name) ?? 0) + 1);
			}
		}

		const exposed: ExposedTool[] = [];
		for (const page of pages) {
			for (const tool of page.tools) {
				const ambiguous = (countByName.get(tool.name) ?? 0) > 1;
				exposed.push({
					exposedName: ambiguous === true ? `${tool.name}__tab${page.tabId}` : tool.name,
					pageName: tool.name,
					tabId: page.tabId,
					title: tool.title,
					description: `${tool.description} (page: ${page.title || page.url})`,
					inputSchema: tool.inputSchema,
					readOnly: tool.readOnly,
				});
			}
		}
		return exposed;
	}

	/**
	 * Runs a tool in whichever tab owns it.
	 *
	 * An acting tool is refused outright while any page has recently returned content shaped like an
	 * attempt to give the agent orders. Reading stays available, so the agent can still report what it
	 * found, which is what it should be doing instead of acting on it.
	 *
	 * @param exposedName - The name the agent used.
	 * @param args - The tool's arguments.
	 * @returns Whatever the tool returned.
	 * @throws When no tab offers that tool, the tab refuses, or a page has tried to issue instructions.
	 */
	static async callTool(exposedName: string, args: Record<string, unknown>): Promise<unknown> {
		const exposed = await NativeBridge.listTools();
		const tool = exposed.find((candidate) => candidate.exposedName === exposedName);
		if (tool === undefined) {
			throw new Error(`no tool named ${exposedName} is available on any open page`);
		}

		if (tool.readOnly === false && (await InjectionWatch.isActingBlocked()) === true) {
			throw new Error(await InjectionWatch.refusalMessage());
		}

		const reply = await NativeBridge._askTab(tool.tabId, {
			kind: 'page:callTool',
			name: tool.pageName,
			args: args ?? {},
		});
		if (reply === null) {
			throw new Error(`the page holding ${exposedName} stopped answering`);
		}
		if (reply.ok === false) {
			throw new Error(reply.error ?? 'the tool failed');
		}

		await NativeBridge._noticeWarnings(tool, reply.result);
		return reply.result;
	}

	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////
	//	Helpers
	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////

	/**
	 * Serves one request from the native host.
	 *
	 * @param message - The host's request.
	 * @returns Nothing.
	 */
	static async _onRequest(message: {
		id?: number;
		kind?: string;
		name?: string;
		args?: Record<string, unknown>;
	}): Promise<void> {
		if (message?.id === undefined) {
			return;
		}
		try {
			const result = await NativeBridge._serve(message);
			NativeBridge._reply({
				id: message.id,
				ok: true,
				result: result,
			});
		} catch (error) {
			NativeBridge._reply({
				id: message.id,
				ok: false,
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}

	/**
	 * Works out what one request is asking for.
	 *
	 * @param message - The host's request.
	 * @returns The answer.
	 * @throws When the request is not understood.
	 */
	static async _serve(message: {
		kind?: string;
		name?: string;
		args?: Record<string, unknown>;
	}): Promise<unknown> {
		if (message.kind === 'listTools') {
			const exposed = await NativeBridge.listTools();
			const settings = await ExtensionStorage.read();
			return {
				enabled: settings.globallyEnabled,
				tools: exposed.map((tool) => ({
					name: tool.exposedName,
					title: tool.title,
					description: tool.description,
					inputSchema: tool.inputSchema,
					readOnly: tool.readOnly,
				})),
			};
		}

		if (message.kind === 'listPages') {
			const pages = await NativeBridge.listPages();
			return pages.map((page) => ({
				tabId: page.tabId,
				url: page.url,
				title: page.title,
				adapter: page.siteSlug,
				toolCount: page.tools.length,
			}));
		}

		if (message.kind === 'openPage') {
			const page = await NativeBridge.openPage(String(message.args?.['url'] ?? ''));
			return {
				tabId: page.tabId,
				url: page.url,
				title: page.title,
				adapter: page.siteSlug,
				tools: page.tools.map((tool) => tool.name),
			};
		}

		if (message.kind === 'closePage') {
			const tabId = Number(message.args?.['tabId']);
			if (Number.isInteger(tabId) === false) {
				throw new Error('closing a page needs the tabId that list_pages or open_page reported');
			}
			return await NativeBridge.closePage(tabId);
		}

		if (message.kind === 'callTool') {
			if (message.name === NativeBridge.LIST_PAGES_TOOL) {
				return await NativeBridge._serve({
					kind: 'listPages',
				});
			}
			if (message.name === NativeBridge.OPEN_PAGE_TOOL) {
				return await NativeBridge._serve({
					kind: 'openPage',
					args: message.args ?? {},
				});
			}
			if (message.name === NativeBridge.CLOSE_PAGE_TOOL) {
				return await NativeBridge._serve({
					kind: 'closePage',
					args: message.args ?? {},
				});
			}
			return await NativeBridge.callTool(message.name ?? '', message.args ?? {});
		}

		throw new Error(`unknown request kind ${message.kind}`);
	}

	/**
	 * Notices anything the content check flagged in a result, and makes it visible.
	 *
	 * @param tool - The tool that produced the result.
	 * @param result - The framed result the page returned.
	 * @returns Nothing.
	 */
	static async _noticeWarnings(tool: ExposedTool, result: unknown): Promise<void> {
		const framed = NativeBridge._asFramed(result);
		const warnings = framed?.webmcpEverywhere?.warnings ?? [];
		if (warnings.length === 0) {
			return;
		}
		const blocked = await InjectionWatch.record(
			framed?.webmcpEverywhere?.origin ?? 'an unknown origin',
			framed?.webmcpEverywhere?.tool ?? tool.pageName,
			warnings,
		);
		if (blocked === true) {
			await chrome.action.setBadgeBackgroundColor({
				color: '#c0392b',
			});
			await chrome.action.setBadgeText({
				text: '!',
			});
		}
	}

	/**
	 * Reads the framing off a result, whichever form it arrived in.
	 *
	 * `executeTool` hands back a JSON string rather than an object, so a result that has crossed WebMCP
	 * arrives as text. Reading `.webmcpEverywhere` straight off it silently found nothing, which left
	 * the injection watch permanently unarmed while every check around it still passed.
	 *
	 * @param result - The result as it arrived.
	 * @returns The framed result, or null when it carries no framing.
	 */
	static _asFramed(
		result: unknown,
	): { webmcpEverywhere?: { origin?: string; tool?: string; warnings?: ContentWarning[] } } | null {
		if (typeof result === 'string') {
			try {
				return JSON.parse(result);
			} catch {
				return null;
			}
		}
		if (result !== null && typeof result === 'object') {
			return result as { webmcpEverywhere?: { origin?: string; warnings?: ContentWarning[] } };
		}
		return null;
	}

	/**
	 * Sends one reply back to the native host.
	 *
	 * @param reply - What to send.
	 * @returns Nothing.
	 */
	static _reply(reply: { id: number; ok: boolean; result?: unknown; error?: string }): void {
		if (NativeBridge._port === null) {
			return;
		}
		NativeBridge._port.postMessage(reply);
	}

	/**
	 * Asks one tab a question, returning null rather than throwing when the tab cannot answer.
	 *
	 * A tab may be mid-navigation, discarded, or simply have no content script, and none of those should
	 * fail a request that spans every tab.
	 *
	 * @param tabId - The tab to ask.
	 * @param message - The question.
	 * @returns The tab's reply, or null when it did not answer.
	 */
	static async _askTab(
		tabId: number,
		message: Record<string, unknown>,
	): Promise<{ ok: boolean; result?: unknown; error?: string } | null> {
		try {
			const reply = await chrome.tabs.sendMessage(tabId, message);
			if (reply === undefined || reply === null) {
				return null;
			}
			return reply as { ok: boolean; result?: unknown; error?: string };
		} catch {
			return null;
		}
	}

	/**
	 * Waits for a while.
	 *
	 * @param milliseconds - How long to wait.
	 * @returns Nothing.
	 */
	static async _wait(milliseconds: number): Promise<void> {
		await new Promise((resolve) => {
			setTimeout(resolve, milliseconds);
		});
	}

	/**
	 * Tries the host again later, backing off so a missing host does not spin.
	 *
	 * The host is absent whenever it has not been installed, which is a normal state for a user who only
	 * wants the extension. It must not turn into a busy loop.
	 *
	 * @returns Nothing.
	 */
	static _scheduleReconnect(): void {
		const delay = NativeBridge._reconnectDelay;
		NativeBridge._reconnectDelay = Math.min(delay * 2, 60000);
		setTimeout(() => {
			if (NativeBridge._port === null) {
				NativeBridge.connect();
			}
		}, delay);
	}
}

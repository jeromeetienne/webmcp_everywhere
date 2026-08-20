///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	NativeBridge — answers the native host on behalf of every adapted tab
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

import { AdapterRegistry } from './adapter_registry.js';
import { ExtensionStorage } from './extension_storage.js';
import { InjectionWatch } from './injection_watch.js';
import type { PageToolSummary } from './page_query.js';
import type { ContentWarning } from '../adapter_format/untrusted_content.js';

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

		if (message.kind === 'callTool') {
			if (message.name === NativeBridge.LIST_PAGES_TOOL) {
				return await NativeBridge._serve({ kind: 'listPages' });
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

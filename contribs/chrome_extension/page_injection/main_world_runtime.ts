import { ToolNaming } from '@webmcp_everywhere/site_adapter_lib';
import type { Adapter, OriginGrant } from '@webmcp_everywhere/site_adapter_lib';
import { AdapterRuntime } from './adapter_runtime.js';
import { PageQuery } from './page_query.js';
import type { PageQueryRequest, PageToolSummary } from './page_query.js';

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	MainWorldRuntime — the main world entry point, the only place that touches WebMCP
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/** Answers which adapter, if any, covers a page. */
export type FindAdapterForUrlFn = (url: string) => Adapter | null;

/**
 * Runs in the page's main world, because `document.modelContext` exists nowhere else.
 *
 * It does two jobs. It registers the matching adapter's tools, subject to what the user has allowed.
 * And it answers questions from the isolated world about what is registered here and runs those tools
 * on request, which is how an agent connected to the native host eventually reaches this page.
 *
 * This script has no access to extension storage, so it never decides for itself what the user has
 * allowed. It asks, waits, and re-asks whenever the answer changes.
 *
 * Two entry points share it. `content_main.ts` is the bundled path, and looks its adapter up in the
 * registry this build carries. `external_adapter_main.ts` is the loaded path, and its one adapter came
 * from a folder by way of the native messaging host. Exactly one of them runs on any page, because the
 * service worker never registers two adapters for one origin: both would answer the isolated world's
 * questions, and the second answer would be thrown away without anybody noticing.
 */
export class MainWorldRuntime {
	/** The adapter matching this page, worked out at startup and again on same-document navigation. */
	static _adapter: Adapter | null = null;

	/** How to find the adapter for a page, which differs between the bundled path and the loaded path. */
	static _findAdapterForUrl: FindAdapterForUrlFn = () => null;

	/**
	 * Starts listening for grants and for queries, then asks for the first grant.
	 *
	 * @param findAdapterForUrl - How to find the adapter covering a page.
	 * @returns Nothing.
	 */
	static start(findAdapterForUrl: FindAdapterForUrlFn): void {
		MainWorldRuntime._findAdapterForUrl = findAdapterForUrl;
		MainWorldRuntime._adapter = findAdapterForUrl(window.location.href);
		if (MainWorldRuntime._adapter === null) {
			return;
		}

		document.addEventListener(AdapterRuntime.GRANT_EVENT, MainWorldRuntime._onGrant as EventListener);
		document.addEventListener(PageQuery.REQUEST_EVENT, MainWorldRuntime._onQuery as EventListener);
		window.addEventListener('hashchange', MainWorldRuntime._onSameDocumentNavigation);
		window.addEventListener('popstate', MainWorldRuntime._onSameDocumentNavigation);

		MainWorldRuntime._requestGrant();
	}

	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////
	//	Helpers
	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////

	/**
	 * Asks the isolated world what the user has allowed on this origin.
	 *
	 * @returns Nothing.
	 */
	static _requestGrant(): void {
		document.dispatchEvent(new CustomEvent(AdapterRuntime.REQUEST_GRANT_EVENT));
	}

	/**
	 * Registers, or re-registers, when a grant arrives.
	 *
	 * @param event - The grant event from the isolated world.
	 * @returns Nothing.
	 */
	static _onGrant = (event: CustomEvent<OriginGrant>): void => {
		const adapter = MainWorldRuntime._adapter;
		if (adapter === null) {
			return;
		}
		void AdapterRuntime.register(adapter, event.detail);
	};

	/**
	 * Answers a question from the isolated world.
	 *
	 * @param event - The request event.
	 * @returns Nothing.
	 */
	static _onQuery = (event: CustomEvent<PageQueryRequest>): void => {
		const request = event.detail;
		void MainWorldRuntime._handleQuery(request)
			.then((result) => {
				PageQuery.answer({
					requestId: request.requestId,
					ok: true,
					result: result,
				});
			})
			.catch((error: unknown) => {
				PageQuery.answer({
					requestId: request.requestId,
					ok: false,
					error: error instanceof Error ? error.message : String(error),
				});
			});
	};

	/**
	 * Does the work behind one query.
	 *
	 * @param request - What was asked.
	 * @returns The answer.
	 * @throws When the request cannot be served.
	 */
	static async _handleQuery(request: PageQueryRequest): Promise<unknown> {
		if (request.kind === 'listTools') {
			return await MainWorldRuntime._listTools();
		}
		if (request.kind === 'callTool') {
			return await MainWorldRuntime._callTool(request.name, request.args);
		}
		throw new Error('unknown request');
	}

	/**
	 * Describes every tool this page's adapter currently has registered.
	 *
	 * The permission class is read from the adapter definition rather than from the registration,
	 * because WebMCP only carries a read-only hint and the extension needs the real class to check a
	 * call against the user's grant a second time before running it.
	 *
	 * @returns One summary per registered tool.
	 */
	static async _listTools(): Promise<PageToolSummary[]> {
		const adapter = MainWorldRuntime._adapter;
		if (adapter === null) {
			return [];
		}
		if (document.modelContext === undefined) {
			return [];
		}

		const registered = await document.modelContext.getTools();
		const summaries: PageToolSummary[] = [];

		for (const tool of registered) {
			if (ToolNaming.belongsTo(tool.name, adapter.siteSlug) === false) {
				continue;
			}
			const parts = ToolNaming.unqualify(tool.name);
			const definition = adapter.tools.find((candidate) => candidate.name === parts?.toolName);
			summaries.push({
				name: tool.name,
				title: tool.title ?? definition?.title ?? tool.name,
				description: tool.description,
				inputSchema: MainWorldRuntime._parseSchema(tool.inputSchema),
				permissionClass: definition?.permissionClass ?? 'acting',
				readOnly: tool.annotations?.readOnlyHint === true,
			});
		}

		return summaries;
	}

	/**
	 * Runs one of this page's registered tools.
	 *
	 * @param name - The qualified tool name.
	 * @param args - The tool's arguments.
	 * @returns Whatever the tool returned, as the string WebMCP produces.
	 * @throws When the tool is not registered here.
	 */
	static async _callTool(name: string, args: Record<string, unknown>): Promise<string> {
		const adapter = MainWorldRuntime._adapter;
		if (adapter === null) {
			throw new Error('no adapter is active on this page');
		}
		if (ToolNaming.belongsTo(name, adapter.siteSlug) === false) {
			throw new Error(`${name} does not belong to the adapter running here`);
		}
		const registered = await document.modelContext.getTools();
		const tool = registered.find((candidate) => candidate.name === name);
		if (tool === undefined) {
			throw new Error(`${name} is not registered on this page`);
		}
		return await document.modelContext.executeTool(tool, JSON.stringify(args ?? {}));
	}

	/**
	 * Parses the schema string WebMCP hands back.
	 *
	 * @param schemaJson - The schema as WebMCP reported it.
	 * @returns A JSON Schema object.
	 */
	static _parseSchema(schemaJson: string | undefined): Record<string, unknown> {
		const empty = {
			type: 'object',
			properties: {},
		};
		if (schemaJson === undefined) {
			return empty;
		}
		try {
			const parsed = JSON.parse(schemaJson);
			if (parsed === null || typeof parsed !== 'object') {
				return empty;
			}
			return parsed as Record<string, unknown>;
		} catch {
			return empty;
		}
	}

	/**
	 * Handles navigation that does not reload the page.
	 *
	 * A single-page application can change what it is capable of without a page load, which is exactly
	 * the re-registration lifecycle issue #1 raises. TodoMVC changes its filter through the URL fragment,
	 * so this path runs on the demonstration site rather than being untested defensive code.
	 *
	 * Re-registering only when the matching adapter actually changes matters more than it looks. An
	 * adapter tool that switches filters changes the fragment, so re-registering on every fragment change
	 * meant a tool aborted its own registration part way through its own call, and the agent got
	 * `UnknownError` back from a tool that had in fact worked.
	 *
	 * @returns Nothing.
	 */
	static _onSameDocumentNavigation = (): void => {
		const stillMatching = MainWorldRuntime._findAdapterForUrl(window.location.href);
		if (stillMatching === null) {
			AdapterRuntime.unregister();
			MainWorldRuntime._adapter = null;
			return;
		}
		if (stillMatching === MainWorldRuntime._adapter) {
			return;
		}
		MainWorldRuntime._adapter = stillMatching;
		MainWorldRuntime._requestGrant();
	};
}

import { AdapterRuntime } from './adapter_runtime.js';
import { ExtensionStorage } from './extension_storage.js';
import { PageQuery } from './page_query.js';

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	ContentIsolated — carries grants into the main world and questions back out
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/**
 * Runs in the ordinary isolated world, where extension privileges are reachable and WebMCP is not.
 *
 * It is the only bridge between the rest of the extension and the page. Everything it sends into the
 * page is plain data — a grant, or a request naming a tool. It never sends code, and it never takes
 * instructions from the page.
 */
class ContentIsolated {
	/** The last report the main world published, kept for the popup to read. */
	static _lastReport: unknown = null;

	/**
	 * Wires up both directions and answers the first request.
	 *
	 * @returns Nothing.
	 */
	static start(): void {
		document.addEventListener(AdapterRuntime.REQUEST_GRANT_EVENT, () => {
			void ContentIsolated._sendGrant();
		});

		document.addEventListener(AdapterRuntime.REPORT_EVENT, ((event: CustomEvent) => {
			ContentIsolated._lastReport = event.detail;
			void chrome.runtime
				.sendMessage({
					kind: 'report',
					report: event.detail,
				})
				.catch(() => undefined);
		}) as EventListener);

		document.addEventListener('webmcp-everywhere:invocation', ((event: CustomEvent) => {
			void chrome.runtime
				.sendMessage({
					kind: 'invocation',
					invocation: event.detail,
				})
				.catch(() => undefined);
		}) as EventListener);

		chrome.storage.onChanged.addListener(() => {
			void ContentIsolated._sendGrant();
		});

		chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
			if (message?.kind === 'getReport') {
				sendResponse(ContentIsolated._lastReport);
				return undefined;
			}

			if (message?.kind === 'page:listTools') {
				void PageQuery.ask({
					kind: 'listTools',
				}).then(sendResponse);
				return true;
			}

			if (message?.kind === 'page:callTool') {
				void ContentIsolated._callTool(message.name, message.args).then(sendResponse);
				return true;
			}

			return undefined;
		});

		void ContentIsolated._sendGrant();
	}

	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////
	//	Helpers
	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////

	/**
	 * Runs a tool on this page, after checking the user's grant a second time.
	 *
	 * The first check happens when tools are registered: a withheld tool is never registered, so it is
	 * not in the page to call. This is the second, on the path the agent's request actually travels, so
	 * that enforcement does not rest on registration alone.
	 *
	 * @param name - The qualified tool name.
	 * @param args - The tool's arguments.
	 * @returns The main world's reply.
	 */
	static async _callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
		const listed = await PageQuery.ask({
			kind: 'listTools',
		});
		if (listed.ok === false) {
			return listed;
		}
		const tools = (listed.result ?? []) as Array<{ name: string; permissionClass: string }>;
		const tool = tools.find((candidate) => candidate.name === name);
		if (tool === undefined) {
			return {
				requestId: '',
				ok: false,
				error: `${name} is not available on this page`,
			};
		}

		const grant = await ExtensionStorage.grantForOrigin(window.location.origin);
		if (grant.globallyEnabled === false) {
			return {
				requestId: '',
				ok: false,
				error: 'WebMCP Everywhere is switched off',
			};
		}
		if (tool.permissionClass !== 'readOnly' && grant.actingAllowed === false) {
			return {
				requestId: '',
				ok: false,
				error: `${name} is an acting tool and ${window.location.origin} has not been opted in`,
			};
		}

		return await PageQuery.ask({
			kind: 'callTool',
			name: name,
			args: args ?? {},
		});
	}

	/**
	 * Reads the grant for this origin and hands it to the main world.
	 *
	 * @returns Nothing.
	 */
	static async _sendGrant(): Promise<void> {
		const grant = await ExtensionStorage.grantForOrigin(window.location.origin);
		document.dispatchEvent(
			new CustomEvent(AdapterRuntime.GRANT_EVENT, {
				detail: grant,
			}),
		);
	}
}

ContentIsolated.start();

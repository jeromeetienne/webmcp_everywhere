///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	ContentIsolated — carries grants into the main world and reports back out
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

import { AdapterRuntime } from './adapter_runtime.js';
import { ExtensionStorage } from './extension_storage.js';

/**
 * Runs in the ordinary isolated world, where extension storage is reachable and WebMCP is not.
 *
 * It is the only bridge between the user's settings and the adapters. Everything it sends into the page
 * is a plain grant object; it never sends code, and it never takes instructions from the page.
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
			void chrome.runtime.sendMessage({
				kind: 'report',
				report: event.detail,
			}).catch(() => undefined);
		}) as EventListener);

		document.addEventListener('webmcp-everywhere:invocation', ((event: CustomEvent) => {
			void chrome.runtime.sendMessage({
				kind: 'invocation',
				invocation: event.detail,
			}).catch(() => undefined);
		}) as EventListener);

		chrome.storage.onChanged.addListener(() => {
			void ContentIsolated._sendGrant();
		});

		chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
			if (message?.kind === 'getReport') {
				sendResponse(ContentIsolated._lastReport);
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

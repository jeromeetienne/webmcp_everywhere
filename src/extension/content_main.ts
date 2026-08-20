///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	ContentMain — the main world entry point, the only place that touches WebMCP
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

import type { Adapter, OriginGrant } from '../adapter_format/adapter_types.js';
import { AdapterRegistry } from './adapter_registry.js';
import { AdapterRuntime } from './adapter_runtime.js';

/**
 * Runs in the page's main world, because `document.modelContext` exists nowhere else.
 *
 * This script has no access to extension storage, so it cannot decide for itself what the user has
 * allowed. It asks the isolated world, waits for the answer, and re-asks whenever the answer changes or
 * the page navigates within itself.
 */
class ContentMain {
	/** The adapter matching this page, worked out once at startup. */
	static _adapter: Adapter | null = AdapterRegistry.findForUrl(window.location.href);

	/**
	 * Starts listening for grants and asks for the first one.
	 *
	 * @returns Nothing.
	 */
	static start(): void {
		if (ContentMain._adapter === null) {
			return;
		}

		document.addEventListener(AdapterRuntime.GRANT_EVENT, ContentMain._onGrant as EventListener);
		window.addEventListener('hashchange', ContentMain._onSameDocumentNavigation);
		window.addEventListener('popstate', ContentMain._onSameDocumentNavigation);

		ContentMain._requestGrant();
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
		const adapter = ContentMain._adapter;
		if (adapter === null) {
			return;
		}
		void AdapterRuntime.register(adapter, event.detail);
	};

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
		const stillMatching = AdapterRegistry.findForUrl(window.location.href);
		if (stillMatching === null) {
			AdapterRuntime.unregister();
			ContentMain._adapter = null;
			return;
		}
		if (stillMatching === ContentMain._adapter) {
			return;
		}
		ContentMain._adapter = stillMatching;
		ContentMain._requestGrant();
	};
}

ContentMain.start();

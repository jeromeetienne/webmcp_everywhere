import type { LoadedAdapter } from '@webmcp_everywhere/site_adapter_lib';
import { AdapterRegistry } from '../shared_state/adapter_registry.js';
import { InjectionRegistrar } from '../shared_state/injection_registrar.js';
import type { InjectionReport } from '../shared_state/injection_registrar.js';
import { NativeBridge } from './native_bridge.js';

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	BackgroundServiceWorker — keeps the last report per tab and makes invocations visible
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/**
 * The extension's background script.
 *
 * Named `BackgroundServiceWorker` rather than `ServiceWorker` because the latter is already a Document
 * Object Model interface, and shadowing it makes every reference in this file ambiguous.
 *
 * It exists for three reasons. The popup needs somewhere to read the current page's report from. An
 * acting tool invocation has to be visible somewhere the user will notice, because issue #1 puts
 * visible invocation among the mitigations that matter, on the grounds that silence is what turns a
 * small compromise into a large one. And the manifest names no site any more, so this is what decides
 * which adapter's scripts are registered for which pages, and re-decides it whenever the user changes
 * their mind or the native messaging host reports a different set of loaded adapters.
 */
class BackgroundServiceWorker {
	/** The most recent report from each tab, keyed by tab identifier. */
	static _reportByTab = new Map<number, unknown>();

	/** The adapters the native messaging host read from folders, empty until it reports any. */
	static _loadedAdapters: LoadedAdapter[] = [];

	/** What the last pass of the registrar did, which is what the popup shows. */
	static _injectionReport: InjectionReport | null = null;

	/**
	 * Starts listening for messages from the isolated world and from the popup.
	 *
	 * @returns Nothing.
	 */
	static start(): void {
		chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
			const tabId = sender.tab?.id;

			if (message?.kind === 'report' && tabId !== undefined) {
				BackgroundServiceWorker._reportByTab.set(tabId, message.report);
				void BackgroundServiceWorker._showRegisteredCount(tabId, message.report);
				return undefined;
			}

			if (message?.kind === 'invocation' && tabId !== undefined) {
				void BackgroundServiceWorker._flashInvocation(tabId, message.invocation);
				return undefined;
			}

			if (message?.kind === 'getReportForTab') {
				sendResponse(BackgroundServiceWorker._reportByTab.get(message.tabId) ?? null);
				return true;
			}

			if (message?.kind === 'getAdapters') {
				sendResponse(BackgroundServiceWorker._describeAdapters());
				return true;
			}

			return undefined;
		});

		chrome.tabs.onRemoved.addListener((tabId) => {
			BackgroundServiceWorker._reportByTab.delete(tabId);
		});

		chrome.storage.onChanged.addListener(() => {
			void BackgroundServiceWorker.applyInjections();
		});

		NativeBridge.onLoadedAdapters = async (adapters) =>
			await BackgroundServiceWorker.setLoadedAdapters(adapters);

		void BackgroundServiceWorker.applyInjections();
		NativeBridge.connect();
	}

	/**
	 * Registers the scripts of every switched-on adapter, and removes the rest.
	 *
	 * @returns What is registered now.
	 */
	static async applyInjections(): Promise<InjectionReport> {
		const report = await InjectionRegistrar.apply(BackgroundServiceWorker._loadedAdapters);
		BackgroundServiceWorker._injectionReport = report;
		return report;
	}

	/**
	 * Takes a new set of adapters from the native messaging host and registers what the user allows.
	 *
	 * @param loadedAdapters - Every adapter the host read from a folder and passed its review checks.
	 * @returns What is registered now.
	 */
	static async setLoadedAdapters(loadedAdapters: LoadedAdapter[]): Promise<InjectionReport> {
		BackgroundServiceWorker._loadedAdapters = loadedAdapters;
		return await BackgroundServiceWorker.applyInjections();
	}

	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////
	//	Helpers
	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////

	/**
	 * Describes every adapter the extension knows about, for the popup's list of switches.
	 *
	 * @returns The bundled adapters, the loaded ones, and what the registrar last did with them.
	 */
	static _describeAdapters(): unknown {
		return {
			bundled: AdapterRegistry.ADAPTERS.map((adapter) => ({
				siteSlug: adapter.siteSlug,
				siteName: adapter.siteName,
				matchPatterns: adapter.matchPatterns,
				toolCount: adapter.tools.length,
				targetSiteVerifiedOn: adapter.metadata.targetSiteVerifiedOn,
			})),
			loaded: BackgroundServiceWorker._loadedAdapters.map((adapter) => ({
				siteSlug: adapter.siteSlug,
				siteName: adapter.siteName,
				matchPatterns: adapter.matchPatterns,
				toolCount: adapter.tools.length,
				targetSiteVerifiedOn: adapter.metadata.targetSiteVerifiedOn,
				sourceFolder: adapter.sourceFolder,
				author: adapter.metadata.author,
			})),
			injection: BackgroundServiceWorker._injectionReport,
			areUserScriptsAllowed: typeof chrome.userScripts !== 'undefined',
		};
	}

	/**
	 * Shows how many tools are registered on a tab, so the user can tell at a glance.
	 *
	 * @param tabId - The tab to label.
	 * @param report - The report the main world published.
	 * @returns Nothing.
	 */
	static async _showRegisteredCount(tabId: number, report: { registered?: string[] }): Promise<void> {
		const count = report?.registered?.length ?? 0;
		await chrome.action.setBadgeBackgroundColor({
			tabId: tabId,
			color: '#3b7dd8',
		});
		await chrome.action.setBadgeText({
			tabId: tabId,
			text: count === 0 ? '' : String(count),
		});
	}

	/**
	 * Marks the badge while an acting tool runs, then puts the count back.
	 *
	 * @param tabId - The tab the invocation happened on.
	 * @param invocation - What was invoked.
	 * @returns Nothing.
	 */
	static async _flashInvocation(
		tabId: number,
		invocation: { permissionClass?: string },
	): Promise<void> {
		if (invocation?.permissionClass === 'readOnly') {
			return;
		}
		await chrome.action.setBadgeBackgroundColor({
			tabId: tabId,
			color: '#d8663b',
		});
		await chrome.action.setBadgeText({
			tabId: tabId,
			text: '!',
		});
		setTimeout(() => {
			const report = BackgroundServiceWorker._reportByTab.get(tabId) as { registered?: string[] } | undefined;
			void BackgroundServiceWorker._showRegisteredCount(tabId, report ?? {});
		}, 1500);
	}
}

BackgroundServiceWorker.start();

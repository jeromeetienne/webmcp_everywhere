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
 * It exists for two reasons: the popup needs somewhere to read the current page's report from, and an
 * acting tool invocation has to be visible somewhere the user will notice. Issue #1 puts visible
 * invocation among the mitigations that matter, on the grounds that silence is what turns a small
 * compromise into a large one.
 */
class BackgroundServiceWorker {
	/** The most recent report from each tab, keyed by tab identifier. */
	static _reportByTab = new Map<number, unknown>();

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

			return undefined;
		});

		chrome.tabs.onRemoved.addListener((tabId) => {
			BackgroundServiceWorker._reportByTab.delete(tabId);
		});
	}

	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////
	//	Helpers
	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////

	/**
	 * Shows how many tools are registered on a tab, so the user can tell at a glance.
	 *
	 * @param tabId - The tab to label.
	 * @param report - The report the main world published.
	 * @returns Nothing.
	 */
	static async _showRegisteredCount(tabId: number, report: { registered?: string[] }): Promise<void> {
		const count = report?.registered?.length ?? 0;
		await chrome.action.setBadgeBackgroundColor({ tabId: tabId, color: '#3b7dd8' });
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
		await chrome.action.setBadgeBackgroundColor({ tabId: tabId, color: '#d8663b' });
		await chrome.action.setBadgeText({ tabId: tabId, text: '!' });
		setTimeout(() => {
			const report = BackgroundServiceWorker._reportByTab.get(tabId) as { registered?: string[] } | undefined;
			void BackgroundServiceWorker._showRegisteredCount(tabId, report ?? {});
		}, 1500);
	}
}

BackgroundServiceWorker.start();

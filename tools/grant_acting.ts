///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	GrantActing — stands in for the popup when nobody is at the keyboard
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

import { ServiceWorkerEvaluation } from './chrome_devtools_protocol/service_worker_evaluation.ts';
import type { CdpTarget } from './chrome_devtools_protocol/cdp_client.ts';

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	Types
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/** What to write into extension storage. */
export type GrantActingOptions = {
	/** Chrome's remote debugging port. */
	port?: number;
	/** The origin to change. */
	origin?: string;
	/** Whether acting tools are allowed there. */
	actingAllowed?: boolean;
	/** Whether the extension is on at all. */
	globallyEnabled?: boolean;
	/** Which adapters to switch on, named by site slug. Absent leaves every adapter at its default. */
	enabledAdapters?: string[];
};

/**
 * Writes the user's opt-in straight into extension storage.
 *
 * The popup is the real way to do this. This exists so an unattended run can reach the same state, and
 * so a demonstration does not stall waiting for somebody to tick a box.
 */
export class GrantActing {
	/** The remote debugging port a Chrome launched by `LaunchChrome` listens on. */
	static readonly DEFAULT_PORT = 9333;

	/** The origin used when the caller names none, which is the demonstration site. */
	static readonly DEFAULT_ORIGIN = 'https://demo.playwright.dev';

	/**
	 * Grants or withdraws acting rights for one origin.
	 *
	 * @param options - What to set.
	 * @returns What was written.
	 * @throws When the extension's service worker never starts.
	 */
	static async run(options: GrantActingOptions = {}): Promise<string> {
		const port = options.port ?? GrantActing.DEFAULT_PORT;
		const origin = options.origin ?? GrantActing.DEFAULT_ORIGIN;
		const actingAllowed = options.actingAllowed ?? true;
		const globallyEnabled = options.globallyEnabled ?? true;

		const adapterEnabledBySlug: Record<string, boolean> = {};
		for (const siteSlug of options.enabledAdapters ?? []) {
			adapterEnabledBySlug[siteSlug] = true;
		}

		const settings = {
			globallyEnabled: globallyEnabled,
			actingAllowedByOrigin: {
				[origin]: actingAllowed,
			},
			adapterEnabledBySlug: adapterEnabledBySlug,
		};

		await ServiceWorkerEvaluation.evaluate(
			port,
			`chrome.storage.local.set({ webmcp_everywhere_settings: ${JSON.stringify(settings)} }).then(() => 'ok')`,
		);
		return JSON.stringify(settings);
	}

	/**
	 * Waits for the extension's service worker to start, and returns the target it is running as.
	 *
	 * @param port - The remote debugging port.
	 * @returns The service worker's target.
	 * @throws When the service worker never starts.
	 */
	static async waitForServiceWorker(port: number): Promise<CdpTarget> {
		return await ServiceWorkerEvaluation.waitForTarget(port);
	}
}

if (import.meta.filename === process.argv[1]) {
	console.log(
		await GrantActing.run({
			origin: process.argv[2],
		}),
	);
}

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	GrantActing — stands in for the popup when nobody is at the keyboard
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

import { CdpClient } from './chrome_devtools_protocol/cdp_client.ts';
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

	/** The tail of the service worker's address, which is how it is told from every other target. */
	static readonly SERVICE_WORKER_PATH = 'dist/background_service_worker.js';

	/** How many times to look for the service worker before giving up. */
	static readonly SERVICE_WORKER_ATTEMPTS = 40;

	/** How long to wait between two attempts to find the service worker, in milliseconds. */
	static readonly SERVICE_WORKER_POLL_DELAY = 250;

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

		const worker = await GrantActing.waitForServiceWorker(port);

		const settings = {
			globallyEnabled: globallyEnabled,
			actingAllowedByOrigin: {
				[origin]: actingAllowed,
			},
		};

		const client = new CdpClient(port);
		await client.connect(worker.webSocketDebuggerUrl);
		await client.evaluate(
			`chrome.storage.local.set({ webmcp_everywhere_settings: ${JSON.stringify(settings)} }).then(() => 'ok')`,
		);
		client.close();
		return JSON.stringify(settings);
	}

	/**
	 * Waits for the extension's service worker to start, and returns the target it is running as.
	 *
	 * A Chrome that has only just been launched has not installed the extension yet, so the worker is
	 * absent for the first second or two. Every caller used to write this loop again, and the one that
	 * did not wait failed intermittently on a slow machine.
	 *
	 * @param port - The remote debugging port.
	 * @returns The service worker's target.
	 * @throws When the service worker never starts.
	 */
	static async waitForServiceWorker(port: number): Promise<CdpTarget> {
		for (let attempt = 0; attempt < GrantActing.SERVICE_WORKER_ATTEMPTS; attempt += 1) {
			const targets = await CdpClient.listTargets(port);
			const worker = targets.find(
				(target) =>
					target.type === 'service_worker' &&
					target.url.includes(GrantActing.SERVICE_WORKER_PATH),
			);
			if (worker !== undefined) {
				return worker;
			}
			await GrantActing._pause(GrantActing.SERVICE_WORKER_POLL_DELAY);
		}
		throw new Error('the WebMCP Everywhere service worker never started');
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
	static async _pause(milliseconds: number): Promise<void> {
		await new Promise((resolve) => {
			setTimeout(resolve, milliseconds);
		});
	}
}

if (import.meta.filename === process.argv[1]) {
	console.log(
		await GrantActing.run({
			origin: process.argv[2],
		}),
	);
}

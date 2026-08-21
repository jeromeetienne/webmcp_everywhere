///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	GrantActing — stands in for the popup when nobody is at the keyboard
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

import { CdpClient } from './chrome_devtools_protocol/cdp_client.ts';

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
	/**
	 * Grants or withdraws acting rights for one origin.
	 *
	 * @param options - What to set.
	 * @returns What was written.
	 * @throws When the extension's service worker is not running.
	 */
	static async run(options: GrantActingOptions = {}): Promise<string> {
		const port = options.port ?? 9333;
		const origin = options.origin ?? 'https://demo.playwright.dev';
		const actingAllowed = options.actingAllowed ?? true;
		const globallyEnabled = options.globallyEnabled ?? true;

		const targets = await CdpClient.listTargets(port);
		const worker = targets.find(
			(target) => target.type === 'service_worker' && target.url.includes('dist/background_service_worker.js'),
		);
		if (worker === undefined) {
			throw new Error('the WebMCP Everywhere service worker is not running');
		}

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
}

if (import.meta.filename === process.argv[1]) {
	console.log(
		await GrantActing.run({
			origin: process.argv[2],
		}),
	);
}

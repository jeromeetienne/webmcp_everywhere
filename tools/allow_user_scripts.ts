import { CdpClient } from './chrome_devtools_protocol/cdp_client.ts';
import { GenerateExtensionKey } from './generate_extension_key.ts';

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	AllowUserScripts — turns on the toggle a loaded adapter cannot run without
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

const __filename = import.meta.filename;
const __dirname = import.meta.dirname;

/**
 * Turns on **Allow User Scripts** for this extension, in a Chrome this repository launched.
 *
 * Chrome hides `chrome.userScripts` from an extension until a person turns that toggle on at
 * `chrome://extensions`, and an adapter loaded from a folder has no other way to reach the page. The
 * toggle is the real consent point for running somebody else's code inside your own logged-in
 * sessions, and a person turning it on by hand is the intended way.
 *
 * This exists because a verification runner has nobody at the keyboard, and because a check that
 * cannot reach the state a user reaches is checking something else. It works only against a Chrome
 * that is already exposing a remote debugging port, which is a Chrome started by `npm run chrome` or
 * by a runner, never the browser the user installed.
 *
 * The only page holding `chrome.developerPrivate` is `chrome://extensions` itself, so the toggle is
 * turned on from a tab opened there and nowhere else.
 */
export class AllowUserScripts {
	/** The remote debugging port a Chrome launched by `LaunchChrome` listens on. */
	static readonly DEFAULT_PORT = 9333;

	/** How long to wait for the extensions page to open, in milliseconds. */
	static readonly SETTLE_DELAY = 2500;

	/**
	 * Turns the toggle on and reports what Chrome then said about it.
	 *
	 * @param port - The remote debugging port.
	 * @returns What `chrome.developerPrivate` reports about user script access afterwards.
	 * @throws When the extensions page never answers.
	 */
	static async run(port: number = AllowUserScripts.DEFAULT_PORT): Promise<string> {
		const identifier = GenerateExtensionKey.currentIdentifier();
		const browser = await CdpClient.connectToBrowser(port);
		await browser.send('Target.createTarget', {
			url: `chrome://extensions/?id=${identifier}`,
		});
		await AllowUserScripts._pause(AllowUserScripts.SETTLE_DELAY);

		const extensionsPage = await CdpClient.connectToPage(port, 'chrome://extensions');
		const answer = await extensionsPage.evaluate<string>(`
			(async () => {
				await new Promise((resolve) => chrome.developerPrivate.updateExtensionConfiguration(
					{ extensionId: ${JSON.stringify(identifier)}, userScriptsAccess: true }, resolve));
				const info = await new Promise((resolve) =>
					chrome.developerPrivate.getExtensionInfo(${JSON.stringify(identifier)}, resolve));
				return JSON.stringify(info.userScriptsAccess);
			})()
		`);

		extensionsPage.close();
		browser.close();
		return answer;
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
	const port = process.argv[2] === undefined ? AllowUserScripts.DEFAULT_PORT : Number(process.argv[2]);
	console.log(`user script access is now ${await AllowUserScripts.run(port)}`);
}

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	LaunchChrome — brings up a Chrome that speaks WebMCP with the extension installed
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

import ChildProcess from 'node:child_process';
import Fs from 'node:fs';
import Os from 'node:os';
import Path from 'node:path';
import { CdpClient } from '../src/bridge/cdp_client.mjs';

const __dirname = import.meta.dirname;

/**
 * Starts a Chrome that can run this extension, without a human clicking anything.
 *
 * Four steps are needed and none of them are obvious, so they live here rather than in a README nobody
 * reads. `--load-extension` is deliberately not among them: Chrome 151 ignores it silently, leaving zero
 * extensions installed and nothing in the log, and `--disable-features=DisableLoadExtensionCommandLineSwitch`
 * does not bring it back. Installing over the Chrome DevTools Protocol is the only path that works.
 */
export class LaunchChrome {
	/** Where Chrome lives on macOS. */
	static CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

	/** The remote debugging port everything else in this repository expects. */
	static PORT = 9333;

	/** The page the extension is built to adapt. */
	static TARGET_URL = 'https://demo.playwright.dev/todomvc/';

	/**
	 * Prepares a throwaway profile, launches Chrome, installs the extension, and opens the target page.
	 *
	 * @param {object} options - How to launch.
	 * @param {string} [options.profileDir] - Where to keep the throwaway profile.
	 * @param {number} [options.port] - The remote debugging port.
	 * @param {string} [options.url] - The page to open.
	 * @returns {Promise<{port: number, extensionId: string, profileDir: string}>} How to reach it.
	 */
	static async run(options = {}) {
		const port = options.port ?? LaunchChrome.PORT;
		const profileDir = options.profileDir ?? Path.join(Os.tmpdir(), 'webmcp_everywhere_profile');
		const url = options.url ?? LaunchChrome.TARGET_URL;
		const extensionDir = Path.join(__dirname, '..', 'src', 'extension');

		if (Fs.existsSync(Path.join(extensionDir, 'dist', 'content_main.js')) === false) {
			throw new Error('the extension is not built; run "npm run build" first');
		}

		LaunchChrome._stopExisting(profileDir);
		LaunchChrome._prepareProfile(profileDir);

		const child = ChildProcess.spawn(
			LaunchChrome.CHROME_PATH,
			[
				`--user-data-dir=${profileDir}`,
				`--remote-debugging-port=${port}`,
				'--enable-unsafe-extension-debugging',
				'--no-first-run',
				'--no-default-browser-check',
				'--disable-sync',
				'about:blank',
			],
			{
				detached: true,
				stdio: 'ignore',
			},
		);
		child.unref();

		await CdpClient.waitUntilReady(port);

		const browser = await CdpClient.connectToBrowser(port);
		const installed = await browser.send('Extensions.loadUnpacked', {
			path: extensionDir,
		});
		browser.close();

		const page = await CdpClient.connectToPage(port, 'about:blank');
		await page.navigate(url);
		page.close();

		return {
			port: port,
			extensionId: installed.id,
			profileDir: profileDir,
		};
	}

	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////
	//	Helpers
	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////

	/**
	 * Writes the two settings files that have to be in place before Chrome starts.
	 *
	 * The WebMCP flag has to be in `Local State` or the API is simply absent. Developer mode has to be in
	 * `Preferences` or the extension installs but its content scripts silently never run, which is a
	 * failure with no error message anywhere.
	 *
	 * @param {string} profileDir - The profile directory to prepare.
	 * @returns {void} Nothing.
	 */
	static _prepareProfile(profileDir) {
		const defaultDir = Path.join(profileDir, 'Default');
		Fs.mkdirSync(defaultDir, {
			recursive: true,
		});

		const localStatePath = Path.join(profileDir, 'Local State');
		/** @type {Record<string, any>} */
		const localState = LaunchChrome._readJson(localStatePath);
		localState.browser = localState.browser ?? {};
		localState.browser.enabled_labs_experiments = ['enable-webmcp-testing@1'];
		Fs.writeFileSync(localStatePath, JSON.stringify(localState));

		const preferencesPath = Path.join(defaultDir, 'Preferences');
		/** @type {Record<string, any>} */
		const preferences = LaunchChrome._readJson(preferencesPath);
		preferences.extensions = preferences.extensions ?? {};
		preferences.extensions.ui = preferences.extensions.ui ?? {};
		preferences.extensions.ui.developer_mode = true;
		Fs.writeFileSync(preferencesPath, JSON.stringify(preferences));
	}

	/**
	 * Reads a JSON file, returning an empty object when it is missing or unreadable.
	 *
	 * @param {string} path - The file to read.
	 * @returns {Record<string, any>} The parsed contents.
	 */
	static _readJson(path) {
		if (Fs.existsSync(path) === false) {
			return {};
		}
		try {
			return JSON.parse(Fs.readFileSync(path, 'utf8'));
		} catch {
			return {};
		}
	}

	/**
	 * Stops any Chrome already running on this profile, so a relaunch picks up new settings.
	 *
	 * @param {string} profileDir - The profile directory whose Chrome should be stopped.
	 * @returns {void} Nothing.
	 */
	static _stopExisting(profileDir) {
		ChildProcess.spawnSync('pkill', ['-f', profileDir], {
			stdio: 'ignore',
		});
		ChildProcess.spawnSync('sleep', ['2'], {
			stdio: 'ignore',
		});
	}
}

if (import.meta.filename === process.argv[1]) {
	const result = await LaunchChrome.run();
	console.log(`Chrome ready on port ${result.port}`);
	console.log(`extension installed as ${result.extensionId}`);
	console.log(`profile at ${result.profileDir}`);
}

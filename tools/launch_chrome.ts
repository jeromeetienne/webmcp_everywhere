///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	LaunchChrome — brings up a Chrome that speaks WebMCP with the extension installed
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

import ChildProcess from 'node:child_process';
import Fs from 'node:fs';
import Os from 'node:os';
import Path from 'node:path';
import { CdpClient } from './chrome_devtools_protocol/cdp_client.ts';
import { InstallNativeHost } from './install_native_host.ts';

const __filename = import.meta.filename;
const __dirname = import.meta.dirname;

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	Types
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/** Whether a launched Chrome puts a window on the screen. */
export type ChromeVisibility = 'visible' | 'hidden';

/** How to launch. */
export type LaunchChromeOptions = {
	/** Where to keep the throwaway profile. */
	profileDir?: string;
	/** The remote debugging port. */
	port?: number;
	/** The page to open. */
	url?: string;
	/** Keep the existing profile, and with it the previous build. */
	keepProfile?: boolean;
	/** Whether to put a window on the screen. Falls back to the environment, then to hidden. */
	visibility?: ChromeVisibility;
};

/** How to reach the Chrome that was launched. */
export type LaunchedChrome = {
	/** The remote debugging port it is listening on. */
	port: number;
	/** The identifier Chrome gave the installed extension. */
	extensionId: string;
	/** The profile directory it is running against. */
	profileDir: string;
};

/** The parts of Chrome's `Local State` file this tool writes. */
type ChromeLocalState = {
	/** Browser-wide settings, including which experiments are on. */
	browser?: {
		/** The experiments Chrome turns on at startup. */
		enabled_labs_experiments?: string[];
	};
	/** Everything else the file carries, left untouched. */
	[field: string]: unknown;
};

/** The parts of Chrome's `Preferences` file this tool writes. */
type ChromePreferences = {
	/** Extension settings. */
	extensions?: {
		/** The extensions page's own settings. */
		ui?: {
			/** Whether developer mode is on, without which content scripts never run. */
			developer_mode?: boolean;
		};
		/** Everything else under `extensions`, left untouched. */
		[field: string]: unknown;
	};
	/** Everything else the file carries, left untouched. */
	[field: string]: unknown;
};

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

	/** The environment variable that says whether a launched Chrome puts a window on the screen. */
	static VISIBILITY_VARIABLE = 'WEBMCP_EVERYWHERE_CHROME_VISIBILITY';

	/** The page the extension is built to adapt. */
	static TARGET_URL = 'https://demo.playwright.dev/todomvc/';

	/**
	 * Prepares a throwaway profile, launches Chrome, installs the extension, and opens the target page.
	 *
	 * The profile is deleted and rebuilt on every launch unless `keepProfile` is set. Chrome does not
	 * re-read an unpacked extension it has already installed in a profile, so reusing the profile
	 * silently keeps running the previous build. That turned a working fix into an apparent failure and
	 * cost a full debugging cycle, because every check still ran, and ran against old code.
	 *
	 * The host manifest goes into the throwaway profile and nowhere else. A Chrome started with a custom
	 * `--user-data-dir` reads host manifests from inside that directory and never looks at the everyday
	 * Chrome's, so covering the everyday one here would modify a browser the user installed to run a
	 * check that does not use it. See [issue #4](https://github.com/jeromeetienne/webmcp_everywhere/issues/4).
	 *
	 * @param options - How to launch.
	 * @returns How to reach it.
	 */
	static async run(options: LaunchChromeOptions = {}): Promise<LaunchedChrome> {
		const port = options.port ?? LaunchChrome.PORT;
		const profileDir = options.profileDir ?? Path.join(Os.tmpdir(), 'webmcp_everywhere_profile');
		const url = options.url ?? LaunchChrome.TARGET_URL;
		const visibility = options.visibility ?? LaunchChrome._visibilityFromEnvironment() ?? 'hidden';
		const extensionDir = Path.join(__dirname, '..', 'build', 'chrome_extension');

		if (Fs.existsSync(Path.join(extensionDir, 'dist', 'content_main.js')) === false) {
			throw new Error('the extension is not built; run "npm run build" first');
		}

		LaunchChrome._stopExisting(profileDir);
		if (options.keepProfile !== true) {
			Fs.rmSync(profileDir, {
				recursive: true,
				force: true,
			});
		}
		LaunchChrome._prepareProfile(profileDir);
		InstallNativeHost.run({
			userDataDirs: [profileDir],
			isEverydayChromeCovered: false,
		});

		const args = [
			`--user-data-dir=${profileDir}`,
			`--remote-debugging-port=${port}`,
			'--enable-unsafe-extension-debugging',
			'--no-first-run',
			'--no-default-browser-check',
			'--disable-sync',
		];
		if (visibility === 'hidden') {
			args.push('--headless=new');
		}
		args.push('about:blank');

		const childProcess = ChildProcess.spawn(LaunchChrome.CHROME_PATH, args, {
			detached: true,
			stdio: 'ignore',
		});
		childProcess.unref();

		await CdpClient.waitUntilReady(port);

		const browser = await CdpClient.connectToBrowser(port);
		const installed = await browser.send<{ id: string }>('Extensions.loadUnpacked', {
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
	 * @param profileDir - The profile directory to prepare.
	 * @returns Nothing.
	 */
	static _prepareProfile(profileDir: string): void {
		const defaultDir = Path.join(profileDir, 'Default');
		Fs.mkdirSync(defaultDir, {
			recursive: true,
		});

		const localStatePath = Path.join(profileDir, 'Local State');
		const localState = LaunchChrome._readJson<ChromeLocalState>(localStatePath);
		localState.browser = localState.browser ?? {};
		localState.browser.enabled_labs_experiments = ['enable-webmcp-testing@1'];
		Fs.writeFileSync(localStatePath, JSON.stringify(localState));

		const preferencesPath = Path.join(defaultDir, 'Preferences');
		const preferences = LaunchChrome._readJson<ChromePreferences>(preferencesPath);
		preferences.extensions = preferences.extensions ?? {};
		preferences.extensions.ui = preferences.extensions.ui ?? {};
		preferences.extensions.ui.developer_mode = true;
		Fs.writeFileSync(preferencesPath, JSON.stringify(preferences));
	}

	/**
	 * Reads a JSON file, returning an empty object when it is missing or unreadable.
	 *
	 * @param path - The file to read.
	 * @returns The parsed contents.
	 */
	static _readJson<ShapeType extends object>(path: string): ShapeType {
		if (Fs.existsSync(path) === false) {
			return {} as ShapeType;
		}
		try {
			return JSON.parse(Fs.readFileSync(path, 'utf8')) as ShapeType;
		} catch {
			return {} as ShapeType;
		}
	}

	/**
	 * Reads the visibility the environment asks for.
	 *
	 * @returns What the environment asked for, or null when it asked for nothing.
	 * @throws When the variable is set to anything other than `visible` or `hidden`.
	 */
	static _visibilityFromEnvironment(): ChromeVisibility | null {
		const value = process.env[LaunchChrome.VISIBILITY_VARIABLE];
		if (value === undefined || value === '') {
			return null;
		}
		if (value !== 'visible' && value !== 'hidden') {
			throw new Error(
				`${LaunchChrome.VISIBILITY_VARIABLE} must be 'visible' or 'hidden', not '${value}'`,
			);
		}
		return value;
	}

	/**
	 * Stops any Chrome already running on this profile, so a relaunch picks up new settings.
	 *
	 * @param profileDir - The profile directory whose Chrome should be stopped.
	 * @returns Nothing.
	 */
	static _stopExisting(profileDir: string): void {
		ChildProcess.spawnSync('pkill', ['-f', profileDir], {
			stdio: 'ignore',
		});
		ChildProcess.spawnSync('sleep', ['2'], {
			stdio: 'ignore',
		});
	}
}

if (import.meta.filename === process.argv[1]) {
	// This command exists to hand somebody a browser to look at, so it shows one unless the
	// environment says otherwise. The checks under tests/ hide theirs instead.
	const visibility = LaunchChrome._visibilityFromEnvironment() ?? 'visible';
	const url = process.argv[2] ?? LaunchChrome.TARGET_URL;
	const result = await LaunchChrome.run({
		visibility: visibility,
		url: url,
	});
	console.log(`opened ${url}`);
	console.log(`Chrome ready on port ${result.port}, ${visibility}`);
	console.log(`extension installed as ${result.extensionId}`);
	console.log(`profile at ${result.profileDir}`);
}

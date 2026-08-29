import { WorkingCopyLayout } from './working_copy_layout.ts';
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
import { ServiceWorkerEvaluation } from './chrome_devtools_protocol/service_worker_evaluation.ts';
import { InstallNativeHost } from '../packages/npm_package/src/install_native_host.ts';
import type { InstallNativeHostOptions } from '../packages/npm_package/src/install_native_host.ts';

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
	/** The extension folder to install, when it is not this working copy's build. */
	extensionDir?: string;
	/**
	 * Where the native messaging host comes from, when it is not this working copy's.
	 *
	 * A packaged release carries its own launcher, its own bundled host, and its own copy of the
	 * manifest template. Naming them here is what lets a check prove the packaged host really runs.
	 */
	nativeHost?: Partial<Pick<InstallNativeHostOptions, 'launcherPath' | 'templateDir' | 'extensionManifestPath'>>;
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
	/**
	 * Where Chrome lives, in the order these paths are tried.
	 *
	 * The first is macOS, and the rest are Linux, which is what a continuous integration runner is.
	 * `WEBMCP_EVERYWHERE_CHROME_PATH` overrides the whole list, for a Chrome installed somewhere else.
	 */
	static CHROME_PATHS = [
		'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
		'/usr/bin/google-chrome',
		'/usr/bin/google-chrome-stable',
		'/opt/google/chrome/chrome',
		'/usr/bin/chromium',
		'/usr/bin/chromium-browser',
	];

	/** The environment variable naming a Chrome to use instead of searching for one. */
	static CHROME_PATH_VARIABLE = 'WEBMCP_EVERYWHERE_CHROME_PATH';

	/** The remote debugging port everything else in this repository expects. */
	static PORT = 9333;

	/** The environment variable that says whether a launched Chrome puts a window on the screen. */
	static VISIBILITY_VARIABLE = 'WEBMCP_EVERYWHERE_CHROME_VISIBILITY';

	/** The page the extension is built to adapt. */
	static TARGET_URL = 'https://demo.playwright.dev/todomvc/';

	/** The identifier prefix the extension gives every script it registers. */
	static REGISTRATION_PREFIX = 'webmcp_everywhere_';

	/** How long to wait for the extension to register its first script, in milliseconds. */
	static REGISTRATION_TIMEOUT = 10000;

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
		const extensionDir = options.extensionDir ?? Path.join(__dirname, '..', 'build', 'chrome_extension');

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
			...WorkingCopyLayout.nativeHostPaths(),
			...(options.nativeHost ?? {}),
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

		const childProcess = ChildProcess.spawn(LaunchChrome.chromePath(), args, {
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

		await LaunchChrome._waitUntilAdaptersRegistered(port);

		const page = await CdpClient.connectToPage(port, 'about:blank');
		await page.navigate(url);
		page.close();

		return {
			port: port,
			extensionId: installed.id,
			profileDir: profileDir,
		};
	}

	/**
	 * Waits until one named adapter's scripts are registered, whichever kind of adapter it is.
	 *
	 * Switching an adapter on writes extension storage, and the registrar re-applies when it notices
	 * that write. Nothing about that is instant, so a page loaded straight after the switch can still
	 * be running under the old set. The page then has no tools and the failure names the adapter,
	 * which is the one thing that was working.
	 *
	 * @param port - The remote debugging port.
	 * @param siteSlug - The adapter to wait for.
	 * @param timeoutMs - How long to wait before giving up.
	 * @returns Nothing.
	 * @throws When the adapter's scripts are still not registered when the time runs out.
	 */
	static async waitUntilAdapterRegistered(
		port: number,
		siteSlug: string,
		timeoutMs = LaunchChrome.REGISTRATION_TIMEOUT,
	): Promise<void> {
		const expression = `
			(async () => {
				const content = await chrome.scripting.getRegisteredContentScripts();
				const user = typeof chrome.userScripts === 'undefined'
					? []
					: await chrome.userScripts.getScripts();
				return [...content, ...user]
					.map((script) => script.id)
					.filter((id) => id.endsWith(${JSON.stringify(siteSlug)}))
					.length;
			})()
		`;
		const deadline = Date.now() + timeoutMs;
		while (Date.now() < deadline) {
			const registered = await ServiceWorkerEvaluation.evaluate<number>(port, expression);
			if (registered > 0) {
				return;
			}
			await new Promise((resolve) => setTimeout(resolve, 250));
		}
		throw new Error(`nothing was registered for the adapter ${siteSlug} within ${timeoutMs}ms`);
	}

	/**
	 * Finds the Chrome to launch.
	 *
	 * This repository was written on macOS, where there is one path and it is always right. A
	 * continuous integration runner is Linux, where Chrome sits in one of several places and may be
	 * Chromium instead, so the path is searched for rather than named.
	 *
	 * @returns The path of the first Chrome found.
	 * @throws When no Chrome is at any of the paths, naming every path tried.
	 */
	static chromePath(): string {
		const named = process.env[LaunchChrome.CHROME_PATH_VARIABLE];
		if (named !== undefined && named !== '') {
			if (Fs.existsSync(named) === false) {
				throw new Error(`${LaunchChrome.CHROME_PATH_VARIABLE} names ${named}, which does not exist`);
			}
			return named;
		}
		for (const candidate of LaunchChrome.CHROME_PATHS) {
			if (Fs.existsSync(candidate) === true) {
				return candidate;
			}
		}
		throw new Error(
			`no Chrome found at any of: ${LaunchChrome.CHROME_PATHS.join(', ')}. ` +
				`Set ${LaunchChrome.CHROME_PATH_VARIABLE} to name one.`,
		);
	}

	/**
	 * Reports the version of the Chrome that would be launched.
	 *
	 * WebMCP is an origin trial that runs from Chrome 149 to Chrome 156, so a check that fails on an
	 * older Chrome has found the browser, not a fault in this repository, and has to say so.
	 *
	 * @returns The version string Chrome prints, such as `Google Chrome 151.0.7710.0`.
	 */
	static chromeVersion(): string {
		const result = ChildProcess.spawnSync(LaunchChrome.chromePath(), ['--version'], {
			encoding: 'utf8',
		});
		return (result.stdout ?? '').trim();
	}

	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////
	//	Helpers
	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////

	/**
	 * Waits until the extension has told Chrome which scripts to run on which sites.
	 *
	 * The manifest names no site any more, so nothing runs on a page until the service worker has
	 * called `chrome.scripting.registerContentScripts`. That happens after the extension is installed
	 * and takes a moment, and a page opened during that moment gets no adapter at all — the tool list
	 * comes back empty and every check after it fails for a reason that looks nothing like the cause.
	 *
	 * The waiting is done here rather than inside the worker. A loop running in a service worker is a
	 * loop running in something Chrome may stop at any moment, and it took a slow runner to show it:
	 * one long evaluation never came back, while short ones that can be retried always do.
	 *
	 * @param port - The remote debugging port.
	 * @returns Nothing.
	 * @throws When the extension registers nothing within `REGISTRATION_TIMEOUT`.
	 */
	static async _waitUntilAdaptersRegistered(port: number): Promise<void> {
		const expression = `
			chrome.scripting.getRegisteredContentScripts().then(
				(scripts) => scripts.filter(
					(script) => script.id.startsWith(${JSON.stringify(LaunchChrome.REGISTRATION_PREFIX)})
				).length
			)
		`;
		const deadline = Date.now() + LaunchChrome.REGISTRATION_TIMEOUT;
		while (Date.now() < deadline) {
			const registered = await ServiceWorkerEvaluation.evaluate<number>(port, expression);
			if (registered > 0) {
				return;
			}
			await new Promise((resolve) => setTimeout(resolve, 250));
		}
		throw new Error('the extension registered no content scripts, so no adapter would run');
	}

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

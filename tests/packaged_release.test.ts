///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	PackagedReleaseTest — that a release installs and runs with no repository at all
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

import ChildProcess from 'node:child_process';
import Fs from 'node:fs';
import Os from 'node:os';
import Path from 'node:path';
import NodeTest from 'node:test';
import { LaunchChrome } from '../tools/launch_chrome.ts';
import { PackageRelease } from '../tools/package_release.ts';

const __filename = import.meta.filename;
const __dirname = import.meta.dirname;

/**
 * Drives what a person who never cloned this repository actually does.
 *
 * Everything else in this repository runs the host straight out of a working copy: the launcher
 * walks up from its own location to find `src/`, and Node.js runs the TypeScript with no build step.
 * That hides the question this runner asks. A release is a folder with no repository under it, no
 * `node_modules`, and no TypeScript — and the only honest way to know it works is to copy it
 * somewhere else entirely and start Chrome against it.
 *
 * Nothing is mocked. The release is really built, really copied out of the repository, its host is
 * really registered with a throwaway Chrome, and the endpoint is really asked for its tools.
 */
class PackagedReleaseTest {
	/** Where the release is copied to, which is deliberately nowhere near the repository. */
	static readonly INSTALLED_AT = Path.join(Os.tmpdir(), 'webmcp_everywhere_installed_release');

	/** How long to wait for Chrome to start the host and for the host to take its port, in milliseconds. */
	static readonly HOST_START = 8000;

	/** Where the host writes the address it is serving on. */
	static readonly ENDPOINT_FILE = Path.join(Os.homedir(), '.webmcp_everywhere', 'endpoint.json');

	/** Where the host keeps the bearer token an agent must present. */
	static readonly TOKEN_FILE = Path.join(Os.homedir(), '.webmcp_everywhere', 'token');

	/** The address and token of the running host, or null before the first check. */
	static endpoint: { url: string; token: string } | null = null;


	/**
	 * Why these checks could not run, or null when they could.
	 *
	 * They need port 8765, and the port serves one browser at a time on purpose. A developer with
	 * their everyday Chrome open already owns it, and no amount of waiting changes that. So this
	 * says so and the checks skip, rather than failing and reading like a broken adapter. Continuous
	 * integration has no other browser, so there they really run — see `.github/workflows/release.yml`.
	 */
	static blockedBy: string | null = null;

	/**
	 * Names the process currently serving on the host's port, or null when nothing is.
	 *
	 * Port 8765 holds one browser at a time, on purpose. So a Chrome already running on this machine
	 * with this extension installed owns the port, and the Chrome this runner launches has to take it
	 * away before anything here can be true. Asking first is what turns "no page tools" — which reads
	 * as a broken adapter — into "another browser owns the port", which is what actually happened.
	 *
	 * @returns The process identifier answering, or null when nothing answers.
	 */
	static async whoHoldsThePort(): Promise<number | null> {
		try {
			const response = await fetch('http://127.0.0.1:8765/health');
			const health = (await response.json()) as { processId?: number };
			return health.processId ?? null;
		} catch {
			return null;
		}
	}

	/**
	 * Finds the packaged host this runner started, by the folder it was copied to.
	 *
	 * Comparing this against the process answering on the port is the only reliable way to know the
	 * answers are coming from the release. Comparing against whoever held the port beforehand is not:
	 * the other checks in this repository start and stop their own Chrome, so a browser that owned the
	 * port a minute ago can be pushed off it and take it back again while this runner is starting.
	 *
	 * @returns Every process identifier whose command line names the installed release, newest first.
	 */
	static packagedHostProcessIds(): number[] {
		const listing = ChildProcess.execSync('ps -axww -o pid=,command=', {
			encoding: 'utf8',
		});
		const found: number[] = [];
		for (const line of listing.split('\n')) {
			if (line.includes(PackagedReleaseTest.INSTALLED_AT) === false) {
				continue;
			}
			const processId = Number.parseInt(line.trim().split(/\s+/)[0], 10);
			if (Number.isNaN(processId) === false) {
				found.push(processId);
			}
		}
		return found;
	}

	/**
	 * Builds the release and copies it out of the repository.
	 *
	 * The copy is what makes this a real check. A release folder still sitting inside `build/` has a
	 * repository above it, so a path that accidentally reaches for one would still resolve and the
	 * check would pass while the thing it checks was broken.
	 *
	 * @returns The folder the release was installed into.
	 */
	static async installSomewhereElse(): Promise<string> {
		const packaged = await PackageRelease.run();
		Fs.rmSync(PackagedReleaseTest.INSTALLED_AT, {
			recursive: true,
			force: true,
		});
		Fs.cpSync(packaged.folder, PackagedReleaseTest.INSTALLED_AT, {
			recursive: true,
		});
		Fs.chmodSync(Path.join(PackagedReleaseTest.INSTALLED_AT, PackageRelease.LAUNCHER), 0o755);
		return PackagedReleaseTest.INSTALLED_AT;
	}

	/**
	 * Waits.
	 *
	 * @param milliseconds - How long to wait.
	 * @returns Nothing.
	 */
	static async _pause(milliseconds: number): Promise<void> {
		await new Promise((resolve) => setTimeout(resolve, milliseconds));
	}

	/**
	 * Reads where the host is serving, refusing to continue when no host is there.
	 *
	 * @returns The address and the token.
	 * @throws When no host wrote an endpoint file.
	 */
	static readEndpoint(): { url: string; token: string } {
		if (Fs.existsSync(PackagedReleaseTest.ENDPOINT_FILE) === false) {
			throw new Error(
				'the packaged host wrote no endpoint.json, so Chrome never started it or it never took the port',
			);
		}
		const endpoint = JSON.parse(Fs.readFileSync(PackagedReleaseTest.ENDPOINT_FILE, 'utf8')) as {
			url: string;
		};
		return {
			url: endpoint.url,
			token: Fs.readFileSync(PackagedReleaseTest.TOKEN_FILE, 'utf8').trim(),
		};
	}

	/**
	 * Asks the host for its tool list, the way an agent does.
	 *
	 * @param endpoint - The address and the bearer token.
	 * @returns Whatever the host answered, as text.
	 */
	static async listTools(endpoint: { url: string; token: string }): Promise<string> {
		const response = await fetch(endpoint.url, {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				accept: 'application/json, text/event-stream',
				authorization: `Bearer ${endpoint.token}`,
			},
			body: JSON.stringify({
				jsonrpc: '2.0',
				id: 1,
				method: 'tools/list',
				params: {},
			}),
		});
		return await response.text();
	}

	/**
	 * Returns the running host's address, refusing to continue when there is none.
	 *
	 * @returns The address and the token.
	 * @throws When the host was never reached.
	 */
	static requireEndpoint(): { url: string; token: string } {
		if (PackagedReleaseTest.endpoint === null) {
			throw new Error('the packaged host was never reached');
		}
		return PackagedReleaseTest.endpoint;
	}
}

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	Checks
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

NodeTest.describe('A packaged release, installed with no repository under it', () => {
	NodeTest.before(async () => {
		const installedAt = await PackagedReleaseTest.installSomewhereElse();
		await LaunchChrome.run({
			extensionDir: Path.join(installedAt, 'chrome_extension'),
			nativeHost: {
				launcherPath: Path.join(installedAt, PackageRelease.LAUNCHER),
				templateDir: Path.join(installedAt, 'native_messaging_template'),
				extensionManifestPath: Path.join(installedAt, 'chrome_extension', 'manifest.json'),
			},
		});
		await PackagedReleaseTest._pause(PackagedReleaseTest.HOST_START);

		// Whoever is answering has to be the host that came out of the release. Another Chrome on this
		// machine with this extension installed owns the port otherwise, the port serves one browser at
		// a time on purpose, and every answer below would then be about that browser instead.
		const holder = await PackagedReleaseTest.whoHoldsThePort();
		const ours = PackagedReleaseTest.packagedHostProcessIds();
		if (holder !== null && ours.includes(holder) === false) {
			PackagedReleaseTest.blockedBy =
				`process ${holder} holds port 8765, and it is not the packaged host this runner started ` +
				`(${ours.length === 0 ? 'which is no longer running' : `process ${ours.join(' or ')}`}). ` +
				'That is another Chrome on this machine with this extension installed, and the port serves ' +
				'one browser at a time by design. Close that browser to run these here; continuous ' +
				'integration runs them for real, where no other Chrome exists.';
			return;
		}
		PackagedReleaseTest.endpoint = PackagedReleaseTest.readEndpoint();
	});

	NodeTest.test('the release carries everything it needs and no TypeScript', async (t) => {
		if (PackagedReleaseTest.blockedBy !== null) {
			t.skip(PackagedReleaseTest.blockedBy);
			return;
		}
		const installedAt = PackagedReleaseTest.INSTALLED_AT;
		for (const name of [
			'chrome_extension/manifest.json',
			PackageRelease.HOST_BUNDLE,
			PackageRelease.LAUNCHER,
			PackageRelease.INSTALLER,
			PackageRelease.COMMAND,
			PackageRelease.PACKAGE_MANIFEST,
			'native_messaging_template/com.webmcp_everywhere.host.json',
			'README.md',
			'LICENSE',
		]) {
			if (Fs.existsSync(Path.join(installedAt, name)) === false) {
				throw new Error(`the release is missing ${name}`);
			}
		}

		const leftovers: string[] = [];
		const walk = (folder: string): void => {
			for (const entry of Fs.readdirSync(folder, { withFileTypes: true })) {
				const full = Path.join(folder, entry.name);
				if (entry.isDirectory() === true) {
					walk(full);
					continue;
				}
				if (entry.name.endsWith('.ts') === true) {
					leftovers.push(Path.relative(installedAt, full));
				}
			}
		};
		walk(installedAt);
		if (leftovers.length > 0) {
			throw new Error(`the release ships TypeScript, which needs a build: ${leftovers.join(', ')}`);
		}
		if (Fs.existsSync(Path.join(installedAt, 'node_modules')) === true) {
			throw new Error('the release ships node_modules, so its dependencies were not bundled in');
		}
		t.diagnostic(`${installedAt} carries the extension, the bundled host, the launcher and the installer`);
	});

	NodeTest.test('Chrome starts the packaged host, which takes the port', async (t) => {
		if (PackagedReleaseTest.blockedBy !== null) {
			t.skip(PackagedReleaseTest.blockedBy);
			return;
		}
		const endpoint = PackagedReleaseTest.requireEndpoint();
		const response = await fetch(endpoint.url.replace('/mcp', '/health'));
		const health = (await response.json()) as {
			extensionConnected?: boolean;
			program?: string;
		};
		if (health.extensionConnected !== true) {
			throw new Error(`the packaged host is up but the extension is not connected: ${JSON.stringify(health)}`);
		}
		t.diagnostic(`the packaged host answers on ${endpoint.url}, extension connected`);
	});

	NodeTest.test('an agent gets the page tools through the packaged host', async (t) => {
		if (PackagedReleaseTest.blockedBy !== null) {
			t.skip(PackagedReleaseTest.blockedBy);
			return;
		}
		const endpoint = PackagedReleaseTest.requireEndpoint();
		let text = '';
		let fromThePage: string[] = [];

		// The tool list is built by asking every open tab, so it is empty until the page has loaded,
		// the content script has run, and the adapter has registered. Asking once races all three.
		for (let attempt = 0; attempt < 10; attempt += 1) {
			text = await PackagedReleaseTest.listTools(endpoint);
			const names = [...text.matchAll(/"name":"([a-z0-9_]+)"/g)].map((match) => match[1]);
			fromThePage = names.filter((name) => name.startsWith('demo_playwright_dev__'));
			if (fromThePage.length > 0) {
				break;
			}
			await PackagedReleaseTest._pause(2000);
		}

		if (fromThePage.length === 0) {
			// A host that is up but has no page tools is nearly always the wrong host: port 8765 holds
			// one browser at a time, and another Chrome on this machine may own it. Say which process
			// answered and what pages it can see, because "no page tools" alone points at the adapter.
			const health = await fetch(endpoint.url.replace('/mcp', '/health')).then(
				async (response) => await response.text(),
			);
			throw new Error(
				`the host answering ${endpoint.url} listed no page tools.\n` +
					`its health says: ${health}\n` +
					`this check's own host should be the packaged one; if the process above belongs to ` +
					`another Chrome, that browser owns the port and this check cannot run beside it.\n` +
					`it answered: ${text.slice(0, 300)}`,
			);
		}
		t.diagnostic(`${fromThePage.length} tools from the page, through a host with no repository under it`);
	});
});

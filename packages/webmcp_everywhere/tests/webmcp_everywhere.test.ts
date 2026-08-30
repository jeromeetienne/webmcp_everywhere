///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	WebmcpEverywhereTest — that the published package installs itself where npm cannot delete it
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

import ChildProcess from 'node:child_process';
import Crypto from 'node:crypto';
import Fs from 'node:fs';
import Os from 'node:os';
import Path from 'node:path';
import NodeTest from 'node:test';
import { ExtensionIdentifier } from '../src/extension_identifier.ts';
import { InstallNativeHost } from '../src/install_native_host.ts';
import { InstallationStatus } from '../src/installation_status.ts';
import { PackageRelease } from '../tools/package_release.ts';
import { PackagedReleaseInstallation } from '../src/packaged_release_installation.ts';
import { ReleaseLayout } from '../src/release_layout.ts';
import { VersionAgreement } from '../tools/version_agreement.ts';

const __filename = import.meta.filename;
const __dirname = import.meta.dirname;

/**
 * Drives the package the way npm delivers it, into a home folder that is not the runner's.
 *
 * The command is really packed with `npm pack`, really installed with `npm install`, and really run
 * through the executable npm links for the `bin` field. Nothing is mocked, and no file goes anywhere
 * near the home folder of whoever runs this: `HOME` is a throwaway directory, so the installation, the
 * state directory and the Chrome native messaging host directory all land inside it.
 *
 * These checks need no browser and no port. What a browser then does with the installation is
 * `packaged_release.test.ts`, which installs through the same `PackagedReleaseInstallation` and drives
 * a real Chrome against the result.
 */
class WebmcpEverywhereTest {
	/** Where everything this runner writes goes, well away from the repository and from the real home. */
	static readonly WORKING_DIR = Path.join(Os.tmpdir(), 'webmcp_everywhere_published_package');

	/** The home folder the command is run against, standing in for a user's. */
	static readonly HOME_DIR = Path.join(WebmcpEverywhereTest.WORKING_DIR, 'home');

	/** Where the tarball is installed, standing in for the folder an npx run unpacks into. */
	static readonly CONSUMER_DIR = Path.join(WebmcpEverywhereTest.WORKING_DIR, 'consumer');

	/** The tarball `npm pack` wrote, or null before it has been packed. */
	static tarball: string | null = null;

	/**
	 * Names the folder the installation goes into, inside the throwaway home.
	 *
	 * @returns The absolute path of the installation folder.
	 */
	static installationDir(): string {
		return Path.join(
			WebmcpEverywhereTest.HOME_DIR,
			'.webmcp_everywhere',
			PackagedReleaseInstallation.FOLDER_NAME,
		);
	}

	/**
	 * Names the host manifest Chrome would read, inside the throwaway home.
	 *
	 * @returns The absolute path of the manifest file.
	 */
	static manifestPath(): string {
		return Path.join(
			InstallNativeHost.everydayChromeDirectory(WebmcpEverywhereTest.HOME_DIR),
			`${InstallNativeHost.HOST_NAME}.json`,
		);
	}

	/**
	 * Names the executable npm links for the `bin` field of the published manifest.
	 *
	 * @returns The absolute path of that executable.
	 */
	static commandPath(): string {
		return Path.join(WebmcpEverywhereTest.CONSUMER_DIR, 'node_modules', '.bin', 'webmcp_everywhere');
	}

	/**
	 * Packs the release with npm and installs the tarball into a throwaway prefix.
	 *
	 * @returns Nothing.
	 * @throws When packing or installing failed, with whatever npm said.
	 */
	static async packAndInstall(): Promise<void> {
		const packaged = await PackageRelease.run();

		Fs.mkdirSync(WebmcpEverywhereTest.CONSUMER_DIR, {
			recursive: true,
		});
		Fs.mkdirSync(WebmcpEverywhereTest.HOME_DIR, {
			recursive: true,
		});

		const packed = ChildProcess.spawnSync(
			'npm',
			['pack', '--pack-destination', WebmcpEverywhereTest.WORKING_DIR, packaged.folder],
			{
				encoding: 'utf8',
			},
		);
		if (packed.status !== 0) {
			throw new Error(`npm pack failed:\n${packed.stderr}`);
		}
		WebmcpEverywhereTest.tarball = Path.join(WebmcpEverywhereTest.WORKING_DIR, packed.stdout.trim().split('\n').pop() ?? '');

		WebmcpEverywhereTest.installTheTarball();
	}

	/**
	 * Installs the packed tarball into the throwaway prefix, as npm does for an npx run.
	 *
	 * @returns Nothing.
	 * @throws When npm refused to install it.
	 */
	static installTheTarball(): void {
		if (WebmcpEverywhereTest.tarball === null) {
			throw new Error('nothing has been packed yet');
		}
		const installed = ChildProcess.spawnSync(
			'npm',
			[
				'install',
				'--prefix',
				WebmcpEverywhereTest.CONSUMER_DIR,
				'--no-audit',
				'--no-fund',
				'--loglevel=error',
				WebmcpEverywhereTest.tarball,
			],
			{
				encoding: 'utf8',
			},
		);
		if (installed.status !== 0) {
			throw new Error(`npm install failed:\n${installed.stderr}`);
		}
	}

	/**
	 * Runs the installed command against the throwaway home folder.
	 *
	 * @param args - The subcommand and its arguments, or nothing for the install.
	 * @param isFailureExpected - Whether a code other than zero is part of what is being checked.
	 * @returns What the command printed and the code it exited with.
	 * @throws When the command failed and the caller did not expect it to.
	 */
	static runTheCommand(args: string[] = [], isFailureExpected: boolean = false): {
		stdout: string;
		stderr: string;
		code: number | null;
	} {
		const environment: NodeJS.ProcessEnv = {
			...process.env,
			HOME: WebmcpEverywhereTest.HOME_DIR,
		};
		delete environment.WEBMCP_EVERYWHERE_STATE_DIR;

		const ran = ChildProcess.spawnSync(WebmcpEverywhereTest.commandPath(), args, {
			encoding: 'utf8',
			env: environment,
		});
		if (ran.status !== 0 && isFailureExpected === false) {
			throw new Error(`the command failed with code ${ran.status}:\n${ran.stdout}\n${ran.stderr}`);
		}
		return {
			stdout: ran.stdout,
			stderr: ran.stderr,
			code: ran.status,
		};
	}

	/**
	 * Reads the host manifest Chrome would read.
	 *
	 * @returns The parsed manifest.
	 * @throws When there is no manifest to read.
	 */
	static readManifest(): { path: string; allowed_origins: string[] } {
		const manifestPath = WebmcpEverywhereTest.manifestPath();
		if (Fs.existsSync(manifestPath) === false) {
			throw new Error(`the command wrote no host manifest at ${manifestPath}`);
		}
		return JSON.parse(Fs.readFileSync(manifestPath, 'utf8')) as {
			path: string;
			allowed_origins: string[];
		};
	}

	/**
	 * Lists every file under a folder with the digest of its content, keyed by its path inside the folder.
	 *
	 * @param folder - The folder to walk.
	 * @param only - The entries inside it to cover, or nothing to cover the whole folder.
	 * @returns One entry per file, path inside the folder to digest.
	 */
	static digestEveryFile(folder: string, only?: string[]): Map<string, string> {
		const digests = new Map<string, string>();
		const walk = (current: string): void => {
			for (const entry of Fs.readdirSync(current, { withFileTypes: true })) {
				const full = Path.join(current, entry.name);
				if (entry.isDirectory() === true) {
					walk(full);
					continue;
				}
				const digest = Crypto.createHash('sha256').update(Fs.readFileSync(full)).digest('hex');
				digests.set(Path.relative(folder, full), digest);
			}
		};
		if (only === undefined) {
			walk(folder);
			return digests;
		}
		for (const entry of only) {
			const full = Path.join(folder, entry);
			if (Fs.statSync(full).isDirectory() === true) {
				walk(full);
				continue;
			}
			const digest = Crypto.createHash('sha256').update(Fs.readFileSync(full)).digest('hex');
			digests.set(entry, digest);
		}
		return digests;
	}

	/**
	 * Answers whether a file is executable by its owner.
	 *
	 * @param path - The file to look at.
	 * @returns True when the owner execute bit is set.
	 */
	static isRunnable(path: string): boolean {
		return (Fs.statSync(path).mode & 0o100) !== 0;
	}
}

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	Checks
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

NodeTest.describe('The published package, installed by npm into a home folder of its own', () => {
	NodeTest.before(async () => {
		Fs.rmSync(WebmcpEverywhereTest.WORKING_DIR, {
			recursive: true,
			force: true,
		});
		await WebmcpEverywhereTest.packAndInstall();
	});

	NodeTest.after(() => {
		Fs.rmSync(WebmcpEverywhereTest.WORKING_DIR, {
			recursive: true,
			force: true,
		});
	});

	NodeTest.test('the package and the extension name one version', (t) => {
		const agreed = VersionAgreement.check();
		if (agreed.isAgreed === false) {
			throw new Error(`the version numbers disagree: ${agreed.disagreement}`);
		}

		// The same check has to be able to fail, or it is checking nothing. A tag is what the release
		// workflow passes it, and a tag naming another version is the mistake it exists to refuse.
		const refused = VersionAgreement.check(`v${agreed.packageVersion}9`);
		if (refused.isAgreed === true) {
			throw new Error('a tag naming another version was accepted');
		}
		t.diagnostic(`both say ${agreed.packageVersion}, and a tag saying otherwise is refused`);
	});

	NodeTest.test('npm links the command the bin field names, and it runs', (t) => {
		const commandPath = WebmcpEverywhereTest.commandPath();
		if (Fs.existsSync(commandPath) === false) {
			throw new Error(`npm linked no command at ${commandPath}`);
		}
		const version = WebmcpEverywhereTest.runTheCommand(['--version']).stdout.trim();
		if (/^\d+\.\d+\.\d+$/.test(version) === false) {
			throw new Error(`the command answered --version with ${version}`);
		}
		t.diagnostic(`${commandPath} answered ${version}`);
	});

	NodeTest.test('asked before anything is installed, it says so and exits 1', (t) => {
		const asked = WebmcpEverywhereTest.runTheCommand(['status'], true);

		if (asked.code === 0) {
			throw new Error('status exited 0 with nothing installed, so no script could act on it');
		}
		if (asked.stdout.includes('Nothing is installed') === false) {
			throw new Error(`status said: ${asked.stdout}`);
		}
		t.diagnostic(`exit code ${asked.code}, and it named the command to run`);
	});

	NodeTest.test('installing copies the release out of the folder npm owns', (t) => {
		const output = WebmcpEverywhereTest.runTheCommand().stdout;
		const installationDir = WebmcpEverywhereTest.installationDir();

		for (const name of [
			Path.join(ReleaseLayout.EXTENSION_DIR, ReleaseLayout.EXTENSION_MANIFEST),
			ReleaseLayout.HOST_BUNDLE,
			ReleaseLayout.LAUNCHER,
			ReleaseLayout.INSTALLER,
			ReleaseLayout.COMMAND,
			ReleaseLayout.PACKAGE_MANIFEST,
			Path.join(ReleaseLayout.TEMPLATE_DIR, `${InstallNativeHost.HOST_NAME}.json`),
			'README.md',
			'LICENSE',
		]) {
			if (Fs.existsSync(Path.join(installationDir, name)) === false) {
				throw new Error(`the installation is missing ${name}`);
			}
		}

		if (WebmcpEverywhereTest.isRunnable(Path.join(installationDir, ReleaseLayout.LAUNCHER)) === false) {
			throw new Error('the copied launcher is not executable, so Chrome could never start it');
		}
		if (output.includes(installationDir) === false) {
			throw new Error('the command never named the folder it wrote, so nothing was announced');
		}
		t.diagnostic(`installed into ${installationDir}`);
	});

	NodeTest.test('what npm delivered is the release a real Chrome is driven against', (t) => {
		// This is the link between the two runners. `packaged_release.test.ts` drives a real Chrome
		// against the release folder, installed through the same `PackagedReleaseInstallation` this
		// command uses, and it needs port 8765 so it can only run where no other browser does. Here the
		// same folder is compared with what npm really packed, installed and copied, so the browser proof
		// carries over to the package without a second twelve-minute Chrome run.
		// only the entries the package publishes: that folder is the workspace package, so it also holds
		// the `src/` that is bundled into the three files rather than shipped, and its `CONTEXT.md`
		const released = WebmcpEverywhereTest.digestEveryFile(
			Path.join(__dirname, '..'),
			ReleaseLayout.PUBLISHED_ENTRIES,
		);
		const installed = WebmcpEverywhereTest.digestEveryFile(WebmcpEverywhereTest.installationDir());

		const missing = [...released.keys()].filter((name) => installed.has(name) === false);
		if (missing.length > 0) {
			throw new Error(`npm delivered no ${missing.join(', ')}`);
		}
		const extra = [...installed.keys()].filter((name) => released.has(name) === false);
		if (extra.length > 0) {
			throw new Error(`the installation holds ${extra.join(', ')}, which the release does not`);
		}
		const changed = [...released.entries()]
			.filter(([name, digest]) => installed.get(name) !== digest)
			.map(([name]) => name);
		if (changed.length > 0) {
			throw new Error(`${changed.join(', ')} arrived changed`);
		}
		t.diagnostic(`${released.size} files, every one identical to the release Chrome is driven against`);
	});

	NodeTest.test('installing ends by saying the one step nobody else can take', (t) => {
		const output = WebmcpEverywhereTest.runTheCommand().stdout;
		const extensionDir = Path.join(WebmcpEverywhereTest.installationDir(), ReleaseLayout.EXTENSION_DIR);

		if (output.includes('No browser is holding the port') === false) {
			throw new Error(`the install never said whether it is working:\n${output}`);
		}
		if (output.includes(extensionDir) === false) {
			throw new Error('the install never named the folder to load at chrome://extensions');
		}
		t.diagnostic('the last thing a person reads is why no tools are reaching their agent');
	});

	NodeTest.test('the copied command runs on its own, with no npm around it', (t) => {
		const bundle = Path.join(WebmcpEverywhereTest.installationDir(), ReleaseLayout.COMMAND);
		const ran = ChildProcess.spawnSync(process.execPath, [bundle, '--version'], {
			encoding: 'utf8',
		});

		// The release README tells anybody who unzipped an archive to run exactly this. It once crashed,
		// because a bundle shares one `import.meta.filename` across every module inlined into it, so the
		// `import.meta.filename === process.argv[1]` test at the foot of an imported tool fired as well.
		if (ran.status !== 0) {
			throw new Error(`running the bundle directly failed:\n${ran.stdout}\n${ran.stderr}`);
		}
		if (/^\d+\.\d+\.\d+$/.test(ran.stdout.trim()) === false) {
			throw new Error(`running the bundle directly printed: ${ran.stdout}${ran.stderr}`);
		}
		t.diagnostic(`node ${ReleaseLayout.COMMAND} answered ${ran.stdout.trim()} and did nothing else`);
	});

	NodeTest.test('an endpoint file naming an address nothing answers on is called out as that', (t) => {
		const endpointPath = Path.join(WebmcpEverywhereTest.HOME_DIR, '.webmcp_everywhere', 'endpoint.json');
		Fs.writeFileSync(
			endpointPath,
			JSON.stringify({
				url: 'http://127.0.0.1:1/mcp',
				processId: 999999,
				startedAt: '2026-08-29T00:00:00.000Z',
			}),
		);

		const asked = WebmcpEverywhereTest.runTheCommand(['status'], true);
		Fs.rmSync(endpointPath);

		if (asked.code === 0) {
			throw new Error('status exited 0 while nothing was listening');
		}
		if (asked.stdout.includes('nothing answers there') === false) {
			throw new Error(`status said: ${asked.stdout}`);
		}
		t.diagnostic('a recorded address with nothing behind it reads as that, not as a missing extension');
	});

	NodeTest.test('the registration names the copy, and the extension identifier is the pinned one', (t) => {
		const manifest = WebmcpEverywhereTest.readManifest();
		const launcher = Path.join(WebmcpEverywhereTest.installationDir(), ReleaseLayout.LAUNCHER);

		if (manifest.path !== launcher) {
			throw new Error(`the manifest tells Chrome to start ${manifest.path}, not ${launcher}`);
		}

		const identifier = ExtensionIdentifier.fromManifest(
			Path.join(
				__dirname,
				'..',
				'..',
				'..',
				'dist',
				ReleaseLayout.EXTENSION_DIR,
				ReleaseLayout.EXTENSION_MANIFEST,
			),
		);
		const expected = `chrome-extension://${identifier}/`;
		if (manifest.allowed_origins.includes(expected) === false) {
			throw new Error(
				`the manifest allows ${manifest.allowed_origins.join(', ')} rather than ${expected}`,
			);
		}
		t.diagnostic(`${manifest.path} is allowed to ${identifier}, which the folder it sits in did not change`);
	});

	NodeTest.test('the installation outlives the folder npm unpacked into', (t) => {
		Fs.rmSync(Path.join(WebmcpEverywhereTest.CONSUMER_DIR, 'node_modules'), {
			recursive: true,
			force: true,
		});

		const launcher = WebmcpEverywhereTest.readManifest().path;
		if (Fs.existsSync(launcher) === false) {
			throw new Error(`npm emptying its folder took the launcher with it: ${launcher}`);
		}
		if (WebmcpEverywhereTest.isRunnable(launcher) === false) {
			throw new Error(`${launcher} is no longer executable`);
		}
		t.diagnostic(`${launcher} is still there with node_modules gone, which is the whole reason for the copy`);
	});

	NodeTest.test('installing again replaces the folder rather than adding another', (t) => {
		const installationDir = WebmcpEverywhereTest.installationDir();
		const leftover = Path.join(installationDir, 'left_over_from_the_previous_version.txt');
		Fs.writeFileSync(leftover, 'this file belongs to no version of the package');

		WebmcpEverywhereTest.installTheTarball();
		WebmcpEverywhereTest.runTheCommand();

		if (Fs.existsSync(leftover) === true) {
			throw new Error('the second installation was written over the first rather than replacing it');
		}
		const siblings = Fs.readdirSync(Path.dirname(installationDir));
		const installations = siblings.filter((name) => {
			return name.startsWith(PackagedReleaseInstallation.FOLDER_NAME) === true;
		});
		if (installations.length !== 1) {
			throw new Error(`there are ${installations.length} installations: ${installations.join(', ')}`);
		}
		t.diagnostic(`one installation, and ${Path.basename(leftover)} is gone`);
	});

	NodeTest.test('the browser own tools are not counted as a site adapter', (t) => {
		const adapters = InstallationStatus._groupByAdapter([
			'webmcp_everywhere__list_pages',
			'webmcp_everywhere__open_page',
			'webmcp_everywhere__close_page',
			'caniuse_com__check_support',
			'demo_playwright_dev__list_todos__tab7',
			'demo_playwright_dev__list_todos__tab12',
		]);

		if (adapters.length !== 2) {
			throw new Error(`counted ${adapters.length} adapters: ${adapters.map((one) => one.siteSlug).join(', ')}`);
		}
		const [caniuse, playwright] = adapters;
		if (caniuse.siteSlug !== 'caniuse_com' || caniuse.toolCount !== 1) {
			throw new Error(`the first adapter is ${caniuse.siteSlug} with ${caniuse.toolCount} tools`);
		}
		if (playwright.tabIds.join(',') !== '7,12') {
			throw new Error(`the tabs read back as ${playwright.tabIds.join(',')}`);
		}
		t.diagnostic('three browser tools left out, two adapters counted, two tabs told apart');
	});

	NodeTest.test('uninstalling removes both, and leaves the token alone', (t) => {
		const tokenPath = Path.join(WebmcpEverywhereTest.HOME_DIR, '.webmcp_everywhere', 'token');
		Fs.writeFileSync(tokenPath, 'a token an agent was configured with');

		const output = WebmcpEverywhereTest.runTheCommand(['uninstall']).stdout;

		if (Fs.existsSync(WebmcpEverywhereTest.manifestPath()) === true) {
			throw new Error('the host manifest is still there, so Chrome would still start the host');
		}
		if (Fs.existsSync(WebmcpEverywhereTest.installationDir()) === true) {
			throw new Error('the installation folder is still there');
		}
		if (Fs.existsSync(tokenPath) === false) {
			throw new Error('uninstalling deleted the token, which belongs to the user and not to it');
		}
		if (output.includes(tokenPath.replace('/token', '')) === false) {
			throw new Error('uninstalling never said what it left behind');
		}
		t.diagnostic('the registration and the folder are gone, the token is not');
	});
});

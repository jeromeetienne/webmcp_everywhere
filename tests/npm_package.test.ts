///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	NpmPackageTest — that the published package installs itself where npm cannot delete it
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

import ChildProcess from 'node:child_process';
import Fs from 'node:fs';
import Os from 'node:os';
import Path from 'node:path';
import NodeTest from 'node:test';
import { GenerateExtensionKey } from '../tools/generate_extension_key.ts';
import { InstallNativeHost } from '../tools/install_native_host.ts';
import { PackageRelease } from '../tools/package_release.ts';
import { PackagedReleaseInstallation } from '../tools/packaged_release_installation.ts';
import { ReleaseLayout } from '../tools/release_layout.ts';

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
class NpmPackageTest {
	/** Where everything this runner writes goes, well away from the repository and from the real home. */
	static readonly WORKING_DIR = Path.join(Os.tmpdir(), 'webmcp_everywhere_npm_package');

	/** The home folder the command is run against, standing in for a user's. */
	static readonly HOME_DIR = Path.join(NpmPackageTest.WORKING_DIR, 'home');

	/** Where the tarball is installed, standing in for the folder an npx run unpacks into. */
	static readonly CONSUMER_DIR = Path.join(NpmPackageTest.WORKING_DIR, 'consumer');

	/** The tarball `npm pack` wrote, or null before it has been packed. */
	static tarball: string | null = null;

	/**
	 * Names the folder the installation goes into, inside the throwaway home.
	 *
	 * @returns The absolute path of the installation folder.
	 */
	static installationDir(): string {
		return Path.join(
			NpmPackageTest.HOME_DIR,
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
			InstallNativeHost.everydayChromeDirectory(NpmPackageTest.HOME_DIR),
			`${InstallNativeHost.HOST_NAME}.json`,
		);
	}

	/**
	 * Names the executable npm links for the `bin` field of the published manifest.
	 *
	 * @returns The absolute path of that executable.
	 */
	static commandPath(): string {
		return Path.join(NpmPackageTest.CONSUMER_DIR, 'node_modules', '.bin', 'webmcp_everywhere');
	}

	/**
	 * Packs the release with npm and installs the tarball into a throwaway prefix.
	 *
	 * @returns Nothing.
	 * @throws When packing or installing failed, with whatever npm said.
	 */
	static async packAndInstall(): Promise<void> {
		const packaged = await PackageRelease.run();

		Fs.mkdirSync(NpmPackageTest.CONSUMER_DIR, {
			recursive: true,
		});
		Fs.mkdirSync(NpmPackageTest.HOME_DIR, {
			recursive: true,
		});

		const packed = ChildProcess.spawnSync(
			'npm',
			['pack', '--pack-destination', NpmPackageTest.WORKING_DIR, packaged.folder],
			{
				encoding: 'utf8',
			},
		);
		if (packed.status !== 0) {
			throw new Error(`npm pack failed:\n${packed.stderr}`);
		}
		NpmPackageTest.tarball = Path.join(NpmPackageTest.WORKING_DIR, packed.stdout.trim().split('\n').pop() ?? '');

		NpmPackageTest.installTheTarball();
	}

	/**
	 * Installs the packed tarball into the throwaway prefix, as npm does for an npx run.
	 *
	 * @returns Nothing.
	 * @throws When npm refused to install it.
	 */
	static installTheTarball(): void {
		if (NpmPackageTest.tarball === null) {
			throw new Error('nothing has been packed yet');
		}
		const installed = ChildProcess.spawnSync(
			'npm',
			[
				'install',
				'--prefix',
				NpmPackageTest.CONSUMER_DIR,
				'--no-audit',
				'--no-fund',
				'--loglevel=error',
				NpmPackageTest.tarball,
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
	 * @returns What the command printed and the code it exited with.
	 * @throws When the command exited with a code other than zero.
	 */
	static runTheCommand(args: string[] = []): { stdout: string; stderr: string } {
		const environment: NodeJS.ProcessEnv = {
			...process.env,
			HOME: NpmPackageTest.HOME_DIR,
		};
		delete environment.WEBMCP_EVERYWHERE_STATE_DIR;

		const ran = ChildProcess.spawnSync(NpmPackageTest.commandPath(), args, {
			encoding: 'utf8',
			env: environment,
		});
		if (ran.status !== 0) {
			throw new Error(`the command failed with code ${ran.status}:\n${ran.stdout}\n${ran.stderr}`);
		}
		return {
			stdout: ran.stdout,
			stderr: ran.stderr,
		};
	}

	/**
	 * Reads the host manifest Chrome would read.
	 *
	 * @returns The parsed manifest.
	 * @throws When there is no manifest to read.
	 */
	static readManifest(): { path: string; allowed_origins: string[] } {
		const manifestPath = NpmPackageTest.manifestPath();
		if (Fs.existsSync(manifestPath) === false) {
			throw new Error(`the command wrote no host manifest at ${manifestPath}`);
		}
		return JSON.parse(Fs.readFileSync(manifestPath, 'utf8')) as {
			path: string;
			allowed_origins: string[];
		};
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
		Fs.rmSync(NpmPackageTest.WORKING_DIR, {
			recursive: true,
			force: true,
		});
		await NpmPackageTest.packAndInstall();
	});

	NodeTest.after(() => {
		Fs.rmSync(NpmPackageTest.WORKING_DIR, {
			recursive: true,
			force: true,
		});
	});

	NodeTest.test('npm links the command the bin field names, and it runs', (t) => {
		const commandPath = NpmPackageTest.commandPath();
		if (Fs.existsSync(commandPath) === false) {
			throw new Error(`npm linked no command at ${commandPath}`);
		}
		const version = NpmPackageTest.runTheCommand(['--version']).stdout.trim();
		if (/^\d+\.\d+\.\d+$/.test(version) === false) {
			throw new Error(`the command answered --version with ${version}`);
		}
		t.diagnostic(`${commandPath} answered ${version}`);
	});

	NodeTest.test('installing copies the release out of the folder npm owns', (t) => {
		const output = NpmPackageTest.runTheCommand().stdout;
		const installationDir = NpmPackageTest.installationDir();

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

		if (NpmPackageTest.isRunnable(Path.join(installationDir, ReleaseLayout.LAUNCHER)) === false) {
			throw new Error('the copied launcher is not executable, so Chrome could never start it');
		}
		if (output.includes(installationDir) === false) {
			throw new Error('the command never named the folder it wrote, so nothing was announced');
		}
		t.diagnostic(`installed into ${installationDir}`);
	});

	NodeTest.test('the registration names the copy, and the extension identifier is the pinned one', (t) => {
		const manifest = NpmPackageTest.readManifest();
		const launcher = Path.join(NpmPackageTest.installationDir(), ReleaseLayout.LAUNCHER);

		if (manifest.path !== launcher) {
			throw new Error(`the manifest tells Chrome to start ${manifest.path}, not ${launcher}`);
		}

		const identifier = GenerateExtensionKey.currentIdentifier(
			Path.join(__dirname, '..', 'build', ReleaseLayout.EXTENSION_DIR, ReleaseLayout.EXTENSION_MANIFEST),
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
		Fs.rmSync(Path.join(NpmPackageTest.CONSUMER_DIR, 'node_modules'), {
			recursive: true,
			force: true,
		});

		const launcher = NpmPackageTest.readManifest().path;
		if (Fs.existsSync(launcher) === false) {
			throw new Error(`npm emptying its folder took the launcher with it: ${launcher}`);
		}
		if (NpmPackageTest.isRunnable(launcher) === false) {
			throw new Error(`${launcher} is no longer executable`);
		}
		t.diagnostic(`${launcher} is still there with node_modules gone, which is the whole reason for the copy`);
	});

	NodeTest.test('installing again replaces the folder rather than adding another', (t) => {
		const installationDir = NpmPackageTest.installationDir();
		const leftover = Path.join(installationDir, 'left_over_from_the_previous_version.txt');
		Fs.writeFileSync(leftover, 'this file belongs to no version of the package');

		NpmPackageTest.installTheTarball();
		NpmPackageTest.runTheCommand();

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

	NodeTest.test('uninstalling removes both, and leaves the token alone', (t) => {
		const tokenPath = Path.join(NpmPackageTest.HOME_DIR, '.webmcp_everywhere', 'token');
		Fs.writeFileSync(tokenPath, 'a token an agent was configured with');

		const output = NpmPackageTest.runTheCommand(['uninstall']).stdout;

		if (Fs.existsSync(NpmPackageTest.manifestPath()) === true) {
			throw new Error('the host manifest is still there, so Chrome would still start the host');
		}
		if (Fs.existsSync(NpmPackageTest.installationDir()) === true) {
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

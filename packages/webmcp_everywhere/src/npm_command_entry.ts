import Fs from 'node:fs';
import Path from 'node:path';
import { InstallationStatus } from './installation_status.ts';
import { PackagedReleaseInstallation } from './packaged_release_installation.ts';
import { ReleaseLayout } from './release_layout.ts';
import type { InstallationStatusReport } from './installation_status.ts';

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	NpmCommandEntry — the command an `npx webmcp_everywhere` run starts
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

const __filename = import.meta.filename;
const __dirname = import.meta.dirname;

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	NpmCommandEntry
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/**
 * Installs the packaged release sitting beside this file, says whether it is working, or removes it.
 *
 * This is the command the `bin` field of the published manifest names, so `npx webmcp_everywhere`
 * starts it. It never installs from the folder it is running in: an npx run unpacks the package under
 * `~/.npm/_npx/`, npm empties that whenever it decides to, and Chrome would be left naming a folder
 * that is gone. `PackagedReleaseInstallation` copies the release into the state directory first, and
 * everything Chrome is told about names the copy.
 *
 * One step is left for the person, and cannot be taken away here: Chrome loads an unpacked extension
 * only when somebody turns on Developer mode and picks the folder. So installing ends by asking the
 * running system whether that step has been taken, which is the same answer `status` gives on its own.
 */
export class NpmCommandEntry {
	/** The path segments that name a folder npm fills for one run and empties whenever it decides to. */
	static readonly CACHE_SEGMENTS = ['_npx', '_cacache'];

	/** The issue holding the plan this command is a milestone of. */
	static readonly PLAN_URL = 'https://github.com/jeromeetienne/webmcp_everywhere/issues/12';

	/** Where an agent is pointed once the extension is loaded and Chrome has started the host. */
	static readonly ENDPOINT_URL = 'http://127.0.0.1:8765/mcp';

	/**
	 * Runs the subcommand the arguments name.
	 *
	 * @param argv - The arguments after the command name, which is `process.argv.slice(2)`.
	 * @returns Nothing.
	 */
	static async run(argv: string[]): Promise<void> {
		const subcommand = argv[0] ?? 'install';

		if (subcommand === 'install') {
			NpmCommandEntry._install();
			await NpmCommandEntry._reportStatus(true);
			return;
		}
		if (subcommand === 'status') {
			const report = await NpmCommandEntry._reportStatus(false);

			// The exit code is set here and not after an install. A status is asked in order to be acted
			// on, by a person or by a script, so "no tools are reaching your agent" is a failure. The same
			// answer a moment after installing is not: nobody has had the chance to load the extension yet.
			process.exitCode = report.isReady === true ? 0 : 1;
			return;
		}
		if (subcommand === 'uninstall') {
			NpmCommandEntry._uninstall();
			return;
		}
		if (subcommand === '--version' || subcommand === 'version') {
			console.log(NpmCommandEntry._extensionVersion());
			return;
		}
		if (subcommand === '--help' || subcommand === 'help') {
			NpmCommandEntry._usage(console.log);
			return;
		}

		console.error(`webmcp_everywhere: no subcommand called ${subcommand}`);
		NpmCommandEntry._usage(console.error);
		process.exitCode = 1;
	}

	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////
	//	Helpers
	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////

	/**
	 * Names every path the installation is about to write, then writes them.
	 *
	 * The announcement comes first for the same reason the installer inside a release announces: from
	 * the moment the host manifest exists, Chrome starts a program outside the browser sandbox with the
	 * user's full rights, and that is not a thing to be opted into silently.
	 *
	 * @returns Nothing.
	 */
	static _install(): void {
		const planned = PackagedReleaseInstallation.plan({
			sourceDir: __dirname,
		});

		console.log(`WebMCP Everywhere ${NpmCommandEntry._extensionVersion()}`);
		console.log('');
		if (planned.isAlreadyInPlace === true) {
			console.log(`This is already installed at ${planned.targetDir}, so only the registration runs again.`);
		} else {
			const verb = planned.isTargetDirReplaced === true ? 'replaces the folder' : 'writes the folder';
			console.log(`This ${verb} ${planned.targetDir}`);
			console.log(`with a copy of ${planned.sourceDir}`);
			if (NpmCommandEntry._isFolderNpmMayEmpty(planned.sourceDir) === true) {
				console.log('');
				console.log('The copy is made because npm empties the folder above whenever it decides to, and');
				console.log('Chrome keeps an absolute path for both an unpacked extension and a native messaging');
				console.log('host. Registering the folder npm owns would break the day npm cleared it.');
			}
		}
		console.log('');
		console.log('It is also about to write:');
		for (const manifestPath of planned.nativeHost.manifests) {
			console.log(`  ${manifestPath}`);
		}
		console.log('');
		console.log(`Each of those tells Chrome to start: ${Path.join(planned.targetDir, ReleaseLayout.LAUNCHER)}`);
		console.log(`and to let only the extension ${planned.nativeHost.identifier} talk to it.`);
		console.log('');
		console.log('Chrome will start that program outside the browser sandbox, with your rights.');
		console.log('To undo all of it: npx webmcp_everywhere uninstall');
		console.log('');

		const installed = PackagedReleaseInstallation.install({
			sourceDir: __dirname,
		});

		console.log(`installed ${installed.targetDir}`);
		for (const manifestPath of installed.nativeHost.manifests) {
			console.log(`wrote     ${manifestPath}`);
		}
	}

	/**
	 * Asks the running system whether the extension is loaded and reaching an agent, and says so.
	 *
	 * @param isAfterInstall - Whether this follows an installation, which changes what is left to say.
	 * @returns What the check found, so a caller can act on it.
	 */
	static async _reportStatus(isAfterInstall: boolean): Promise<InstallationStatusReport> {
		const report = await InstallationStatus.read();

		console.log('');
		console.log(report.summary);

		if (report.remedy.length > 0) {
			console.log('');
			for (const line of report.remedy) {
				console.log(line);
			}
		}

		if (report.adapters.length > 0) {
			console.log('');
			const widest = Math.max(...report.adapters.map((adapter) => adapter.siteSlug.length));
			for (const adapter of report.adapters) {
				const tabs =
					adapter.tabIds.length === 0
						? ''
						: `   in ${adapter.tabIds.length === 1 ? 'tab' : 'tabs'} ${adapter.tabIds.join(', ')}`;
				const count = `${adapter.toolCount}`.padStart(2);
				console.log(`  ${adapter.siteSlug.padEnd(widest)}  ${count} tools${tabs}`);
			}
		}

		const tokenPath = Path.join(report.stateDir, 'token');
		if (report.isReady === true && report.endpoint !== null) {
			console.log('');
			console.log(`Point your agent at ${report.endpoint.url}, with the bearer token from`);
			console.log(`  ${tokenPath}`);
		} else if (isAfterInstall === true) {
			console.log('');
			console.log(`Once it is loaded, point your agent at ${NpmCommandEntry.ENDPOINT_URL}, with the`);
			console.log(`bearer token from ${tokenPath}`);
		}

		return report;
	}

	/**
	 * Removes the registration and the installation folder, and says what it left behind.
	 *
	 * @returns Nothing.
	 */
	static _uninstall(): void {
		const removed = PackagedReleaseInstallation.remove({
			sourceDir: __dirname,
		});

		for (const manifest of removed.manifests) {
			if (manifest.isRemoved === true) {
				console.log(`removed ${manifest.path}`);
				if (manifest.launcher !== null) {
					console.log(`  it told Chrome to start: ${manifest.launcher}`);
				}
			} else {
				console.log(`nothing to remove at ${manifest.path}`);
			}
		}
		if (removed.isTargetDirRemoved === true) {
			console.log(`removed ${removed.targetDir}`);
		} else {
			console.log(`nothing to remove at ${removed.targetDir}`);
		}

		console.log('');
		console.log('Chrome will no longer start the native messaging host for this extension.');
		console.log('The extension itself is removed at chrome://extensions, which this does not touch.');
		console.log(`Your bearer token and your loaded adapters are left alone in ${removed.stateDir}`);
		console.log(`To remove those as well: rm -rf ${removed.stateDir}`);
	}

	/**
	 * Prints what the command accepts.
	 *
	 * @param write - Where the lines go, so that an unknown subcommand can print this to standard error.
	 * @returns Nothing.
	 */
	static _usage(write: (line: string) => void): void {
		write('');
		write('  npx webmcp_everywhere              install it, then say whether it is working');
		write('  npx webmcp_everywhere status       say whether it is working, and exit 1 when it is not');
		write('  npx webmcp_everywhere uninstall    take the installation and the registration back out');
		write('  npx webmcp_everywhere --version    print the version of the extension it carries');
		write('');
		write(`The plan this command follows is ${NpmCommandEntry.PLAN_URL}`);
	}

	/**
	 * Answers whether npm empties the folder a path names.
	 *
	 * @param folder - The folder to test.
	 * @returns True when a segment of the path names one of npm's own caches.
	 */
	static _isFolderNpmMayEmpty(folder: string): boolean {
		const segments = folder.split(Path.sep);
		return NpmCommandEntry.CACHE_SEGMENTS.some((segment) => segments.includes(segment));
	}

	/**
	 * Reads the version out of the extension manifest this package carries.
	 *
	 * The packaged release holds a manifest of its own that npm publishes it with, and the version there
	 * and the version here are the same number; `tools/webmcp_everywhere/package_release.ts` refuses to package them apart.
	 * This one is read because it is the version of the thing a person loads into Chrome.
	 *
	 * @returns The version string, or `unknown` when the manifest is missing or unreadable.
	 */
	static _extensionVersion(): string {
		const manifestPath = Path.join(__dirname, ReleaseLayout.EXTENSION_DIR, ReleaseLayout.EXTENSION_MANIFEST);
		if (Fs.existsSync(manifestPath) === false) {
			return 'unknown';
		}
		try {
			const manifest = JSON.parse(Fs.readFileSync(manifestPath, 'utf8')) as {
				version?: string;
			};
			return manifest.version ?? 'unknown';
		} catch {
			return 'unknown';
		}
	}
}

await NpmCommandEntry.run(process.argv.slice(2));

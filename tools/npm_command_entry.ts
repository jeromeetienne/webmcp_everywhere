import Fs from 'node:fs';
import Path from 'node:path';
import { PackagedReleaseInstallation } from './packaged_release_installation.ts';
import { ReleaseLayout } from './release_layout.ts';

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
 * Installs the packaged release sitting beside this file, or takes that installation back out.
 *
 * This is the command the `bin` field of the published manifest names, so `npx webmcp_everywhere`
 * starts it. It never installs from the folder it is running in: an npx run unpacks the package under
 * `~/.npm/_npx/`, npm empties that whenever it decides to, and Chrome would be left naming a folder
 * that is gone. `PackagedReleaseInstallation` copies the release into the state directory first, and
 * everything Chrome is told about names the copy.
 *
 * One step is left for the person, and cannot be taken away here: Chrome loads an unpacked extension
 * only when somebody turns on Developer mode and picks the folder. So the command ends by naming the
 * folder to pick.
 */
export class NpmCommandEntry {
	/** The path segments that name a folder npm fills for one run and empties whenever it decides to. */
	static readonly CACHE_SEGMENTS = ['_npx', '_cacache'];

	/** The issue holding the plan this command is a milestone of. */
	static readonly PLAN_URL = 'https://github.com/jeromeetienne/webmcp_everywhere/issues/12';

	/** What an agent is pointed at once the extension is loaded and Chrome has started the host. */
	static readonly ENDPOINT_URL = 'http://127.0.0.1:8765/mcp';

	/**
	 * Runs the subcommand the arguments name.
	 *
	 * @param argv - The arguments after the command name, which is `process.argv.slice(2)`.
	 * @returns Nothing.
	 */
	static run(argv: string[]): void {
		const subcommand = argv[0] ?? 'install';

		if (subcommand === 'install') {
			NpmCommandEntry._install();
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
	 * Names every path the installation is about to write, writes them, then names the step left over.
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
		console.log('');
		console.log('One step is left, and only you can take it. Chrome loads an unpacked extension by hand:');
		console.log('');
		console.log('  1. Open chrome://extensions and turn on Developer mode.');
		console.log('  2. Choose Load unpacked, and select this folder:');
		console.log(`     ${installed.extensionDir}`);
		console.log('');
		console.log(`Then point your agent at ${NpmCommandEntry.ENDPOINT_URL}, with the bearer token from`);
		console.log(`  ${Path.join(installed.stateDir, 'token')}`);
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
		write('  npx webmcp_everywhere              install it, and say what is left to do by hand');
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
	 * and the version here are the same number; `tools/package_release.ts` refuses to package them apart.
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

NpmCommandEntry.run(process.argv.slice(2));

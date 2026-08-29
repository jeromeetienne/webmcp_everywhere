import Fs from 'node:fs';
import Path from 'node:path';

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	NpmCommandEntry — the command an `npx webmcp_everywhere` run starts
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

const __filename = import.meta.filename;
const __dirname = import.meta.dirname;

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	Types
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/** One file or folder the package carries, and what a person would use it for. */
export type PackagedEntry = {
	/** The name inside the packaged release, with a trailing slash when it is a folder. */
	name: string;
	/** What it is for, in one clause, written for somebody who has never read this repository. */
	purpose: string;
};

/** What an `npx webmcp_everywhere` run got, and where npm put it. */
export type NpmPackageReport = {
	/** The version of the extension this package carries, read from the packaged extension manifest. */
	version: string;
	/** The folder this command is running from, which is the packaged release inside the package. */
	folder: string;
	/** Whether npm empties that folder on its own, which is true of every folder an npx run unpacks into. */
	isFolderNpmMayEmpty: boolean;
};

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	NpmCommandEntry
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/**
 * Says what an `npx webmcp_everywhere` run got, and why it registers nothing with Chrome yet.
 *
 * This is the command named by the `bin` field of `package.json`, and milestone 1 of issue #12 is the
 * package rather than the installation. So it reports and it stops.
 *
 * The stopping is the point, not a missing feature. An npx run unpacks the package into a folder npm
 * empties whenever it decides to, and Chrome records an absolute path twice over: once for an
 * extension loaded unpacked, and once in the native messaging host manifest that names the launcher to
 * start. A registration made from a folder npm later deletes leaves a broken extension and a host that
 * never starts, and nothing on the screen says why. Milestone 2 copies the package into a folder this
 * project owns and installs from there, and the test below is what tells it that the copy is needed.
 */
export class NpmCommandEntry {
	/** The path segments that name a folder npm fills for one run and empties whenever it decides to. */
	static readonly CACHE_SEGMENTS = ['_npx', '_cacache'];

	/** Everything the packaged release carries, in the order a person is shown it. */
	static readonly CONTENTS: PackagedEntry[] = [
		{
			name: 'chrome_extension/',
			purpose: 'the extension to load at chrome://extensions, with Developer mode on',
		},
		{
			name: 'webmcp_native_host.mjs',
			purpose: 'the native messaging host, bundled into one file with no dependency to install',
		},
		{
			name: 'webmcp_native_host.sh',
			purpose: 'the launcher Chrome starts, which finds a Node.js and runs that bundle',
		},
		{
			name: 'install_the_native_messaging_host.mjs',
			purpose: 'registers that launcher with Chrome, naming the folder it sits in',
		},
		{
			name: 'native_messaging_template/',
			purpose: 'the host manifest that installer fills in',
		},
	];

	/** The issue holding the plan this command is one milestone of. */
	static readonly PLAN_URL = 'https://github.com/jeromeetienne/webmcp_everywhere/issues/12';

	/** Where somebody can install from today, with no clone of the repository and no npm. */
	static readonly RELEASES_URL = 'https://github.com/jeromeetienne/webmcp_everywhere/releases/latest';

	/**
	 * Reads what this package is and where it landed.
	 *
	 * @returns The version it carries, the folder it runs from, and whether npm may empty that folder.
	 */
	static report(): NpmPackageReport {
		const folder = __dirname;
		const segments = folder.split(Path.sep);
		const isFolderNpmMayEmpty = NpmCommandEntry.CACHE_SEGMENTS.some((segment) => segments.includes(segment));
		return {
			version: NpmCommandEntry._extensionVersion(),
			folder: folder,
			isFolderNpmMayEmpty: isFolderNpmMayEmpty,
		};
	}

	/**
	 * Prints that report, then the one reason nothing was installed and the way in that works today.
	 *
	 * @returns Nothing.
	 */
	static run(): void {
		const report = NpmCommandEntry.report();

		console.log(`WebMCP Everywhere ${report.version}`);
		console.log('');
		console.log('This package is at:');
		console.log(`  ${report.folder}`);
		console.log('');
		console.log('It carries:');
		const widest = Math.max(...NpmCommandEntry.CONTENTS.map((entry) => entry.name.length));
		for (const entry of NpmCommandEntry.CONTENTS) {
			console.log(`  ${entry.name.padEnd(widest)}  ${entry.purpose}`);
		}
		console.log('');

		if (report.isFolderNpmMayEmpty === true) {
			console.log('npm empties that folder whenever it decides to, so nothing here has been registered');
			console.log('with Chrome. Chrome records an absolute path both for an extension loaded unpacked and');
			console.log('for a native messaging host, and a registration naming a folder npm later deleted leaves');
			console.log('a broken extension and a host that never starts, with nothing saying why.');
		} else {
			console.log('This folder is not one npm empties, so it is safe to register from. Doing that is still');
			console.log('two commands rather than this one: run install_the_native_messaging_host.mjs beside this');
			console.log('file, and load the chrome_extension folder at chrome://extensions.');
		}
		console.log('');
		console.log(`Installing from one command is milestone 2 of ${NpmCommandEntry.PLAN_URL}`);
		console.log('');
		console.log('Until then, install from the archive on the release page, which needs no clone:');
		console.log(`  ${NpmCommandEntry.RELEASES_URL}`);
	}

	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////
	//	Helpers
	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////

	/**
	 * Reads the version out of the extension manifest this package carries.
	 *
	 * The packaged release holds no `package.json` of its own, and the version a person cares about is
	 * the extension's: that is the thing they load, and the thing a bug report has to name. Milestone 4
	 * of issue #12 is what makes the three version numbers agree.
	 *
	 * @returns The version string, or `unknown` when the manifest is missing or unreadable.
	 */
	static _extensionVersion(): string {
		const manifestPath = Path.join(__dirname, 'chrome_extension', 'manifest.json');
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

NpmCommandEntry.run();

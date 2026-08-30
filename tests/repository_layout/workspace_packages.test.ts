///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	WorkspacePackagesTest — that the packages an adapter author installs hold together
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

import ChildProcess from 'node:child_process';
import Fs from 'node:fs';
import Os from 'node:os';
import Path from 'node:path';
import NodeTest from 'node:test';
import Esbuild from 'esbuild';
import { ADAPTER_FORMAT_VERSION } from '@webmcp_everywhere/adapter_format';

const __filename = import.meta.filename;
const __dirname = import.meta.dirname;

const repositoryRoot = Path.join(__dirname, '..', '..');

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	Types
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/** The fields this runner reads out of a workspace package's manifest. */
type PackageManifest = {
	/** The name npm would publish it under. */
	name: string;
	/** The version npm would publish it as. */
	version: string;
	/** Whether npm refuses to publish it. */
	private?: boolean;
	/** What the package offers to be imported, which must be one entry point under `"."` when it is there. */
	exports?: Record<string, unknown>;
	/** What the package offers to be run, which is how the published package offers itself. */
	bin?: Record<string, string>;
	/** What travels in the tarball, beyond the files npm always includes. */
	files?: string[];
};

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	WorkspacePackagesTest
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/**
 * Checks the two packages an adapter author installs, as manifests and as tarballs.
 *
 * Inside this repository npm links a workspace package with a symbolic link, and Node.js resolves that
 * link to a real path outside `node_modules` before it decides whether to strip types. An adapter
 * author gets neither: they get a real folder inside their own `node_modules`, which is a different
 * thing and behaves differently. So the last two checks really pack each package and really install the
 * tarball, rather than trusting the linked copy to answer for the installed one.
 *
 * Nothing here starts a browser and nothing reaches the network.
 */
class WorkspacePackagesTest {
	/** Where the packages live, one folder each. */
	static readonly PACKAGES_DIR = Path.join(repositoryRoot, 'packages');

	/** The one package npmjs carries, which is what `npx webmcp_everywhere` fetches. */
	static readonly PUBLISHED_PACKAGE = 'webmcp_everywhere';

	/**
	 * Every package this workspace has, which is a decision rather than a list that grew.
	 *
	 * Milestone 4 of [issue #11](https://github.com/jeromeetienne/webmcp_everywhere/issues/11) stopped
	 * the split here. `src/chrome_extension/`, `src/native_messaging_host/` and `src/site_adapters/`
	 * stayed folders because nothing installs any of them, one build reads all of them, and one version
	 * covers all of them — and each move spends every document that names a path again.
	 *
	 * A fourth package is not forbidden. It is asked about: this list is what a new one has to be added
	 * to, beside the reason, so that growing the workspace is something somebody decided rather than
	 * something that happened. What would reopen the decision is written in `packages/CONTEXT.md`.
	 */
	static readonly DECIDED_PACKAGES = [
		'@webmcp_everywhere/adapter_format',
		'@webmcp_everywhere/adapter_toolkit',
		'webmcp_everywhere',
	];

	/** Where everything this runner writes goes, well away from the repository. */
	static readonly WORKING_DIR = Path.join(Os.tmpdir(), 'webmcp_everywhere_workspace_packages');

	/** The folder standing in for an adapter author's own folder, holding the installed packages. */
	static readonly CONSUMER_DIR = Path.join(WorkspacePackagesTest.WORKING_DIR, 'adapter_of_my_own');

	/**
	 * Lists every workspace package, read off disk rather than named here.
	 *
	 * @returns Each package's folder name and its manifest.
	 */
	static packages(): Array<{ folderName: string; manifest: PackageManifest }> {
		const found: Array<{ folderName: string; manifest: PackageManifest }> = [];
		for (const entry of Fs.readdirSync(WorkspacePackagesTest.PACKAGES_DIR, {
			withFileTypes: true,
		})) {
			if (entry.isDirectory() === false) {
				continue;
			}
			const manifestPath = Path.join(
				WorkspacePackagesTest.PACKAGES_DIR,
				entry.name,
				'package.json',
			);
			found.push({
				folderName: entry.name,
				manifest: JSON.parse(Fs.readFileSync(manifestPath, 'utf8')) as PackageManifest,
			});
		}
		return found;
	}

	/**
	 * Packs every package and unpacks each one into the consumer's `node_modules`.
	 *
	 * This is what an adapter author's folder looks like: real directories, not links. The tarball is
	 * the one `npm pack` writes, so anything the manifest leaves out is left out here too.
	 *
	 * @returns Nothing.
	 * @throws When packing failed, with whatever npm said.
	 */
	static installPacked(): void {
		Fs.rmSync(WorkspacePackagesTest.WORKING_DIR, {
			recursive: true,
			force: true,
		});
		Fs.mkdirSync(WorkspacePackagesTest.CONSUMER_DIR, {
			recursive: true,
		});
		Fs.writeFileSync(
			Path.join(WorkspacePackagesTest.CONSUMER_DIR, 'package.json'),
			`${JSON.stringify(
				{
					name: 'adapter_of_my_own',
					private: true,
					type: 'module',
				},
				null,
				'\t',
			)}\n`,
		);
		for (const { manifest } of WorkspacePackagesTest.packages()) {
			const packed = ChildProcess.spawnSync(
				'npm',
				[
					'pack',
					'--workspace',
					manifest.name,
					'--pack-destination',
					WorkspacePackagesTest.WORKING_DIR,
				],
				{
					cwd: repositoryRoot,
					encoding: 'utf8',
				},
			);
			if (packed.status !== 0) {
				throw new Error(`npm pack refused ${manifest.name}:\n${packed.stderr}`);
			}
			const tarballName = packed.stdout.trim().split('\n').pop();
			if (tarballName === undefined) {
				throw new Error(`npm pack named no tarball for ${manifest.name}`);
			}
			const installedAt = Path.join(
				WorkspacePackagesTest.CONSUMER_DIR,
				'node_modules',
				...manifest.name.split('/'),
			);
			Fs.mkdirSync(installedAt, {
				recursive: true,
			});
			const unpacked = ChildProcess.spawnSync(
				'tar',
				[
					'xzf',
					Path.join(WorkspacePackagesTest.WORKING_DIR, tarballName),
					'-C',
					installedAt,
					'--strip-components',
					'1',
				],
				{
					encoding: 'utf8',
				},
			);
			if (unpacked.status !== 0) {
				throw new Error(`the tarball of ${manifest.name} would not unpack:\n${unpacked.stderr}`);
			}
		}
	}

	/**
	 * Writes an adapter that imports both packages by name, the way an author outside this repository would.
	 *
	 * @param fileName - What to call the file inside the consumer's folder.
	 * @returns The path written.
	 */
	static writeAdapterImportingBoth(fileName: string): string {
		const filePath = Path.join(WorkspacePackagesTest.CONSUMER_DIR, fileName);
		Fs.writeFileSync(
			filePath,
			[
				"import { ADAPTER_FORMAT_VERSION, ToolNaming } from '@webmcp_everywhere/adapter_format';",
				"import { PageWaiting } from '@webmcp_everywhere/adapter_toolkit';",
				'',
				'export const probe = {',
				'\tformatVersion: ADAPTER_FORMAT_VERSION,',
				"\tqualified: ToolNaming.qualify('example_com', 'read_page'),",
				'\tpollInterval: PageWaiting.DEFAULT_POLL_INTERVAL,',
				'};',
				'',
			].join('\n'),
		);
		return filePath;
	}
}

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	Checks
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

NodeTest.describe('The packages an adapter author installs', () => {
	NodeTest.test('the workspace holds the packages milestone 4 decided on, and no others', (t) => {
		const found = WorkspacePackagesTest.packages()
			.map(({ manifest }) => manifest.name)
			.sort();
		const decided = [...WorkspacePackagesTest.DECIDED_PACKAGES].sort();
		const added = found.filter((name) => decided.includes(name) === false);
		const gone = decided.filter((name) => found.includes(name) === false);
		if (added.length > 0 || gone.length > 0) {
			throw new Error(
				[
					added.length > 0 ? `${added.join(' and ')} is a package nobody decided on` : '',
					gone.length > 0 ? `${gone.join(' and ')} is decided on but not there` : '',
					'The split stopped at three in milestone 4 of',
					'https://github.com/jeromeetienne/webmcp_everywhere/issues/11, and packages/CONTEXT.md says',
					'what would reopen it. Add the package to WorkspacePackagesTest.DECIDED_PACKAGES with the',
					'reason, or take it back out.',
				]
					.filter((line) => line.length > 0)
					.join(' '),
			);
		}
		t.diagnostic(`${found.length} packages, the three decided on: ${found.join(', ')}`);
	});

	NodeTest.test('a package is imported by one entry point, or run by a bin, and never both', (t) => {
		const wrong: string[] = [];
		for (const { folderName, manifest } of WorkspacePackagesTest.packages()) {
			const keys = Object.keys(manifest.exports ?? {});
			if (keys.length === 0) {
				if (manifest.bin === undefined) {
					wrong.push(`${folderName} offers neither an entry point to import nor a command to run`);
				}
				continue;
			}
			if (keys.length !== 1 || keys[0] !== '.') {
				wrong.push(`${folderName} names ${keys.length} exports (${keys.join(', ')}) instead of one "."`);
				continue;
			}
			if (manifest.exports?.['.'] !== './src/index.ts') {
				wrong.push(`${folderName} points "." at ${String(manifest.exports?.['.'])}`);
			}
		}
		if (wrong.length > 0) {
			throw new Error(`${wrong.length} packages offer the wrong thing:\n        ${wrong.join('\n        ')}`);
		}
		t.diagnostic(`${WorkspacePackagesTest.packages().length} packages, each offering one thing`);
	});

	NodeTest.test('one package is published on npmjs and every other one is private', (t) => {
		const publishable = WorkspacePackagesTest.packages()
			.filter(({ manifest }) => manifest.private !== true)
			.map(({ manifest }) => manifest.name);
		if (publishable.join(',') !== WorkspacePackagesTest.PUBLISHED_PACKAGE) {
			throw new Error(
				`${publishable.length === 0 ? 'no package' : publishable.join(' and ')} would be published, ` +
					`and it should be ${WorkspacePackagesTest.PUBLISHED_PACKAGE} alone. That package is what ` +
					'https://github.com/jeromeetienne/webmcp_everywhere/issues/12 put on npmjs. The two an ' +
					'adapter author installs are still private, which is the decision milestone 2 of ' +
					'https://github.com/jeromeetienne/webmcp_everywhere/issues/11 left open.',
			);
		}
		t.diagnostic(`${WorkspacePackagesTest.PUBLISHED_PACKAGE} is the one npm publish can reach`);
	});

	NodeTest.test('the published package publishes no TypeScript, because nothing could run it', (t) => {
		const found = WorkspacePackagesTest.packages().find(
			({ manifest }) => manifest.name === WorkspacePackagesTest.PUBLISHED_PACKAGE,
		);
		if (found === undefined) {
			throw new Error(`${WorkspacePackagesTest.PUBLISHED_PACKAGE} is not a package under packages/`);
		}
		if (found.manifest.files === undefined) {
			throw new Error(`${WorkspacePackagesTest.PUBLISHED_PACKAGE} names no files, so it publishes its source`);
		}
		if (found.manifest.files.includes('src') === true) {
			throw new Error(
				`${WorkspacePackagesTest.PUBLISHED_PACKAGE} publishes src/, which Node.js refuses to strip ` +
					'types for once it is inside node_modules. What ships is the bundle esbuild writes.',
			);
		}
		t.diagnostic(`it publishes ${found.manifest.files.join(', ')}`);
	});

	NodeTest.test('the adapter format package and ADAPTER_FORMAT_VERSION name one version', (t) => {
		const found = WorkspacePackagesTest.packages().find(
			({ manifest }) => manifest.name === '@webmcp_everywhere/adapter_format',
		);
		if (found === undefined) {
			throw new Error('@webmcp_everywhere/adapter_format is not a package under packages/');
		}
		if (found.manifest.version !== ADAPTER_FORMAT_VERSION) {
			throw new Error(
				`the package says version ${found.manifest.version} and ADAPTER_FORMAT_VERSION says ` +
					`${ADAPTER_FORMAT_VERSION}; an author reading one and a check reading the other would ` +
					'disagree about which format an adapter must carry',
			);
		}
		t.diagnostic(`both say ${ADAPTER_FORMAT_VERSION}`);
	});

	NodeTest.describe('installed as real folders, the way an author outside this repository gets them', () => {
		NodeTest.before(() => {
			WorkspacePackagesTest.installPacked();
		});

		NodeTest.after(() => {
			Fs.rmSync(WorkspacePackagesTest.WORKING_DIR, {
				recursive: true,
				force: true,
			});
		});

		NodeTest.test('esbuild bundles an adapter that imports both by name', async (t) => {
			const adapterPath = WorkspacePackagesTest.writeAdapterImportingBoth('adapter_bundled.ts');
			const built = await Esbuild.build({
				entryPoints: [adapterPath],
				bundle: true,
				write: false,
				format: 'iife',
				globalName: 'probeBundle',
				target: 'chrome120',
				platform: 'browser',
				logLevel: 'silent',
			});
			const bundled = built.outputFiles[0].text;
			// each of these is written in one of the two packages and nowhere in the adapter itself
			const fromThePackages = {
				'the adapter format version': ADAPTER_FORMAT_VERSION,
				'the ToolNaming class': 'ToolNaming = class',
				'the PageWaiting class': 'PageWaiting = class',
				'the separator ToolNaming qualifies with': '"__"',
			};
			for (const [what, expected] of Object.entries(fromThePackages)) {
				if (bundled.includes(expected) === false) {
					throw new Error(`the bundle carries no ${what}, so a package was not inlined into it`);
				}
			}
			t.diagnostic(`${bundled.length} bytes bundled from two installed packages, no repository above them`);
		});

		NodeTest.test('Node.js refuses the same installed packages, which is why esbuild is the only way in', (t) => {
			const adapterPath = WorkspacePackagesTest.writeAdapterImportingBoth('adapter_imported.ts');
			const ran = ChildProcess.spawnSync(process.execPath, [adapterPath], {
				cwd: WorkspacePackagesTest.CONSUMER_DIR,
				encoding: 'utf8',
			});
			if (ran.status === 0) {
				throw new Error(
					'Node.js imported a package whose entry point is TypeScript from inside node_modules. ' +
						'That restriction is what packages/CONTEXT.md and every tool here are written around, ' +
						'so if it has been lifted, those rules can be rewritten rather than worked around.',
				);
			}
			if (ran.stderr.includes('ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING') === false) {
				throw new Error(`Node.js refused it for some other reason:\n${ran.stderr.trim()}`);
			}
			t.diagnostic('ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING, as it has to be while the source ships as TypeScript');
		});
	});
});

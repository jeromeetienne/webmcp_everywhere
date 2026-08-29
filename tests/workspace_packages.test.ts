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

const repositoryRoot = Path.join(__dirname, '..');

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
	/** What the package offers to the outside, which must be one entry point under `"."`. */
	exports?: Record<string, unknown>;
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
	NodeTest.test('each names one entry point, and it is the package source', (t) => {
		const wrong: string[] = [];
		for (const { folderName, manifest } of WorkspacePackagesTest.packages()) {
			const keys = Object.keys(manifest.exports ?? {});
			if (keys.length !== 1 || keys[0] !== '.') {
				wrong.push(`${folderName} names ${keys.length} exports (${keys.join(', ')}) instead of one "."`);
				continue;
			}
			if (manifest.exports?.['.'] !== './src/index.ts') {
				wrong.push(`${folderName} points "." at ${String(manifest.exports?.['.'])}`);
			}
		}
		if (wrong.length > 0) {
			throw new Error(`${wrong.length} packages name the wrong entry point:\n        ${wrong.join('\n        ')}`);
		}
		t.diagnostic(`${WorkspacePackagesTest.packages().length} packages, each offering only ./src/index.ts`);
	});

	NodeTest.test('each is private, so publishing one is a decision somebody took', (t) => {
		const publishable = WorkspacePackagesTest.packages()
			.filter(({ manifest }) => manifest.private !== true)
			.map(({ manifest }) => manifest.name);
		if (publishable.length > 0) {
			throw new Error(
				`${publishable.join(' and ')} would be published by an npm publish at the root. ` +
					'Milestone 2 of https://github.com/jeromeetienne/webmcp_everywhere/issues/11 is where that ' +
					'decision is recorded; until it is taken, every package stays private.',
			);
		}
		t.diagnostic('no package would be published by accident');
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

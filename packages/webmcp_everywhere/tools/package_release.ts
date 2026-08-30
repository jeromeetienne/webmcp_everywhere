import ChildProcess from 'node:child_process';
import Esbuild from 'esbuild';
import Fs from 'node:fs';
import Path from 'node:path';
import { ReleaseLayout } from '../src/release_layout.ts';

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	PackageRelease — builds the four things the published package cannot commit
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

const __filename = import.meta.filename;
const __dirname = import.meta.dirname;

const repositoryRoot = Path.join(__dirname, '..', '..', '..');
const tsconfigPath = Path.join(repositoryRoot, 'tsconfig.json');
const packageDir = Path.join(repositoryRoot, 'packages', 'webmcp_everywhere');

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	Types
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/** The one field of the published manifest this reads, to refuse a release whose versions disagree. */
type PublishedManifest = {
	/** The version npm publishes, which has to equal the one in the extension manifest. */
	version: string;
};

/** What one packaging run produced. */
export type PackagedRelease = {
	/** The folder holding everything a user installs, which is the workspace package itself. */
	folder: string;
	/** The archive of that folder, ready to attach to a release. */
	archive: string;
	/** The launcher inside the folder, which is what a host manifest names. */
	launcher: string;
	/** Every path written, relative to the package folder. */
	written: string[];
};

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	PackageRelease
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/**
 * Builds the parts of `packages/webmcp_everywhere/` that cannot be committed, and archives the whole.
 *
 * Everything else in this repository assumes a working copy on disk: the launcher walks up from its
 * own location to find the host program, and Node.js runs the TypeScript with no build step. That is
 * right for somebody developing an adapter and wrong for everybody else, because it means a user has
 * to clone a repository to use a browser extension. So the host is bundled into one file with its
 * dependencies inlined, and the launcher beside it points at that file rather than at the package.
 * Node.js is still needed, and the launcher still searches for one, because bundling removes the
 * repository rather than the runtime.
 *
 * Four things are built here: the extension folder, the bundled host, the installer, and the command.
 * Everything else the package publishes — the manifest, the notes, the licence, the launcher, and the
 * host manifest template — is committed in that folder and read rather than written, so what npm
 * publishes can be reviewed in a diff. It was generated from this file until milestone 3 of
 * [issue #11](https://github.com/jeromeetienne/webmcp_everywhere/issues/11), which is also where the
 * launcher stopped being a shell script inside a TypeScript template literal.
 */
export class PackageRelease {
	/**
	 * Builds what the package cannot commit, and archives what it publishes.
	 *
	 * @returns Where everything went.
	 * @throws When the extension has not been built, when the versions disagree, or when an entry the
	 *   package publishes is not there afterwards.
	 */
	static async run(): Promise<PackagedRelease> {
		const extensionSource = Path.join(repositoryRoot, 'dist', ReleaseLayout.EXTENSION_DIR);
		if (Fs.existsSync(Path.join(extensionSource, ReleaseLayout.EXTENSION_MANIFEST)) === false) {
			throw new Error('the extension is not built; run "npm run build" first');
		}

		const publishedManifest = JSON.parse(
			Fs.readFileSync(Path.join(packageDir, ReleaseLayout.PACKAGE_MANIFEST), 'utf8'),
		) as PublishedManifest;
		const extensionManifest = JSON.parse(
			Fs.readFileSync(Path.join(extensionSource, ReleaseLayout.EXTENSION_MANIFEST), 'utf8'),
		) as {
			version: string;
		};
		if (publishedManifest.version !== extensionManifest.version) {
			throw new Error(
				`the package says version ${publishedManifest.version} and the extension it carries says ` +
					`version ${extensionManifest.version}; they are one product and have to agree`,
			);
		}

		// only what this writes is cleared, because everything else in that folder is committed
		for (const entry of ReleaseLayout.GENERATED_ENTRIES) {
			Fs.rmSync(Path.join(packageDir, entry), {
				recursive: true,
				force: true,
			});
		}

		const written: string[] = [];

		Fs.cpSync(extensionSource, Path.join(packageDir, ReleaseLayout.EXTENSION_DIR), {
			recursive: true,
		});
		written.push(`${ReleaseLayout.EXTENSION_DIR}/`);

		await Esbuild.build({
			entryPoints: [Path.join(repositoryRoot, 'packages', 'native_messaging_host', 'src', 'webmcp_native_host.ts')],
			outfile: Path.join(packageDir, ReleaseLayout.HOST_BUNDLE),
			bundle: true,
			format: 'esm',
			platform: 'node',
			target: 'node20',
			tsconfig: tsconfigPath,
			logLevel: 'warning',
		});
		written.push(ReleaseLayout.HOST_BUNDLE);

		await Esbuild.build({
			entryPoints: [Path.join(packageDir, 'src', 'release_installer_entry.ts')],
			outfile: Path.join(packageDir, ReleaseLayout.INSTALLER),
			bundle: true,
			format: 'esm',
			platform: 'node',
			target: 'node20',
			tsconfig: tsconfigPath,
			logLevel: 'warning',
		});
		written.push(ReleaseLayout.INSTALLER);

		await Esbuild.build({
			entryPoints: [Path.join(packageDir, 'src', 'npm_command_entry.ts')],
			outfile: Path.join(packageDir, ReleaseLayout.COMMAND),
			bundle: true,
			format: 'esm',
			platform: 'node',
			target: 'node20',
			tsconfig: tsconfigPath,
			banner: {
				js: '#!/usr/bin/env node',
			},
			logLevel: 'warning',
		});
		Fs.chmodSync(Path.join(packageDir, ReleaseLayout.COMMAND), 0o755);
		written.push(ReleaseLayout.COMMAND);

		const launcher = Path.join(packageDir, ReleaseLayout.LAUNCHER);
		Fs.chmodSync(launcher, 0o755);

		PackageRelease._refuseAnythingMissing();

		const archive = Path.join(repositoryRoot, 'dist', 'webmcp_everywhere_release.zip');
		Fs.mkdirSync(Path.dirname(archive), {
			recursive: true,
		});
		Fs.rmSync(archive, {
			force: true,
		});
		// the entries are named rather than `.`, because the folder also holds `src/` and `CONTEXT.md`
		const zipped = ChildProcess.spawnSync(
			'zip',
			['-r', '-q', archive, ...ReleaseLayout.PUBLISHED_ENTRIES],
			{
				cwd: packageDir,
				encoding: 'utf8',
			},
		);
		if (zipped.status !== 0) {
			throw new Error(`packing the archive failed:\n${zipped.stderr}`);
		}

		return {
			folder: packageDir,
			archive: archive,
			launcher: launcher,
			written: written,
		};
	}

	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////
	//	Helpers
	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////

	/**
	 * Refuses to archive a package missing anything it says it publishes.
	 *
	 * The committed entries cannot be written here any more, so a deleted one would leave a release
	 * that installs and then fails at the moment Chrome starts the launcher. Naming them all in
	 * `ReleaseLayout.PUBLISHED_ENTRIES` is only worth something if somebody looks.
	 *
	 * @returns Nothing.
	 * @throws When an entry the package publishes is not in the folder.
	 */
	static _refuseAnythingMissing(): void {
		const missing = ReleaseLayout.PUBLISHED_ENTRIES.filter(
			(entry) => Fs.existsSync(Path.join(packageDir, entry)) === false,
		);
		if (missing.length > 0) {
			throw new Error(
				`packages/webmcp_everywhere/ is missing ${missing.join(' and ')}, which the package publishes`,
			);
		}
	}
}

if (import.meta.filename === process.argv[1]) {
	const packaged = await PackageRelease.run();
	console.log(`package folder ${packaged.folder}`);
	for (const entry of packaged.written) {
		console.log(`  ${entry}`);
	}
	console.log(`archive        ${packaged.archive}`);
}

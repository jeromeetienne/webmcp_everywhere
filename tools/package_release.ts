import ChildProcess from 'node:child_process';
import Esbuild from 'esbuild';
import Fs from 'node:fs';
import Path from 'node:path';
import { ReleaseLayout } from './release_layout.ts';

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	PackageRelease — writes a folder somebody can install without cloning anything
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

const __filename = import.meta.filename;
const __dirname = import.meta.dirname;

const repositoryRoot = Path.join(__dirname, '..');
const tsconfigPath = Path.join(repositoryRoot, 'tsconfig.json');
const releaseDir = Path.join(repositoryRoot, 'build', 'release');

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	Types
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/**
 * The fields of this repository's `package.json` that the published package inherits.
 *
 * They are read rather than restated, so the description, the keywords and the links have one
 * authoritative place and cannot drift into two versions that disagree.
 */
type RepositoryManifest = {
	/** The package name on npmjs, which is the name of this repository. */
	name: string;
	/** The version, which has to equal the one in the extension manifest. */
	version: string;
	/** The licence identifier. */
	license: string;
	/** The one sentence npmjs shows under the name. */
	description: string;
	/** The words npmjs indexes the package under. */
	keywords: string[];
	/** The project page. */
	homepage: string;
	/** Where the source is, in the shape npm defines. */
	repository: unknown;
	/** Where a defect is reported, in the shape npm defines. */
	bugs: unknown;
};

/** What one packaging run produced. */
export type PackagedRelease = {
	/** The folder holding everything a user installs. */
	folder: string;
	/** The archive of that folder, ready to attach to a release. */
	archive: string;
	/** The launcher inside the folder, which is what a host manifest names. */
	launcher: string;
	/** Every path written, relative to the release folder. */
	written: string[];
};

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	PackageRelease
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/**
 * Packages the extension and the native messaging host into one folder that needs no repository.
 *
 * Everything in this repository so far assumes a working copy on disk: the launcher walks up from
 * its own location to find `src/`, and Node.js runs the TypeScript with no build step. That is right
 * for somebody developing an adapter and wrong for everybody else, because it means a user has to
 * clone a repository to use a browser extension.
 *
 * So the host is bundled into one file with its dependencies inlined, and the launcher beside it
 * points at that file rather than at `src/`. Node.js is still needed, and the launcher still searches
 * for one, because bundling removes the repository rather than the runtime.
 */
export class PackageRelease {
	/**
	 * The Node.js the published package asks for.
	 *
	 * It is not the `engines` field of this repository, which asks for 22.18.0 because that is what the
	 * runners here and the TypeScript Node.js runs directly need. What a user runs is the bundled host
	 * and the launcher, and the launcher accepts any Node.js 20 or later, so that is what the package says.
	 */
	static readonly NODE_ENGINE = '>=20';

	/**
	 * The launcher a packaged release carries.
	 *
	 * It is a near copy of `bin/webmcp_native_host.sh` and differs in one line: it runs the bundle
	 * beside it rather than the TypeScript under `src/`. The Node.js search is the same, and for the
	 * same reason — Chrome starts this with a very small environment, so no path may be assumed.
	 */
	static readonly LAUNCHER_SOURCE = `#!/usr/bin/env bash
#
# The executable Chrome starts for the native messaging host, in a packaged release.
#
# Chrome reads the path of this file from the host manifest the installer writes, and starts it with
# a very small environment. So the script holds no absolute path of its own: it finds the bundled
# host beside itself, and it looks for a Node.js instead of naming one. The whole program is one
# \`exec\`, because Chrome talks to the process it starts over standard input and standard output, and
# any extra process in between would break that.

set -euo pipefail

scriptDir="$(cd -- "$(dirname -- "\${BASH_SOURCE[0]}")" && pwd)"
hostBundle="\${scriptDir}/${ReleaseLayout.HOST_BUNDLE}"

# Answers whether a Node.js can run the bundled host, which is an ECMAScript module.
runsTheHost() {
	local candidate="$1"
	local version major
	version="$("\${candidate}" --version 2>/dev/null)" || return 1
	version="\${version#v}"
	major="\${version%%.*}"
	if [ "\${major}" -ge 20 ]; then
		return 0
	fi
	return 1
}

# Prints the first usable Node.js, or fails when there is none.
findNode() {
	local candidate
	for candidate in \\
		"$(command -v node 2>/dev/null || true)" \\
		/opt/homebrew/bin/node \\
		/usr/local/bin/node \\
		/usr/bin/node; do
		if [ -n "\${candidate}" ] && [ -x "\${candidate}" ] && runsTheHost "\${candidate}"; then
			echo "\${candidate}"
			return 0
		fi
	done
	return 1
}

# The message goes to standard error, never to standard output, which belongs to Chrome alone.
nodeBinary="$(findNode)" || {
	echo "webmcp_native_host.sh: found no Node.js 20 or later" >&2
	exit 1
}

exec "\${nodeBinary}" "\${hostBundle}" "$@"
`;

	/**
	 * Builds the release folder and the archive beside it.
	 *
	 * @returns Where everything went.
	 * @throws When the extension has not been built.
	 */
	static async run(): Promise<PackagedRelease> {
		const extensionSource = Path.join(repositoryRoot, 'build', ReleaseLayout.EXTENSION_DIR);
		if (Fs.existsSync(Path.join(extensionSource, ReleaseLayout.EXTENSION_MANIFEST)) === false) {
			throw new Error('the extension is not built; run "npm run build" first');
		}

		const repositoryManifest = JSON.parse(
			Fs.readFileSync(Path.join(repositoryRoot, 'package.json'), 'utf8'),
		) as RepositoryManifest;
		const extensionManifest = JSON.parse(
			Fs.readFileSync(Path.join(extensionSource, ReleaseLayout.EXTENSION_MANIFEST), 'utf8'),
		) as {
			version: string;
		};
		if (repositoryManifest.version !== extensionManifest.version) {
			throw new Error(
				`the package says version ${repositoryManifest.version} and the extension it carries says ` +
					`version ${extensionManifest.version}; they are one product and have to agree`,
			);
		}

		Fs.rmSync(releaseDir, {
			recursive: true,
			force: true,
		});
		Fs.mkdirSync(releaseDir, {
			recursive: true,
		});

		const written: string[] = [];

		Fs.cpSync(extensionSource, Path.join(releaseDir, ReleaseLayout.EXTENSION_DIR), {
			recursive: true,
		});
		written.push(`${ReleaseLayout.EXTENSION_DIR}/`);

		await Esbuild.build({
			entryPoints: [Path.join(repositoryRoot, 'src', 'native_messaging_host', 'webmcp_native_host.ts')],
			outfile: Path.join(releaseDir, ReleaseLayout.HOST_BUNDLE),
			bundle: true,
			format: 'esm',
			platform: 'node',
			target: 'node20',
			tsconfig: tsconfigPath,
			logLevel: 'warning',
		});
		written.push(ReleaseLayout.HOST_BUNDLE);

		await Esbuild.build({
			entryPoints: [Path.join(repositoryRoot, 'tools', 'release_installer_entry.ts')],
			outfile: Path.join(releaseDir, ReleaseLayout.INSTALLER),
			bundle: true,
			format: 'esm',
			platform: 'node',
			target: 'node20',
			tsconfig: tsconfigPath,
			logLevel: 'warning',
		});
		written.push(ReleaseLayout.INSTALLER);

		await Esbuild.build({
			entryPoints: [Path.join(repositoryRoot, 'tools', 'npm_command_entry.ts')],
			outfile: Path.join(releaseDir, ReleaseLayout.COMMAND),
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
		Fs.chmodSync(Path.join(releaseDir, ReleaseLayout.COMMAND), 0o755);
		written.push(ReleaseLayout.COMMAND);

		const launcher = Path.join(releaseDir, ReleaseLayout.LAUNCHER);
		Fs.writeFileSync(launcher, PackageRelease.LAUNCHER_SOURCE);
		Fs.chmodSync(launcher, 0o755);
		written.push(ReleaseLayout.LAUNCHER);

		Fs.cpSync(
			Path.join(repositoryRoot, 'data', 'native_messaging_template'),
			Path.join(releaseDir, ReleaseLayout.TEMPLATE_DIR),
			{
				recursive: true,
			},
		);
		written.push(`${ReleaseLayout.TEMPLATE_DIR}/`);

		Fs.copyFileSync(Path.join(repositoryRoot, 'LICENSE'), Path.join(releaseDir, 'LICENSE'));
		written.push('LICENSE');

		Fs.writeFileSync(Path.join(releaseDir, 'README.md'), PackageRelease._readme());
		written.push('README.md');

		Fs.writeFileSync(
			Path.join(releaseDir, ReleaseLayout.PACKAGE_MANIFEST),
			PackageRelease._publishedPackageManifest(repositoryManifest),
		);
		written.push(ReleaseLayout.PACKAGE_MANIFEST);

		const archive = Path.join(repositoryRoot, 'build', 'webmcp_everywhere_release.zip');
		Fs.rmSync(archive, {
			force: true,
		});
		const zipped = ChildProcess.spawnSync('zip', ['-r', '-q', archive, '.'], {
			cwd: releaseDir,
			encoding: 'utf8',
		});
		if (zipped.status !== 0) {
			throw new Error(`packing the archive failed:\n${zipped.stderr}`);
		}

		return {
			folder: releaseDir,
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
	 * Builds the package manifest npm publishes this folder with.
	 *
	 * The repository is not the package. This repository's own `package.json` carries every development
	 * dependency, every script that needs a working copy, and a Node.js requirement that belongs to the
	 * runners rather than to the product, and it is marked private so that none of it can be published by
	 * accident. What is published is this folder, which already holds the user's README.md and the
	 * licence, and which now holds a manifest naming only what a user needs.
	 *
	 * @param repositoryManifest The fields read out of this repository's `package.json`.
	 * @returns The JSON text of the published manifest, ending in a newline.
	 */
	static _publishedPackageManifest(repositoryManifest: RepositoryManifest): string {
		const published = {
			name: repositoryManifest.name,
			version: repositoryManifest.version,
			license: repositoryManifest.license,
			description: repositoryManifest.description,
			keywords: repositoryManifest.keywords,
			homepage: repositoryManifest.homepage,
			repository: repositoryManifest.repository,
			bugs: repositoryManifest.bugs,
			type: 'module',
			engines: {
				node: PackageRelease.NODE_ENGINE,
			},
			bin: {
				webmcp_everywhere: `./${ReleaseLayout.COMMAND}`,
			},
		};
		return `${JSON.stringify(published, null, '\t')}\n`;
	}

	/**
	 * Writes the instructions that travel inside the release.
	 *
	 * The release is for somebody who will never open this repository, so the instructions cannot
	 * point at a command in it.
	 *
	 * @returns The Markdown of the release's own README.md.
	 */
	static _readme(): string {
		return `# WebMCP Everywhere

A browser extension carrying community-maintained WebMCP adapters — small scripts that register tools
into sites that never shipped their own. Install it, point any agent at one local address, and that
agent gains real tools on the sites you already have open.

You need Google Chrome 149 or later, and Node.js 20 or later. The WebMCP origin trial runs from Chrome
149 to Chrome 156.

## Install it

\`\`\`bash
npx webmcp_everywhere
\`\`\`

If you unzipped this folder from a release rather than installing from npm, run the same command out of
the folder instead:

\`\`\`bash
node ${ReleaseLayout.COMMAND}
\`\`\`

Either way it copies this folder to \`~/.webmcp_everywhere/installation\`, and registers the native
messaging host so that an agent can reach the browser. It names every path before it writes one. The
copy is the point: whatever folder you ran it from may be moved, unzipped again, or emptied by npm, and
Chrome keeps an absolute path for both an unpacked extension and a native messaging host.

From then on Chrome starts \`${ReleaseLayout.LAUNCHER}\` out of the installation folder, as a separate
operating system process outside the browser sandbox, with your rights.

One step is left, and only you can take it. Chrome loads an unpacked extension by hand:

1. Open \`chrome://extensions\` and turn on **Developer mode**.
2. Choose **Load unpacked**, and select \`~/.webmcp_everywhere/installation/${ReleaseLayout.EXTENSION_DIR}\`.

Then point your agent at \`http://127.0.0.1:8765/mcp\`, with the bearer token from
\`~/.webmcp_everywhere/token\`.

## Check it is working

\`\`\`bash
npx webmcp_everywhere status
\`\`\`

It asks the running system rather than looking for the extension in Chrome's own files, so it answers
about what an agent would really receive: whether a browser is holding the port, whether the extension
is connected to it, and which adapters are offering tools in which tabs. It exits 1 when no tools are
reaching your agent, and says which step to go and fix. Installing ends with the same answer.

## Take it back out

\`\`\`bash
npx webmcp_everywhere uninstall
\`\`\`

That removes the registration and the installation folder, and prints what it removed. Your bearer token
and any adapters you loaded are left alone. Remove the extension itself at \`chrome://extensions\`.

## What it does, and what it does not

Read the security model and the permissions before you let an agent act on a site: https://github.com/jeromeetienne/webmcp_everywhere/blob/main/docs/security_model.md
`;
	}
}

if (import.meta.filename === process.argv[1]) {
	const packaged = await PackageRelease.run();
	console.log(`release folder ${packaged.folder}`);
	for (const entry of packaged.written) {
		console.log(`  ${entry}`);
	}
	console.log(`archive        ${packaged.archive}`);
}

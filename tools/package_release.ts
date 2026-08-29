import ChildProcess from 'node:child_process';
import Esbuild from 'esbuild';
import Fs from 'node:fs';
import Path from 'node:path';

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
	/** The name of the bundled host inside the release folder. */
	static readonly HOST_BUNDLE = 'webmcp_native_host.mjs';

	/** The name of the launcher inside the release folder. */
	static readonly LAUNCHER = 'webmcp_native_host.sh';

	/** The name of the installer inside the release folder, which registers the host with Chrome. */
	static readonly INSTALLER = 'install_the_native_messaging_host.mjs';

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
hostBundle="\${scriptDir}/${PackageRelease.HOST_BUNDLE}"

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
		const extensionSource = Path.join(repositoryRoot, 'build', 'chrome_extension');
		if (Fs.existsSync(Path.join(extensionSource, 'manifest.json')) === false) {
			throw new Error('the extension is not built; run "npm run build" first');
		}

		Fs.rmSync(releaseDir, {
			recursive: true,
			force: true,
		});
		Fs.mkdirSync(releaseDir, {
			recursive: true,
		});

		const written: string[] = [];

		Fs.cpSync(extensionSource, Path.join(releaseDir, 'chrome_extension'), {
			recursive: true,
		});
		written.push('chrome_extension/');

		await Esbuild.build({
			entryPoints: [Path.join(repositoryRoot, 'src', 'native_messaging_host', 'webmcp_native_host.ts')],
			outfile: Path.join(releaseDir, PackageRelease.HOST_BUNDLE),
			bundle: true,
			format: 'esm',
			platform: 'node',
			target: 'node20',
			tsconfig: tsconfigPath,
			logLevel: 'warning',
		});
		written.push(PackageRelease.HOST_BUNDLE);

		await Esbuild.build({
			entryPoints: [Path.join(repositoryRoot, 'tools', 'release_installer_entry.ts')],
			outfile: Path.join(releaseDir, PackageRelease.INSTALLER),
			bundle: true,
			format: 'esm',
			platform: 'node',
			target: 'node20',
			tsconfig: tsconfigPath,
			logLevel: 'warning',
		});
		written.push(PackageRelease.INSTALLER);

		const launcher = Path.join(releaseDir, PackageRelease.LAUNCHER);
		Fs.writeFileSync(launcher, PackageRelease.LAUNCHER_SOURCE);
		Fs.chmodSync(launcher, 0o755);
		written.push(PackageRelease.LAUNCHER);

		Fs.cpSync(
			Path.join(repositoryRoot, 'data', 'native_messaging_template'),
			Path.join(releaseDir, 'native_messaging_template'),
			{
				recursive: true,
			},
		);
		written.push('native_messaging_template/');

		Fs.copyFileSync(Path.join(repositoryRoot, 'LICENSE'), Path.join(releaseDir, 'LICENSE'));
		written.push('LICENSE');

		Fs.writeFileSync(Path.join(releaseDir, 'README.md'), PackageRelease._readme());
		written.push('README.md');

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
	 * Writes the instructions that travel inside the release.
	 *
	 * The release is for somebody who will never open this repository, so the instructions cannot
	 * point at a command in it.
	 *
	 * @returns The Markdown of the release's own README.md.
	 */
	static _readme(): string {
		return `# WebMCP Everywhere

This folder is a packaged release. It needs no clone of the repository and no build.

You need Google Chrome 149 or later, and Node.js 20 or later. The WebMCP origin trial runs from Chrome 149 to Chrome 156.

## Install it

1. Open \`chrome://extensions\`, turn on **Developer mode**, choose **Load unpacked**, and select the \`chrome_extension\` folder beside this file.
2. Register the native messaging host, so an agent can reach the browser. This writes one file into Chrome's \`NativeMessagingHosts\` directory, naming the launcher in this folder:

   \`\`\`bash
   node install_the_native_messaging_host.mjs
   \`\`\`

   From then on Chrome starts \`webmcp_native_host.sh\` from this folder, as a separate operating system process outside the browser sandbox, with your rights. Keep the folder where it is: the registration names this path, so moving the folder means running the command again.

3. Point your agent at \`http://127.0.0.1:8765/mcp\`, with the bearer token from \`~/.webmcp_everywhere/token\`.

## Take it back out

Remove the extension at \`chrome://extensions\`, and delete the file the installer named. It prints the path.

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

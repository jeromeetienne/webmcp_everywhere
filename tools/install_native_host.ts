///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	InstallNativeHost — registers the host so Chrome will start it for this extension
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

import Fs from 'node:fs';
import Os from 'node:os';
import Path from 'node:path';
import { GenerateExtensionKey } from './generate_extension_key.ts';

const __dirname = import.meta.dirname;

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	Types
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/** Where to install. */
export type InstallNativeHostOptions = {
	/** Extra Chrome user data directories to install into. */
	userDataDirs?: string[];
};

/** What one installation wrote. */
export type InstalledNativeHost = {
	/** The extension identifier the manifest allows. */
	identifier: string;
	/** The executable file Chrome starts. */
	launcher: string;
	/** Every manifest file that was written. */
	manifests: string[];
};

/**
 * Puts the native messaging host manifest where Chrome will find it.
 *
 * Chrome only starts a native host that a manifest names, and only lets the extensions listed in that
 * manifest connect to it. Both halves have to be right: the manifest points at an executable file, and
 * it lists the extension identifier, which is why the extension's identifier is pinned with a key
 * rather than derived from wherever the folder happens to sit.
 */
export class InstallNativeHost {
	/** The host name the extension asks for, which must match the manifest file name. */
	static HOST_NAME = 'com.webmcp_everywhere.host';

	/**
	 * Writes the launcher and the manifest.
	 *
	 * @param options - Where to install.
	 * @returns What was written.
	 */
	static run(options: InstallNativeHostOptions = {}): InstalledNativeHost {
		const identifier = GenerateExtensionKey.currentIdentifier();
		const launcher = InstallNativeHost._writeLauncher();

		const manifest = {
			name: InstallNativeHost.HOST_NAME,
			description: 'WebMCP Everywhere — serves the extension tools over Model Context Protocol',
			path: launcher,
			type: 'stdio',
			allowed_origins: [`chrome-extension://${identifier}/`],
		};

		const directories = InstallNativeHost._manifestDirectories(options.userDataDirs ?? []);
		const written: string[] = [];
		for (const directory of directories) {
			Fs.mkdirSync(directory, {
				recursive: true,
			});
			const manifestPath = Path.join(directory, `${InstallNativeHost.HOST_NAME}.json`);
			Fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, '\t') + '\n');
			written.push(manifestPath);
		}

		return {
			identifier: identifier,
			launcher: launcher,
			manifests: written,
		};
	}

	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////
	//	Helpers
	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////

	/**
	 * Writes the executable Chrome actually launches.
	 *
	 * Chrome runs the path in the manifest directly, so it has to be an executable file rather than a
	 * script it would have to know how to interpret. A one-line shell wrapper around Node.js is the
	 * simplest thing that satisfies that.
	 *
	 * @returns The absolute path to the launcher.
	 */
	static _writeLauncher(): string {
		const repoRoot = Path.join(__dirname, '..');
		const launcher = Path.join(repoRoot, 'bin', 'webmcp_native_host.sh');
		const hostScript = Path.join(repoRoot, 'src', 'native_messaging_host', 'webmcp_native_host.ts');
		Fs.mkdirSync(Path.dirname(launcher), {
			recursive: true,
		});
		Fs.writeFileSync(
			launcher,
			['#!/bin/sh', `exec ${JSON.stringify(process.execPath)} ${JSON.stringify(hostScript)} "$@"`, ''].join('\n'),
		);
		Fs.chmodSync(launcher, 0o755);
		return launcher;
	}

	/**
	 * Lists every directory Chrome might read host manifests from.
	 *
	 * The everyday Chrome reads them from its own support directory. A Chrome started with a custom
	 * `--user-data-dir`, which is what the verification tooling uses, reads them from inside that
	 * directory instead, so both are written.
	 *
	 * @param userDataDirs - Extra user data directories to cover.
	 * @returns The directories to write into.
	 */
	static _manifestDirectories(userDataDirs: string[]): string[] {
		const directories: string[] = [];
		if (process.platform === 'darwin') {
			directories.push(
				Path.join(Os.homedir(), 'Library', 'Application Support', 'Google', 'Chrome', 'NativeMessagingHosts'),
			);
		} else {
			directories.push(Path.join(Os.homedir(), '.config', 'google-chrome', 'NativeMessagingHosts'));
		}
		for (const userDataDir of userDataDirs) {
			directories.push(Path.join(userDataDir, 'NativeMessagingHosts'));
		}
		return directories;
	}
}

if (import.meta.filename === process.argv[1]) {
	const throwaway = Path.join(Os.tmpdir(), 'webmcp_everywhere_profile');
	const result = InstallNativeHost.run({
		userDataDirs: [throwaway],
	});
	console.log(`extension identifier: ${result.identifier}`);
	console.log(`launcher: ${result.launcher}`);
	for (const manifest of result.manifests) {
		console.log(`manifest: ${manifest}`);
	}
}

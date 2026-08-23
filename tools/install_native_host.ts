///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	InstallNativeHost — registers the host so Chrome will start it for this extension
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

import Fs from 'node:fs';
import Os from 'node:os';
import Path from 'node:path';
import { GenerateExtensionKey } from './generate_extension_key.ts';

const __filename = import.meta.filename;
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
		const launcher = InstallNativeHost._resolveLauncher();

		const manifest = InstallNativeHost._renderManifest(launcher, identifier);

		const directories = InstallNativeHost._manifestDirectories(options.userDataDirs ?? []);
		const written: string[] = [];
		for (const directory of directories) {
			Fs.mkdirSync(directory, {
				recursive: true,
			});
			const manifestPath = Path.join(directory, `${InstallNativeHost.HOST_NAME}.json`);
			Fs.writeFileSync(manifestPath, manifest);
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
	 * Fills the host manifest template in with this installation's values.
	 *
	 * The manifest lives in `data/native_messaging_template/com.webmcp_everywhere.host.json` rather than in
	 * this file, so that the shape Chrome reads can be looked at and edited as the JSON document it is. It
	 * is read every time instead of being cached, because an installation runs once and then exits. Every
	 * placeholder has to be replaced, so an unreplaced one is an error rather than something written out
	 * to Chrome, which would refuse the manifest with no useful message.
	 *
	 * @param launcher - The absolute path to the executable file Chrome starts.
	 * @param identifier - The extension identifier the manifest allows to connect.
	 * @returns The manifest text to write, ending in a newline.
	 */
	static _renderManifest(launcher: string, identifier: string): string {
		const templatePath = Path.join(
			__dirname,
			'..',
			'data',
			'native_messaging_template',
			`${InstallNativeHost.HOST_NAME}.json`,
		);
		if (Fs.existsSync(templatePath) === false) {
			throw new Error(`host manifest template is missing: ${templatePath}`);
		}
		const template = Fs.readFileSync(templatePath, 'utf8');

		const values: Record<string, string> = {
			hostName: InstallNativeHost.HOST_NAME,
			launcherPath: launcher,
			extensionIdentifier: identifier,
		};
		let rendered = template;
		for (const [placeholder, value] of Object.entries(values)) {
			rendered = rendered.split(`{{${placeholder}}}`).join(value);
		}

		const leftover = rendered.match(/\{\{[^}]*\}\}/);
		if (leftover !== null) {
			throw new Error(`host manifest template has an unknown placeholder: ${leftover[0]}`);
		}

		JSON.parse(rendered);

		return rendered.endsWith('\n') === true ? rendered : rendered + '\n';
	}

	/**
	 * Locates the executable Chrome actually launches.
	 *
	 * Chrome runs the path in the manifest directly, so it has to be an executable file rather than a
	 * script it would have to know how to interpret. `bin/webmcp_native_host.sh` is that file, it is
	 * kept in the repository, and it works out the rest of the paths on its own, so this only has to
	 * check that it is there and that it is executable.
	 *
	 * @returns The absolute path to the launcher.
	 */
	static _resolveLauncher(): string {
		const repoRoot = Path.join(__dirname, '..');
		const launcher = Path.join(repoRoot, 'bin', 'webmcp_native_host.sh');
		if (Fs.existsSync(launcher) === false) {
			throw new Error(`launcher is missing: ${launcher}`);
		}
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

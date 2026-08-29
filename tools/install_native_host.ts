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
	/**
	 * Whether the everyday Chrome, the one the user installed, is covered as well. True by default,
	 * because registering with that Chrome is the whole point of `npm run install:host`. Set to false by
	 * anything that only needs a throwaway profile to work, so that it leaves the user's browser alone.
	 */
	isEverydayChromeCovered?: boolean;
};

/**
 * What an installation writes, or would write.
 *
 * `InstallNativeHost.plan` returns this before anything is written, so a caller can say what it is
 * about to do to the user's machine. `InstallNativeHost.run` returns the same shape afterwards, naming
 * what it really wrote.
 */
export type NativeHostInstallation = {
	/** The extension identifier the manifest allows. */
	identifier: string;
	/** The executable file Chrome starts. */
	launcher: string;
	/** Every manifest file, in the order they are written. */
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
	 * Works out what an installation would write, without writing any of it.
	 *
	 * This exists so that the installation can say what it is about to do to the user's machine before it
	 * does it. Writing a file into a browser the user installed is not something to announce afterwards.
	 *
	 * @param options - Where the installation would write.
	 * @returns The files the installation would write.
	 */
	static plan(options: InstallNativeHostOptions = {}): NativeHostInstallation {
		const identifier = GenerateExtensionKey.currentIdentifier();
		const launcher = InstallNativeHost._resolveLauncher();
		const directories = InstallNativeHost.manifestDirectories(options);

		return {
			identifier: identifier,
			launcher: launcher,
			manifests: directories.map((directory) => {
				return Path.join(directory, `${InstallNativeHost.HOST_NAME}.json`);
			}),
		};
	}

	/**
	 * Writes the launcher and the manifest.
	 *
	 * @param options - Where to install.
	 * @returns What was written.
	 */
	static run(options: InstallNativeHostOptions = {}): NativeHostInstallation {
		const planned = InstallNativeHost.plan(options);
		const manifest = InstallNativeHost._renderManifest(planned.launcher, planned.identifier);

		for (const manifestPath of planned.manifests) {
			Fs.mkdirSync(Path.dirname(manifestPath), {
				recursive: true,
			});
			Fs.writeFileSync(manifestPath, manifest);
		}

		return planned;
	}

	/**
	 * Lists every directory Chrome might read host manifests from.
	 *
	 * The everyday Chrome reads them from its own support directory. A Chrome started with a custom
	 * `--user-data-dir`, which is what `LaunchChrome` and the verification runners use, reads them from
	 * inside that directory instead and never looks at the everyday one, which is why a throwaway profile
	 * can be covered without touching the browser the user installed.
	 *
	 * This is public because the uninstallation has to remove a manifest from exactly the directories the
	 * installation writes one into, and two lists that have to agree are one list.
	 *
	 * @param options - Which directories to cover.
	 * @returns The directories that hold a manifest, the everyday Chrome first when it is covered.
	 */
	static manifestDirectories(options: InstallNativeHostOptions = {}): string[] {
		const directories: string[] = [];
		if (options.isEverydayChromeCovered !== false) {
			directories.push(InstallNativeHost.everydayChromeDirectory());
		}
		for (const userDataDir of options.userDataDirs ?? []) {
			directories.push(Path.join(userDataDir, 'NativeMessagingHosts'));
		}
		return directories;
	}

	/**
	 * Names the directory the everyday Chrome, the one the user installed, reads host manifests from.
	 *
	 * @returns The absolute path of that directory on this platform.
	 */
	static everydayChromeDirectory(): string {
		if (process.platform === 'darwin') {
			return Path.join(Os.homedir(), 'Library', 'Application Support', 'Google', 'Chrome', 'NativeMessagingHosts');
		}
		return Path.join(Os.homedir(), '.config', 'google-chrome', 'NativeMessagingHosts');
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
}

if (import.meta.filename === process.argv[1]) {
	const throwaway = Path.join(Os.tmpdir(), 'webmcp_everywhere_profile');
	const options: InstallNativeHostOptions = {
		userDataDirs: [throwaway],
	};

	const planned = InstallNativeHost.plan(options);
	console.log('This registers WebMCP Everywhere with Google Chrome. It is about to write:');
	for (const manifestPath of planned.manifests) {
		console.log(`  ${manifestPath}`);
	}
	console.log('');
	console.log('Each of those files tells Google Chrome to start this program when the extension asks:');
	console.log(`  ${planned.launcher}`);
	console.log('Chrome starts it outside the browser sandbox, with your full rights.');
	console.log('To undo all of this later, run: npm run uninstall:host');
	console.log('');

	const result = InstallNativeHost.run(options);
	console.log(`extension identifier: ${result.identifier}`);
	console.log(`launcher: ${result.launcher}`);
	for (const manifest of result.manifests) {
		console.log(`wrote: ${manifest}`);
	}
}

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	InstallNativeHost — registers the host so Chrome will start it for this extension
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

import Fs from 'node:fs';
import Os from 'node:os';
import Path from 'node:path';
import { ExtensionIdentifier } from './extension_identifier.ts';

const __filename = import.meta.filename;
const __dirname = import.meta.dirname;

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	Types
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/**
 * Which Chrome profiles a host manifest is written into, or removed from.
 *
 * Removing a manifest needs no launcher and no template, so it asks for this narrower shape: an
 * uninstallation that had to name a launcher it is about to delete could not be run from a folder the
 * launcher had already gone from.
 */
export type ManifestDirectoryOptions = {
	/** Extra Chrome user data directories to cover. */
	userDataDirs?: string[];
	/**
	 * Whether the everyday Chrome, the one the user installed, is covered as well. True by default,
	 * because registering with that Chrome is the whole point of `npm run install:host`. Set to false by
	 * anything that only needs a throwaway profile to work, so that it leaves the user's browser alone.
	 */
	isEverydayChromeCovered?: boolean;
};

/** Where to install, which is the profiles plus the three things the installation reads. */
export type InstallNativeHostOptions = ManifestDirectoryOptions & {
	/**
	 * The executable Chrome should start.
	 *
	 * Every caller names it, because this file ships inside the release and a default of its own would be
	 * a path that exists in a working copy and nowhere else. A release names the launcher beside its own
	 * bundled host; a working copy names `WorkingCopyLayout.LAUNCHER`.
	 */
	launcherPath: string;
	/** The folder holding the host manifest template, named by every caller for the same reason. */
	templateDir: string;
	/** The extension manifest the pinned identifier is read from, named by every caller for the same reason. */
	extensionManifestPath: string;
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
	static plan(options: InstallNativeHostOptions): NativeHostInstallation {
		const identifier = ExtensionIdentifier.fromManifest(options.extensionManifestPath);
		const launcher = InstallNativeHost._resolveLauncher(options.launcherPath);

		return {
			identifier: identifier,
			launcher: launcher,
			manifests: InstallNativeHost.manifestPaths(options),
		};
	}

	/**
	 * Names every manifest file the installation writes, without reading anything else.
	 *
	 * The installation, the uninstallation and the command that copies a release somewhere stable all
	 * need this same list, and a file name spelled in three places is spelled wrong in one of them
	 * eventually. It reads no launcher and no extension manifest, so it also answers before an
	 * installation exists, which is what lets a command name the files it is about to write.
	 *
	 * @param options - Which directories to cover.
	 * @returns The manifest files, in the order they are written.
	 */
	static manifestPaths(options: ManifestDirectoryOptions = {}): string[] {
		return InstallNativeHost.manifestDirectories(options).map((directory) => {
			return Path.join(directory, `${InstallNativeHost.HOST_NAME}.json`);
		});
	}

	/**
	 * Writes the launcher and the manifest.
	 *
	 * @param options - Where to install.
	 * @returns What was written.
	 */
	static run(options: InstallNativeHostOptions): NativeHostInstallation {
		const planned = InstallNativeHost.plan(options);
		const manifest = InstallNativeHost._renderManifest(
			planned.launcher,
			planned.identifier,
			options.templateDir,
		);

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
	static manifestDirectories(options: ManifestDirectoryOptions = {}): string[] {
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
	 * @param homeDir - The home folder to read it out of, for a runner installing into a throwaway one.
	 * @returns The absolute path of that directory on this platform.
	 */
	static everydayChromeDirectory(homeDir: string = Os.homedir()): string {
		if (process.platform === 'darwin') {
			return Path.join(homeDir, 'Library', 'Application Support', 'Google', 'Chrome', 'NativeMessagingHosts');
		}
		return Path.join(homeDir, '.config', 'google-chrome', 'NativeMessagingHosts');
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
	 * @param templateDir - The folder holding the template, or nothing for this working copy's.
	 * @returns The manifest text to write, ending in a newline.
	 */
	static _renderManifest(launcher: string, identifier: string, templateDir: string): string {
		const folder = templateDir;
		const templatePath = Path.join(folder, `${InstallNativeHost.HOST_NAME}.json`);
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
	 * @param named - A launcher to use instead of this working copy's, such as a packaged release's.
	 * @returns The absolute path to the launcher.
	 * @throws When the launcher is not there.
	 */
	static _resolveLauncher(named: string): string {
		const launcher = Path.resolve(named);
		if (Fs.existsSync(launcher) === false) {
			throw new Error(`launcher is missing: ${launcher}`);
		}
		Fs.chmodSync(launcher, 0o755);
		return launcher;
	}
}


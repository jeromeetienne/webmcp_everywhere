import Fs from 'node:fs';
import Path from 'node:path';
import { HostStateFiles } from '../src/native_messaging_host/host_state_files.ts';
import { GenerateExtensionKey } from './generate_extension_key.ts';
import { InstallNativeHost } from './install_native_host.ts';
import { ReleaseLayout } from './release_layout.ts';
import { UninstallNativeHost } from './uninstall_native_host.ts';
import type { NativeHostInstallation } from './install_native_host.ts';
import type { InspectedNativeHostManifest } from './uninstall_native_host.ts';

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	PackagedReleaseInstallation — puts a packaged release where npm cannot delete it
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	Types
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/** Where an installation reads from, where it writes to, and which Chrome it covers. */
export type PackagedReleaseInstallationOptions = {
	/** The release folder to copy from, which is the folder the running command sits in. */
	sourceDir: string;
	/** Where to install, when it is not `installation` inside the state directory. */
	targetDir?: string;
	/**
	 * Whether the everyday Chrome, the one the user installed, is covered. True by default, because
	 * registering with that Chrome is the whole point of the command. A runner sets it to false.
	 */
	isEverydayChromeCovered?: boolean;
	/** Extra Chrome user data directories to register with, which is how a runner covers a throwaway profile. */
	userDataDirs?: string[];
};

/** What an installation would write, or did write. */
export type InstalledPackagedRelease = {
	/** The release folder copied from. */
	sourceDir: string;
	/** The folder copied to, which is the one Chrome is told about. */
	targetDir: string;
	/** Whether that folder was already there, so a person is told it is replaced rather than created. */
	isTargetDirReplaced: boolean;
	/**
	 * Whether the source and the target are one folder, in which case nothing is copied and only the
	 * registration runs again.
	 */
	isAlreadyInPlace: boolean;
	/** The extension folder to load at `chrome://extensions`, inside the target folder. */
	extensionDir: string;
	/**
	 * The state directory holding the token, the endpoint file and the loaded adapters, which the target
	 * folder sits in.
	 */
	stateDir: string;
	/** What registering the native messaging host writes. */
	nativeHost: NativeHostInstallation;
};

/** What a removal took out, and what it deliberately left behind. */
export type RemovedPackagedRelease = {
	/** The installation folder. */
	targetDir: string;
	/** Whether that folder was there and has been removed. */
	isTargetDirRemoved: boolean;
	/** Every host manifest looked at, and whether each one was there. */
	manifests: InspectedNativeHostManifest[];
	/** The state directory, which holds the token and the loaded adapters and is left alone. */
	stateDir: string;
};

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	PackagedReleaseInstallation
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/**
 * Copies a packaged release out of the package and into a folder this project owns, then registers it.
 *
 * The copy is the whole reason this exists. An `npx` run unpacks the package under `~/.npm/_npx/`,
 * which npm empties whenever it decides to, and two absolute paths would then name that folder: the
 * `path` field of the host manifest Chrome reads, and Chrome's own record of an extension loaded
 * unpacked. When npm empties the cache, the extension shows as broken at `chrome://extensions` and the
 * host is never started, with nothing on the screen saying why.
 *
 * So the release is copied whole, into `installation` inside the state directory that already holds the
 * token and the loaded adapters. The copy is whole rather than partial because a folder that carries its
 * own installer, its own manifest template and its own extension can be registered again later without
 * the package it came from.
 */
export class PackagedReleaseInstallation {
	/** The folder inside the state directory that the release is copied into. */
	static readonly FOLDER_NAME = 'installation';

	/**
	 * Names the folder an installation goes into.
	 *
	 * @param options - Where the installation reads from and writes to.
	 * @returns The target folder, which is the state directory's `installation` unless one was named.
	 */
	static targetDir(options: PackagedReleaseInstallationOptions): string {
		return options.targetDir ?? Path.join(HostStateFiles.STATE_DIR, PackagedReleaseInstallation.FOLDER_NAME);
	}

	/**
	 * Works out everything an installation would write, without writing any of it.
	 *
	 * This is what lets the command name every path it is about to touch before it touches one. A copy
	 * into the user's home folder and a file written into the browser they installed are both things to
	 * announce beforehand, not afterwards.
	 *
	 * @param options - Where the installation reads from and writes to.
	 * @returns The folders and files the installation would write.
	 */
	static plan(options: PackagedReleaseInstallationOptions): InstalledPackagedRelease {
		const targetDir = PackagedReleaseInstallation.targetDir(options);
		const isAlreadyInPlace = Path.resolve(options.sourceDir) === Path.resolve(targetDir);
		// `InstallNativeHost.plan` is deliberately not used here. It resolves the launcher and refuses a
		// path with no file at it, which is right when a launcher already exists and wrong here: on a
		// first install the launcher arrives with the copy this plan has not made yet. So the identifier
		// is read from the extension in the package, and the manifest paths come from the one list.
		const nativeHost: NativeHostInstallation = {
			identifier: GenerateExtensionKey.currentIdentifier(
				Path.join(options.sourceDir, ReleaseLayout.EXTENSION_DIR, ReleaseLayout.EXTENSION_MANIFEST),
			),
			launcher: Path.join(targetDir, ReleaseLayout.LAUNCHER),
			manifests: InstallNativeHost.manifestPaths({
				isEverydayChromeCovered: options.isEverydayChromeCovered,
				userDataDirs: options.userDataDirs,
			}),
		};

		return {
			sourceDir: options.sourceDir,
			targetDir: targetDir,
			isTargetDirReplaced: Fs.existsSync(targetDir) === true && isAlreadyInPlace === false,
			isAlreadyInPlace: isAlreadyInPlace,
			extensionDir: Path.join(targetDir, ReleaseLayout.EXTENSION_DIR),
			stateDir: HostStateFiles.STATE_DIR,
			nativeHost: nativeHost,
		};
	}

	/**
	 * Copies the release into the target folder, then registers its launcher with Chrome.
	 *
	 * Running it a second time replaces the folder rather than adding a second one beside it, because a
	 * user updating to a newer version is the ordinary case and two installations would leave Chrome
	 * pointing at whichever was registered last with no way to tell which.
	 *
	 * @param options - Where the installation reads from and writes to.
	 * @returns What was written, in the same shape `plan` returns.
	 */
	static install(options: PackagedReleaseInstallationOptions): InstalledPackagedRelease {
		const planned = PackagedReleaseInstallation.plan(options);

		if (planned.isAlreadyInPlace === false) {
			Fs.rmSync(planned.targetDir, {
				recursive: true,
				force: true,
			});
			Fs.mkdirSync(Path.dirname(planned.targetDir), {
				recursive: true,
				mode: 0o700,
			});
			Fs.cpSync(planned.sourceDir, planned.targetDir, {
				recursive: true,
			});
		}

		PackagedReleaseInstallation._makeRunnable(Path.join(planned.targetDir, ReleaseLayout.LAUNCHER));
		PackagedReleaseInstallation._makeRunnable(Path.join(planned.targetDir, ReleaseLayout.COMMAND));

		InstallNativeHost.run({
			launcherPath: Path.join(planned.targetDir, ReleaseLayout.LAUNCHER),
			templateDir: Path.join(planned.targetDir, ReleaseLayout.TEMPLATE_DIR),
			extensionManifestPath: Path.join(
				planned.targetDir,
				ReleaseLayout.EXTENSION_DIR,
				ReleaseLayout.EXTENSION_MANIFEST,
			),
			isEverydayChromeCovered: options.isEverydayChromeCovered,
			userDataDirs: options.userDataDirs,
		});

		return planned;
	}

	/**
	 * Takes the registration and the installation folder back out, and leaves everything else.
	 *
	 * The token and the loaded adapters are not removed. They are the user's, they took a decision each
	 * to create, and a command that installed a browser extension has no business deleting them.
	 *
	 * @param options - Where the installation was written, and which Chrome it covered.
	 * @returns Every manifest looked at, whether the folder was removed, and the state directory left alone.
	 */
	static remove(options: PackagedReleaseInstallationOptions): RemovedPackagedRelease {
		const targetDir = PackagedReleaseInstallation.targetDir(options);
		const uninstalled = UninstallNativeHost.run({
			isEverydayChromeCovered: options.isEverydayChromeCovered,
			userDataDirs: options.userDataDirs,
		});

		const isTargetDirRemoved = Fs.existsSync(targetDir);
		if (isTargetDirRemoved === true) {
			Fs.rmSync(targetDir, {
				recursive: true,
				force: true,
			});
		}

		return {
			targetDir: targetDir,
			isTargetDirRemoved: isTargetDirRemoved,
			manifests: uninstalled.manifests,
			stateDir: uninstalled.stateDir,
		};
	}

	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////
	//	Helpers
	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////

	/**
	 * Makes one copied file executable again.
	 *
	 * A copy does not always carry the executable bit through, and neither does every way a package
	 * reaches a machine. Chrome starting the launcher and a person running the command are both silent
	 * failures when it is missing, so it is set rather than assumed.
	 *
	 * @param path - The file to make executable.
	 * @returns Nothing.
	 */
	static _makeRunnable(path: string): void {
		if (Fs.existsSync(path) === false) {
			return;
		}
		Fs.chmodSync(path, 0o755);
	}
}

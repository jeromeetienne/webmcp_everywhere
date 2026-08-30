///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	UninstallNativeHost — removes every host manifest the installation wrote
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

import Fs from 'node:fs';
import { HostStateFiles } from '@webmcp_everywhere/native_messaging_host';
import { InstallNativeHost } from './install_native_host.ts';
import type { ManifestDirectoryOptions } from './install_native_host.ts';

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	Types
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/** Where to uninstall from. The same shape as the installation, so the two cover the same places. */
export type UninstallNativeHostOptions = ManifestDirectoryOptions;

/** One manifest file the uninstallation looked at. */
export type InspectedNativeHostManifest = {
	/** The manifest file, whether or not it was there. */
	path: string;
	/** Whether the file was there and has been removed. */
	isRemoved: boolean;
	/**
	 * The executable the manifest named, or null when the file was not there or could not be read as
	 * JSON. It is reported because a manifest left behind by a working copy that has since been deleted
	 * names a program that no longer exists, and seeing that path is how a person recognises it.
	 */
	launcher: string | null;
};

/** What one uninstallation removed, and what it deliberately left alone. */
export type UninstalledNativeHost = {
	/** Every manifest file that was looked at, in the order they were looked at. */
	manifests: InspectedNativeHostManifest[];
	/** The state directory in the home folder, which is left alone. */
	stateDir: string;
};

/**
 * Takes the native messaging host manifest back out of Chrome.
 *
 * Installing writes a file into a browser the user installed, so there has to be a way to put that
 * browser back the way it was. A manifest is removed by name from exactly the directories
 * `InstallNativeHost` writes one into, including a manifest left behind by a working copy that has
 * since moved or been deleted, which is the one a person cannot find on their own.
 */
export class UninstallNativeHost {
	/**
	 * Removes the manifest from every directory the installation writes it into.
	 *
	 * @param options - Where to uninstall from.
	 * @returns Every manifest file looked at, and whether each one was there.
	 */
	static run(options: UninstallNativeHostOptions = {}): UninstalledNativeHost {
		const manifests: InspectedNativeHostManifest[] = [];

		for (const manifestPath of InstallNativeHost.manifestPaths(options)) {
			const launcher = UninstallNativeHost._readLauncher(manifestPath);
			let isRemoved = false;
			if (Fs.existsSync(manifestPath) === true) {
				Fs.rmSync(manifestPath);
				isRemoved = true;
			}
			manifests.push({
				path: manifestPath,
				isRemoved: isRemoved,
				launcher: launcher,
			});
		}

		return {
			manifests: manifests,
			stateDir: HostStateFiles.STATE_DIR,
		};
	}

	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////
	//	Helpers
	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////

	/**
	 * Reads the executable a manifest names, before that manifest is removed.
	 *
	 * A manifest another program wrote, or one this project wrote and then half overwrote, is still a
	 * file to remove, so an unreadable one is reported as an unknown launcher rather than refused.
	 *
	 * @param manifestPath - The manifest file to read.
	 * @returns The path in the manifest's `path` field, or null when there is none to read.
	 */
	static _readLauncher(manifestPath: string): string | null {
		if (Fs.existsSync(manifestPath) === false) {
			return null;
		}
		try {
			const parsed = JSON.parse(Fs.readFileSync(manifestPath, 'utf8')) as {
				path?: unknown;
			};
			if (typeof parsed.path === 'string') {
				return parsed.path;
			}
			return null;
		} catch {
			return null;
		}
	}
}


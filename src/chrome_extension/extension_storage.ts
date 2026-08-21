import type { OriginGrant } from '../adapter_format/adapter_types.js';

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	ExtensionStorage — where the user's grants and the kill switch live
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/** Everything the extension remembers between page loads. */
export type StoredSettings = {
	/** The global kill switch. When false, no adapter registers anything anywhere. */
	globallyEnabled: boolean;
	/** Whether acting tools are allowed, keyed by origin. Absent means not allowed. */
	actingAllowedByOrigin: Record<string, boolean>;
};

/**
 * Reads and writes the extension's settings.
 *
 * Only the isolated world and the service worker may use this. The main world, where adapters run, has
 * no access to extension storage at all, which is why grants have to be passed across as messages.
 */
export class ExtensionStorage {
	/** The single key everything is stored under. */
	static readonly KEY = 'webmcp_everywhere_settings';

	/** What a fresh install looks like: on, and read-only everywhere. */
	static readonly DEFAULTS: StoredSettings = {
		globallyEnabled: true,
		actingAllowedByOrigin: {},
	};

	/**
	 * Reads the settings, filling in defaults for anything missing.
	 *
	 * @returns The stored settings.
	 */
	static async read(): Promise<StoredSettings> {
		const stored = await chrome.storage.local.get(ExtensionStorage.KEY);
		const settings = stored[ExtensionStorage.KEY] as Partial<StoredSettings> | undefined;
		return {
			globallyEnabled: settings?.globallyEnabled ?? ExtensionStorage.DEFAULTS.globallyEnabled,
			actingAllowedByOrigin:
				settings?.actingAllowedByOrigin ?? ExtensionStorage.DEFAULTS.actingAllowedByOrigin,
		};
	}

	/**
	 * Writes the settings.
	 *
	 * @param settings - The settings to store.
	 * @returns Nothing.
	 */
	static async write(settings: StoredSettings): Promise<void> {
		await chrome.storage.local.set({ [ExtensionStorage.KEY]: settings });
	}

	/**
	 * Works out what an origin is allowed to do right now.
	 *
	 * @param origin - The origin to look up.
	 * @returns The grant for that origin.
	 */
	static async grantForOrigin(origin: string): Promise<OriginGrant> {
		const settings = await ExtensionStorage.read();
		return {
			origin: origin,
			globallyEnabled: settings.globallyEnabled,
			actingAllowed: settings.actingAllowedByOrigin[origin] === true,
		};
	}

	/**
	 * Turns acting tools on or off for one origin.
	 *
	 * @param origin - The origin to change.
	 * @param allowed - Whether acting tools are allowed there.
	 * @returns Nothing.
	 */
	static async setActingAllowed(origin: string, allowed: boolean): Promise<void> {
		const settings = await ExtensionStorage.read();
		settings.actingAllowedByOrigin[origin] = allowed;
		await ExtensionStorage.write(settings);
	}

	/**
	 * Throws the global kill switch.
	 *
	 * @param enabled - Whether the extension registers anything at all.
	 * @returns Nothing.
	 */
	static async setGloballyEnabled(enabled: boolean): Promise<void> {
		const settings = await ExtensionStorage.read();
		settings.globallyEnabled = enabled;
		await ExtensionStorage.write(settings);
	}
}

import type { OriginGrant } from '@webmcp_everywhere/site_adapter';

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
	/**
	 * Whether each adapter is switched on, keyed by site slug. Absent means the default for that
	 * adapter: an adapter bundled into this build is on, and an adapter loaded from a folder is off.
	 */
	adapterEnabledBySlug: Record<string, boolean>;
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

	/** What a fresh install looks like: on, read-only everywhere, and nothing decided per adapter. */
	static readonly DEFAULTS: StoredSettings = {
		globallyEnabled: true,
		actingAllowedByOrigin: {},
		adapterEnabledBySlug: {},
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
			adapterEnabledBySlug:
				settings?.adapterEnabledBySlug ?? ExtensionStorage.DEFAULTS.adapterEnabledBySlug,
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
	 * Switches one adapter on or off.
	 *
	 * @param siteSlug - The adapter to change.
	 * @param enabled - Whether its scripts are registered at all.
	 * @returns Nothing.
	 */
	static async setAdapterEnabled(siteSlug: string, enabled: boolean): Promise<void> {
		const settings = await ExtensionStorage.read();
		settings.adapterEnabledBySlug[siteSlug] = enabled;
		await ExtensionStorage.write(settings);
	}

	/**
	 * Says whether an adapter is switched on, applying the default for its kind.
	 *
	 * The defaults differ on purpose. An adapter bundled into this build was reviewed here and its
	 * source is in the repository, so it is on. An adapter loaded from a folder was reviewed by nobody,
	 * so it stays off until the user says otherwise.
	 *
	 * @param settings - The settings already read.
	 * @param siteSlug - The adapter to look up.
	 * @param isBundled - Whether this adapter is bundled into this build.
	 * @returns `true` when the adapter's scripts should be registered.
	 */
	static isAdapterEnabled(settings: StoredSettings, siteSlug: string, isBundled: boolean): boolean {
		const decided = settings.adapterEnabledBySlug[siteSlug];
		if (decided !== undefined) {
			return decided;
		}
		return isBundled;
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

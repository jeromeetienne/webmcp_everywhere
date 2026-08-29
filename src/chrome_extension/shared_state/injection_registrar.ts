import type { LoadedAdapter } from '../../adapter_format/loaded_adapter_types.js';
import { AdapterRegistry } from './adapter_registry.js';
import { ExtensionStorage } from './extension_storage.js';

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	InjectionRegistrar — decides which adapters run where, and tells Chrome
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	Types
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/** One adapter that is registered and will run when its site is opened. */
export type ActiveInjection = {
	/** The adapter's site slug. */
	siteSlug: string;
	/** Whether it was bundled into this build or loaded from a folder. */
	origin: 'bundled' | 'loaded';
	/** The match patterns its scripts were registered for. */
	matchPatterns: string[];
};

/** One adapter that is not registered, and the reason. */
export type WithheldInjection = {
	/** The adapter's site slug. */
	siteSlug: string;
	/** Why nothing was registered for it. */
	reason: string;
};

/** What one pass of the registrar did, kept for the popup and for the verification runners. */
export type InjectionReport = {
	/** The adapters whose scripts are registered right now. */
	active: ActiveInjection[];
	/** The adapters that are not registered, each with its reason. */
	withheld: WithheldInjection[];
	/** Anything Chrome refused. */
	errors: string[];
};

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	InjectionRegistrar
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/**
 * Registers each switched-on adapter's scripts for that adapter's own match patterns, and nothing else.
 *
 * The extension manifest names no site. It used to name every adapted site three times over, which
 * meant the install asked the user for every site the catalogue covered, the extension store reviewed
 * the extension again for each new one, and a user reinstalled to receive one new adapter. None of
 * that survives a catalogue, so the sites moved out of the manifest and into here, where they are
 * decided when the user switches an adapter on.
 *
 * A bundled adapter's main-world code is in this extension, so `chrome.scripting` registers it. A
 * loaded adapter's is not, so `chrome.userScripts` registers it: that is the one interface Chrome
 * offers for running code the extension did not ship, and it stays hidden until the user turns on
 * **Allow User Scripts** for this extension. Until they do, a loaded adapter is withheld and says so.
 */
export class InjectionRegistrar {
	/** The identifier prefix of a registered main-world script for a bundled adapter. */
	static readonly BUNDLED_MAIN_PREFIX = 'webmcp_everywhere_bundled_main_';

	/** The identifier prefix of a registered isolated-world script, which both kinds of adapter need. */
	static readonly ISOLATED_PREFIX = 'webmcp_everywhere_isolated_';

	/** The identifier prefix of a registered user script for a loaded adapter. */
	static readonly LOADED_MAIN_PREFIX = 'webmcp_everywhere_loaded_main_';

	/** The bundled main-world script, which carries the adapters this build ships. */
	static readonly BUNDLED_MAIN_FILE = 'dist/content_main.js';

	/** The isolated-world script, which carries grants in and questions out. */
	static readonly ISOLATED_FILE = 'dist/content_isolated.js';

	/** The main-world runtime a loaded adapter's own bundle is followed by. */
	static readonly LOADED_MAIN_FILE = 'dist/external_adapter_main.js';

	/**
	 * Works out what should be registered, then makes Chrome agree with it.
	 *
	 * @param loadedAdapters - The adapters the native messaging host read from folders, empty when none.
	 * @returns What is registered now, what is not, and why.
	 */
	static async apply(loadedAdapters: LoadedAdapter[]): Promise<InjectionReport> {
		const report: InjectionReport = {
			active: [],
			withheld: [],
			errors: [],
		};
		const settings = await ExtensionStorage.read();

		if (settings.globallyEnabled === false) {
			await InjectionRegistrar._unregisterEverything(report);
			report.withheld.push({
				siteSlug: '*',
				reason: 'WebMCP Everywhere is switched off',
			});
			return report;
		}

		const claimedHosts = new Set<string>();

		for (const adapter of AdapterRegistry.ADAPTERS) {
			if (ExtensionStorage.isAdapterEnabled(settings, adapter.siteSlug, true) === false) {
				report.withheld.push({
					siteSlug: adapter.siteSlug,
					reason: 'switched off in the extension popup',
				});
				continue;
			}
			for (const host of InjectionRegistrar._hostsOf(adapter.matchPatterns)) {
				claimedHosts.add(host);
			}
			report.active.push({
				siteSlug: adapter.siteSlug,
				origin: 'bundled',
				matchPatterns: adapter.matchPatterns,
			});
		}

		for (const adapter of loadedAdapters) {
			if (ExtensionStorage.isAdapterEnabled(settings, adapter.siteSlug, false) === false) {
				report.withheld.push({
					siteSlug: adapter.siteSlug,
					reason: 'loaded from a folder and not switched on yet',
				});
				continue;
			}
			const clash = InjectionRegistrar._hostsOf(adapter.matchPatterns).find((host) =>
				claimedHosts.has(host),
			);
			if (clash !== undefined) {
				report.withheld.push({
					siteSlug: adapter.siteSlug,
					reason: `another adapter already covers ${clash}, and one page carries one adapter`,
				});
				continue;
			}
			if (InjectionRegistrar._areUserScriptsAllowed() === false) {
				report.withheld.push({
					siteSlug: adapter.siteSlug,
					reason: 'turn on "Allow User Scripts" for this extension at chrome://extensions',
				});
				continue;
			}
			for (const host of InjectionRegistrar._hostsOf(adapter.matchPatterns)) {
				claimedHosts.add(host);
			}
			report.active.push({
				siteSlug: adapter.siteSlug,
				origin: 'loaded',
				matchPatterns: adapter.matchPatterns,
			});
		}

		await InjectionRegistrar._applyContentScripts(report);
		await InjectionRegistrar._applyUserScripts(report, loadedAdapters);
		return report;
	}

	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////
	//	Helpers
	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////

	/**
	 * Says whether Chrome is letting this extension register user scripts at all.
	 *
	 * `chrome.userScripts` is absent, rather than failing, until the user turns on **Allow User Scripts**
	 * for this extension. Reading the property is the only way to ask.
	 *
	 * @returns `true` when user scripts may be registered.
	 */
	static _areUserScriptsAllowed(): boolean {
		return typeof chrome.userScripts !== 'undefined';
	}

	/**
	 * Names the hosts a set of match patterns covers, so that two adapters cannot claim one page.
	 *
	 * @param matchPatterns - The patterns to read.
	 * @returns One host per pattern, with the scheme and the path dropped.
	 */
	static _hostsOf(matchPatterns: string[]): string[] {
		return matchPatterns.map((pattern) => {
			const withoutScheme = pattern.replace(/^[a-z*]+:\/\//, '');
			return withoutScheme.split('/')[0];
		});
	}

	/**
	 * Registers the content scripts the active adapters need, and removes the rest.
	 *
	 * @param report - The report to record errors in.
	 * @returns Nothing.
	 */
	static async _applyContentScripts(report: InjectionReport): Promise<void> {
		const wanted: chrome.scripting.RegisteredContentScript[] = [];
		for (const active of report.active) {
			wanted.push({
				id: `${InjectionRegistrar.ISOLATED_PREFIX}${active.siteSlug}`,
				matches: active.matchPatterns,
				js: [InjectionRegistrar.ISOLATED_FILE],
				world: 'ISOLATED',
				runAt: 'document_start',
				allFrames: false,
			});
			if (active.origin === 'bundled') {
				wanted.push({
					id: `${InjectionRegistrar.BUNDLED_MAIN_PREFIX}${active.siteSlug}`,
					matches: active.matchPatterns,
					js: [InjectionRegistrar.BUNDLED_MAIN_FILE],
					world: 'MAIN',
					runAt: 'document_start',
					allFrames: false,
				});
			}
		}

		const existing = await chrome.scripting.getRegisteredContentScripts();
		const ours = existing.filter((script) => InjectionRegistrar._isOurs(script.id));
		const stale = ours.filter((script) => wanted.some((entry) => entry.id === script.id) === false);
		if (stale.length > 0) {
			await InjectionRegistrar._record(report, () =>
				chrome.scripting.unregisterContentScripts({
					ids: stale.map((script) => script.id),
				}),
			);
		}

		for (const entry of wanted) {
			const already = ours.some((script) => script.id === entry.id);
			await InjectionRegistrar._record(report, () =>
				already === true
					? chrome.scripting.updateContentScripts([entry])
					: chrome.scripting.registerContentScripts([entry]),
			);
		}
	}

	/**
	 * Registers a user script for every active loaded adapter, and removes the rest.
	 *
	 * Each registration carries two pieces of code in order: the adapter's own bundle, which assigns
	 * itself to a global, and then the extension's own main-world runtime, which picks it up. They are
	 * one registration rather than two because Chrome guarantees the order inside one, and nothing
	 * guarantees it between two.
	 *
	 * @param report - The report to record errors in.
	 * @param loadedAdapters - Every loaded adapter, active or not.
	 * @returns Nothing.
	 */
	static async _applyUserScripts(report: InjectionReport, loadedAdapters: LoadedAdapter[]): Promise<void> {
		if (InjectionRegistrar._areUserScriptsAllowed() === false) {
			return;
		}

		const activeSlugs = new Set(
			report.active.filter((entry) => entry.origin === 'loaded').map((entry) => entry.siteSlug),
		);
		const wanted = loadedAdapters
			.filter((adapter) => activeSlugs.has(adapter.siteSlug) === true)
			.map((adapter) => ({
				id: `${InjectionRegistrar.LOADED_MAIN_PREFIX}${adapter.siteSlug}`,
				matches: adapter.matchPatterns,
				js: [
					{
						code: adapter.source,
					},
					{
						file: InjectionRegistrar.LOADED_MAIN_FILE,
					},
				],
				world: 'MAIN' as const,
				runAt: 'document_start' as const,
				allFrames: false,
			}));

		const existing = await chrome.userScripts.getScripts();
		const stale = existing.filter(
			(script) =>
				InjectionRegistrar._isOurs(script.id) === true &&
				wanted.some((entry) => entry.id === script.id) === false,
		);
		if (stale.length > 0) {
			await InjectionRegistrar._record(report, () =>
				chrome.userScripts.unregister({
					ids: stale.map((script) => script.id),
				}),
			);
		}

		for (const entry of wanted) {
			const already = existing.some((script) => script.id === entry.id);
			await InjectionRegistrar._record(report, () =>
				already === true ? chrome.userScripts.update([entry]) : chrome.userScripts.register([entry]),
			);
		}
	}

	/**
	 * Removes every script this extension registered, for the global kill switch.
	 *
	 * @param report - The report to record errors in.
	 * @returns Nothing.
	 */
	static async _unregisterEverything(report: InjectionReport): Promise<void> {
		const contentScripts = await chrome.scripting.getRegisteredContentScripts();
		const ourContentScripts = contentScripts.filter((script) => InjectionRegistrar._isOurs(script.id));
		if (ourContentScripts.length > 0) {
			await InjectionRegistrar._record(report, () =>
				chrome.scripting.unregisterContentScripts({
					ids: ourContentScripts.map((script) => script.id),
				}),
			);
		}
		if (InjectionRegistrar._areUserScriptsAllowed() === false) {
			return;
		}
		const userScripts = await chrome.userScripts.getScripts();
		const ourUserScripts = userScripts.filter((script) => InjectionRegistrar._isOurs(script.id));
		if (ourUserScripts.length > 0) {
			await InjectionRegistrar._record(report, () =>
				chrome.userScripts.unregister({
					ids: ourUserScripts.map((script) => script.id),
				}),
			);
		}
	}

	/**
	 * Tells a registration this extension made from one somebody else made.
	 *
	 * @param identifier - The registration identifier Chrome reported.
	 * @returns `true` when this extension registered it.
	 */
	static _isOurs(identifier: string): boolean {
		return identifier.startsWith('webmcp_everywhere_');
	}

	/**
	 * Runs one registration call, keeping the reason rather than throwing.
	 *
	 * A registration that Chrome refuses must not stop the ones after it, or one bad adapter takes
	 * every other adapter down with it.
	 *
	 * @param report - The report to record the failure in.
	 * @param call - The call to make.
	 * @returns Nothing.
	 */
	static async _record(report: InjectionReport, call: () => Promise<unknown>): Promise<void> {
		try {
			await call();
		} catch (error) {
			report.errors.push(error instanceof Error ? error.message : String(error));
		}
	}
}

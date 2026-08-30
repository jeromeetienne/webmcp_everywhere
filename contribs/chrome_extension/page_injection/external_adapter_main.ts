import { LOADED_ADAPTER_GLOBAL } from '@webmcp_everywhere/site_adapter_lib';
import type { Adapter } from '@webmcp_everywhere/site_adapter_lib';
import { AdapterRegistry } from '../shared_state/adapter_registry.js';
import { MainWorldRuntime } from './main_world_runtime.js';

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	ExternalAdapterMain — the main world entry point for an adapter loaded from a folder
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/**
 * Starts the main world runtime with the adapter a user script put on the page.
 *
 * The service worker registers two pieces of code as one user script: the adapter's own bundle, which
 * assigns itself to `globalThis.__webmcpEverywhereLoadedAdapter`, and then this file, which picks the
 * adapter out of that bundle and hands it to the same runtime a bundled adapter uses. Registering them
 * as one user script is what makes the order certain; two separate registrations would race.
 *
 * Nothing here decides whether the adapter is acceptable. That was settled in the native messaging
 * host, which ran the same review checks `npm run build` runs, before the source ever reached the
 * extension.
 */
class ExternalAdapterMain {
	/**
	 * Finds the adapter inside the bundle the user script left on the page.
	 *
	 * The bundle exports whatever the author's file exported, so the adapter is recognised by its shape
	 * rather than by a name the author had to get right.
	 *
	 * @returns The adapter, or `null` when the bundle carries none.
	 */
	static _adapterFromBundle(): Adapter | null {
		const bundle = (globalThis as unknown as Record<string, unknown>)[LOADED_ADAPTER_GLOBAL];
		if (bundle === undefined || bundle === null || typeof bundle !== 'object') {
			return null;
		}
		for (const value of Object.values(bundle)) {
			if (value === null || typeof value !== 'object') {
				continue;
			}
			const candidate = value as Partial<Adapter>;
			if (typeof candidate.siteSlug === 'string' && Array.isArray(candidate.matchPatterns)) {
				return candidate as Adapter;
			}
		}
		return null;
	}
}

const loadedAdapter = ExternalAdapterMain._adapterFromBundle();
if (loadedAdapter !== null) {
	MainWorldRuntime.start((url) => {
		const matches = loadedAdapter.matchPatterns.some(
			(pattern) => AdapterRegistry._matches(pattern, url) === true,
		);
		return matches === true ? loadedAdapter : null;
	});
}

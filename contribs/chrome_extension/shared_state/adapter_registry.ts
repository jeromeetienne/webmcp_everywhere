import type { Adapter } from '@webmcp_everywhere/adapter_format';
// sync:adapters begin imports
import { caniuseAdapter } from '../../site_adapters/caniuse_com/caniuse_adapter.js';
import { todomvcAdapter } from '../../site_adapters/demo_playwright_dev/todomvc_adapter.js';
import { openStreetMapAdapter } from '../../site_adapters/openstreetmap_org/openstreetmap_adapter.js';
// sync:adapters end imports

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	AdapterRegistry — the adapters this build of the extension carries
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/**
 * Holds every adapter bundled into this build and picks the one that matches a page.
 *
 * Adapters are bundled rather than fetched, so this build has no supply chain to attack. Signing and a
 * registry arrive with the catalogue, and neither is in this slice.
 *
 * **The two blocks between the `sync:adapters` markers are written by `npm run sync:adapters`**, from
 * the folders under `contribs/site_adapters/`, together with the three match pattern lists in
 * `manifest.json`. Editing either block by hand is undone by the next run, and
 * `node --test tests/repository_layout/adapter_registry_sync.test.ts` refuses a working copy where they disagree.
 */
export class AdapterRegistry {
	/** Every adapter this build carries, one per folder under `contribs/site_adapters/`. */
	static readonly ADAPTERS: Adapter[] = [
		// sync:adapters begin adapters
		caniuseAdapter,
		todomvcAdapter,
		openStreetMapAdapter,
		// sync:adapters end adapters
	];

	/**
	 * Finds the adapter that applies to a page.
	 *
	 * @param url - The page's uniform resource locator.
	 * @returns The matching adapter, or `null` when no adapter covers this page.
	 */
	static findForUrl(url: string): Adapter | null {
		for (const adapter of AdapterRegistry.ADAPTERS) {
			for (const pattern of adapter.matchPatterns) {
				if (AdapterRegistry._matches(pattern, url) === true) {
					return adapter;
				}
			}
		}
		return null;
	}

	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////
	//	Helpers
	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////

	/**
	 * Tests one Chrome extension match pattern against a uniform resource locator.
	 *
	 * @param pattern - A match pattern such as `https://demo.playwright.dev/todomvc/*`.
	 * @param url - The uniform resource locator to test.
	 * @returns `true` when the pattern covers the uniform resource locator.
	 */
	static _matches(pattern: string, url: string): boolean {
		const escaped = pattern
			.replace(/[.+?^${}()|[\]\\]/g, '\\$&')
			.replace(/^\\\*/, '[^/]*')
			.replace(/\*/g, '.*');
		return new RegExp(`^${escaped}`).test(url);
	}
}

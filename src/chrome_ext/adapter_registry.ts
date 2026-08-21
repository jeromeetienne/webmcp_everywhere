import type { Adapter } from '../adapter_format/adapter_types.js';
import { todomvcAdapter } from '../adapters/demo_playwright_dev/todomvc_adapter.js';

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
 */
export class AdapterRegistry {
	/** Every adapter this build carries. */
	static readonly ADAPTERS: Adapter[] = [todomvcAdapter];

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

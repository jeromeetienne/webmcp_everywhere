import Fs from 'node:fs';
import Os from 'node:os';
import Path from 'node:path';
import type { LoadedAdapter } from '@webmcp_everywhere/site_adapter';

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	LoadedAdapterStore — the folder of adapters that were installed rather than bundled
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/**
 * Reads the adapters a user installed from their own folders.
 *
 * One file per adapter, written by `npm run load-adapter`, which is where the review checks run: the
 * schema, the permission audit, and the refusal of any network egress, exactly as `npm run build` runs
 * them over a bundled adapter. Nothing here checks anything, because by the time a file is in this
 * folder the checking has already happened and its outcome is what the file holds.
 *
 * The host reads this folder and hands what it finds to the extension. The extension cannot read a
 * folder, and it cannot run code to decide whether an adapter is acceptable, so this side of the
 * native messaging channel is where both of those have to happen.
 */
export class LoadedAdapterStore {
	/** Where installed adapters live, one JSON file each, named after the adapter's site slug. */
	static FOLDER =
		process.env.WEBMCP_EVERYWHERE_ADAPTERS_DIR ??
		Path.join(process.env.WEBMCP_EVERYWHERE_STATE_DIR ?? Path.join(Os.homedir(), '.webmcp_everywhere'), 'adapters');

	/**
	 * Reads every installed adapter.
	 *
	 * A file that cannot be read or parsed is skipped rather than thrown on, because one damaged file
	 * must not stop every other adapter from loading, and the host has no user to report it to.
	 *
	 * @returns Every adapter installed, ordered by site slug so that two runs agree.
	 */
	static read(): LoadedAdapter[] {
		if (Fs.existsSync(LoadedAdapterStore.FOLDER) === false) {
			return [];
		}
		const adapters: LoadedAdapter[] = [];
		for (const name of Fs.readdirSync(LoadedAdapterStore.FOLDER).sort()) {
			if (name.endsWith('.json') === false) {
				continue;
			}
			try {
				const parsed = JSON.parse(
					Fs.readFileSync(Path.join(LoadedAdapterStore.FOLDER, name), 'utf8'),
				) as LoadedAdapter;
				if (typeof parsed.siteSlug === 'string' && typeof parsed.source === 'string') {
					adapters.push(parsed);
				}
			} catch {
				// One unreadable file is skipped; the rest still load.
			}
		}
		return adapters;
	}

	/**
	 * Names the file one adapter is installed as.
	 *
	 * @param siteSlug - The adapter's site slug.
	 * @returns The path of that adapter's file, whether or not it exists.
	 */
	static pathFor(siteSlug: string): string {
		return Path.join(LoadedAdapterStore.FOLDER, `${siteSlug}.json`);
	}
}

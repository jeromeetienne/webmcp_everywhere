import Fs from 'node:fs';
import { LoadedAdapterStore } from '../src/native_messaging_host/loaded_adapter_store.ts';

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	UnloadAdapter — takes an installed adapter back out again
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

const __filename = import.meta.filename;
const __dirname = import.meta.dirname;

/**
 * Removes an adapter installed by `npm run load-adapter`.
 *
 * Every way of installing something needs a way back, and the way back has to be as easy to find as
 * the way in. Switching an adapter off in the popup stops it running; this removes it altogether.
 */
export class UnloadAdapter {
	/**
	 * Removes one installed adapter.
	 *
	 * @param siteSlug - The adapter to remove, named as its site slug.
	 * @returns Where the file was, and whether it was there.
	 */
	static run(siteSlug: string): { path: string; wasInstalled: boolean } {
		const path = LoadedAdapterStore.pathFor(siteSlug);
		const wasInstalled = Fs.existsSync(path);
		Fs.rmSync(path, {
			force: true,
		});
		return {
			path: path,
			wasInstalled: wasInstalled,
		};
	}
}

if (import.meta.filename === process.argv[1]) {
	const siteSlug = process.argv[2];
	if (siteSlug === undefined) {
		const installed = LoadedAdapterStore.read().map((adapter) => adapter.siteSlug);
		console.error('usage: npm run unload-adapter -- <site slug>');
		console.error(installed.length === 0 ? '  nothing is installed' : `  installed: ${installed.join(', ')}`);
		process.exit(1);
	}

	const result = UnloadAdapter.run(siteSlug);
	console.log(result.wasInstalled === true ? `removed ${result.path}` : `nothing was installed at ${result.path}`);
}

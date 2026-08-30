///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	AdapterRegistrySyncTest — that the registry and the manifest still match the folders
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

import Fs from 'node:fs';
import Path from 'node:path';
import NodeTest from 'node:test';
import { SyncAdapterRegistry } from '../../tools/sync_adapter_registry.ts';

const __filename = import.meta.filename;
const __dirname = import.meta.dirname;

/**
 * Checks that an adapter folder is still the only thing an adapter author adds.
 *
 * Registering an adapter used to be four hand edits, and forgetting one of them registered an adapter
 * that never ran, with nothing anywhere saying so. `npm run sync:adapters` writes the registry now,
 * and the extension manifest names no site at all, so these checks are what keeps both true: a working
 * copy where the committed registry and the folders disagree fails here, naming the command to fix it,
 * and a manifest that has started listing sites again fails here too.
 *
 * No browser is started. The subject is the source folder and the files on disk.
 */
class AdapterRegistrySyncTest {
	/** The repository root, worked out from this file's own location. */
	static readonly REPOSITORY_ROOT = Path.join(__dirname, '..', '..');

	/** Where the adapters live, one folder each. */
	static readonly SITE_ADAPTERS_DIR = Path.join(
		AdapterRegistrySyncTest.REPOSITORY_ROOT,
		'src',
		'site_adapters',
	);

	/** Where the verification runners live, one file per adapter folder. */
	static readonly SITE_RUNNERS_DIR = Path.join(
		AdapterRegistrySyncTest.REPOSITORY_ROOT,
		'tests',
		'site_adapters',
	);

	/**
	 * Reads the extension manifest as it stands on disk.
	 *
	 * @returns The three match pattern lists, and nothing else this file needs.
	 */
	static readManifest(): {
		permissions: string[];
		host_permissions: string[];
		content_scripts?: Array<{ world: string; matches: string[] }>;
	} {
		const manifestPath = Path.join(
			AdapterRegistrySyncTest.REPOSITORY_ROOT,
			'src',
			'chrome_extension',
			'manifest.json',
		);
		return JSON.parse(Fs.readFileSync(manifestPath, 'utf8'));
	}
}

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	Checks
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

NodeTest.test('the committed registry matches the adapter folders', async (t) => {
	const outOfDate = await SyncAdapterRegistry.findOutOfDate();

	if (outOfDate.length > 0) {
		throw new Error(
			`${outOfDate.join(' and ')} no longer matches the folders under src/site_adapters/. ` +
				'Run: npm run sync:adapters',
		);
	}
	t.diagnostic('the registry is what the adapter folders say it should be');
});

NodeTest.test('every adapter folder holds one adapter whose slug is its folder name', async (t) => {
	const adapters = await SyncAdapterRegistry.discover();

	if (adapters.length === 0) {
		throw new Error('no adapter was found under src/site_adapters/, and the extension carries none');
	}
	for (const adapter of adapters) {
		if (adapter.siteSlug !== adapter.folderName) {
			throw new Error(`${adapter.folderName} holds an adapter calling itself ${adapter.siteSlug}`);
		}
	}
	t.diagnostic(`${adapters.length} adapters: ${adapters.map((adapter) => adapter.siteSlug).join(', ')}`);
});

NodeTest.test('the extension manifest names no site at all', async (t) => {
	const manifest = AdapterRegistrySyncTest.readManifest();

	if (manifest.content_scripts !== undefined) {
		throw new Error(
			'the manifest declares content scripts again. The service worker registers them per adapter ' +
				'when the user switches that adapter on, so a static list here would ask every user for ' +
				'every site in the catalogue at install time.',
		);
	}
	for (const pattern of manifest.host_permissions) {
		if (pattern !== '*://*/*') {
			throw new Error(
				`host_permissions names ${pattern}. It names no site, only *://*/*, because a list that ` +
					'grows with the catalogue is re-reviewed by the extension store and re-installed by ' +
					'every user for each new adapter.',
			);
		}
	}
	for (const needed of ['scripting', 'userScripts']) {
		if (manifest.permissions.includes(needed) === false) {
			throw new Error(`the manifest is missing the ${needed} permission, which nothing can register without`);
		}
	}
	t.diagnostic('the manifest names no site, and can register scripts and user scripts at runtime');
});

NodeTest.test('every adapter folder has a verification runner named after it', async (t) => {
	const adapters = await SyncAdapterRegistry.discover();
	const missing: string[] = [];

	for (const adapter of adapters) {
		const adapterFile = Path.basename(adapter.importPath).replace(/\.js$/, '');
		const runnerName = SyncAdapterRegistry.runnerFileNameFor(adapterFile);
		const runnerPath = Path.join(AdapterRegistrySyncTest.SITE_RUNNERS_DIR, runnerName);
		if (Fs.existsSync(runnerPath) === false) {
			missing.push(`${adapter.siteSlug} has no tests/site_adapters/${runnerName}`);
		}
	}

	if (missing.length > 0) {
		throw new Error(missing.join('; '));
	}
	t.diagnostic(`${adapters.length} adapters, each with its own runner in tests/site_adapters/`);
});

NodeTest.test('every adapter folder carries its own CONTEXT.md and README.md', async (t) => {
	const adapters = await SyncAdapterRegistry.discover();
	const missing: string[] = [];

	for (const adapter of adapters) {
		for (const document of ['CONTEXT.md', 'README.md']) {
			const path = Path.join(AdapterRegistrySyncTest.SITE_ADAPTERS_DIR, adapter.folderName, document);
			if (Fs.existsSync(path) === false) {
				missing.push(`src/site_adapters/${adapter.folderName}/${document}`);
			}
		}
	}

	if (missing.length > 0) {
		throw new Error(`missing: ${missing.join(', ')}`);
	}
	t.diagnostic(`${adapters.length} adapters, each with its rules and its own README.md`);
});

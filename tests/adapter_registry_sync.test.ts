///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	AdapterRegistrySyncTest — that the registry and the manifest still match the folders
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

import Fs from 'node:fs';
import Path from 'node:path';
import NodeTest from 'node:test';
import { SyncAdapterRegistry } from '../tools/sync_adapter_registry.ts';

const __filename = import.meta.filename;
const __dirname = import.meta.dirname;

/**
 * Checks the four places an adapter has to appear, and that they still agree with each other.
 *
 * Registering an adapter used to be four hand edits, and forgetting the third of them — the match
 * patterns in the second `content_scripts` entry — registered an adapter that never ran, with nothing
 * anywhere saying so. `npm run sync:adapters` writes all four now, and these checks are what makes
 * running it obligatory rather than optional: a working copy where the committed files and the folders
 * disagree fails here, naming the command to fix it.
 *
 * No browser is started. The subject is the source folder and two generated files on disk.
 */
class AdapterRegistrySyncTest {
	/** The repository root, worked out from this file's own location. */
	static readonly REPOSITORY_ROOT = Path.join(__dirname, '..');

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
	static readManifest(): { host_permissions: string[]; content_scripts: Array<{ world: string; matches: string[] }> } {
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

NodeTest.test('the committed registry and manifest match the adapter folders', async (t) => {
	const outOfDate = await SyncAdapterRegistry.findOutOfDate();

	if (outOfDate.length > 0) {
		throw new Error(
			`${outOfDate.join(' and ')} no longer match the folders under src/site_adapters/. ` +
				'Run: npm run sync:adapters',
		);
	}
	t.diagnostic('the registry and the manifest are what the adapter folders say they should be');
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

NodeTest.test('every match pattern is in all three lists in the manifest', async (t) => {
	const adapters = await SyncAdapterRegistry.discover();
	const manifest = AdapterRegistrySyncTest.readManifest();

	if (manifest.content_scripts.length !== 2) {
		throw new Error(`the manifest holds ${manifest.content_scripts.length} content script entries, expected 2`);
	}
	for (const adapter of adapters) {
		for (const pattern of adapter.matchPatterns) {
			if (manifest.host_permissions.includes(pattern) === false) {
				throw new Error(`${pattern} of ${adapter.siteSlug} is missing from host_permissions`);
			}
			for (const contentScript of manifest.content_scripts) {
				if (contentScript.matches.includes(pattern) === false) {
					throw new Error(
						`${pattern} of ${adapter.siteSlug} is missing from the ${contentScript.world} content script, ` +
							'so that adapter would be registered and never run',
					);
				}
			}
		}
	}
	t.diagnostic(`${manifest.host_permissions.length} match patterns, in all three lists`);
});

NodeTest.test('every adapter folder has a verification runner named after it', async (t) => {
	const adapters = await SyncAdapterRegistry.discover();
	const missing: string[] = [];

	for (const adapter of adapters) {
		const adapterFile = Path.basename(adapter.importPath).replace(/\.js$/, '');
		const runnerName = `${adapterFile.replace(/_adapter$/, '')}.test.ts`;
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

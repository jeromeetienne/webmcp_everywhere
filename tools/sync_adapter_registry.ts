import ChildProcess from 'node:child_process';
import Esbuild from 'esbuild';
import Fs from 'node:fs';
import Path from 'node:path';

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	SyncAdapterRegistry — writes the registry and the manifest from the adapter folders
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

const __filename = import.meta.filename;
const __dirname = import.meta.dirname;

const repositoryRoot = Path.join(__dirname, '..');
const siteAdaptersDir = Path.join(repositoryRoot, 'src', 'site_adapters');
const registryPath = Path.join(
	repositoryRoot,
	'src',
	'chrome_extension',
	'shared_state',
	'adapter_registry.ts',
);
const manifestPath = Path.join(repositoryRoot, 'src', 'chrome_extension', 'manifest.json');
const tsconfigPath = Path.join(repositoryRoot, 'tsconfig.json');
const probePath = Path.join(repositoryRoot, 'build', '.probe_adapters.mjs');

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	Types
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/** One adapter found under `src/site_adapters/`, and everything the two written files need from it. */
export type DiscoveredAdapter = {
	/** The folder the adapter lives in, which must equal its own `siteSlug`. */
	folderName: string;
	/** The path `adapter_registry.ts` imports it by, written the way that file writes its imports. */
	importPath: string;
	/** The name the adapter is exported under. */
	exportName: string;
	/** The adapter's own site slug, read from the adapter rather than from the folder name. */
	siteSlug: string;
	/** The adapter's human-readable site name, used only in the report this tool prints. */
	siteName: string;
	/** The match patterns that activate it, which become the manifest's three lists. */
	matchPatterns: string[];
};

/** What the two written files should hold, given the folders that exist right now. */
export type RenderedFiles = {
	/** Every adapter found, in the order the two files list them. */
	adapters: DiscoveredAdapter[];
	/** What `src/chrome_extension/shared_state/adapter_registry.ts` should hold. */
	registrySource: string;
	/** What `src/chrome_extension/manifest.json` should hold. */
	manifestSource: string;
};

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	SyncAdapterRegistry
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/**
 * Writes the adapter registry and the extension manifest from the folders under `src/site_adapters/`.
 *
 * Registering an adapter used to be four hand edits: the registry, and the match patterns in all three
 * lists in the manifest. Forgetting the third list registered an adapter that never ran, and nothing
 * said so. Now the folder is the only thing an author adds, and this tool writes the four places.
 *
 * Nothing is picked up silently, which is the property the four hand edits were protecting. This tool
 * runs when a person asks it to, its output is committed, and `tests/adapter_registry_sync.test.ts`
 * refuses a working copy where the committed files and the folders disagree. So the change still
 * arrives as a diff a reviewer reads, and it is no longer a diff an author writes by hand.
 */
export class SyncAdapterRegistry {
	/** The line that opens the generated import block in `adapter_registry.ts`. */
	static readonly IMPORTS_BEGIN = '// sync:adapters begin imports';

	/** The line that closes the generated import block in `adapter_registry.ts`. */
	static readonly IMPORTS_END = '// sync:adapters end imports';

	/** The line that opens the generated adapter list in `adapter_registry.ts`. */
	static readonly ADAPTERS_BEGIN = '\t\t// sync:adapters begin adapters';

	/** The line that closes the generated adapter list in `adapter_registry.ts`. */
	static readonly ADAPTERS_END = '\t\t// sync:adapters end adapters';

	/**
	 * Finds every adapter under `src/site_adapters/` and reads what the two written files need.
	 *
	 * The values are read out of the adapters themselves rather than parsed out of their source, so an
	 * adapter that builds its match patterns from a constant is read correctly.
	 *
	 * @returns One entry per adapter, ordered by folder name so that two runs agree.
	 * @throws When an adapter folder holds no adapter, or its slug disagrees with its folder name.
	 */
	static async discover(): Promise<DiscoveredAdapter[]> {
		const adapterFiles = SyncAdapterRegistry._adapterFiles();
		const probed = SyncAdapterRegistry._probe(adapterFiles);
		const discovered: DiscoveredAdapter[] = [];

		for (const entry of probed) {
			const folderName = Path.basename(Path.dirname(entry.file));
			if (entry.siteSlug !== folderName) {
				throw new Error(
					`${entry.file} declares siteSlug ${entry.siteSlug} but sits in the folder ${folderName}; ` +
						'the two have to agree, because the tool names are namespaced by the slug',
				);
			}
			const withoutExtension = entry.file.replace(/\.ts$/, '.js');
			discovered.push({
				folderName: folderName,
				importPath: `../../site_adapters/${folderName}/${Path.basename(withoutExtension)}`,
				exportName: entry.exportName,
				siteSlug: entry.siteSlug,
				siteName: entry.siteName,
				matchPatterns: entry.matchPatterns,
			});
		}

		return discovered;
	}

	/**
	 * Works out what the two written files should hold.
	 *
	 * @returns The adapters found, and the text each of the two files should hold.
	 */
	static async render(): Promise<RenderedFiles> {
		const adapters = await SyncAdapterRegistry.discover();
		return {
			adapters: adapters,
			registrySource: SyncAdapterRegistry._renderRegistry(adapters),
			manifestSource: SyncAdapterRegistry._renderManifest(adapters),
		};
	}

	/**
	 * Writes the two files, and reports which of them actually changed.
	 *
	 * @returns The adapters found, and the paths that were rewritten.
	 */
	static async run(): Promise<{ adapters: DiscoveredAdapter[]; written: string[] }> {
		const rendered = await SyncAdapterRegistry.render();
		const written: string[] = [];

		for (const [path, source] of [
			[registryPath, rendered.registrySource],
			[manifestPath, rendered.manifestSource],
		] as Array<[string, string]>) {
			if (Fs.readFileSync(path, 'utf8') === source) {
				continue;
			}
			Fs.writeFileSync(path, source);
			written.push(Path.relative(repositoryRoot, path));
		}

		return {
			adapters: rendered.adapters,
			written: written,
		};
	}

	/**
	 * Reports which committed files disagree with the folders, without writing anything.
	 *
	 * @returns The paths that are out of date, empty when the two written files are correct.
	 */
	static async findOutOfDate(): Promise<string[]> {
		const rendered = await SyncAdapterRegistry.render();
		const outOfDate: string[] = [];

		if (Fs.readFileSync(registryPath, 'utf8') !== rendered.registrySource) {
			outOfDate.push(Path.relative(repositoryRoot, registryPath));
		}
		if (Fs.readFileSync(manifestPath, 'utf8') !== rendered.manifestSource) {
			outOfDate.push(Path.relative(repositoryRoot, manifestPath));
		}

		return outOfDate;
	}

	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////
	//	Helpers
	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////

	/**
	 * Lists the adapter file of every folder under `src/site_adapters/`.
	 *
	 * @returns One path per adapter, relative to the repository root, ordered by folder name.
	 * @throws When a folder holds no adapter file, or holds more than one.
	 */
	static _adapterFiles(): string[] {
		const folders = Fs.readdirSync(siteAdaptersDir, {
			withFileTypes: true,
		})
			.filter((entry) => entry.isDirectory() === true)
			.map((entry) => entry.name)
			.sort();

		const files: string[] = [];
		for (const folder of folders) {
			const candidates = Fs.readdirSync(Path.join(siteAdaptersDir, folder)).filter((name) =>
				name.endsWith('_adapter.ts'),
			);
			if (candidates.length !== 1) {
				throw new Error(
					`src/site_adapters/${folder}/ holds ${candidates.length} files ending in _adapter.ts, ` +
						'and every adapter folder holds exactly one',
				);
			}
			files.push(`src/site_adapters/${folder}/${candidates[0]}`);
		}
		return files;
	}

	/**
	 * Reads the slug, the name, the export name, and the match patterns out of every adapter.
	 *
	 * The adapters are bundled and then run, rather than imported, for the same reason the review checks
	 * are: they import each other with a `.js` extension for the browser, and Node.js cannot resolve
	 * that from a `.ts` file on disk.
	 *
	 * @param adapterFiles - The adapter files to read, relative to the repository root.
	 * @returns What each adapter says about itself.
	 * @throws When a file exports nothing that looks like an adapter.
	 */
	static _probe(
		adapterFiles: string[],
	): Array<{ file: string; exportName: string; siteSlug: string; siteName: string; matchPatterns: string[] }> {
		const imports = adapterFiles
			.map((file, index) => `import * as module${index} from ${JSON.stringify(Path.join(repositoryRoot, file))};`)
			.join('\n');
		const entries = adapterFiles
			.map((file, index) => `\t{ file: ${JSON.stringify(file)}, module: module${index} }`)
			.join(',\n');
		const probeSource = [
			imports,
			'const found = [];',
			`for (const entry of [\n${entries}\n]) {`,
			'\tconst named = Object.entries(entry.module).find(([, value]) =>',
			"\t\tvalue !== null && typeof value === 'object' &&",
			"\t\ttypeof value.siteSlug === 'string' && Array.isArray(value.matchPatterns));",
			'\tif (named === undefined) {',
			'\t\tthrow new Error(`${entry.file} exports nothing that looks like an adapter`);',
			'\t}',
			'\tconst [exportName, adapter] = named;',
			'\tfound.push({',
			'\t\tfile: entry.file,',
			'\t\texportName: exportName,',
			'\t\tsiteSlug: adapter.siteSlug,',
			'\t\tsiteName: adapter.siteName,',
			'\t\tmatchPatterns: adapter.matchPatterns,',
			'\t});',
			'}',
			'console.log(JSON.stringify(found));',
		].join('\n');

		const probeEntryPath = `${probePath}.entry.mjs`;
		Fs.mkdirSync(Path.dirname(probePath), {
			recursive: true,
		});
		Fs.writeFileSync(probeEntryPath, probeSource);

		try {
			Esbuild.buildSync({
				entryPoints: [probeEntryPath],
				outfile: probePath,
				bundle: true,
				format: 'esm',
				platform: 'node',
				target: 'node20',
				tsconfig: tsconfigPath,
				logLevel: 'warning',
			});
			const run = ChildProcess.spawnSync(process.execPath, [probePath], {
				encoding: 'utf8',
			});
			if (run.status !== 0) {
				throw new Error(`reading the adapters failed:\n${run.stderr}`);
			}
			return JSON.parse(run.stdout);
		} finally {
			Fs.rmSync(probeEntryPath, {
				force: true,
			});
			Fs.rmSync(probePath, {
				force: true,
			});
		}
	}

	/**
	 * Rewrites the two generated blocks of `adapter_registry.ts` and leaves the rest of the file alone.
	 *
	 * @param adapters - The adapters found.
	 * @returns What the file should hold.
	 */
	static _renderRegistry(adapters: DiscoveredAdapter[]): string {
		const current = Fs.readFileSync(registryPath, 'utf8');
		const importLines = adapters.map(
			(adapter) => `import { ${adapter.exportName} } from '${adapter.importPath}';`,
		);
		const adapterLines = adapters.map((adapter) => `\t\t${adapter.exportName},`);

		const withImports = SyncAdapterRegistry._replaceRegion(
			current,
			SyncAdapterRegistry.IMPORTS_BEGIN,
			SyncAdapterRegistry.IMPORTS_END,
			importLines,
		);
		return SyncAdapterRegistry._replaceRegion(
			withImports,
			SyncAdapterRegistry.ADAPTERS_BEGIN,
			SyncAdapterRegistry.ADAPTERS_END,
			adapterLines,
		);
	}

	/**
	 * Writes every adapter's match patterns into the three lists the manifest keeps them in.
	 *
	 * The three lists have to agree: `host_permissions` is what the extension may reach, and the two
	 * `content_scripts` entries are the pages the main-world and isolated-world scripts run on. An
	 * adapter missing from any one of them never runs.
	 *
	 * @param adapters - The adapters found.
	 * @returns What the file should hold.
	 */
	static _renderManifest(adapters: DiscoveredAdapter[]): string {
		const patterns: string[] = [];
		for (const adapter of adapters) {
			for (const pattern of adapter.matchPatterns) {
				if (patterns.includes(pattern) === false) {
					patterns.push(pattern);
				}
			}
		}

		const manifest = JSON.parse(Fs.readFileSync(manifestPath, 'utf8')) as {
			host_permissions: string[];
			content_scripts: Array<{ matches: string[] }>;
		};
		manifest.host_permissions = patterns;
		for (const contentScript of manifest.content_scripts) {
			contentScript.matches = patterns;
		}

		return `${JSON.stringify(manifest, null, '\t')}\n`;
	}

	/**
	 * Replaces the lines between two markers, keeping the markers themselves.
	 *
	 * @param source - The file text to rewrite.
	 * @param beginMarker - The line that opens the region.
	 * @param endMarker - The line that closes the region.
	 * @param lines - The lines to put between them.
	 * @returns The rewritten text.
	 * @throws When either marker is missing, or they are the wrong way round.
	 */
	static _replaceRegion(source: string, beginMarker: string, endMarker: string, lines: string[]): string {
		const begin = source.indexOf(beginMarker);
		const end = source.indexOf(endMarker);
		if (begin === -1 || end === -1 || end < begin) {
			throw new Error(
				`adapter_registry.ts is missing the markers ${beginMarker.trim()} and ${endMarker.trim()}, ` +
					'which is where this tool writes',
			);
		}
		const before = source.slice(0, begin + beginMarker.length);
		const after = source.slice(end);
		return `${before}\n${lines.join('\n')}\n${after}`;
	}
}

if (import.meta.filename === process.argv[1]) {
	const result = await SyncAdapterRegistry.run();
	for (const adapter of result.adapters) {
		console.log(`  ${adapter.siteSlug}: ${adapter.matchPatterns.length} match patterns (${adapter.siteName})`);
	}
	if (result.written.length === 0) {
		console.log('the registry and the manifest already match the adapter folders, nothing written');
	} else {
		for (const path of result.written) {
			console.log(`wrote: ${path}`);
		}
	}
}

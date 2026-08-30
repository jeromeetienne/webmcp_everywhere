import Esbuild from 'esbuild';
import Fs from 'node:fs';
import Path from 'node:path';
import ChildProcess from 'node:child_process';
import { LOADED_ADAPTER_GLOBAL } from '@webmcp_everywhere/site_adapter_lib';
import type { LoadedAdapter } from '@webmcp_everywhere/site_adapter_lib';
import { LoadedAdapterStore } from '@webmcp_everywhere/native_messaging_host';

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	LoadAdapter — checks an adapter folder and installs it for the browser to run
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

const __filename = import.meta.filename;
const __dirname = import.meta.dirname;

const repositoryRoot = Path.join(__dirname, '..', '..', '..');
const tsconfigPath = Path.join(repositoryRoot, 'tsconfig.json');

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	Types
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/** What one installation produced, or refused to produce. */
export type LoadAdapterResult = {
	/** Whether the adapter passed every check and was installed. */
	isInstalled: boolean;
	/** The adapter's site slug, absent when the folder held nothing readable. */
	siteSlug?: string;
	/** Where the adapter's file was written, when it was installed. */
	installedAt?: string;
	/** Every reason the adapter was refused. Empty when it was installed. */
	problems: string[];
	/** One line per tool, for the person running the command to read before trusting it. */
	tools: string[];
};

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	LoadAdapter
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/**
 * Installs an adapter written outside this repository, after putting it through the same checks a
 * bundled adapter goes through.
 *
 * This is the step that makes an adapter usable without rebuilding the extension. It exists as a
 * command rather than as something the browser does, for two reasons that both matter. The checks are
 * Node.js code that has to run an adapter to inspect it, and a Chrome extension may not run code it
 * did not ship. And installing somebody else's code to run inside your own logged-in sessions should
 * be a thing you did on purpose, at a moment you chose, with the tool list printed in front of you.
 */
export class LoadAdapter {
	/**
	 * Checks one adapter folder and installs it when it passes.
	 *
	 * @param folder - The folder holding the adapter, which must hold exactly one `*_adapter.ts` file.
	 * @returns What was installed, or every reason it was refused.
	 */
	static async run(folder: string): Promise<LoadAdapterResult> {
		const resolved = Path.resolve(folder);
		if (Fs.existsSync(resolved) === false) {
			return {
				isInstalled: false,
				problems: [`${resolved} does not exist`],
				tools: [],
			};
		}

		const adapterFile = LoadAdapter._adapterFileIn(resolved);
		if (typeof adapterFile !== 'string') {
			return {
				isInstalled: false,
				problems: [adapterFile.problem],
				tools: [],
			};
		}

		const reviewed = LoadAdapter._review(adapterFile);
		if (reviewed.problems.length > 0) {
			return {
				isInstalled: false,
				siteSlug: reviewed.siteSlug,
				problems: reviewed.problems,
				tools: reviewed.tools.map((tool) => `${tool.permissionClass} ${tool.name}`),
			};
		}

		const source = await LoadAdapter._bundleForBrowser(adapterFile);
		const record: LoadedAdapter = {
			siteSlug: reviewed.siteSlug,
			siteName: reviewed.siteName,
			matchPatterns: reviewed.matchPatterns,
			metadata: reviewed.metadata,
			tools: reviewed.tools,
			sourceFolder: resolved,
			source: source,
		};

		Fs.mkdirSync(LoadedAdapterStore.FOLDER, {
			recursive: true,
		});
		const installedAt = LoadedAdapterStore.pathFor(record.siteSlug);
		Fs.writeFileSync(installedAt, `${JSON.stringify(record, null, '\t')}\n`);

		return {
			isInstalled: true,
			siteSlug: record.siteSlug,
			installedAt: installedAt,
			problems: [],
			tools: record.tools.map((tool) => `${tool.permissionClass} ${tool.name}`),
		};
	}

	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////
	//	Helpers
	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////

	/**
	 * Finds the one adapter file in a folder.
	 *
	 * @param folder - The folder to look in.
	 * @returns The file's path, or the reason there is not exactly one.
	 */
	static _adapterFileIn(folder: string): string | { problem: string } {
		const candidates = Fs.readdirSync(folder).filter(
			(name) => name.endsWith('_adapter.ts') === true || name.endsWith('_adapter.js') === true,
		);
		if (candidates.length !== 1) {
			return {
				problem:
					`${folder} holds ${candidates.length} files ending in _adapter.ts or _adapter.js, ` +
					'and an adapter folder holds exactly one',
			};
		}
		return Path.join(folder, candidates[0]);
	}

	/**
	 * Runs the review checks over the adapter, in a Node.js process of its own.
	 *
	 * The checks live in `packages/site_adapter_lib/tools/` and read types that assume a browser, so they are
	 * bundled before they run, exactly as `npm run build` bundles them. Running them in a child process
	 * rather than importing them keeps an adapter's own top-level code out of this process.
	 *
	 * @param adapterFile - The adapter file to check.
	 * @returns What the adapter says about itself, and every reason it was refused.
	 */
	static _review(adapterFile: string): {
		siteSlug: string;
		siteName: string;
		matchPatterns: string[];
		metadata: LoadedAdapter['metadata'];
		tools: LoadedAdapter['tools'];
		problems: string[];
	} {
		const reviewerPath = Path.join(repositoryRoot, 'dist', '.review_loaded_adapter.mjs');
		const entryPath = `${reviewerPath}.entry.mjs`;
		Fs.mkdirSync(Path.dirname(reviewerPath), {
			recursive: true,
		});
		Fs.writeFileSync(entryPath, LoadAdapter._reviewerSource(adapterFile));

		try {
			Esbuild.buildSync({
				entryPoints: [entryPath],
				outfile: reviewerPath,
				bundle: true,
				format: 'esm',
				platform: 'node',
				target: 'node20',
				tsconfig: tsconfigPath,
				logLevel: 'warning',
			});
			const run = ChildProcess.spawnSync(process.execPath, [reviewerPath], {
				encoding: 'utf8',
			});
			if (run.status !== 0) {
				return {
					siteSlug: '',
					siteName: '',
					matchPatterns: [],
					metadata: {
						author: '',
						version: '',
						adapterFormatVersion: '',
						targetSiteVerifiedOn: '',
					},
					tools: [],
					problems: [`the adapter could not be read:\n${run.stderr.trim()}`],
				};
			}
			return JSON.parse(run.stdout);
		} finally {
			Fs.rmSync(entryPath, {
				force: true,
			});
			Fs.rmSync(reviewerPath, {
				force: true,
			});
		}
	}

	/**
	 * Writes the program that reviews one adapter and prints what it found.
	 *
	 * @param adapterFile - The adapter file to review.
	 * @returns The program's source.
	 */
	static _reviewerSource(adapterFile: string): string {
		const checksDir = Path.join(repositoryRoot, 'packages', 'site_adapter_lib', 'tools');
		const schemaPath = Path.join(checksDir, 'adapter_schema.ts');
		const auditPath = Path.join(checksDir, 'permission_audit.ts');
		return [
			`import * as module from ${JSON.stringify(adapterFile)};`,
			`import { AdapterSchema } from ${JSON.stringify(schemaPath)};`,
			`import { PermissionAudit } from ${JSON.stringify(auditPath)};`,
			'const adapter = Object.values(module).find((value) =>',
			"	value !== null && typeof value === 'object' &&",
			"	typeof value.siteSlug === 'string' && Array.isArray(value.matchPatterns));",
			'if (adapter === undefined) {',
			'	throw new Error("this file exports nothing that looks like an adapter");',
			'}',
			'const problems = [];',
			'const validation = AdapterSchema.validate(adapter);',
			'problems.push(...validation.errors);',
			'for (const finding of PermissionAudit.auditAdapter(adapter)) {',
			'	problems.push(`${finding.toolName} declares ${finding.declared} but ${finding.evidence.join(", ")}`);',
			'}',
			'for (const offence of PermissionAudit.findNetworkEgress(adapter)) {',
			'	problems.push(`${offence}, and no adapter may reach the network`);',
			'}',
			'console.log(JSON.stringify({',
			'	siteSlug: adapter.siteSlug,',
			'	siteName: adapter.siteName,',
			'	matchPatterns: adapter.matchPatterns,',
			'	metadata: adapter.metadata,',
			'	tools: (adapter.tools ?? []).map((tool) => ({',
			'		name: tool.name,',
			'		title: tool.title,',
			'		description: tool.description,',
			'		permissionClass: tool.permissionClass,',
			'	})),',
			'	problems: problems,',
			'}));',
		].join('\n');
	}

	/**
	 * Bundles the adapter into the one piece of code the page will run.
	 *
	 * It is an immediately invoked function expression assigning itself to a global, because a user
	 * script is not a module and has nowhere else to put its exports.
	 *
	 * @param adapterFile - The adapter file to bundle.
	 * @returns The bundled source.
	 */
	static async _bundleForBrowser(adapterFile: string): Promise<string> {
		const built = await Esbuild.build({
			entryPoints: [adapterFile],
			bundle: true,
			write: false,
			format: 'iife',
			globalName: LOADED_ADAPTER_GLOBAL,
			target: 'chrome120',
			platform: 'browser',
			tsconfig: tsconfigPath,
			logLevel: 'warning',
		});
		return built.outputFiles[0].text;
	}
}

if (import.meta.filename === process.argv[1]) {
	const folder = process.argv[2];
	if (folder === undefined) {
		console.error('usage: npm run load-adapter -- <folder holding one adapter>');
		process.exit(1);
	}

	const result = await LoadAdapter.run(folder);
	for (const line of result.tools) {
		console.log(`  ${line}`);
	}
	if (result.isInstalled === false) {
		for (const problem of result.problems) {
			console.error(`  REFUSED ${problem}`);
		}
		process.exit(1);
	}
	console.log(`installed ${result.siteSlug} as ${result.installedAt}`);
	console.log('');
	console.log('It is switched off until you turn it on in the extension popup, because nobody here');
	console.log('reviewed it. Adapters loaded from a folder also need "Allow User Scripts" turned on');
	console.log('for this extension at chrome://extensions, and a browser restart to pick them up.');
}

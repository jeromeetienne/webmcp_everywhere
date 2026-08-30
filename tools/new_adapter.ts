import ChildProcess from 'node:child_process';
import Fs from 'node:fs';
import Path from 'node:path';
import { ADAPTER_FORMAT_VERSION } from '@webmcp_everywhere/adapter_format';
import { SyncAdapterRegistry } from './sync_adapter_registry.ts';

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	NewAdapter — writes the folder, the runner, and the two documents for a new site
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

const __filename = import.meta.filename;
const __dirname = import.meta.dirname;

const repositoryRoot = Path.join(__dirname, '..');

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	Types
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/** Every name the scaffold needs, worked out once from the address the author gave. */
export type AdapterNames = {
	/** The origin the adapter covers, such as `https://example.com`. */
	origin: string;
	/** The match pattern the adapter activates on. */
	matchPattern: string;
	/** The folder under `src/site_adapters/`, which is also the adapter's `siteSlug`. */
	siteSlug: string;
	/** The site's human-readable name, which the author is expected to correct. */
	siteName: string;
	/** The short name the adapter file, the page class, and the runner are all named after. */
	shortName: string;
	/** The adapter file, such as `example_adapter.ts`. */
	adapterFileName: string;
	/** The exported adapter, such as `exampleAdapter`. */
	adapterExportName: string;
	/** The page-reading class, such as `ExamplePage`. */
	pageClassName: string;
	/** The verification runner under `tests/site_adapters/`, such as `example.test.ts`. */
	runnerFileName: string;
	/** The class the runner's own helpers live in, such as `ExampleTest`. */
	runnerClassName: string;
};

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	NewAdapter
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/**
 * Writes everything a new site needs, already passing the build.
 *
 * The first adapter somebody writes used to start from a blank file and a guide, and the cost was
 * measured in days. Most of that cost was not the site: it was working out what the folder is called,
 * which of five files the tool definition goes in, what the format version is, and what a runner looks
 * like. None of that is the author's problem, so this writes all of it, and then runs
 * `npm run sync:adapters` so the new adapter is registered before the author has typed anything.
 *
 * What it deliberately does not write is any knowledge of the site. Every existing adapter earns its
 * rules by probing the live site first, and a scaffold that guessed a selector would be teaching the
 * opposite of that.
 */
export class NewAdapter {
	/**
	 * Works out every name from the address the author gave.
	 *
	 * @param address - The site, as a full address or a bare host name.
	 * @param shortName - The short name to build the file names from, or nothing to take the first label
	 *                    of the host.
	 * @returns Every name the scaffold writes.
	 * @throws When the address names no host.
	 */
	static namesFor(address: string, shortName?: string): AdapterNames {
		const withScheme = address.includes('://') === true ? address : `https://${address}`;
		let host: string;
		try {
			host = new URL(withScheme).host;
		} catch {
			throw new Error(`${address} is not an address this can read`);
		}
		if (host.length === 0) {
			throw new Error(`${address} names no host`);
		}

		const bareHost = host.replace(/^www\./, '');
		const siteSlug = bareHost.replace(/[^a-z0-9]+/gi, '_').toLowerCase();
		const chosenShortName = (shortName ?? bareHost.split('.')[0]).replace(/[^a-z0-9]+/gi, '_').toLowerCase();
		const pascal = chosenShortName
			.split('_')
			.filter((part) => part.length > 0)
			.map((part) => part[0].toUpperCase() + part.slice(1))
			.join('');

		return {
			origin: `https://${host}`,
			matchPattern: `https://${host}/*`,
			siteSlug: siteSlug,
			siteName: bareHost,
			shortName: chosenShortName,
			adapterFileName: `${chosenShortName}_adapter.ts`,
			adapterExportName: `${chosenShortName}Adapter`,
			pageClassName: `${pascal}Page`,
			runnerFileName: `${chosenShortName}.test.ts`,
			runnerClassName: `${pascal}Test`,
		};
	}

	/**
	 * Writes the folder, the runner, and the two documents, then registers the adapter.
	 *
	 * @param address - The site, as a full address or a bare host name.
	 * @param shortName - The short name to build the file names from, or nothing to derive one.
	 * @returns The names it used, and every path it wrote.
	 * @throws When the folder already exists.
	 */
	static async run(address: string, shortName?: string): Promise<{ names: AdapterNames; written: string[] }> {
		const names = NewAdapter.namesFor(address, shortName);
		const folder = Path.join(repositoryRoot, 'src', 'site_adapters', names.siteSlug);
		if (Fs.existsSync(folder) === true) {
			throw new Error(`src/site_adapters/${names.siteSlug}/ already exists, so this site is already covered`);
		}

		const files: Array<[string, string]> = [
			[Path.join(folder, names.adapterFileName), NewAdapter._renderAdapter(names)],
			[Path.join(folder, 'CONTEXT.md'), NewAdapter._renderContext(names)],
			[Path.join(folder, 'README.md'), NewAdapter._renderReadme(names)],
			[
				Path.join(repositoryRoot, 'tests', 'site_adapters', names.runnerFileName),
				NewAdapter._renderRunner(names),
			],
		];

		const written: string[] = [];
		for (const [path, source] of files) {
			Fs.mkdirSync(Path.dirname(path), {
				recursive: true,
			});
			Fs.writeFileSync(path, source);
			written.push(Path.relative(repositoryRoot, path));
		}

		const synced = await SyncAdapterRegistry.run();
		written.push(...synced.written);

		return {
			names: names,
			written: written,
		};
	}

	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////
	//	Helpers
	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////

	/**
	 * Writes the adapter itself: one page-reading class, and one read-only tool that already works.
	 *
	 * The one tool it writes reads only what every page has — its address, its title, and its first
	 * heading — so the scaffold passes the build and the live runner without pretending to know
	 * anything about this particular site.
	 *
	 * @param names - Every name worked out from the address.
	 * @returns The file's text.
	 */
	static _renderAdapter(names: AdapterNames): string {
		const separator = '/'.repeat(79);
		return [
			"import type { Adapter } from '@webmcp_everywhere/adapter_format';",
			'',
			separator,
			separator,
			`//\t${names.pageClassName} — reads and drives ${names.origin}`,
			separator,
			separator,
			'',
			'/**',
			` * Reads and drives ${names.origin}.`,
			' *',
			' * Everything this class knows about the site has to come from probing the live site with the',
			' * developer tools open. Where the site keeps its real state, what the rendered page will not tell',
			' * you, and what the site ignores are the three things to find out first, and each of them becomes',
			' * a rule in this folder\'s CONTEXT.md.',
			' *',
			' * For waiting and for driving, use `@webmcp_everywhere/adapter_toolkit`: `PageWaiting` for waiting on the page,',
			' * and `PageDriving` for writing into a field or pressing a key. Do not write either again here.',
			' */',
			`export class ${names.pageClassName} {`,
			'\t/**',
			'\t * Reads the address the page is showing.',
			'\t *',
			'\t * A read-only handler must never name `location` itself: the permission audit cannot tell reading',
			'\t * it from assigning to it, and would refuse an honest read-only tool. Reading it out here, away',
			'\t * from the handler, is the way round that.',
			'\t *',
			'\t * @returns The full address of the page.',
			'\t */',
			'\tstatic _address(): string {',
			'\t\treturn window.location.href;',
			'\t}',
			'',
			'\t/**',
			'\t * Reads the first heading the page shows.',
			'\t *',
			'\t * @returns The heading text, or `null` when the page shows no heading.',
			'\t */',
			'\tstatic _heading(): string | null {',
			"\t\tconst heading = document.querySelector('h1');",
			'\t\tif (heading === null) {',
			'\t\t\treturn null;',
			'\t\t}',
			'\t\treturn heading.textContent;',
			'\t}',
			'}',
			'',
			separator,
			separator,
			`//\t${names.adapterExportName} — the WebMCP tool surface for ${names.origin}`,
			separator,
			separator,
			'',
			'/**',
			` * The tools an agent gets on ${names.origin}.`,
			' */',
			`export const ${names.adapterExportName}: Adapter = {`,
			`\tsiteSlug: '${names.siteSlug}',`,
			`\tsiteName: '${names.siteName}',`,
			`\tmatchPatterns: ['${names.matchPattern}'],`,
			'\tmetadata: {',
			`\t\tauthor: '${NewAdapter._authorName()}',`,
			"\t\tversion: '0.1.0',",
			`\t\tadapterFormatVersion: '${ADAPTER_FORMAT_VERSION}',`,
			`\t\ttargetSiteVerifiedOn: '${NewAdapter._today()}',`,
			'\t},',
			'\tyieldCondition: (firstPartyToolNames) => firstPartyToolNames.length > 0,',
			'\ttools: [',
			'\t\t{',
			"\t\t\tname: 'describe_page',",
			"\t\t\ttitle: 'Describe the page',",
			'\t\t\tdescription:',
			`\t\t\t\t'Report the address, the title, and the first heading of the ${names.siteName} page the ' +`,
			"\t\t\t\t'user is looking at. Call this first, to find out where on the site the user already is.',",
			'\t\t\tinputSchema: {',
			"\t\t\t\ttype: 'object',",
			'\t\t\t\tproperties: {},',
			'\t\t\t\tadditionalProperties: false,',
			'\t\t\t},',
			"\t\t\tpermissionClass: 'readOnly',",
			'\t\t\texecute: () => {',
			'\t\t\t\treturn {',
			`\t\t\t\t\taddress: ${names.pageClassName}._address(),`,
			'\t\t\t\t\ttitle: document.title,',
			`\t\t\t\t\theading: ${names.pageClassName}._heading(),`,
			'\t\t\t\t};',
			'\t\t\t},',
			'\t\t},',
			'\t],',
			'};',
			'',
		].join('\n');
	}

	/**
	 * Writes the verification runner, which drives the live site in a real Chrome.
	 *
	 * @param names - Every name worked out from the address.
	 * @returns The file's text.
	 */
	static _renderRunner(names: AdapterNames): string {
		const separator = '/'.repeat(79);
		const host = names.origin.replace('https://', '');
		return [
			separator,
			separator,
			`//\t${names.runnerClassName} — drives ${names.origin} and checks what the adapter reports`,
			separator,
			separator,
			'',
			"import NodeTest from 'node:test';",
			"import { LivePageHarness } from '../libs/live_page_harness.ts';",
			'',
			`const TARGET_URL = '${names.origin}/';`,
			'',
			'/** What `describe_page` reports. A second shape moves both into ' +
				`\`${names.shortName}_result_types.ts\`. */`,
			'type DescribePageResult = {',
			'\t/** The address the page is showing. */',
			'\taddress: string;',
			'\t/** The page title. */',
			'\ttitle: string;',
			'\t/** The first heading, or `null` when the page shows none. */',
			'\theading: string | null;',
			'};',
			'',
			'/**',
			' * The live browser every check works against, prepared once before the first of them.',
			' *',
			' * Nothing here is mocked. Chrome is launched, the extension is installed, the real page is loaded,',
			' * and every assertion reads state back out of that page.',
			' */',
			'const harness = new LivePageHarness({',
			`\tsiteSlug: '${names.siteSlug}',`,
			`\torigin: '${names.origin}',`,
			'\turl: TARGET_URL,',
			`\turlFragment: '${host}',`,
			'\tsettleMs: 3000,',
			'});',
			'',
			separator,
			separator,
			'//\tChecks',
			separator,
			separator,
			'',
			'NodeTest.before(async () => {',
			'\tawait harness.launch();',
			'});',
			'',
			'NodeTest.after(() => {',
			'\tharness.close();',
			'});',
			'',
			"NodeTest.test('the read-only tools register with no opt-in', async (t) => {",
			'\tconst { page } = harness.requireContext();',
			'\tconst names = await harness.toolNames(page);',
			'',
			`\tif (names.includes('${names.siteSlug}__describe_page') === false) {`,
			'\t\tthrow new Error(`describe_page did not register, the page has ${names.join(", ")}`);',
			'\t}',
			'\tt.diagnostic(`${names.length} tools registered on the page`);',
			'});',
			'',
			"NodeTest.test('describe_page reports what the page itself shows', async (t) => {",
			'\tconst { page } = harness.requireContext();',
			"\tconst result = await harness.callTool<DescribePageResult>(page, 'describe_page', {});",
			"\tconst title = await page.evaluate<string>('document.title');",
			'',
			'\tif (result.title !== title) {',
			'\t\tthrow new Error(`describe_page said "${result.title}", the page says "${title}"`);',
			'\t}',
			'\tt.diagnostic(`describe_page agrees with the page: ${result.title}`);',
			'});',
			'',
		].join('\n');
	}

	/**
	 * Writes the folder's CONTEXT.md, in the shape every other folder uses.
	 *
	 * @param names - Every name worked out from the address.
	 * @returns The file's text.
	 */
	static _renderContext(names: AdapterNames): string {
		return [
			`# Directory Context: \`/src/site_adapters/${names.siteSlug}\``,
			'',
			'## Purpose',
			`The WebMCP tool surface for ${names.origin}. **Say here what an agent can do on this site that it could not do without a browser session.**`,
			'',
			'## Key Exports & Entry Points',
			`- \`${names.adapterFileName}\`: \`${names.adapterExportName}\`, the adapter, and \`${names.pageClassName}\`, which reads and drives the page.`,
			`- Command to check this adapter against the live site: \`node --test tests/site_adapters/${names.runnerFileName}\``,
			'',
			'## Rules',
			'- **Replace every rule below with what the live site taught you.** Each one is a sentence in the present tense, and each one is a failure a probe found first. An adapter whose rules are still the ones written here has not been checked against its site.',
			'- Nothing here imports from another adapter, or from anything under `chrome_extension/`. Types come from ' +
				'`@webmcp_everywhere/adapter_format`, and waiting and driving from `@webmcp_everywhere/adapter_toolkit`.',
			'- Nothing here reaches the network. `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `navigator.sendBeacon`, and a dynamic import each fail the build.',
			'- `metadata.targetSiteVerifiedOn` is the date this adapter was last checked against the live site, and it moves every time the runner passes again.',
			'',
			'## Background',
			`- Written with \`npm run new-adapter -- ${names.origin}\`. How to fill it in: [write_a_site_adapter.md](../../../docs/write_a_site_adapter.md).`,
			'',
		].join('\n');
	}

	/**
	 * Writes the folder's README.md, which says what the site is good for.
	 *
	 * @param names - Every name worked out from the address.
	 * @returns The file's text.
	 */
	static _renderReadme(names: AdapterNames): string {
		return [
			`# ${names.siteName}`,
			'',
			`What an agent can do on ${names.origin} through this adapter, and the workflows worth asking for.`,
			'',
			'## Workflows',
			'',
			'**Say here what a person would actually ask for**, in their own words, and which tools answer it. This section is the reason somebody can tell what this site is good for without reading the tool list, so write it before the tool table below.',
			'',
			'## Tools',
			'',
			'| Tool | Permission | What it does |',
			'| --- | --- | --- |',
			'| `describe_page` | read-only | Reports the address, the title, and the first heading of the page the user is looking at |',
			'',
			'## Checked against the live site',
			'',
			`Last checked on ${NewAdapter._today()}, with \`node --test tests/site_adapters/${names.runnerFileName}\`.`,
			'',
		].join('\n');
	}

	/**
	 * Names the author, so the adapter's provenance is true from the first commit.
	 *
	 * @returns The name Git is configured with, or a placeholder when Git has none.
	 */
	static _authorName(): string {
		const asked = ChildProcess.spawnSync('git', ['config', 'user.name'], {
			encoding: 'utf8',
		});
		const name = asked.stdout?.trim() ?? '';
		return name.length > 0 ? name : 'put your name here';
	}

	/**
	 * Names today, for the date the adapter was last checked against the live site.
	 *
	 * @returns Today, as `YYYY-MM-DD`.
	 */
	static _today(): string {
		return new Date().toISOString().slice(0, 10);
	}
}

if (import.meta.filename === process.argv[1]) {
	const address = process.argv[2];
	if (address === undefined) {
		console.error('usage: npm run new-adapter -- <site address> [short name]');
		console.error('   for example: npm run new-adapter -- https://example.com');
		process.exit(1);
	}
	const result = await NewAdapter.run(address, process.argv[3]);
	for (const path of result.written) {
		console.log(`wrote: ${path}`);
	}
	console.log('');
	console.log(`${result.names.siteSlug} is registered and already passes the build. Next:`);
	console.log('  1. Probe the live site with the developer tools open, before writing any tool.');
	console.log(`  2. Write the tools in src/site_adapters/${result.names.siteSlug}/${result.names.adapterFileName}`);
	console.log(`  3. node --test tests/site_adapters/${result.names.runnerFileName}`);
	console.log('  Read docs/write_a_site_adapter.md, which is the order to do all of that in.');
}

import Fs from 'node:fs';
import Path from 'node:path';
import { SyncAdapterRegistry } from './sync_adapter_registry.ts';

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	AdapterFreshness — says which adapters the nightly run should check, and how they did
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

const __filename = import.meta.filename;
const __dirname = import.meta.dirname;

const repositoryRoot = Path.join(__dirname, '..', '..', '..');

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	Types
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/** One adapter, as the nightly workflow's job matrix needs it. */
export type FreshnessMatrixEntry = {
	/** The adapter's site slug, which names its job. */
	siteSlug: string;
	/** The path of its verification runner, which the job runs. */
	runnerPath: string;
};

/** How one adapter did on one nightly run. */
export type FreshnessResult = {
	/** The adapter's site slug. */
	siteSlug: string;
	/** Whether its runner passed. */
	isPassing: boolean;
};

/** One row of the freshness table. */
export type FreshnessRow = {
	/** The adapter's site slug. */
	siteSlug: string;
	/** The site it covers, as the adapter names it. */
	siteName: string;
	/** The first match pattern, which stands for the site's address. */
	site: string;
	/** How many read-only tools it carries. */
	readOnly: number;
	/** How many acting tools it carries. */
	acting: number;
	/** How many sensitive tools it carries. */
	sensitive: number;
	/** The date its author last checked it against the live site. */
	verifiedOn: string;
	/** Whether it passed the most recent nightly run, or null when that run said nothing about it. */
	isPassing: boolean | null;
};

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	AdapterFreshness
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/**
 * Turns the adapter folders into the nightly job's matrix, and its results into a table in the
 * repository `README.md`.
 *
 * A catalogue nobody checks goes stale quietly: the site changes, the adapter keeps registering
 * tools that no longer work, and the first person to find out is a user whose agent got a wrong
 * answer. The nightly run exists to find that first, and this is what makes the answer visible in
 * the one place everybody already reads.
 *
 * The matrix is generated rather than written by hand, so that adding an adapter stays one folder.
 */
export class AdapterFreshness {
	/** The markers in `README.md` between which the table is written. */
	static readonly BEGIN_MARKER = '<!-- adapter_freshness begin -->';

	/** The marker that closes the written region. */
	static readonly END_MARKER = '<!-- adapter_freshness end -->';

	/**
	 * Lists every adapter the nightly run should check, one job each.
	 *
	 * @returns One entry per adapter, ordered by site slug so that two runs agree.
	 */
	static async matrix(): Promise<FreshnessMatrixEntry[]> {
		const adapters = await SyncAdapterRegistry.discover();
		return adapters.map((adapter) => ({
			siteSlug: adapter.siteSlug,
			runnerPath: `contribs/site_adapters/${adapter.folderName}/tests/${adapter.runnerFileName}`,
		}));
	}

	/**
	 * Builds every row of the freshness table.
	 *
	 * @param results - What the nightly run found, empty when it found nothing.
	 * @returns One row per adapter.
	 */
	static async rows(results: FreshnessResult[]): Promise<FreshnessRow[]> {
		const adapters = await SyncAdapterRegistry.discover();
		const passingBySlug = new Map(results.map((result) => [result.siteSlug, result.isPassing]));

		return adapters.map((adapter) => ({
			siteSlug: adapter.siteSlug,
			siteName: adapter.siteName,
			site: adapter.matchPatterns[0],
			readOnly: adapter.readOnly,
			acting: adapter.acting,
			sensitive: adapter.sensitive,
			verifiedOn: adapter.targetSiteVerifiedOn,
			isPassing: passingBySlug.get(adapter.siteSlug) ?? null,
		}));
	}

	/**
	 * Renders the rows as the Markdown table that goes into `README.md`.
	 *
	 * @param rows - The rows to render.
	 * @param checkedOn - The date the nightly run happened, as `YYYY-MM-DD`.
	 * @returns The table, with no surrounding markers.
	 */
	static renderTable(rows: FreshnessRow[], checkedOn: string): string {
		const lines = [
			'| Adapter | Site | Read-only | Acting | Sensitive | Author last checked | Last nightly run |',
			'| --- | --- | --- | --- | --- | --- | --- |',
		];
		for (const row of rows) {
			const state =
				row.isPassing === null ? 'not checked' : row.isPassing === true ? `passing` : `**failing**`;
			lines.push(
				`| \`${row.siteSlug}\` | ${row.siteName} | ${row.readOnly} | ${row.acting} | ` +
					`${row.sensitive} | ${row.verifiedOn} | ${state} |`,
			);
		}
		lines.push('');
		lines.push(`Last nightly run: ${checkedOn}.`);
		return lines.join('\n');
	}

	/**
	 * Writes the table into `README.md`, between the two markers.
	 *
	 * @param table - The rendered table.
	 * @returns Whether the file changed.
	 * @throws When `README.md` carries no markers to write between.
	 */
	static writeIntoReadme(table: string): boolean {
		const readmePath = Path.join(repositoryRoot, 'README.md');
		const before = Fs.readFileSync(readmePath, 'utf8');
		const beginAt = before.indexOf(AdapterFreshness.BEGIN_MARKER);
		const endAt = before.indexOf(AdapterFreshness.END_MARKER);
		if (beginAt === -1 || endAt === -1 || endAt < beginAt) {
			throw new Error(
				`README.md has no ${AdapterFreshness.BEGIN_MARKER} and ${AdapterFreshness.END_MARKER} to write between`,
			);
		}
		const after =
			before.slice(0, beginAt + AdapterFreshness.BEGIN_MARKER.length) +
			`\n${table}\n` +
			before.slice(endAt);
		if (after === before) {
			return false;
		}
		Fs.writeFileSync(readmePath, after);
		return true;
	}
}

if (import.meta.filename === process.argv[1]) {
	const command = process.argv[2] ?? 'matrix';

	if (command === 'matrix') {
		console.log(JSON.stringify(await AdapterFreshness.matrix()));
	} else if (command === 'table') {
		const resultsPath = process.argv[3];
		const checkedOn = process.argv[4];
		if (resultsPath === undefined || checkedOn === undefined) {
			console.error('usage: node contribs/site_adapters/tools/adapter_freshness.ts table <results.json> <YYYY-MM-DD>');
			process.exit(1);
		}
		const results = JSON.parse(Fs.readFileSync(resultsPath, 'utf8')) as FreshnessResult[];
		const rows = await AdapterFreshness.rows(results);
		const changed = AdapterFreshness.writeIntoReadme(AdapterFreshness.renderTable(rows, checkedOn));
		console.log(changed === true ? 'README.md updated' : 'README.md was already right');
	} else {
		console.error(`unknown command ${command}; expected "matrix" or "table"`);
		process.exit(1);
	}
}

import Fs from 'node:fs';
import Path from 'node:path';
import NodeTest from 'node:test';

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	SourceBoundaryTest — refuses a relative import that leaves the folder it is in
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

const __filename = import.meta.filename;
const __dirname = import.meta.dirname;

const repositoryRoot = Path.join(__dirname, '..', '..');

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	Types
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/** One folder holding product code, which no relative import may leave. */
type ProductRoot = {
	/** The folder itself, absolute. */
	directory: string;
	/** How the folder is named in a message, relative to the repository root. */
	name: string;
};

/** One import a product file may not write. */
type Offence = {
	/** The file holding the import, relative to the repository root. */
	filePath: string;
	/** The line number the import sits on, counted from one. */
	lineNumber: number;
	/** The specifier as it is written in the source. */
	specifier: string;
	/** Why the import is refused, ready to be read at the end of a sentence naming the file and the line. */
	reason: string;
};

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	SourceBoundaryTest
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/**
 * Checks that every folder holding product code holds product code only, in the two directions that
 * matter.
 *
 * **Outward.** No relative import may resolve outside the folder it is written in. There are two kinds
 * of such folder. `contribs/` is one: build tooling and verification code may import from `contribs/`,
 * and the reverse direction is what this check refuses, because that is how both drifted into the
 * product before. A workspace package that publishes its own source is the other: a path it reached
 * back along would work here and break for anybody who installed it, because the repository would not
 * be there. A package that publishes only built files is not held to that, because its source never
 * leaves this repository — `packages/webmcp_everywhere/src/` is bundled by esbuild into the three files
 * the package ships, and its `files` list says so. Whether a package publishes its source is read out
 * of that list rather than decided here, so a package that starts publishing its source starts being
 * checked on the same day.
 *
 * **Inward.** Since [issue #28](https://github.com/jeromeetienne/webmcp_everywhere/issues/28), the
 * tooling and the runners for a subject live inside that subject, in a `tests/` or a `tools/` folder
 * beside its source. Those two folders are not product code, so they are cut out of the folder the
 * outward check guards — a runner reaching `tools/chrome_devtools_protocol/` is the direction that was
 * always allowed. The refusal they used to get from the outward check is stated here instead: no
 * product file may import from a `tests/` or a `tools/` folder, wherever that folder sits.
 *
 * A bare specifier such as `@webmcp_everywhere/site_adapter` is not checked here. That is a dependency
 * npm resolves, and the manifests are what `tests/repository_layout/workspace_packages.test.ts` reads.
 */
class SourceBoundaryTest {
	/** Where the workspace packages live, each one a folder no relative import may leave. */
	static PACKAGES_DIR = Path.join(repositoryRoot, 'packages');

	/**
	 * The two folder names that hold no product code, wherever they sit. A folder with either name is
	 * left out of the outward check, and is what the inward check refuses a product file to import from.
	 */
	static NON_PRODUCT_FOLDER_NAMES = ['tests', 'tools'];

	/** How a relative import is written, in either the static form or the dynamic one. */
	static SPECIFIER_PATTERN = /from\s+'(\.[^']*)'|import\s*\(\s*'(\.[^']*)'/g;

	/**
	 * Reads every file under every product folder and reports every import that leaves it.
	 *
	 * @returns The folders that were checked, the files that were read, and the offences found in them.
	 */
	static run(): { productRoots: ProductRoot[]; filePaths: string[]; offences: Offence[] } {
		const productRoots = SourceBoundaryTest._collectProductRoots();
		const filePaths: string[] = [];
		const offences: Offence[] = [];
		for (const productRoot of productRoots) {
			const rootFilePaths = SourceBoundaryTest._collectTypescriptFiles(productRoot.directory);
			filePaths.push(...rootFilePaths);
			for (const filePath of rootFilePaths) {
				offences.push(...SourceBoundaryTest._findOffences(filePath, productRoot));
				offences.push(...SourceBoundaryTest._findInwardOffences(filePath, productRoot));
			}
		}
		return {
			productRoots: productRoots,
			filePaths: filePaths,
			offences: offences,
		};
	}

	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////
	//	Helpers
	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////

	/**
	 * Lists every folder holding product code: `contribs/`, and every workspace package under `packages/`.
	 *
	 * The packages are read off the disk rather than named here, so a package added tomorrow is checked
	 * without this file being edited.
	 *
	 * @returns Every product folder, in the order they are checked.
	 */
	static _collectProductRoots(): ProductRoot[] {
		const productRoots: ProductRoot[] = [
			{
				directory: Path.join(repositoryRoot, 'contribs'),
				name: 'contribs/',
			},
		];
		for (const entry of Fs.readdirSync(SourceBoundaryTest.PACKAGES_DIR, {
			withFileTypes: true,
		})) {
			if (entry.isDirectory() === false) {
				continue;
			}
			const packageDir = Path.join(SourceBoundaryTest.PACKAGES_DIR, entry.name);
			if (SourceBoundaryTest._doesPublishItsSource(packageDir) === false) {
				continue;
			}
			productRoots.push({
				directory: packageDir,
				name: `packages/${entry.name}/`,
			});
		}
		return productRoots;
	}

	/**
	 * Answers whether a package puts its own `src/` folder in the tarball npm publishes.
	 *
	 * A manifest with no `files` list publishes everything, so it publishes its source. One that names
	 * `src` publishes it too. One that names only built files does not, and a relative import out of that
	 * package reaches something esbuild inlines rather than something a user would have to have.
	 *
	 * @param packageDir - The package folder, absolute.
	 * @returns True when the package's own source travels to whoever installs it.
	 */
	static _doesPublishItsSource(packageDir: string): boolean {
		const manifest = JSON.parse(
			Fs.readFileSync(Path.join(packageDir, 'package.json'), 'utf8'),
		) as {
			files?: string[];
		};
		if (manifest.files === undefined) {
			return true;
		}
		return manifest.files.includes('src') === true;
	}

	/**
	 * Lists every TypeScript file below a directory.
	 *
	 * @param directory - Where to start.
	 * @returns Every matching file path, absolute.
	 */
	static _collectTypescriptFiles(directory: string): string[] {
		const filePaths: string[] = [];
		for (const entry of Fs.readdirSync(directory, {
			withFileTypes: true,
		})) {
			const entryPath = Path.join(directory, entry.name);
			if (entry.isDirectory() === true) {
				if (SourceBoundaryTest.NON_PRODUCT_FOLDER_NAMES.includes(entry.name) === true) {
					continue;
				}
				filePaths.push(...SourceBoundaryTest._collectTypescriptFiles(entryPath));
				continue;
			}
			if (entry.name.endsWith('.ts') === true) {
				filePaths.push(entryPath);
			}
		}
		return filePaths;
	}

	/**
	 * Reads one product file and reports every relative import reaching into a `tests/` or a `tools/`
	 * folder, wherever that folder sits.
	 *
	 * The outward check cannot see these, because since
	 * [issue #28](https://github.com/jeromeetienne/webmcp_everywhere/issues/28) those two folders sit
	 * inside the very product folder an import would have had to leave.
	 *
	 * @param filePath - The file to read, absolute.
	 * @param productRoot - The folder that file belongs to, named in the message.
	 * @returns The offences found in that file.
	 */
	static _findInwardOffences(filePath: string, productRoot: ProductRoot): Offence[] {
		const offences: Offence[] = [];
		const lines = Fs.readFileSync(filePath, 'utf8').split('\n');
		for (const [index, line] of lines.entries()) {
			for (const match of line.matchAll(SourceBoundaryTest.SPECIFIER_PATTERN)) {
				const specifier = match[1] ?? match[2];
				if (specifier === undefined) {
					continue;
				}
				const resolved = Path.resolve(Path.dirname(filePath), specifier);
				const segments = Path.relative(repositoryRoot, resolved).split(Path.sep);
				const reached = segments.find((segment) =>
					SourceBoundaryTest.NON_PRODUCT_FOLDER_NAMES.includes(segment) === true
				);
				if (reached === undefined) {
					continue;
				}
				offences.push({
					filePath: Path.relative(repositoryRoot, filePath),
					lineNumber: index + 1,
					specifier: specifier,
					reason: `which reaches into a ${reached}/ folder from inside ${productRoot.name}`,
				});
			}
		}
		return offences;
	}

	/**
	 * Reads one file and reports every relative import that resolves outside its product folder.
	 *
	 * @param filePath - The file to read, absolute.
	 * @param productRoot - The folder that file must stay inside.
	 * @returns The offences found in that file.
	 */
	static _findOffences(filePath: string, productRoot: ProductRoot): Offence[] {
		const offences: Offence[] = [];
		const lines = Fs.readFileSync(filePath, 'utf8').split('\n');
		for (const [index, line] of lines.entries()) {
			for (const match of line.matchAll(SourceBoundaryTest.SPECIFIER_PATTERN)) {
				const specifier = match[1] ?? match[2];
				if (specifier === undefined) {
					continue;
				}
				const resolved = Path.resolve(Path.dirname(filePath), specifier);
				if (resolved.startsWith(productRoot.directory + Path.sep) === true) {
					continue;
				}
				offences.push({
					filePath: Path.relative(repositoryRoot, filePath),
					lineNumber: index + 1,
					specifier: specifier,
					reason: `which leaves ${productRoot.name}`,
				});
			}
		}
		return offences;
	}
}

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	Checks
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

NodeTest.test('contribs/ and every package publishing its source hold product code only', (t) => {
	const { productRoots, filePaths, offences } = SourceBoundaryTest.run();
	if (offences.length > 0) {
		const listed = offences
			.map(
				(offence) =>
					`${offence.filePath}:${offence.lineNumber} imports '${offence.specifier}', ${offence.reason}`,
			)
			.join('\n        ');
		throw new Error(`${offences.length} imports are refused:\n        ${listed}`);
	}
	const named = productRoots.map((productRoot) => productRoot.name).join(', ');
	t.diagnostic(
		`${filePaths.length} product files across ${named} import nothing outside the folder they are ` +
			'in, and nothing from a tests/ or a tools/ folder',
	);
});

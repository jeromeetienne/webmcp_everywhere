import Fs from 'node:fs';
import Path from 'node:path';
import NodeTest from 'node:test';

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	VerifySourceBoundary — refuses a relative import that leaves `src/`
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

const __filename = import.meta.filename;
const __dirname = import.meta.dirname;

/** One import that leaves `src/`. */
type Offence = {
	/** The file holding the import, relative to the repository root. */
	filePath: string;
	/** The line number the import sits on, counted from one. */
	lineNumber: number;
	/** The specifier as it is written in the source. */
	specifier: string;
};

/**
 * Checks that `src/` holds product code only, by refusing any relative import that resolves outside it.
 *
 * `tools/` and `tests/` may import from `src/`, and `tests/` may import from `tools/`. The reverse direction is
 * what this check refuses, because that is how build tooling and verification code drifted into `src/` before.
 */
class VerifySourceBoundary {
	/** The folder every checked file must stay inside. */
	static SOURCE_DIR = Path.join(__dirname, '..', 'src');

	/**
	 * Reads every file under `src/` and reports every import that leaves it.
	 *
	 * @returns The files that were read, and the offences found in them.
	 */
	static run(): { filePaths: string[]; offences: Offence[] } {
		const filePaths = VerifySourceBoundary._collectTypescriptFiles(VerifySourceBoundary.SOURCE_DIR);
		const offences: Offence[] = [];
		for (const filePath of filePaths) {
			offences.push(...VerifySourceBoundary._findOffences(filePath));
		}
		return {
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
				filePaths.push(...VerifySourceBoundary._collectTypescriptFiles(entryPath));
				continue;
			}
			if (entry.name.endsWith('.ts') === true) {
				filePaths.push(entryPath);
			}
		}
		return filePaths;
	}

	/**
	 * Reads one file and reports every relative import that resolves outside `src/`.
	 *
	 * @param filePath - The file to read, absolute.
	 * @returns The offences found in that file.
	 */
	static _findOffences(filePath: string): Offence[] {
		const offences: Offence[] = [];
		const lines = Fs.readFileSync(filePath, 'utf8').split('\n');
		const specifierPattern = /from\s+'(\.[^']*)'|import\s*\(\s*'(\.[^']*)'/g;
		for (const [index, line] of lines.entries()) {
			for (const match of line.matchAll(specifierPattern)) {
				const specifier = match[1] ?? match[2];
				if (specifier === undefined) {
					continue;
				}
				const resolved = Path.resolve(Path.dirname(filePath), specifier);
				if (resolved.startsWith(VerifySourceBoundary.SOURCE_DIR + Path.sep) === true) {
					continue;
				}
				offences.push({
					filePath: Path.relative(Path.join(__dirname, '..'), filePath),
					lineNumber: index + 1,
					specifier: specifier,
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

NodeTest.test('src/ holds product code only, so no relative import leaves it', (t) => {
	const { filePaths, offences } = VerifySourceBoundary.run();
	if (offences.length > 0) {
		const listed = offences
			.map((offence) => `${offence.filePath}:${offence.lineNumber} imports '${offence.specifier}'`)
			.join('\n        ');
		throw new Error(`${offences.length} imports leave src/:\n        ${listed}`);
	}
	t.diagnostic(`${filePaths.length} files under src/ import nothing outside it`);
});

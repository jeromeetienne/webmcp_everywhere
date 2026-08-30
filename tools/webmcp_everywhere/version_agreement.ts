import Fs from 'node:fs';
import Path from 'node:path';

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	VersionAgreement — that the tag, the package and the extension name one version
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

/** The three version numbers, and whether they say the same thing. */
export type VersionAgreementReport = {
	/** What `packages/webmcp_everywhere/package.json` says, which is the version npm publishes under. */
	packageVersion: string;
	/** What `contribs/chrome_extension/manifest.json` says, which is the version Chrome shows. */
	extensionVersion: string;
	/** What the tag says with its leading `v` removed, or null when no tag was named. */
	tagVersion: string | null;
	/** Whether every version named is the same. */
	isAgreed: boolean;
	/** Which ones disagree and what each says, or null when they agree. */
	disagreement: string | null;
};

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	VersionAgreement
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/**
 * Refuses a release whose version numbers do not agree.
 *
 * Three places carry the version: `package.json`, which is what npmjs lists the package under;
 * `contribs/chrome_extension/manifest.json`, which is what `chrome://extensions` shows a user; and the tag,
 * which is what the GitHub release is called. A user reading one of them and a maintainer reading
 * another have no way to tell they are talking about different builds, and every later report becomes
 * unreadable. So they are compared before anything is published rather than after somebody notices.
 */
export class VersionAgreement {
	/**
	 * Where the package version is read from, which is the manifest npm publishes.
	 *
	 * It is `packages/webmcp_everywhere/package.json`, not the root one. The root is private and is never
	 * published, so its version names nothing a user could ever see; the published manifest is what
	 * npmjs lists and what `npx webmcp_everywhere --version` prints.
	 */
	static readonly PACKAGE_MANIFEST = Path.join(
		repositoryRoot,
		'packages',
		'webmcp_everywhere',
		'package.json',
	);

	/** Where the extension version is read from, which is the source rather than a build of it. */
	static readonly EXTENSION_MANIFEST = Path.join(
		repositoryRoot,
		'contribs',
		'chrome_extension',
		'manifest.json',
	);

	/**
	 * Reads every version and says whether they agree.
	 *
	 * @param tag - The tag being released, such as `v0.1.0`, or nothing when there is no tag to check.
	 * @returns What each place says, and what disagrees.
	 */
	static check(tag?: string): VersionAgreementReport {
		const packageVersion = VersionAgreement._readVersion(VersionAgreement.PACKAGE_MANIFEST);
		const extensionVersion = VersionAgreement._readVersion(VersionAgreement.EXTENSION_MANIFEST);
		const tagVersion = tag === undefined || tag.length === 0 ? null : tag.replace(/^v/, '');

		const named: [string, string][] = [
			['packages/webmcp_everywhere/package.json', packageVersion],
			['contribs/chrome_extension/manifest.json', extensionVersion],
		];
		if (tagVersion !== null) {
			named.push([`the tag ${tag}`, tagVersion]);
		}

		const distinct = [...new Set(named.map(([, version]) => version))];
		if (distinct.length === 1) {
			return {
				packageVersion: packageVersion,
				extensionVersion: extensionVersion,
				tagVersion: tagVersion,
				isAgreed: true,
				disagreement: null,
			};
		}

		return {
			packageVersion: packageVersion,
			extensionVersion: extensionVersion,
			tagVersion: tagVersion,
			isAgreed: false,
			disagreement: named.map(([where, version]) => `${where} says ${version}`).join(', '),
		};
	}

	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////
	//	Helpers
	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////

	/**
	 * Reads the `version` field out of one JSON manifest.
	 *
	 * @param manifestPath - The file to read.
	 * @returns The version it names.
	 * @throws When the file is missing or names no version.
	 */
	static _readVersion(manifestPath: string): string {
		if (Fs.existsSync(manifestPath) === false) {
			throw new Error(`there is no manifest at ${manifestPath}`);
		}
		const manifest = JSON.parse(Fs.readFileSync(manifestPath, 'utf8')) as {
			version?: string;
		};
		if (typeof manifest.version !== 'string') {
			throw new Error(`${manifestPath} names no version`);
		}
		return manifest.version;
	}
}

if (import.meta.filename === process.argv[1]) {
	const report = VersionAgreement.check(process.argv[2]);
	if (report.isAgreed === false) {
		console.error(`the version numbers disagree: ${report.disagreement}`);
		process.exitCode = 1;
	} else if (report.tagVersion === null) {
		console.log(`the package and the extension both say ${report.packageVersion}`);
	} else {
		console.log(`the tag, the package and the extension all say ${report.packageVersion}`);
	}
}

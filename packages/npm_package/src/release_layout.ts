///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	ReleaseLayout — the names of the files inside a packaged release
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/**
 * What a packaged release is called on disk, in one place.
 *
 * Four programs need these names: the packaging that writes the folder, the installer that travels
 * inside it, the command that copies it somewhere npm will not empty, and the runner that checks the
 * folder holds what it should. Naming a file in four places is naming it four times, and the fourth
 * one is the one that goes stale.
 *
 * They live here rather than on `PackageRelease` because the command is bundled for a user, and
 * importing the packaging would pull esbuild into that bundle for the sake of five strings.
 */
export class ReleaseLayout {
	/** The bundled native messaging host, one file with its dependencies inlined. */
	static readonly HOST_BUNDLE = 'webmcp_native_host.mjs';

	/** The launcher Chrome starts, which finds a Node.js and runs the bundle beside it. */
	static readonly LAUNCHER = 'webmcp_native_host.sh';

	/** The installer that registers that launcher with Chrome. */
	static readonly INSTALLER = 'install_the_native_messaging_host.mjs';

	/** The command an `npx webmcp_everywhere` run starts, which the `bin` field of the manifest names. */
	static readonly COMMAND = 'webmcp_everywhere.mjs';

	/** The manifest npm publishes the folder with. */
	static readonly PACKAGE_MANIFEST = 'package.json';

	/** The folder a person loads at `chrome://extensions`. */
	static readonly EXTENSION_DIR = 'chrome_extension';

	/** The folder holding the host manifest template the installer fills in. */
	static readonly TEMPLATE_DIR = 'native_messaging_template';

	/** The extension manifest inside the extension folder, which pins the extension identifier. */
	static readonly EXTENSION_MANIFEST = 'manifest.json';

	/** The instructions a user reads, which travel inside the release rather than pointing at a repository. */
	static readonly NOTES = 'README.md';

	/** The licence, which travels with everything it covers. */
	static readonly LICENCE = 'LICENSE';

	/**
	 * Everything that travels out of `packages/npm_package/`, and nothing else.
	 *
	 * That folder holds two things a user must never receive: `src/`, which is bundled into the three
	 * files above rather than shipped, and `CONTEXT.md`, which rules the folder for whoever edits it
	 * here. So the copy into a user's installation, the archive attached to a release, and the `files`
	 * list in the published manifest all name the same entries, and `tests/installation/npm_package.test.ts` checks
	 * that this list and that manifest still agree.
	 */
	static readonly PUBLISHED_ENTRIES = [
		ReleaseLayout.EXTENSION_DIR,
		ReleaseLayout.TEMPLATE_DIR,
		ReleaseLayout.HOST_BUNDLE,
		ReleaseLayout.LAUNCHER,
		ReleaseLayout.INSTALLER,
		ReleaseLayout.COMMAND,
		ReleaseLayout.PACKAGE_MANIFEST,
		ReleaseLayout.NOTES,
		ReleaseLayout.LICENCE,
	];

	/**
	 * The entries `npm run package:release` writes, which are the ones it clears first.
	 *
	 * Everything else in that folder is committed, so the packaging removes exactly these rather than
	 * emptying the folder the way it did when the whole release was generated.
	 */
	static readonly GENERATED_ENTRIES = [
		ReleaseLayout.EXTENSION_DIR,
		ReleaseLayout.HOST_BUNDLE,
		ReleaseLayout.INSTALLER,
		ReleaseLayout.COMMAND,
	];
}

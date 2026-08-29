import Path from 'node:path';

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	WorkingCopyLayout — where the things a release carries live in a working copy
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

const __filename = import.meta.filename;
const __dirname = import.meta.dirname;

const repositoryRoot = Path.join(__dirname, '..');

/**
 * The counterpart of `ReleaseLayout`, for the repository rather than for the package.
 *
 * A packaged release carries its own launcher, its own host manifest template and its own extension
 * manifest, and `ReleaseLayout` names those. A working copy has all three too, in different places, and
 * `npm run install:host` and `npm run chrome` need them. Those paths used to be defaults inside the
 * installation code, which meant the code that ships knew where the repository keeps its files — true
 * here and false for every user. They are named here instead, so the package under `packages/` holds no
 * path that only exists in a working copy.
 */
export class WorkingCopyLayout {
	/** The launcher Chrome starts in a working copy, which runs the TypeScript under `src/` directly. */
	static readonly LAUNCHER = Path.join(repositoryRoot, 'bin', 'webmcp_native_host.sh');

	/**
	 * The host manifest template a working copy fills in.
	 *
	 * It is the same folder the package publishes, because there is only one template and it lives with
	 * the thing that ships it.
	 */
	static readonly TEMPLATE_DIR = Path.join(
		repositoryRoot,
		'packages',
		'npm_package',
		'native_messaging_template',
	);

	/** The extension manifest a working copy pins the extension identifier in. */
	static readonly EXTENSION_MANIFEST = Path.join(
		repositoryRoot,
		'src',
		'chrome_extension',
		'manifest.json',
	);

	/** Where `tools/generate_extension_key.ts` writes the private half of the key pair. */
	static readonly EXTENSION_PRIVATE_KEY = Path.join(repositoryRoot, 'extension_private_key.pem');

	/**
	 * The three paths `InstallNativeHost` asks every caller for, as a working copy answers them.
	 *
	 * Spread this rather than naming the three separately, so that a fourth path added to the options
	 * is added here once instead of in every command and every runner.
	 *
	 * @returns The launcher, the template folder and the extension manifest of this working copy.
	 */
	static nativeHostPaths(): {
		launcherPath: string;
		templateDir: string;
		extensionManifestPath: string;
	} {
		return {
			launcherPath: WorkingCopyLayout.LAUNCHER,
			templateDir: WorkingCopyLayout.TEMPLATE_DIR,
			extensionManifestPath: WorkingCopyLayout.EXTENSION_MANIFEST,
		};
	}
}

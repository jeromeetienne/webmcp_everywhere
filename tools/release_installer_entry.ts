import Path from 'node:path';
import { InstallNativeHost } from './install_native_host.ts';

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	ReleaseInstallerEntry — the installer that travels inside a packaged release
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

const __filename = import.meta.filename;
const __dirname = import.meta.dirname;

/**
 * Registers a packaged release's native messaging host with Chrome.
 *
 * This is `npm run install:host` for somebody with no repository. It is bundled by
 * `tools/package_release.ts` into the release folder, and every path it uses is worked out from its
 * own location inside that folder rather than from a working copy.
 *
 * It announces what it is about to write before writing it, for the same reason the repository's
 * installer does: from then on Chrome starts a program out of this folder, as a separate operating
 * system process outside the browser sandbox, with the user's full rights. That is the native
 * messaging design rather than a defect in it, and it is not a thing to be opted into silently.
 */
export class ReleaseInstallerEntry {
	/**
	 * Announces every file, then writes them.
	 *
	 * @returns Nothing.
	 */
	static run(): void {
		const options = {
			launcherPath: Path.join(__dirname, 'webmcp_native_host.sh'),
			templateDir: Path.join(__dirname, 'native_messaging_template'),
			extensionManifestPath: Path.join(__dirname, 'chrome_extension', 'manifest.json'),
		};

		const planned = InstallNativeHost.plan(options);
		console.log('This registers WebMCP Everywhere with Google Chrome. It is about to write:');
		for (const manifestPath of planned.manifests) {
			console.log(`  ${manifestPath}`);
		}
		console.log('');
		console.log(`Each of those tells Chrome to start: ${planned.launcher}`);
		console.log(`and to let only the extension ${planned.identifier} talk to it.`);
		console.log('');
		console.log('Chrome will start that program outside the browser sandbox, with your rights.');
		console.log('To undo this, delete the files listed above.');
		console.log('');

		const written = InstallNativeHost.run(options);
		for (const manifestPath of written.manifests) {
			console.log(`wrote ${manifestPath}`);
		}
		console.log('');
		console.log('Now load the chrome_extension folder at chrome://extensions, with Developer mode on.');
	}
}

ReleaseInstallerEntry.run();

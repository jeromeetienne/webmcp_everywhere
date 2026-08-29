import Os from 'node:os';
import Path from 'node:path';
import { InstallNativeHost } from '../packages/npm_package/src/install_native_host.ts';
import type { InstallNativeHostOptions } from '../packages/npm_package/src/install_native_host.ts';
import { WorkingCopyLayout } from './working_copy_layout.ts';

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	InstallNativeHostEntry — what `npm run install:host` starts
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/**
 * Registers this working copy's native messaging host with Chrome, announcing every file first.
 *
 * It is a file of its own rather than a block at the foot of `install_native_host.ts`, because that
 * file is bundled into the command a user runs. Inside a bundle every module shares one
 * `import.meta.filename`, so a `import.meta.filename === process.argv[1]` test at the foot of an
 * imported module is true for all of them at once, and running the bundle would silently register the
 * host as a side effect of loading it. A module that anything imports carries no such test.
 */
export class InstallNativeHostEntry {
	/**
	 * Announces every file, then writes them.
	 *
	 * @returns Nothing.
	 */
	static run(): void {
		const throwaway = Path.join(Os.tmpdir(), 'webmcp_everywhere_profile');
		const options: InstallNativeHostOptions = {
			...WorkingCopyLayout.nativeHostPaths(),
			userDataDirs: [throwaway],
		};

		const planned = InstallNativeHost.plan(options);
		console.log('This registers WebMCP Everywhere with Google Chrome. It is about to write:');
		for (const manifestPath of planned.manifests) {
			console.log(`  ${manifestPath}`);
		}
		console.log('');
		console.log('Each of those files tells Google Chrome to start this program when the extension asks:');
		console.log(`  ${planned.launcher}`);
		console.log('Chrome starts it outside the browser sandbox, with your full rights.');
		console.log('To undo all of this later, run: npm run uninstall:host');
		console.log('');

		const result = InstallNativeHost.run(options);
		console.log(`extension identifier: ${result.identifier}`);
		console.log(`launcher: ${result.launcher}`);
		for (const manifest of result.manifests) {
			console.log(`wrote: ${manifest}`);
		}
	}
}

InstallNativeHostEntry.run();

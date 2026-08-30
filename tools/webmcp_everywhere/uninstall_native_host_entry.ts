import Os from 'node:os';
import Path from 'node:path';
import { UninstallNativeHost } from '../../packages/webmcp_everywhere/src/uninstall_native_host.ts';

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	UninstallNativeHostEntry — what `npm run uninstall:host` starts
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/**
 * Removes every host manifest the installation writes, and says what it left alone.
 *
 * It is a file of its own for the reason `install_native_host_entry.ts` gives: `uninstall_native_host.ts`
 * is bundled into the command a user runs, and a module that anything imports carries no test on
 * `process.argv[1]`.
 */
export class UninstallNativeHostEntry {
	/**
	 * Removes the manifests, then says what was removed and what was kept.
	 *
	 * @returns Nothing.
	 */
	static run(): void {
		const throwaway = Path.join(Os.tmpdir(), 'webmcp_everywhere_profile');
		const result = UninstallNativeHost.run({
			userDataDirs: [throwaway],
		});

		for (const manifest of result.manifests) {
			if (manifest.isRemoved === true) {
				console.log(`removed: ${manifest.path}`);
				if (manifest.launcher !== null) {
					console.log(`  it told Chrome to start: ${manifest.launcher}`);
				}
			} else {
				console.log(`nothing to remove: ${manifest.path}`);
			}
		}

		console.log('');
		console.log('Google Chrome will no longer start the native messaging host for this extension.');
		console.log('The extension itself is removed from chrome://extensions, which this does not touch.');
		console.log(`Your bearer token and endpoint file are left alone in ${result.stateDir}`);
		console.log(`To remove those as well: rm -rf ${result.stateDir}`);
	}
}

UninstallNativeHostEntry.run();

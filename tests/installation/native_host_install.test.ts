import Fs from 'node:fs';
import Os from 'node:os';
import Path from 'node:path';
import NodeTest from 'node:test';
import { InstallNativeHost } from '../../packages/npm_package/src/install_native_host.ts';
import { UninstallNativeHost } from '../../packages/npm_package/src/uninstall_native_host.ts';
import type { InstallNativeHostOptions } from '../../packages/npm_package/src/install_native_host.ts';
import { WorkingCopyLayout } from '../../tools/working_copy_layout.ts';

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	NativeHostInstallTest — that installing announces itself and uninstalling undoes it
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/**
 * Checks the one thing this repository does to a browser the user installed, and the way back.
 *
 * Every check here covers throwaway user data directories only, and every call sets
 * `isEverydayChromeCovered` to false, so a verification run never writes into the everyday Chrome — which
 * is the behaviour [issue #4](https://github.com/jeromeetienne/webmcp_everywhere/issues/4) is about, and
 * would be an odd thing for the check that covers it to do.
 */
class NativeHostInstallTest {
	/** A throwaway user data directory, thrown away again after the checks. */
	static PROFILE_DIR = Path.join(Os.tmpdir(), 'webmcp_everywhere_install_check');

	/**
	 * Names the manifest file inside the throwaway user data directory.
	 *
	 * @returns The path Chrome would read a host manifest from in that profile.
	 */
	static manifestPath(): string {
		return Path.join(NativeHostInstallTest.PROFILE_DIR, 'NativeMessagingHosts', `${InstallNativeHost.HOST_NAME}.json`);
	}

	/**
	 * The options every check uses: the throwaway profile, and never the everyday Chrome.
	 *
	 * @returns Options naming the throwaway user data directory alone.
	 */
	static options(): InstallNativeHostOptions {
		return {
			...WorkingCopyLayout.nativeHostPaths(),
			userDataDirs: [NativeHostInstallTest.PROFILE_DIR],
			isEverydayChromeCovered: false,
		};
	}
}

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	Checks
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

NodeTest.before(() => {
	Fs.rmSync(NativeHostInstallTest.PROFILE_DIR, {
		recursive: true,
		force: true,
	});
});

NodeTest.after(() => {
	Fs.rmSync(NativeHostInstallTest.PROFILE_DIR, {
		recursive: true,
		force: true,
	});
});

NodeTest.test('the plan names every file before a single one is written', (t) => {
	const planned = InstallNativeHost.plan(NativeHostInstallTest.options());

	if (planned.manifests.length !== 1) {
		throw new Error(`the plan names ${planned.manifests.length} manifests, expected 1`);
	}
	if (planned.manifests[0] !== NativeHostInstallTest.manifestPath()) {
		throw new Error(`the plan names ${planned.manifests[0]}, expected ${NativeHostInstallTest.manifestPath()}`);
	}
	if (Fs.existsSync(planned.manifests[0]) === true) {
		throw new Error('planning wrote the manifest, and a plan that writes is not a plan');
	}
	t.diagnostic(`planned ${planned.manifests[0]}, wrote nothing`);
});

NodeTest.test('a plan for a throwaway profile never names the everyday Chrome', (t) => {
	const everyday = InstallNativeHost.everydayChromeDirectory();
	const planned = InstallNativeHost.plan(NativeHostInstallTest.options());

	for (const manifestPath of planned.manifests) {
		if (manifestPath.startsWith(everyday) === true) {
			throw new Error(`a throwaway launch would write into the everyday Chrome: ${manifestPath}`);
		}
	}
	t.diagnostic(`the everyday Chrome directory ${everyday} is left alone`);
});

NodeTest.test('installing writes exactly the files the plan named', (t) => {
	const planned = InstallNativeHost.plan(NativeHostInstallTest.options());
	const installed = InstallNativeHost.run(NativeHostInstallTest.options());

	if (JSON.stringify(installed.manifests) !== JSON.stringify(planned.manifests)) {
		throw new Error(`installed ${installed.manifests.join(', ')}, but planned ${planned.manifests.join(', ')}`);
	}
	const written = JSON.parse(Fs.readFileSync(NativeHostInstallTest.manifestPath(), 'utf8')) as {
		name: string;
		path: string;
		allowed_origins: string[];
	};
	if (written.name !== InstallNativeHost.HOST_NAME) {
		throw new Error(`the manifest calls itself ${written.name}, expected ${InstallNativeHost.HOST_NAME}`);
	}
	if (written.path !== installed.launcher) {
		throw new Error(`the manifest names ${written.path}, expected the launcher ${installed.launcher}`);
	}
	if (written.allowed_origins.includes(`chrome-extension://${installed.identifier}/`) === false) {
		throw new Error(`the manifest allows ${written.allowed_origins.join(', ')}, missing ${installed.identifier}`);
	}
	t.diagnostic(`wrote ${installed.manifests.length} manifest naming ${written.path}`);
});

NodeTest.test('uninstalling removes every manifest the installation wrote', (t) => {
	const removed = UninstallNativeHost.run(NativeHostInstallTest.options());

	if (removed.manifests.length !== 1) {
		throw new Error(`the uninstallation looked at ${removed.manifests.length} manifests, expected 1`);
	}
	const [manifest] = removed.manifests;
	if (manifest.isRemoved === false) {
		throw new Error(`the uninstallation found nothing at ${manifest.path}, but the installation wrote it`);
	}
	if (manifest.launcher === null) {
		throw new Error('the uninstallation removed the manifest without reading which program it named');
	}
	if (Fs.existsSync(manifest.path) === true) {
		throw new Error(`the manifest is still there after being reported removed: ${manifest.path}`);
	}
	t.diagnostic(`removed ${manifest.path}, which named ${manifest.launcher}`);
});

NodeTest.test('uninstalling twice removes nothing the second time, and says so', (t) => {
	const removed = UninstallNativeHost.run(NativeHostInstallTest.options());

	const [manifest] = removed.manifests;
	if (manifest.isRemoved === true) {
		throw new Error(`the second uninstallation removed ${manifest.path}, which was already gone`);
	}
	if (manifest.launcher !== null) {
		throw new Error(`the second uninstallation read a launcher from a file that is not there: ${manifest.launcher}`);
	}
	t.diagnostic(`nothing to remove at ${manifest.path}`);
});

NodeTest.test('uninstalling removes a manifest left behind by a working copy that is gone', (t) => {
	const manifestPath = NativeHostInstallTest.manifestPath();
	const vanished = '/Users/somebody/a_working_copy_that_was_deleted/bin/webmcp_native_host.sh';
	Fs.mkdirSync(Path.dirname(manifestPath), {
		recursive: true,
	});
	Fs.writeFileSync(
		manifestPath,
		JSON.stringify({
			name: InstallNativeHost.HOST_NAME,
			path: vanished,
			type: 'stdio',
			allowed_origins: [],
		}),
	);

	const removed = UninstallNativeHost.run(NativeHostInstallTest.options());

	const [manifest] = removed.manifests;
	if (manifest.isRemoved === false) {
		throw new Error(`the stale manifest at ${manifest.path} was left in place`);
	}
	if (manifest.launcher !== vanished) {
		throw new Error(`the stale manifest named ${manifest.launcher}, expected ${vanished}`);
	}
	if (Fs.existsSync(manifestPath) === true) {
		throw new Error(`the stale manifest is still there: ${manifestPath}`);
	}
	t.diagnostic(`removed a manifest still naming ${vanished}`);
});

NodeTest.test('the state directory in the home folder is left alone', (t) => {
	const removed = UninstallNativeHost.run(NativeHostInstallTest.options());

	if (Fs.existsSync(removed.stateDir) === true) {
		t.diagnostic(`${removed.stateDir} is still there, as it should be: the token lives there`);
		return;
	}
	t.diagnostic(`${removed.stateDir} does not exist on this machine, and was not created`);
});

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	BuildExtension — bundles the TypeScript sources into loadable extension scripts
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

import Esbuild from 'esbuild';
import Fs from 'node:fs';
import Path from 'node:path';
import ChildProcess from 'node:child_process';

const __dirname = import.meta.dirname;

const extensionDir = Path.join(__dirname, '..', 'src', 'chrome_ext');
const outDir = Path.join(extensionDir, 'dist');

/**
 * Builds every script the extension manifest points at.
 *
 * Content scripts cannot be ECMAScript modules, so everything is bundled as an immediately invoked
 * function expression with its imports inlined.
 */
class BuildExtension {
	/** The entry points, each becoming one file in the output directory. */
	static ENTRY_POINTS = [
		'content_main.ts',
		'content_isolated.ts',
		'background_service_worker.ts',
		'popup.ts',
	];

	/**
	 * Runs the build.
	 *
	 * @returns Nothing.
	 */
	static async run() {
		await BuildExtension.validateAdapters();

		Fs.rmSync(outDir, {
			recursive: true,
			force: true,
		});
		Fs.mkdirSync(outDir, {
			recursive: true,
		});

		const result = await Esbuild.build({
			entryPoints: BuildExtension.ENTRY_POINTS.map((name) => Path.join(extensionDir, name)),
			outdir: outDir,
			bundle: true,
			format: 'iife',
			target: 'chrome120',
			platform: 'browser',
			logLevel: 'info',
			metafile: true,
		});

		const written = Object.keys(result.metafile.outputs).map((file) => Path.basename(file));
		console.log(`built ${written.length} files: ${written.join(', ')}`);
	}

	/**
	 * Runs the review checks over every bundled adapter and refuses to build if any of them fail.
	 *
	 * An adapter that reaches the network, mislabels an acting tool as read-only, or collides with
	 * another adapter's tool name never reaches a user's browser, because the build stops here.
	 *
	 * @returns Nothing.
	 * @throws When any adapter fails a check.
	 */
	static async validateAdapters() {
		console.log('checking adapters');
		const bundlePath = Path.join(outDir, '..', '.validate_adapters.mjs');
		Fs.mkdirSync(Path.dirname(bundlePath), {
			recursive: true,
		});
		await Esbuild.build({
			entryPoints: [Path.join(__dirname, '..', 'src', 'adapter_format', 'validate_all_adapters.ts')],
			outfile: bundlePath,
			bundle: true,
			format: 'esm',
			platform: 'node',
			target: 'node20',
			logLevel: 'warning',
		});
		const validation = ChildProcess.spawnSync(process.execPath, [bundlePath], {
			stdio: 'inherit',
		});
		Fs.rmSync(bundlePath, {
			force: true,
		});
		if (validation.status !== 0) {
			throw new Error('adapter review checks failed, refusing to build');
		}
	}
}

await BuildExtension.run();

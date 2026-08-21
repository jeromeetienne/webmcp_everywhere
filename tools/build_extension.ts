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

const sourceDir = Path.join(__dirname, '..', 'src', 'chrome_extension');
const tsconfigPath = Path.join(__dirname, '..', 'tsconfig.json');
const outDir = Path.join(__dirname, '..', 'build', 'chrome_extension');
const bundleDir = Path.join(outDir, 'dist');

/**
 * Builds every script the extension manifest points at.
 *
 * Content scripts cannot be ECMAScript modules, so everything is bundled as an immediately invoked
 * function expression with its imports inlined.
 */
class BuildExtension {
	/**
	 * The files copied into the output directory unchanged, each keeping its path.
	 */
	static STATIC_FILES = [
		'manifest.json',
		'user_interface/popup.html',
	];

	/**
	 * The entry points, each becoming one file in the output directory.
	 *
	 * Every path keeps its folder, but the output file keeps only the base name, because
	 * `manifest.json` points at a flat `dist/`.
	 */
	static ENTRY_POINTS = [
		'page_injection/content_main.ts',
		'page_injection/content_isolated.ts',
		'native_host_link/background_service_worker.ts',
		'user_interface/popup.ts',
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
		Fs.mkdirSync(bundleDir, {
			recursive: true,
		});
		BuildExtension._copyStaticFiles();

		const result = await Esbuild.build({
			entryPoints: Object.fromEntries(
				BuildExtension.ENTRY_POINTS.map((name) => [
					Path.basename(name, '.ts'),
					Path.join(sourceDir, name),
				]),
			),
			outdir: bundleDir,
			bundle: true,
			format: 'iife',
			target: 'chrome120',
			platform: 'browser',
			tsconfig: tsconfigPath,
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
		const bundlePath = Path.join(outDir, '.validate_adapters.mjs');
		Fs.mkdirSync(Path.dirname(bundlePath), {
			recursive: true,
		});
		await Esbuild.build({
			entryPoints: [Path.join(__dirname, 'adapter_validation', 'validate_all_adapters.ts')],
			outfile: bundlePath,
			bundle: true,
			format: 'esm',
			platform: 'node',
			target: 'node20',
			tsconfig: tsconfigPath,
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

	/**
	 * Copies the files the extension needs verbatim into the output directory.
	 *
	 * Chrome loads an unpacked extension from the folder that holds `manifest.json`, so the manifest and
	 * the popup markup have to sit beside the bundles rather than stay behind in `src/`.
	 *
	 * @returns Nothing.
	 */
	static _copyStaticFiles() {
		for (const name of BuildExtension.STATIC_FILES) {
			const destination = Path.join(outDir, name);
			Fs.mkdirSync(Path.dirname(destination), {
				recursive: true,
			});
			Fs.copyFileSync(Path.join(sourceDir, name), destination);
		}
	}
}

await BuildExtension.run();

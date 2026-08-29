import { GenerateExtensionKey } from './generate_extension_key.ts';

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	GenerateExtensionKeyEntry — what pins the extension identifier, run once by hand
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/**
 * Generates the key that pins the extension identifier, and says where the private half went.
 *
 * It is a file of its own for the reason `install_native_host_entry.ts` gives: `generate_extension_key.ts`
 * is bundled into the command a user runs, and a module that anything imports carries no test on
 * `process.argv[1]`. This one had really fired: running the packaged command directly tried to generate
 * a key before the command had printed a line.
 */
export class GenerateExtensionKeyEntry {
	/**
	 * Generates the key pair and prints the identifier it pins.
	 *
	 * @returns Nothing.
	 */
	static run(): void {
		const result = GenerateExtensionKey.run();
		console.log(`extension identifier: ${result.identifier}`);
		console.log(`private key: ${result.privateKeyPath}`);
	}
}

GenerateExtensionKeyEntry.run();

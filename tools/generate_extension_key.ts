///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	GenerateExtensionKey — generates the key pair that pins the extension identifier, once
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

import Crypto from 'node:crypto';
import Fs from 'node:fs';
import { ExtensionIdentifier } from '../packages/npm_package/src/extension_identifier.ts';
import { WorkingCopyLayout } from './working_copy_layout.ts';

const __filename = import.meta.filename;
const __dirname = import.meta.dirname;

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	Types
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/** The parts of the extension manifest this tool reads and writes. */
type ExtensionManifest = {
	/** The base64 public key that pins the extension identifier, absent before the first run. */
	key?: string;
	/** Everything else the manifest carries, left untouched. */
	[field: string]: unknown;
};

/** What one run produced. */
export type GeneratedExtensionKey = {
	/** The thirty-two character extension identifier. */
	identifier: string;
	/** Where the private half of the key pair went. */
	privateKeyPath: string;
};

/**
 * Gives the extension a fixed identifier instead of one derived from wherever it happens to sit.
 *
 * Native messaging works by a host manifest naming exactly which extension may talk to it, so the
 * extension's identifier has to be known before the host is installed and has to stay the same
 * afterwards. An unpacked extension without a `key` gets an identifier derived from its path, which
 * changes the moment the folder moves, silently breaking the native host permission.
 */
export class GenerateExtensionKey {
	/**
	 * Generates a key pair, writes the public half into the manifest, and reports the identifier.
	 *
	 * @returns What was generated and where the private half went.
	 */
	static run(): GeneratedExtensionKey {
		const manifestPath = WorkingCopyLayout.EXTENSION_MANIFEST;
		const manifest = JSON.parse(Fs.readFileSync(manifestPath, 'utf8')) as ExtensionManifest;

		if (manifest.key !== undefined) {
			const identifier = ExtensionIdentifier.fromPublicKey(
				Buffer.from(manifest.key, 'base64'),
			);
			return {
				identifier: identifier,
				privateKeyPath: 'unchanged, the manifest already carries a key',
			};
		}

		const { publicKey, privateKey } = Crypto.generateKeyPairSync('rsa', {
			modulusLength: 2048,
		});
		const publicKeyDer = publicKey.export({
			type: 'spki',
			format: 'der',
		}) as Buffer;

		manifest.key = publicKeyDer.toString('base64');
		Fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, '\t') + '\n');

		const privateKeyPath = WorkingCopyLayout.EXTENSION_PRIVATE_KEY;
		Fs.writeFileSync(
			privateKeyPath,
			privateKey.export({
				type: 'pkcs8',
				format: 'pem',
			}),
		);

		return {
			identifier: ExtensionIdentifier.fromPublicKey(publicKeyDer),
			privateKeyPath: privateKeyPath,
		};
	}

}


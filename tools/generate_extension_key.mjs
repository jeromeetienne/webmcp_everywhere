///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	GenerateExtensionKey — pins the extension identifier so native messaging can name it
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

import Crypto from 'node:crypto';
import Fs from 'node:fs';
import Path from 'node:path';

const __dirname = import.meta.dirname;

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
	 * Derives Chrome's extension identifier from a public key.
	 *
	 * Chrome takes the SHA-256 of the DER-encoded public key, keeps the first sixteen bytes, and maps
	 * each of the thirty-two nibbles onto the letters `a` to `p`.
	 *
	 * @param {Buffer} publicKeyDer - The DER-encoded SubjectPublicKeyInfo.
	 * @returns {string} The thirty-two character extension identifier.
	 */
	static identifierFromPublicKey(publicKeyDer) {
		const digest = Crypto.createHash('sha256').update(publicKeyDer).digest();
		let identifier = '';
		for (const byte of digest.subarray(0, 16)) {
			identifier += String.fromCharCode(97 + (byte >> 4));
			identifier += String.fromCharCode(97 + (byte & 0x0f));
		}
		return identifier;
	}

	/**
	 * Generates a key pair, writes the public half into the manifest, and reports the identifier.
	 *
	 * @returns {{identifier: string, privateKeyPath: string}} What was generated and where the private half went.
	 */
	static run() {
		const manifestPath = Path.join(__dirname, '..', 'src', 'extension', 'manifest.json');
		const manifest = JSON.parse(Fs.readFileSync(manifestPath, 'utf8'));

		if (manifest.key !== undefined) {
			const identifier = GenerateExtensionKey.identifierFromPublicKey(
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
		});

		manifest.key = publicKeyDer.toString('base64');
		Fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, '\t') + '\n');

		const privateKeyPath = Path.join(__dirname, '..', 'extension_private_key.pem');
		Fs.writeFileSync(
			privateKeyPath,
			privateKey.export({
				type: 'pkcs8',
				format: 'pem',
			}),
		);

		return {
			identifier: GenerateExtensionKey.identifierFromPublicKey(publicKeyDer),
			privateKeyPath: privateKeyPath,
		};
	}

	/**
	 * Reads the extension identifier the manifest currently pins.
	 *
	 * @returns {string} The extension identifier.
	 * @throws When the manifest carries no key.
	 */
	static currentIdentifier() {
		const manifestPath = Path.join(__dirname, '..', 'src', 'extension', 'manifest.json');
		const manifest = JSON.parse(Fs.readFileSync(manifestPath, 'utf8'));
		if (manifest.key === undefined) {
			throw new Error('the manifest has no key; run "node tools/generate_extension_key.mjs" first');
		}
		return GenerateExtensionKey.identifierFromPublicKey(Buffer.from(manifest.key, 'base64'));
	}
}

if (import.meta.filename === process.argv[1]) {
	const result = GenerateExtensionKey.run();
	console.log(`extension identifier: ${result.identifier}`);
	console.log(`private key: ${result.privateKeyPath}`);
}

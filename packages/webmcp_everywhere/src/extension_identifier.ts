///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	ExtensionIdentifier — reads the identifier a manifest pins, and derives one from a key
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

import Crypto from 'node:crypto';
import Fs from 'node:fs';

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	Types
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/** The one field of an extension manifest this reads. */
type KeyedExtensionManifest = {
	/** The base64 public key that pins the extension identifier, absent before a key was generated. */
	key?: string;
	/** Everything else the manifest carries, which is none of this file's business. */
	[field: string]: unknown;
};

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	ExtensionIdentifier
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/**
 * Answers which extension a host manifest is allowed to talk to.
 *
 * Native messaging works by a host manifest naming exactly which extension may talk to it, so the
 * extension's identifier has to be known before the host is installed and has to stay the same
 * afterwards. An unpacked extension without a `key` gets an identifier derived from its path, which
 * changes the moment the folder moves, silently breaking the native host permission.
 *
 * This half ships inside the release, so it names no path of its own: every caller says which manifest
 * to read. Generating the key pair in the first place is `tools/chrome_extension/generate_extension_key.ts`, which runs
 * once by hand in a working copy and is never published.
 */
export class ExtensionIdentifier {
	/**
	 * Derives Chrome's extension identifier from a public key.
	 *
	 * Chrome takes the SHA-256 of the DER-encoded public key, keeps the first sixteen bytes, and maps
	 * each of the thirty-two nibbles onto the letters `a` to `p`.
	 *
	 * @param publicKeyDer - The DER-encoded SubjectPublicKeyInfo.
	 * @returns The thirty-two character extension identifier.
	 */
	static fromPublicKey(publicKeyDer: Buffer): string {
		const digest = Crypto.createHash('sha256').update(publicKeyDer).digest();
		let identifier = '';
		for (const byte of digest.subarray(0, 16)) {
			identifier += String.fromCharCode(97 + (byte >> 4));
			identifier += String.fromCharCode(97 + (byte & 0x0f));
		}
		return identifier;
	}

	/**
	 * Reads the extension identifier a manifest currently pins.
	 *
	 * @param manifestPath - The extension manifest to read, which every caller names.
	 * @returns The extension identifier.
	 * @throws When the manifest carries no key.
	 */
	static fromManifest(manifestPath: string): string {
		const manifest = JSON.parse(Fs.readFileSync(manifestPath, 'utf8')) as KeyedExtensionManifest;
		if (manifest.key === undefined) {
			throw new Error(
				`${manifestPath} has no key; run "node tools/chrome_extension/generate_extension_key_entry.ts" first`,
			);
		}
		return ExtensionIdentifier.fromPublicKey(Buffer.from(manifest.key, 'base64'));
	}
}

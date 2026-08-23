import Crypto from 'node:crypto';
import Fs from 'node:fs';
import Os from 'node:os';
import Path from 'node:path';
import type { HostEndpointRecord } from './webmcp_native_host_types.ts';

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	HostStateFiles — the files the native messaging host keeps in its state directory
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/**
 * The bearer token and the endpoint record the native messaging host writes to disk.
 *
 * Both files live in the same state directory, and every reader of either file is sent to the paths
 * named here rather than building a path of its own.
 */
export class HostStateFiles {
	/** Where the endpoint details, the token, and the log are kept, for an agent to read. */
	static STATE_DIR = process.env.WEBMCP_EVERYWHERE_STATE_DIR ?? Path.join(Os.homedir(), '.webmcp_everywhere');

	/**
	 * Names the one file the bearer token is kept in.
	 *
	 * @returns The path of `token` inside the state directory.
	 */
	static _tokenPath(): string {
		return Path.join(HostStateFiles.STATE_DIR, 'token');
	}

	/**
	 * Reads the stored token, creating one on first run.
	 *
	 * The token persists so an agent configured once keeps working across restarts. This file is the only
	 * place it is kept, and every reader is sent here for it.
	 *
	 * @returns The token.
	 */
	static _readOrCreateToken(): string {
		Fs.mkdirSync(HostStateFiles.STATE_DIR, {
			recursive: true,
			mode: 0o700,
		});
		const tokenPath = HostStateFiles._tokenPath();
		if (Fs.existsSync(tokenPath) === true) {
			return Fs.readFileSync(tokenPath, 'utf8').trim();
		}
		const token = Crypto.randomBytes(32).toString('hex');
		Fs.writeFileSync(tokenPath, token, {
			mode: 0o600,
		});
		return token;
	}

	/**
	 * Names the file that tells an agent where to go.
	 *
	 * @returns The path of `endpoint.json` inside the state directory.
	 */
	static _endpointPath(): string {
		return Path.join(HostStateFiles.STATE_DIR, 'endpoint.json');
	}

	/**
	 * Records where the host is listening, so an agent can be pointed at it.
	 *
	 * Only a host that holds the port writes this file, and it records which process holds it, so the file
	 * can be removed by the host that wrote it and by no other.
	 *
	 * The bearer token is not written here. It never changes, and putting a correct token on the line
	 * beside an address that can go stale made the whole file read as authoritative: readers followed it
	 * to a port nothing was listening on. The token has one home, `~/.webmcp_everywhere/token`, and this
	 * file carries only what is true of the host writing it right now.
	 *
	 * @param port - The bound port.
	 * @returns Nothing.
	 */
	static _writeEndpoint(port: number): void {
		const record: HostEndpointRecord = {
			url: `http://127.0.0.1:${port}/mcp`,
			processId: process.pid,
			startedAt: new Date().toISOString(),
		};
		Fs.writeFileSync(HostStateFiles._endpointPath(), JSON.stringify(record, null, '\t') + '\n', {
			mode: 0o600,
		});
	}

	/**
	 * Removes `endpoint.json`, but only when it is this host's own.
	 *
	 * A host that stopped used to leave the file behind, so it went on naming a port nothing was listening
	 * on and every agent following the README was pointed at nothing. Checking the process identifier
	 * first means a host that has already given the port up to a newer one never removes the newer one's
	 * file.
	 *
	 * @returns Nothing.
	 */
	static _removeEndpointIfOurs(): void {
		try {
			const record = JSON.parse(
				Fs.readFileSync(HostStateFiles._endpointPath(), 'utf8'),
			) as HostEndpointRecord;
			if (record.processId !== process.pid) {
				return;
			}
			Fs.unlinkSync(HostStateFiles._endpointPath());
		} catch {
			// The file is already gone or unreadable, which is the state this is trying to reach anyway.
		}
	}
}

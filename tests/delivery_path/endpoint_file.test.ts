///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	EndpointFileTest — checks that endpoint.json always names a host that is really listening
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

import ChildProcess from 'node:child_process';
import Fs from 'node:fs';
import Http from 'node:http';
import Os from 'node:os';
import Path from 'node:path';
import NodeTest from 'node:test';
import { WebmcpNativeHost } from '../../src/native_messaging_host/webmcp_native_host.ts';
import type { HostEndpointRecord, HostHealth } from '../../src/native_messaging_host/webmcp_native_host_types.ts';

const __filename = import.meta.filename;
const __dirname = import.meta.dirname;

/**
 * Drives real native messaging host processes and reads back what they wrote.
 *
 * Every agent following the README reads its address out of `~/.webmcp_everywhere/endpoint.json`, so a
 * file naming a port nothing is listening on breaks all of them at once and says nothing about why.
 * Two faults produced exactly that, and both are checked here: a host that walked to the next free port
 * and wrote it over a working entry, and a host that outlived the browser that started it while a later
 * host wrote its own port into the file and then stopped.
 *
 * The browser is left out on purpose. The subject of these checks is the host process and the file it
 * writes, and the fault that hid the longest is a host whose standard input never reached its end — a
 * state a browser cannot be asked for, but a named pipe held open by another process reproduces
 * exactly. Nothing is stood in for: the hosts are the real program, started over a real pipe the way
 * Chrome starts them, holding a real port and writing the real file.
 */
class EndpointFileTest {
	/** The host program the checks start, the same file the installed host manifest names. */
	static readonly HOST_SCRIPT = Path.join(
		__dirname,
		'..',
		'..',
		'src',
		'native_messaging_host',
		'webmcp_native_host.ts',
	);

	/**
	 * A process that starts one host and then stays put, so killing it orphans the host.
	 *
	 * It stands in for Chrome, and for one reason only: it can be killed with `SIGKILL` while the write
	 * end of the host's standard input stays open somewhere else, which is what a killed Chrome leaves
	 * behind and what let a host hold the port for hours after its browser was gone.
	 */
	static readonly ORPHAN_MAKER = `
		import ChildProcess from 'node:child_process';
		import Fs from 'node:fs';
		const readEnd = Fs.openSync(process.argv[1], Fs.constants.O_RDONLY);
		const host = ChildProcess.spawn(process.execPath, [process.argv[2]], {
			stdio: [readEnd, 'pipe', 'inherit'],
		});
		process.stdout.write(String(host.pid));
		setInterval(() => {}, 1000);
	`;

	/** The throwaway state directory the hosts write into, so the user's own is never touched. */
	static stateDir = '';

	/** The port every host under check serves on, chosen once and free when it was chosen. */
	static port = 0;

	/** Every host started, so nothing is left running when the checks end. */
	static started: ChildProcess.ChildProcess[] = [];

	/** The first host started, which gives the port up and later takes it back. */
	static firstHost: ChildProcess.ChildProcess | null = null;

	/** The second host started, which takes the port from the first. */
	static secondHost: ChildProcess.ChildProcess | null = null;

	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////
	//	Helpers
	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////

	/**
	 * Starts one host over a pipe, the way Chrome starts it.
	 *
	 * @returns The host process.
	 */
	static _startHost(): ChildProcess.ChildProcess {
		const childProcess = ChildProcess.spawn(process.execPath, [EndpointFileTest.HOST_SCRIPT], {
			stdio: ['pipe', 'pipe', 'pipe'],
			env: EndpointFileTest._environment(),
		});
		EndpointFileTest.started.push(childProcess);
		return childProcess;
	}

	/**
	 * Builds the environment a host under check runs in.
	 *
	 * @returns The environment, pointing the host at the throwaway state directory and the chosen port.
	 */
	static _environment(): NodeJS.ProcessEnv {
		return {
			...process.env,
			WEBMCP_EVERYWHERE_STATE_DIR: EndpointFileTest.stateDir,
			WEBMCP_EVERYWHERE_HOST_PORT: String(EndpointFileTest.port),
		};
	}

	/**
	 * Reads `endpoint.json`.
	 *
	 * @returns What the file holds, or null when there is no file.
	 */
	static _readEndpoint(): HostEndpointRecord | null {
		try {
			const path = Path.join(EndpointFileTest.stateDir, 'endpoint.json');
			return JSON.parse(Fs.readFileSync(path, 'utf8')) as HostEndpointRecord;
		} catch {
			return null;
		}
	}

	/**
	 * Asks whatever holds the port what it is.
	 *
	 * @returns What answered, or null when nothing did.
	 */
	static async _health(): Promise<HostHealth | null> {
		try {
			const response = await fetch(`http://127.0.0.1:${EndpointFileTest.port}/health`, {
				signal: AbortSignal.timeout(1000),
			});
			return (await response.json()) as HostHealth;
		} catch {
			return null;
		}
	}

	/**
	 * Checks the one thing the file exists for: that the address in it is answered by the process in it.
	 *
	 * @param moment - What had just happened, so a failure says when it happened.
	 * @returns The file, once it has been found truthful.
	 * @throws When the file names an address nothing answers, or a process that is not the one answering.
	 */
	static async _requireTruthfulEndpoint(moment: string): Promise<HostEndpointRecord> {
		const record = EndpointFileTest._readEndpoint();
		if (record === null) {
			throw new Error(`${moment}: there is no endpoint.json at all`);
		}
		const health = await EndpointFileTest._health();
		if (health === null) {
			throw new Error(`${moment}: endpoint.json names ${record.url}, and nothing is listening there`);
		}
		if (health.server !== WebmcpNativeHost.SERVER_NAME) {
			throw new Error(`${moment}: ${record.url} is answered by ${health.server}, not by a host of ours`);
		}
		if (health.processId !== record.processId) {
			throw new Error(
				`${moment}: endpoint.json names process ${record.processId}, ` +
					`but process ${health.processId} is the one listening`,
			);
		}
		if (record.url !== `http://127.0.0.1:${EndpointFileTest.port}/mcp`) {
			throw new Error(`${moment}: endpoint.json names ${record.url}, not the port the host was given`);
		}
		return record;
	}

	/**
	 * Answers whether a process is still running.
	 *
	 * @param processId - The process to ask about.
	 * @returns Whether it is still there.
	 */
	static _isRunning(processId: number): boolean {
		try {
			process.kill(processId, 0);
			return true;
		} catch {
			return false;
		}
	}

	/**
	 * Finds a port nothing is using, so the checks never disturb the host the user is really running.
	 *
	 * @returns A free port.
	 */
	static async _findFreePort(): Promise<number> {
		const probe = Http.createServer();
		await new Promise<void>((resolve) => {
			probe.listen(0, '127.0.0.1', () => {
				resolve();
			});
		});
		const port = (probe.address() as { port: number }).port;
		await new Promise<void>((resolve) => {
			probe.close(() => {
				resolve();
			});
		});
		return port;
	}

	/**
	 * Waits.
	 *
	 * @param milliseconds - How long to wait.
	 * @returns Nothing.
	 */
	static async _pause(milliseconds: number): Promise<void> {
		await new Promise((resolve) => setTimeout(resolve, milliseconds));
	}
}

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	Checks
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

NodeTest.describe('endpoint.json always names a host that is really listening', () => {
	NodeTest.before(async () => {
		EndpointFileTest.stateDir = Fs.mkdtempSync(Path.join(Os.tmpdir(), 'webmcp_everywhere_endpoint_'));
		EndpointFileTest.port = await EndpointFileTest._findFreePort();
	});

	NodeTest.after(async () => {
		for (const childProcess of EndpointFileTest.started) {
			childProcess.kill('SIGKILL');
		}
		await EndpointFileTest._pause(500);
		Fs.rmSync(EndpointFileTest.stateDir, {
			recursive: true,
			force: true,
		});
	});

	NodeTest.describe('with one host running', () => {
		NodeTest.before(async () => {
			EndpointFileTest.firstHost = EndpointFileTest._startHost();
			await EndpointFileTest._pause(2000);
		});

		NodeTest.test('the host writes the port it was given, and is listening on it', async (t) => {
			const record = await EndpointFileTest._requireTruthfulEndpoint('with one host running');
			if (record.processId !== EndpointFileTest.firstHost?.pid) {
				throw new Error(`endpoint.json names process ${record.processId}, not the host that was started`);
			}
			t.diagnostic(`endpoint.json names ${record.url}, answered by process ${record.processId}`);
		});
	});

	NodeTest.describe('with a second host started while the first holds the port', () => {
		NodeTest.before(async () => {
			EndpointFileTest.secondHost = EndpointFileTest._startHost();
			await EndpointFileTest._pause(3000);
		});

		NodeTest.test('the second host takes the port rather than walking to another one', async (t) => {
			const record = await EndpointFileTest._requireTruthfulEndpoint('with a second host started');
			if (record.processId !== EndpointFileTest.secondHost?.pid) {
				throw new Error(
					`endpoint.json names process ${record.processId}, not the host that started last; ` +
						'a host that walks to another port leaves a recorded address pointing at nothing',
				);
			}
			t.diagnostic(`process ${record.processId} took ${record.url} from the host that had it`);
		});

		NodeTest.test('the host that gave the port up keeps running, so its browser starts no other', (t) => {
			const first = EndpointFileTest.firstHost?.pid ?? 0;
			if (EndpointFileTest._isRunning(first) === false) {
				throw new Error(
					`the host that gave the port up, process ${first}, stopped; ` +
						'its extension would reconnect, Chrome would start another host, and that one would stop too',
				);
			}
			t.diagnostic(`process ${first} is standing by, waiting for the port`);
		});
	});

	NodeTest.describe('with the host holding the port stopped', () => {
		NodeTest.before(async () => {
			EndpointFileTest.secondHost?.kill('SIGTERM');
			await EndpointFileTest._pause(WebmcpNativeHost.STANDBY_RETRY_DELAY + 2000);
		});

		NodeTest.test('the host standing by takes the port back, and the file follows it', async (t) => {
			const record = await EndpointFileTest._requireTruthfulEndpoint('after the serving host stopped');
			if (record.processId !== EndpointFileTest.firstHost?.pid) {
				throw new Error(
					`endpoint.json names process ${record.processId}, not the host that was standing by`,
				);
			}
			t.diagnostic(`process ${record.processId} took ${record.url} back`);
		});
	});

	NodeTest.describe('with every host stopped', () => {
		NodeTest.before(async () => {
			EndpointFileTest.firstHost?.kill('SIGTERM');
			await EndpointFileTest._pause(1500);
		});

		NodeTest.test('the last host to stop takes the file with it', async (t) => {
			const record = EndpointFileTest._readEndpoint();
			if (record !== null) {
				throw new Error(
					`endpoint.json still names ${record.url} with no host running, ` +
						'so every agent reading it is sent to a port nothing is listening on',
				);
			}
			if ((await EndpointFileTest._health()) !== null) {
				throw new Error('a host is still listening after every host was stopped');
			}
			t.diagnostic('no host, no file, and nothing listening');
		});
	});

	NodeTest.describe('with a host whose browser was killed and whose standard input stayed open', () => {
		/** The process standing in for the browser, killed once the host it started is serving. */
		let orphanMaker: ChildProcess.ChildProcess | null = null;

		/** The host that process started. */
		let orphanedHostId = 0;

		/** The named pipe held open elsewhere, so the host is never told its browser is gone. */
		let pipePath = '';

		/** The open file descriptor holding that pipe, closed once the check is done. */
		let writeEnd = 0;

		NodeTest.before(async () => {
			pipePath = Path.join(EndpointFileTest.stateDir, 'host_standard_input');
			ChildProcess.execFileSync('mkfifo', [pipePath]);
			writeEnd = Fs.openSync(pipePath, Fs.constants.O_RDWR);

			orphanMaker = ChildProcess.spawn(
				process.execPath,
				['--input-type=module', '-e', EndpointFileTest.ORPHAN_MAKER, pipePath, EndpointFileTest.HOST_SCRIPT],
				{
					stdio: ['ignore', 'pipe', 'pipe'],
					env: EndpointFileTest._environment(),
				},
			);
			EndpointFileTest.started.push(orphanMaker);
			orphanMaker.stdout?.on('data', (chunk: Buffer) => {
				orphanedHostId = Number(chunk.toString('utf8').trim());
			});
			await EndpointFileTest._pause(2500);
		});

		NodeTest.after(() => {
			Fs.closeSync(writeEnd);
			// A failing check leaves the orphaned host holding the port, and nothing else will ever stop it.
			try {
				process.kill(orphanedHostId, 'SIGKILL');
			} catch {
				// It stopped on its own, which is what the checks above are there to establish.
			}
		});

		NodeTest.test('that host is serving, and the file names it', async (t) => {
			const record = await EndpointFileTest._requireTruthfulEndpoint('before the browser was killed');
			if (record.processId !== orphanedHostId) {
				throw new Error(`endpoint.json names process ${record.processId}, not the host that was started`);
			}
			t.diagnostic(`process ${orphanedHostId} is serving ${record.url}`);
		});

		NodeTest.test('killing the browser stops the host, even with its standard input still open', async (t) => {
			orphanMaker?.kill('SIGKILL');
			await EndpointFileTest._pause(WebmcpNativeHost.PARENT_CHECK_INTERVAL + 2000);
			if (EndpointFileTest._isRunning(orphanedHostId) === true) {
				throw new Error(
					`process ${orphanedHostId} is still holding the port with its browser gone; ` +
						'standard input never reached its end, so nothing else can notice',
				);
			}
			t.diagnostic(`process ${orphanedHostId} noticed its browser had gone and stopped`);
		});

		NodeTest.test('and it takes the file with it, leaving nothing to send an agent to', async (t) => {
			const record = EndpointFileTest._readEndpoint();
			if (record !== null) {
				throw new Error(`endpoint.json still names ${record.url}, and its host is gone`);
			}
			t.diagnostic('the file went with the host that wrote it');
		});
	});

	NodeTest.describe('with a program that is not a host holding the port', () => {
		/** The program holding the port, which answers nothing a host would answer. */
		let squatter: Http.Server | null = null;

		/** The host that finds the port taken. */
		let waitingHost: ChildProcess.ChildProcess | null = null;

		NodeTest.before(async () => {
			squatter = Http.createServer((request, response) => {
				response.writeHead(200).end('not a host');
			});
			await new Promise<void>((resolve, reject) => {
				squatter?.once('error', reject);
				squatter?.listen(EndpointFileTest.port, '127.0.0.1', () => {
					resolve();
				});
			});
			waitingHost = EndpointFileTest._startHost();
			await EndpointFileTest._pause(2500);
		});

		NodeTest.test('the host writes no file at all rather than one naming a port it does not hold', (t) => {
			const record = EndpointFileTest._readEndpoint();
			if (record !== null) {
				throw new Error(`endpoint.json names ${record.url}, which this host never took`);
			}
			if (EndpointFileTest._isRunning(waitingHost?.pid ?? 0) === false) {
				throw new Error('the host stopped, so its extension would reconnect and Chrome would start another');
			}
			t.diagnostic('no file written, and the host is standing by rather than stopping');
		});

		NodeTest.test('and it takes the port as soon as the other program lets it go', async (t) => {
			squatter?.closeAllConnections();
			await new Promise<void>((resolve) => {
				squatter?.close(() => {
					resolve();
				});
			});
			await EndpointFileTest._pause(WebmcpNativeHost.STANDBY_RETRY_DELAY + 2000);
			const record = await EndpointFileTest._requireTruthfulEndpoint('after the port was freed');
			if (record.processId !== waitingHost?.pid) {
				throw new Error(`endpoint.json names process ${record.processId}, not the host that was waiting`);
			}
			t.diagnostic(`process ${record.processId} took ${record.url} once it was free`);
		});
	});
});

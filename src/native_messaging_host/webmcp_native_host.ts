import Crypto from 'node:crypto';
import Fs from 'node:fs';
import Http from 'node:http';
import Path from 'node:path';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { HostStateFiles } from './host_state_files.ts';
import { NativeMessagingCodec } from './native_messaging_codec.ts';
import type {
	ExtensionAnswer,
	ExtensionRequest,
	ExtensionTool,
	HostHealth,
	PendingRequest,
	WebmcpNativeHostOptions,
} from './webmcp_native_host_types.ts';

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	WebmcpNativeHost — serves the extension's tools over HTTP Model Context Protocol
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/**
 * The native messaging host: a Chrome extension on one side, any agent on the other.
 *
 * A Chrome extension cannot listen on a port. Measured on Chrome 151, Manifest Version 3 exposes no
 * socket or server interface at all — only outbound `fetch` and `WebSocket` — so something native has
 * to hold the socket. This program is that something, and Chrome starts it on demand when the
 * extension connects, so nothing has to be launched by hand after it is installed once.
 *
 * Everything an agent asks for is forwarded to the extension, which is the only place that knows which
 * tabs have adapters and what the user has allowed. The host itself decides nothing about permissions.
 */
export class WebmcpNativeHost {

	/**
	 * The one port a host serves on. It never walks to another port.
	 *
	 * An agent registered with `codex mcp add` keeps a literal address, and a host that quietly moved to
	 * the next free port left that address pointing at nothing. So the port is fixed, and a host that
	 * cannot have it waits for it rather than serving somewhere else.
	 */
	static DEFAULT_PORT = 8765;

	/** How long to wait for the extension to answer one request, in milliseconds. */
	static REQUEST_TIMEOUT = 20000;

	/** What `GET /health` calls this program, so one host can tell another from a stranger. */
	static readonly SERVER_NAME = 'webmcp-everywhere';

	/** The path a newer host posts to, to ask the host holding the port to give it up. */
	static readonly STAND_DOWN_PATH = '/stand_down';

	/** How long to wait for the host holding the port to give it up, in milliseconds. */
	static STAND_DOWN_TIMEOUT = 5000;

	/** How long to wait between two attempts to take a port being given up, in milliseconds. */
	static STAND_DOWN_POLL_DELAY = 100;

	/** How long to wait for an answer to `/health` or `/stand_down`, in milliseconds. */
	static PROBE_TIMEOUT = 1000;

	/** How often a standing-by host tries the port again, in milliseconds. */
	static STANDBY_RETRY_DELAY = 5000;

	/**
	 * How often to check that the browser which started this host is still running, in milliseconds.
	 *
	 * Standard input closing is not a reliable signal that the browser is gone. `pkill` on a Chrome
	 * leaves the write end of the pipe open in whichever of its processes also holds it, so a host has
	 * been seen holding the port for hours after its Chrome died. The parent process identifier is
	 * reliable: the operating system reparents an orphan, so it changes the moment the browser exits.
	 */
	static PARENT_CHECK_INTERVAL = 1000;

	/**
	 * The tools the bridge answers itself, about the browser rather than about any one page.
	 *
	 * They are offered before the page tools so an agent that has never used this host reads them first,
	 * and finds out that a page it needs can be opened rather than only used when it happens to be open.
	 */
	static readonly BUILT_IN_TOOLS: ExtensionTool[] = [
		{
			name: 'webmcp_everywhere__list_pages',
			description:
				'List the open browser pages that WebMCP Everywhere has an adapter for, with the ' +
				'tab identifier, the page title, and how many tools each one offers. Use this when ' +
				'a tool name carries a tab suffix and you need to know which page is which.',
			inputSchema: {
				type: 'object',
				properties: {},
				additionalProperties: false,
			},
			title: 'List adapted pages',
			readOnly: true,
		},
		{
			name: 'webmcp_everywhere__open_page',
			description:
				'Open a page in a new background tab and wait until its tools are registered, so a ' +
				'site can be used even when the user has no tab on it. Only a page WebMCP Everywhere ' +
				'has an adapter for can be opened; any other address is refused, and the refusal names ' +
				'the pages that are allowed. Returns the tab identifier and the tools that page now ' +
				'offers.',
			inputSchema: {
				type: 'object',
				properties: {
					url: {
						type: 'string',
						description: 'The full uniform resource locator of the page to open.',
					},
				},
				required: ['url'],
				additionalProperties: false,
			},
			title: 'Open an adapted page',
			readOnly: false,
		},
		{
			name: 'webmcp_everywhere__close_page',
			description:
				'Close one of the browser pages that WebMCP Everywhere has an adapter for, named by ' +
				'its tab identifier. Use it to put back a page that was opened with ' +
				'webmcp_everywhere__open_page. A tab no adapter covers is never closed.',
			inputSchema: {
				type: 'object',
				properties: {
					tabId: {
						type: 'integer',
						description: 'The tab identifier reported by open_page or list_pages.',
					},
				},
				required: ['tabId'],
				additionalProperties: false,
			},
			title: 'Close an adapted page',
			readOnly: false,
		},
	];

	/** The port to serve on. */
	port: number;

	/** The channel to the extension. */
	channel: NativeMessagingCodec | null;

	/** The next request identifier. */
	nextId: number;

	/** Requests awaiting the extension. */
	pending: Map<number, PendingRequest>;

	/** Whether the extension is connected. */
	extensionConnected: boolean;

	/** The bearer token an agent must present. */
	token: string;

	/** The HTTP server, built before the port is claimed and reused for every attempt at it. */
	httpServer: Http.Server | null;

	/** Whether this host currently holds the port and is the one named in `endpoint.json`. */
	serving: boolean;

	/** The timer retrying the port while another program holds it, or null when there is none. */
	standbyTimer: NodeJS.Timeout | null;

	/** Whether an attempt on the port is in flight, so two attempts never overlap. */
	claiming: boolean;

	/** The process that started this host, which is the browser. */
	parentProcessId: number;

	/**
	 * @param options - How to run.
	 */
	constructor(options: WebmcpNativeHostOptions = {}) {
		this.port = options.port ?? Number(process.env.WEBMCP_EVERYWHERE_HOST_PORT ?? WebmcpNativeHost.DEFAULT_PORT);
		this.channel = null;
		this.nextId = 1;
		this.pending = new Map();
		this.extensionConnected = false;
		this.token = HostStateFiles._readOrCreateToken();
		this.httpServer = null;
		this.serving = false;
		this.standbyTimer = null;
		this.claiming = false;
		this.parentProcessId = process.ppid;
	}

	/**
	 * Connects to the extension, then takes the port if it can.
	 *
	 * A host that cannot take the port still connects to its extension and stays running. It stands by
	 * and takes the port the moment it is free. Exiting instead would make the extension reconnect, which
	 * would make Chrome start another host, which would exit in turn, once a second and forever.
	 *
	 * @returns The port being served on, or null when this host is standing by.
	 */
	async start(): Promise<number | null> {
		this.channel = new NativeMessagingCodec(process.stdin, process.stdout);
		this.channel.onMessage = (message) => {
			this._onExtensionMessage(message as ExtensionAnswer);
		};
		this.channel.onClose = () => {
			this._shutDown('the extension disconnected');
		};
		this.channel.start();
		this.extensionConnected = true;

		this.httpServer = Http.createServer((request, response) => {
			void this._onHttpRequest(request, response);
		});

		this._watchParentProcess();
		this._watchForSignals();

		await this._claimPort(true);
		return this.serving === true ? this.port : null;
	}

	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////
	//	The Model Context Protocol surface
	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////

	/**
	 * Builds the Model Context Protocol server and its handlers.
	 *
	 * @returns The configured server.
	 */
	_buildServer(): Server {
		const server = new Server(
			{
				name: 'webmcp-everywhere',
				version: '0.1.0',
			},
			{
				capabilities: {
					tools: {},
				},
			},
		);

		server.setRequestHandler(ListToolsRequestSchema, async () => {
			const answer = (await this._askExtension({
				kind: 'listTools',
			})) as { tools?: ExtensionTool[] } | undefined;
			const offered = [...WebmcpNativeHost.BUILT_IN_TOOLS, ...(answer?.tools ?? [])];
			const tools = offered.map((tool) => ({
				name: tool.name,
				description: tool.description,
				inputSchema: tool.inputSchema ?? {
					type: 'object',
					properties: {},
				},
				annotations: {
					title: tool.title,
					readOnlyHint: tool.readOnly === true,
				},
			}));

			return {
				tools: tools,
			};
		});

		server.setRequestHandler(CallToolRequestSchema, async (request) => {
			try {
				const result = await this._askExtension({
					kind: 'callTool',
					name: request.params.name,
					args: request.params.arguments ?? {},
				});
				return {
					content: [
						{
							type: 'text',
							text: typeof result === 'string' ? result : JSON.stringify(result),
						},
					],
				};
			} catch (error) {
				return {
					content: [
						{
							type: 'text',
							text: `The tool failed: ${(error as Error)?.message ?? String(error)}`,
						},
					],
					isError: true,
				};
			}
		});

		return server;
	}

	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////
	//	Helpers
	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////

	/**
	 * Serves one HTTP request, refusing anything without the right token.
	 *
	 * A fresh Model Context Protocol server and transport are built for every request. A single shared
	 * transport in stateless mode serves exactly one request and then rejects everything after it with a
	 * 500, which looks to a client like the host crashed.
	 *
	 * A port on the loopback interface is reachable by every process on the machine, so without a token
	 * this would hand any local program the ability to drive the browser — the same hole the Chrome
	 * DevTools Protocol opens, which is what this design exists to close.
	 *
	 * @param request - The request.
	 * @param response - The response.
	 * @returns Nothing.
	 */
	async _onHttpRequest(request: Http.IncomingMessage, response: Http.ServerResponse): Promise<void> {
		const url = new URL(request.url ?? '/', `http://127.0.0.1:${this.port}`);

		if (url.pathname === '/health') {
			const health: HostHealth = {
				ok: true,
				server: WebmcpNativeHost.SERVER_NAME,
				extensionConnected: this.extensionConnected,
				processId: process.pid,
			};
			response.writeHead(200, {
				'content-type': 'application/json',
			});
			response.end(JSON.stringify(health));
			return;
		}

		if (WebmcpNativeHost._isAuthorised(request, this.token) === false) {
			response.writeHead(401, {
				'content-type': 'application/json',
			});
			response.end(JSON.stringify({
				error: 'a bearer token is required; read it from ~/.webmcp_everywhere/token',
			}));
			return;
		}

		if (url.pathname === WebmcpNativeHost.STAND_DOWN_PATH) {
			if (request.method !== 'POST') {
				response.writeHead(405, {
					'content-type': 'application/json',
					allow: 'POST',
				});
				response.end(JSON.stringify({
					error: `${WebmcpNativeHost.STAND_DOWN_PATH} takes POST only`,
				}));
				return;
			}
			response.writeHead(200, {
				'content-type': 'application/json',
			});
			response.end(
				JSON.stringify({
					ok: true,
					processId: process.pid,
				}),
				() => {
					this._standDown();
				},
			);
			return;
		}

		if (url.pathname !== '/mcp') {
			response.writeHead(404).end();
			return;
		}

		if (request.method !== 'POST') {
			response.writeHead(405, {
				'content-type': 'application/json',
				allow: 'POST',
			});
			response.end(
				JSON.stringify({
					jsonrpc: '2.0',
					error: {
						code: -32000,
						message: 'this host is stateless, so it serves POST only',
					},
					id: null,
				}),
			);
			return;
		}

		const body = await WebmcpNativeHost._readJsonBody(request);
		const server = this._buildServer();
		const transport = new StreamableHTTPServerTransport({
			sessionIdGenerator: undefined,
			enableJsonResponse: true,
		});

		try {
			await server.connect(transport);
			await transport.handleRequest(request, response, body);
		} catch (error) {
			WebmcpNativeHost._log(`handleRequest failed: ${(error as Error)?.stack ?? error}`);
			if (response.headersSent === false) {
				response.writeHead(500, {
					'content-type': 'application/json',
				});
				response.end(JSON.stringify({
					error: String((error as Error)?.message ?? error),
				}));
			}
		} finally {
			response.on('close', () => {
				void transport.close().catch(() => undefined);
				void server.close().catch(() => undefined);
			});
		}
	}

	/**
	 * Sends one request to the extension and waits for its answer.
	 *
	 * @param request - What to ask.
	 * @returns The extension's result.
	 * @throws When the extension is absent, refuses, or does not answer in time.
	 */
	async _askExtension(request: ExtensionRequest): Promise<unknown> {
		const channel = this.channel;
		if (channel === null || this.extensionConnected === false) {
			throw new Error('the WebMCP Everywhere extension is not connected');
		}
		const id = this.nextId++;
		return await new Promise((resolve, reject) => {
			const timer = setTimeout(() => {
				this.pending.delete(id);
				reject(new Error('the extension did not answer in time'));
			}, WebmcpNativeHost.REQUEST_TIMEOUT);

			this.pending.set(id, {
				resolve: resolve,
				reject: reject,
				timer: timer,
			});
			channel.send({
				id: id,
				...request,
			});
		});
	}

	/**
	 * Routes one answer from the extension back to whoever asked.
	 *
	 * @param message - The extension's message.
	 * @returns Nothing.
	 */
	_onExtensionMessage(message: ExtensionAnswer): void {
		if (message?.id === undefined) {
			return;
		}
		const waiter = this.pending.get(message.id);
		if (waiter === undefined) {
			return;
		}
		this.pending.delete(message.id);
		clearTimeout(waiter.timer);
		if (message.ok === false) {
			waiter.reject(new Error(message.error ?? 'the extension refused'));
			return;
		}
		waiter.resolve(message.result);
	}

	/**
	 * Checks the bearer token on a request.
	 *
	 * @param request - The request.
	 * @param token - The expected token.
	 * @returns Whether the request may proceed.
	 */
	static _isAuthorised(request: Http.IncomingMessage, token: string): boolean {
		const header = request.headers.authorization ?? '';
		const presented = header.startsWith('Bearer ') ? header.slice(7) : '';
		const expected = Buffer.from(token);
		const actual = Buffer.from(presented);
		if (actual.length !== expected.length) {
			return false;
		}
		return Crypto.timingSafeEqual(expected, actual);
	}

	/**
	 * Reads a JSON request body.
	 *
	 * @param request - The request.
	 * @returns The parsed body, or undefined when there is none.
	 */
	static async _readJsonBody(request: Http.IncomingMessage): Promise<unknown> {
		const chunks: Buffer[] = [];
		for await (const chunk of request) {
			chunks.push(chunk as Buffer);
		}
		if (chunks.length === 0) {
			return undefined;
		}
		try {
			return JSON.parse(Buffer.concat(chunks).toString('utf8'));
		} catch {
			return undefined;
		}
	}

	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////
	//	Holding The Port
	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////

	/**
	 * Takes the one port this host serves on, or stands by until it is free.
	 *
	 * The port never walks. An agent registered with `codex mcp add` keeps a literal address, so a host
	 * that moved to the next free port left that address pointing at nothing. Whoever holds the port is
	 * the host `endpoint.json` names, and a host that holds no port writes no file.
	 *
	 * Asking the holder to stand down happens once, at startup, and never on a later attempt. Two browsers
	 * whose hosts could each evict the other would trade the port back and forth without end; because only
	 * a starting host asks, the browser started last keeps it and the other one waits.
	 *
	 * @param mayAskToStandDown - Whether to ask a WebMCP Everywhere host holding the port to give it up.
	 * @returns Whether this host now holds the port.
	 * @throws When the port cannot be bound for any reason other than another program holding it.
	 */
	async _claimPort(mayAskToStandDown: boolean): Promise<boolean> {
		const httpServer = this.httpServer;
		if (httpServer === null) {
			throw new Error('the HTTP server was never built');
		}
		if (this.claiming === true) {
			return false;
		}
		this.claiming = true;
		try {
			if ((await WebmcpNativeHost._bindPort(httpServer, this.port)) === true) {
				this._beginServing();
				return true;
			}
			if (mayAskToStandDown === false) {
				return false;
			}

			const health = await WebmcpNativeHost._probeHealth(this.port);
			if (health === null) {
				this._enterStandby(`port ${this.port} is held by a program that is not a WebMCP Everywhere host`);
				return false;
			}
			WebmcpNativeHost._log(
				`another WebMCP Everywhere host, process ${health.processId}, holds port ${this.port}; ` +
					'asking it to stand down',
			);
			await WebmcpNativeHost._askToStandDown(this.port, this.token);

			const deadline = Date.now() + WebmcpNativeHost.STAND_DOWN_TIMEOUT;
			while (Date.now() < deadline) {
				await WebmcpNativeHost._wait(WebmcpNativeHost.STAND_DOWN_POLL_DELAY);
				if ((await WebmcpNativeHost._bindPort(httpServer, this.port)) === true) {
					this._beginServing();
					return true;
				}
			}
			this._enterStandby(`the host holding port ${this.port} did not give it up`);
			return false;
		} finally {
			this.claiming = false;
		}
	}

	/**
	 * Records that this host holds the port, which is the only moment `endpoint.json` is ever written.
	 *
	 * @returns Nothing.
	 */
	_beginServing(): void {
		this.serving = true;
		if (this.standbyTimer !== null) {
			clearInterval(this.standbyTimer);
			this.standbyTimer = null;
		}
		HostStateFiles._writeEndpoint(this.port);
		WebmcpNativeHost._log(`serving Model Context Protocol on http://127.0.0.1:${this.port}/mcp`);
	}

	/**
	 * Waits for the port while another program holds it, without exiting and without writing the file.
	 *
	 * Exiting instead would close the native messaging channel, the extension would reconnect, Chrome
	 * would start another host, and that host would exit in turn — once a second, for as long as the
	 * browser is open.
	 *
	 * @param reason - Why this host has no port, recorded once rather than on every attempt.
	 * @returns Nothing.
	 */
	_enterStandby(reason: string): void {
		this.serving = false;
		if (this.standbyTimer !== null) {
			return;
		}
		WebmcpNativeHost._log(`${reason}; standing by, and taking port ${this.port} as soon as it is free`);
		this.standbyTimer = setInterval(() => {
			void this._claimPort(false);
		}, WebmcpNativeHost.STANDBY_RETRY_DELAY);
	}

	/**
	 * Gives the port up to a newer host, staying connected to this browser rather than exiting.
	 *
	 * The file is removed before the port is released, so the newer host writes it afterwards rather than
	 * having it removed from under it.
	 *
	 * @returns Nothing.
	 */
	_standDown(): void {
		HostStateFiles._removeEndpointIfOurs();
		this.serving = false;
		if (this.httpServer !== null) {
			this.httpServer.closeAllConnections();
			this.httpServer.close();
		}
		this._enterStandby(`a newer host asked for port ${this.port}`);
	}

	/**
	 * Stops the host, taking `endpoint.json` with it when it is this host's own.
	 *
	 * @param reason - Why the host is stopping.
	 * @returns Nothing.
	 */
	_shutDown(reason: string): void {
		WebmcpNativeHost._log(`${reason}, shutting down`);
		HostStateFiles._removeEndpointIfOurs();
		process.exit(0);
	}

	/**
	 * Stops the host once the browser that started it is gone.
	 *
	 * Standard input closing is not enough on its own. `pkill` on a Chrome leaves the write end of the
	 * pipe open in whichever of its processes also holds it, and a host has been seen holding the port
	 * for hours after its Chrome died, while `endpoint.json` named a later host that had already stopped.
	 * The parent process identifier does not have that hole: the operating system reparents an orphan, so
	 * it changes the moment the browser exits, whatever the browser was killed with.
	 *
	 * @returns Nothing.
	 */
	_watchParentProcess(): void {
		setInterval(() => {
			if (process.ppid === this.parentProcessId) {
				return;
			}
			this._shutDown(`the browser that started this host, process ${this.parentProcessId}, is gone`);
		}, WebmcpNativeHost.PARENT_CHECK_INTERVAL);
	}

	/**
	 * Stops the host tidily when it is asked to stop, however it is asked.
	 *
	 * The handler on `exit` covers every other way the process can end, so no path out of the program
	 * leaves `endpoint.json` naming a port nothing is listening on.
	 *
	 * @returns Nothing.
	 */
	_watchForSignals(): void {
		const signals = ['SIGINT', 'SIGTERM', 'SIGHUP'] as const;
		for (const signal of signals) {
			process.on(signal, () => {
				this._shutDown(`the host received ${signal}`);
			});
		}
		process.on('exit', () => {
			HostStateFiles._removeEndpointIfOurs();
		});
	}

	/**
	 * Listens on one port, answering whether it was free rather than throwing when it was not.
	 *
	 * Any error other than the port being taken is a real fault and is thrown, so a misconfigured host
	 * fails loudly instead of standing by for a port it could never have had.
	 *
	 * @param httpServer - The server to start.
	 * @param port - The port to take.
	 * @returns Whether the port was taken.
	 * @throws When listening failed for any reason other than another program holding the port.
	 */
	static async _bindPort(httpServer: Http.Server, port: number): Promise<boolean> {
		return await new Promise<boolean>((resolve, reject) => {
			const onError = (error: NodeJS.ErrnoException) => {
				httpServer.removeListener('error', onError);
				if (error.code === 'EADDRINUSE') {
					resolve(false);
					return;
				}
				reject(error);
			};
			httpServer.once('error', onError);
			httpServer.listen(port, '127.0.0.1', () => {
				httpServer.removeListener('error', onError);
				resolve(true);
			});
		});
	}

	/**
	 * Asks whatever holds the port what it is.
	 *
	 * @param port - The port to ask.
	 * @returns What answered when it is a WebMCP Everywhere host, and null when it is anything else.
	 */
	static async _probeHealth(port: number): Promise<HostHealth | null> {
		try {
			const response = await fetch(`http://127.0.0.1:${port}/health`, {
				signal: AbortSignal.timeout(WebmcpNativeHost.PROBE_TIMEOUT),
			});
			const health = (await response.json()) as HostHealth;
			if (health?.server !== WebmcpNativeHost.SERVER_NAME) {
				return null;
			}
			return health;
		} catch {
			return null;
		}
	}

	/**
	 * Asks the WebMCP Everywhere host holding the port to give it up.
	 *
	 * Both hosts read the same token file, so the newer one can authenticate to the older one. The request
	 * carries the token like every other one, because an unauthenticated way to stop the host would let
	 * any local program take the browser away from the agent using it.
	 *
	 * @param port - The port the other host holds.
	 * @param token - The bearer token both hosts share.
	 * @returns Whether the other host agreed.
	 */
	static async _askToStandDown(port: number, token: string): Promise<boolean> {
		try {
			const response = await fetch(`http://127.0.0.1:${port}${WebmcpNativeHost.STAND_DOWN_PATH}`, {
				method: 'POST',
				headers: {
					authorization: `Bearer ${token}`,
				},
				signal: AbortSignal.timeout(WebmcpNativeHost.PROBE_TIMEOUT),
			});
			return response.status === 200;
		} catch {
			return false;
		}
	}

	/**
	 * Waits.
	 *
	 * @param milliseconds - How long to wait.
	 * @returns Nothing.
	 */
	static async _wait(milliseconds: number): Promise<void> {
		await new Promise((resolve) => {
			setTimeout(resolve, milliseconds);
		});
	}

	/**
	 * Writes a line to standard error and to a log file.
	 *
	 * Standard output carries native messages and nothing else, so it can never be used for logging.
	 *
	 * @param line - What to record.
	 * @returns Nothing.
	 */
	static _log(line: string): void {
		const stamped = `${new Date().toISOString()} ${line}\n`;
		process.stderr.write(stamped);
		try {
			Fs.appendFileSync(Path.join(HostStateFiles.STATE_DIR, 'host.log'), stamped);
		} catch {
			// Logging must never take the host down.
		}
	}
}

if (import.meta.filename === process.argv[1]) {
	const host = new WebmcpNativeHost();
	try {
		await host.start();
	} catch (error) {
		WebmcpNativeHost._log(`the host could not start: ${(error as Error)?.stack ?? error}`);
		process.exit(1);
	}
}

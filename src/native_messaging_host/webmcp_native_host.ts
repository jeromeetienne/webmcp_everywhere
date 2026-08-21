import Crypto from 'node:crypto';
import Fs from 'node:fs';
import Http from 'node:http';
import Os from 'node:os';
import Path from 'node:path';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { NativeMessagingCodec } from './native_messaging_codec.ts';

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	Types
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/** One tool as the extension describes it. */
export type ExtensionTool = {
	/** The tool's name, already carrying its adapter and tab namespacing. */
	name: string;
	/** What the tool does, shown to an agent. */
	description: string;
	/** The tool's JSON Schema, absent when the tool takes no arguments. */
	inputSchema?: Record<string, unknown>;
	/** A short human-readable name, when the adapter gave one. */
	title?: string;
	/** Whether the tool only reads the page. */
	readOnly?: boolean;
};

/** What the host asks the extension to do. */
export type ExtensionRequest =
	| {
		/** Ask for every tool the extension currently offers. */
		kind: 'listTools';
	}
	| {
		/** Ask the extension to run one tool. */
		kind: 'callTool';
		/** The tool's name, as `listTools` reported it. */
		name: string;
		/** The tool's arguments. */
		args: Record<string, unknown>;
	};

/** One answer coming back from the extension. */
export type ExtensionAnswer = {
	/** The identifier of the request this answers. */
	id?: number;
	/** Whether the extension carried the request out. */
	ok?: boolean;
	/** Why the extension refused, when it did. */
	error?: string;
	/** Whatever the request produced. */
	result?: unknown;
};

/** One caller waiting for the extension to answer. */
type PendingRequest = {
	/** Hands the extension's result to the caller. */
	resolve: (result: unknown) => void;
	/** Tells the caller the request failed. */
	reject: (error: Error) => void;
	/** The timer that gives up on a silent extension. */
	timer: NodeJS.Timeout;
};

/** How to run the host. */
export type WebmcpNativeHostOptions = {
	/** The port to serve Model Context Protocol on. */
	port?: number;
};

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
	/** Where the endpoint details and the token are kept, for an agent to read. */
	static STATE_DIR = Path.join(Os.homedir(), '.webmcp_everywhere');

	/** The port to serve on, unless it is taken. */
	static DEFAULT_PORT = 8765;

	/** How long to wait for the extension to answer one request, in milliseconds. */
	static REQUEST_TIMEOUT = 20000;

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

	/**
	 * @param options - How to run.
	 */
	constructor(options: WebmcpNativeHostOptions = {}) {
		this.port = options.port ?? Number(process.env.WEBMCP_HOST_PORT ?? WebmcpNativeHost.DEFAULT_PORT);
		this.channel = null;
		this.nextId = 1;
		this.pending = new Map();
		this.extensionConnected = false;
		this.token = WebmcpNativeHost._readOrCreateToken();
	}

	/**
	 * Connects to the extension and starts serving.
	 *
	 * @returns The port actually being served on.
	 */
	async start(): Promise<number> {
		this.channel = new NativeMessagingCodec(process.stdin, process.stdout);
		this.channel.onMessage = (message) => {
			this._onExtensionMessage(message as ExtensionAnswer);
		};
		this.channel.onClose = () => {
			WebmcpNativeHost._log('the extension disconnected, shutting down');
			process.exit(0);
		};
		this.channel.start();
		this.extensionConnected = true;

		const httpServer = Http.createServer((request, response) => {
			void this._onHttpRequest(request, response);
		});

		const port = await WebmcpNativeHost._listen(httpServer, this.port);
		this.port = port;
		WebmcpNativeHost._writeEndpoint(port, this.token);
		WebmcpNativeHost._log(`serving Model Context Protocol on http://127.0.0.1:${port}/mcp`);
		return port;
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
			response.writeHead(200, {
				'content-type': 'application/json',
			});
			response.end(JSON.stringify({
				ok: true,
				extensionConnected: this.extensionConnected,
			}));
			return;
		}

		if (WebmcpNativeHost._isAuthorised(request, this.token) === false) {
			response.writeHead(401, {
				'content-type': 'application/json',
			});
			response.end(JSON.stringify({
				error: 'a bearer token is required; read it from ~/.webmcp_everywhere/endpoint.json',
			}));
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

	/**
	 * Listens on a port, stepping to the next one when it is taken.
	 *
	 * @param httpServer - The server to start.
	 * @param preferredPort - The port to try first.
	 * @returns The port actually bound.
	 */
	static async _listen(httpServer: Http.Server, preferredPort: number): Promise<number> {
		for (let port = preferredPort; port < preferredPort + 20; port++) {
			const bound = await new Promise<boolean>((resolve) => {
				const onError = () => {
					httpServer.removeListener('error', onError);
					resolve(false);
				};
				httpServer.once('error', onError);
				httpServer.listen(port, '127.0.0.1', () => {
					httpServer.removeListener('error', onError);
					resolve(true);
				});
			});
			if (bound === true) {
				return port;
			}
		}
		throw new Error(`no free port between ${preferredPort} and ${preferredPort + 20}`);
	}

	/**
	 * Reads the stored token, creating one on first run.
	 *
	 * The token persists so an agent configured once keeps working across restarts.
	 *
	 * @returns The token.
	 */
	static _readOrCreateToken(): string {
		Fs.mkdirSync(WebmcpNativeHost.STATE_DIR, {
			recursive: true,
			mode: 0o700,
		});
		const tokenPath = Path.join(WebmcpNativeHost.STATE_DIR, 'token');
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
	 * Records where the host is listening, so an agent can be pointed at it.
	 *
	 * @param port - The bound port.
	 * @param token - The bearer token.
	 * @returns Nothing.
	 */
	static _writeEndpoint(port: number, token: string): void {
		Fs.writeFileSync(
			Path.join(WebmcpNativeHost.STATE_DIR, 'endpoint.json'),
			JSON.stringify(
				{
					url: `http://127.0.0.1:${port}/mcp`,
					token: token,
					startedAt: new Date().toISOString(),
				},
				null,
				'\t',
			) + '\n',
			{
				mode: 0o600,
			},
		);
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
			Fs.appendFileSync(Path.join(WebmcpNativeHost.STATE_DIR, 'host.log'), stamped);
		} catch {
			// Logging must never take the host down.
		}
	}
}

if (import.meta.filename === process.argv[1]) {
	const host = new WebmcpNativeHost();
	await host.start();
}

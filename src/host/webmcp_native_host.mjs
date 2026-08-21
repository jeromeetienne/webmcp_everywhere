import Crypto from 'node:crypto';
import Fs from 'node:fs';
import Http from 'node:http';
import Os from 'node:os';
import Path from 'node:path';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { NativeMessagingCodec } from './native_messaging_codec.mjs';

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
	 * @param {object} options - How to run.
	 * @param {number} [options.port] - The port to serve Model Context Protocol on.
	 */
	constructor(options = {}) {
		/** @type {number} The port to serve on. */
		this.port = options.port ?? Number(process.env.WEBMCP_HOST_PORT ?? WebmcpNativeHost.DEFAULT_PORT);
		/** @type {NativeMessagingCodec|null} The channel to the extension. */
		this.channel = null;
		/** @type {number} The next request identifier. */
		this.nextId = 1;
		/** @type {Map<number, {resolve: Function, reject: Function, timer: any}>} Requests awaiting the extension. */
		this.pending = new Map();
		/** @type {boolean} Whether the extension is connected. */
		this.extensionConnected = false;
		/** @type {string} The bearer token an agent must present. */
		this.token = WebmcpNativeHost._readOrCreateToken();
	}

	/**
	 * Connects to the extension and starts serving.
	 *
	 * @returns {Promise<number>} The port actually being served on.
	 */
	async start() {
		this.channel = new NativeMessagingCodec(process.stdin, process.stdout);
		this.channel.onMessage = (message) => {
			this._onExtensionMessage(message);
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
	 * @returns {Server} The configured server.
	 */
	_buildServer() {
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
			const answer = await this._askExtension({
				kind: 'listTools',
			});
			const tools = (answer?.tools ?? []).map((tool) => ({
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

			tools.unshift({
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
				annotations: {
					title: 'List adapted pages',
					readOnlyHint: true,
				},
			});

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
							text: `The tool failed: ${error?.message ?? String(error)}`,
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
	 * @param {Http.IncomingMessage} request - The request.
	 * @param {Http.ServerResponse} response - The response.
	 * @returns {Promise<void>} Nothing.
	 */
	async _onHttpRequest(request, response) {
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
			WebmcpNativeHost._log(`handleRequest failed: ${error?.stack ?? error}`);
			if (response.headersSent === false) {
				response.writeHead(500, {
					'content-type': 'application/json',
				});
				response.end(JSON.stringify({
					error: String(error?.message ?? error),
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
	 * @param {object} request - What to ask.
	 * @returns {Promise<any>} The extension's result.
	 * @throws When the extension is absent, refuses, or does not answer in time.
	 */
	async _askExtension(request) {
		if (this.channel === null || this.extensionConnected === false) {
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
			this.channel.send({
				id: id,
				...request,
			});
		});
	}

	/**
	 * Routes one answer from the extension back to whoever asked.
	 *
	 * @param {any} message - The extension's message.
	 * @returns {void} Nothing.
	 */
	_onExtensionMessage(message) {
		const waiter = this.pending.get(message?.id);
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
	 * @param {Http.IncomingMessage} request - The request.
	 * @param {string} token - The expected token.
	 * @returns {boolean} Whether the request may proceed.
	 */
	static _isAuthorised(request, token) {
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
	 * @param {Http.IncomingMessage} request - The request.
	 * @returns {Promise<any>} The parsed body, or undefined when there is none.
	 */
	static async _readJsonBody(request) {
		const chunks = [];
		for await (const chunk of request) {
			chunks.push(chunk);
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
	 * @param {Http.Server} httpServer - The server to start.
	 * @param {number} preferredPort - The port to try first.
	 * @returns {Promise<number>} The port actually bound.
	 */
	static async _listen(httpServer, preferredPort) {
		for (let port = preferredPort; port < preferredPort + 20; port++) {
			const bound = await new Promise((resolve) => {
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
	 * @returns {string} The token.
	 */
	static _readOrCreateToken() {
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
	 * @param {number} port - The bound port.
	 * @param {string} token - The bearer token.
	 * @returns {void} Nothing.
	 */
	static _writeEndpoint(port, token) {
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
	 * @param {string} line - What to record.
	 * @returns {void} Nothing.
	 */
	static _log(line) {
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

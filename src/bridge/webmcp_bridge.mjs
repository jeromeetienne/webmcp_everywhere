import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { CdpClient } from './cdp_client.mjs';

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	WebmcpBridge — re-exposes a page's WebMCP tools to agents that speak Model Context Protocol
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/**
 * Serves the tools registered on one browser page as Model Context Protocol tools.
 *
 * No agent available today speaks WebMCP. Codex, Claude Code, and everything else speak Model Context
 * Protocol, so something has to sit between them and `document.modelContext`. That is this. It is not a
 * workaround for the demonstration; it is how any ordinary agent will consume this project's adapters
 * until browsers ship their own agent surface.
 *
 * The tool list is read from the page every time it is asked for, so an adapter that registers or
 * withdraws tools as the page changes is reflected without restarting the bridge.
 */
export class WebmcpBridge {
	/**
	 * @param {object} options - How to reach the page.
	 * @param {number} [options.port] - Chrome's remote debugging port.
	 * @param {string} [options.urlFragment] - Text the target page's uniform resource locator contains.
	 */
	constructor(options = {}) {
		/** @type {number} Chrome's remote debugging port. */
		this.port = options.port ?? Number(process.env.WEBMCP_BRIDGE_PORT ?? 9333);
		/** @type {string} Text identifying which page to attach to. */
		this.urlFragment = options.urlFragment ?? process.env.WEBMCP_BRIDGE_PAGE ?? 'todomvc';
		/** @type {CdpClient|null} The connection to the page, opened lazily and reopened when it drops. */
		this.page = null;
		/** @type {Server} The Model Context Protocol server. */
		this.server = new Server(
			{
				name: 'webmcp-everywhere-bridge',
				version: '0.1.0',
			},
			{
				capabilities: {
					tools: {},
				},
			},
		);
	}

	/**
	 * Wires up the request handlers and serves on standard input and output.
	 *
	 * @returns {Promise<void>} Nothing, until the transport closes.
	 */
	async serve() {
		this.server.setRequestHandler(ListToolsRequestSchema, async () => {
			return {
				tools: await this.listTools(),
			};
		});

		this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
			try {
				const result = await this.callTool(request.params.name, request.params.arguments ?? {});
				return {
					content: [
						{
							type: 'text',
							text: result,
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

		await this.server.connect(new StdioServerTransport());
	}

	/**
	 * Reads the tools registered on the page and describes them the way Model Context Protocol expects.
	 *
	 * @returns {Promise<Array<{name: string, description: string, inputSchema: object}>>} The tools.
	 */
	async listTools() {
		const page = await this._connectedPage();
		const raw = await page.evaluate(`
			document.modelContext.getTools().then((tools) => JSON.stringify(tools.map((tool) => ({
				name: tool.name,
				title: tool.title ?? null,
				description: tool.description,
				inputSchema: tool.inputSchema ?? null,
				readOnly: tool.annotations?.readOnlyHint === true,
			}))))
		`);
		/**
		 * @type {Array<{name: string, title: string|null, description: string,
		 * inputSchema: string|null, readOnly: boolean}>}
		 */
		const pageTools = JSON.parse(raw);

		return pageTools.map((tool) => {
			return {
				name: tool.name,
				description: tool.description,
				inputSchema: WebmcpBridge._parseInputSchema(tool.inputSchema),
				annotations: {
					title: tool.title ?? undefined,
					readOnlyHint: tool.readOnly,
				},
			};
		});
	}

	/**
	 * Runs one of the page's tools.
	 *
	 * The lookup has to happen inside the page. A `RegisteredTool` carries a live `window` reference, so
	 * it cannot be serialised out of the page and handed back in; only its name can cross the boundary.
	 *
	 * @param {string} name - The tool's name, as `listTools` reported it.
	 * @param {object} args - The tool's arguments.
	 * @returns {Promise<string>} Whatever the tool returned, as a string.
	 * @throws When the tool is not registered or its handler throws.
	 */
	async callTool(name, args) {
		const page = await this._connectedPage();
		const expression = `
			(async () => {
				const tools = await document.modelContext.getTools();
				const tool = tools.find((candidate) => candidate.name === ${JSON.stringify(name)});
				if (tool === undefined) {
					throw new Error('no tool named ${name} is registered on this page');
				}
				return await document.modelContext.executeTool(tool, ${JSON.stringify(JSON.stringify(args))});
			})()
		`;
		return await page.evaluate(expression);
	}

	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////
	//	Helpers
	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////

	/**
	 * Returns a live connection to the page, opening or reopening one as needed.
	 *
	 * @returns {Promise<CdpClient>} A connected client.
	 * @throws When Chrome is not running or the page is not open.
	 */
	async _connectedPage() {
		if (this.page !== null) {
			try {
				await this.page.evaluate('1');
				return this.page;
			} catch {
				this.page.close();
				this.page = null;
			}
		}
		await CdpClient.waitUntilReady(this.port, 5000);
		this.page = await CdpClient.connectToPage(this.port, this.urlFragment);
		return this.page;
	}

	/**
	 * Turns the schema string WebMCP hands back into the object Model Context Protocol wants.
	 *
	 * Chrome returns `inputSchema` as a JSON string rather than the object that was registered, which the
	 * specification's WebIDL does not say. A tool with no schema still needs one here, because a Model
	 * Context Protocol client will reject a tool without it.
	 *
	 * @param {string|null} schemaJson - The schema as WebMCP reported it.
	 * @returns {object} A JSON Schema object.
	 */
	static _parseInputSchema(schemaJson) {
		const empty = {
			type: 'object',
			properties: {},
		};
		if (schemaJson === null || schemaJson === undefined) {
			return empty;
		}
		try {
			const parsed = JSON.parse(schemaJson);
			if (parsed === null || typeof parsed !== 'object') {
				return empty;
			}
			return parsed;
		} catch {
			return empty;
		}
	}
}

if (import.meta.filename === process.argv[1]) {
	const bridge = new WebmcpBridge();
	await bridge.serve();
}

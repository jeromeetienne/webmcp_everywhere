import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { CdpClient } from './cdp_client.ts';

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	Types
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/** One tool as the page reports it, read out of `document.modelContext`. */
type PageTool = {
	/** The tool's name. */
	name: string;
	/** A short human-readable name, or null when the adapter gave none. */
	title: string | null;
	/** What the tool does. */
	description: string;
	/** The tool's JSON Schema, which WebMCP hands back as a string. */
	inputSchema: string | null;
	/** Whether the tool only reads the page. */
	readOnly: boolean;
};

/** A JSON Schema describing a tool's arguments. */
type InputSchema = {
	/** Always `object`, because Model Context Protocol accepts nothing else at the top level. */
	type: 'object';
	/** Whatever else the schema carries. */
	[key: string]: unknown;
};

/** One tool as Model Context Protocol describes it. */
type BridgedTool = {
	/** The tool's name. */
	name: string;
	/** What the tool does. */
	description: string;
	/** The tool's arguments. */
	inputSchema: InputSchema;
	/** Hints a client may show or act on. */
	annotations: {
		/** A short human-readable name, when the adapter gave one. */
		title: string | undefined;
		/** Whether the tool only reads the page. */
		readOnlyHint: boolean;
	};
};

/** How to reach the page. */
export type WebmcpBridgeOptions = {
	/** Chrome's remote debugging port. */
	port?: number;
	/** Text the target page's uniform resource locator contains. */
	urlFragment?: string;
};

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
	/** Chrome's remote debugging port. */
	port: number;

	/** Text identifying which page to attach to. */
	urlFragment: string;

	/** The connection to the page, opened lazily and reopened when it drops. */
	page: CdpClient | null;

	/** The Model Context Protocol server. */
	server: Server;

	/**
	 * @param options - How to reach the page.
	 */
	constructor(options: WebmcpBridgeOptions = {}) {
		this.port = options.port ?? Number(process.env.WEBMCP_BRIDGE_PORT ?? 9333);
		this.urlFragment = options.urlFragment ?? process.env.WEBMCP_BRIDGE_PAGE ?? 'todomvc';
		this.page = null;
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
	 * @returns Nothing, until the transport closes.
	 */
	async serve(): Promise<void> {
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
							text: `The tool failed: ${(error as Error)?.message ?? String(error)}`,
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
	 * @returns The tools.
	 */
	async listTools(): Promise<BridgedTool[]> {
		const page = await this._connectedPage();
		const raw = await page.evaluate<string>(`
			document.modelContext.getTools().then((tools) => JSON.stringify(tools.map((tool) => ({
				name: tool.name,
				title: tool.title ?? null,
				description: tool.description,
				inputSchema: tool.inputSchema ?? null,
				readOnly: tool.annotations?.readOnlyHint === true,
			}))))
		`);
		const pageTools = JSON.parse(raw) as PageTool[];

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
	 * @param name - The tool's name, as `listTools` reported it.
	 * @param args - The tool's arguments.
	 * @returns Whatever the tool returned, as a string.
	 * @throws When the tool is not registered or its handler throws.
	 */
	async callTool(name: string, args: Record<string, unknown>): Promise<string> {
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
		return await page.evaluate<string>(expression);
	}

	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////
	//	Helpers
	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////

	/**
	 * Returns a live connection to the page, opening or reopening one as needed.
	 *
	 * @returns A connected client.
	 * @throws When Chrome is not running or the page is not open.
	 */
	async _connectedPage(): Promise<CdpClient> {
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
	 * @param schemaJson - The schema as WebMCP reported it.
	 * @returns A JSON Schema object.
	 */
	static _parseInputSchema(schemaJson: string | null): InputSchema {
		const empty: InputSchema = {
			type: 'object',
			properties: {},
		};
		if (schemaJson === null || schemaJson === undefined) {
			return empty;
		}
		try {
			const parsed = JSON.parse(schemaJson) as unknown;
			if (parsed === null || typeof parsed !== 'object') {
				return empty;
			}
			return parsed as InputSchema;
		} catch {
			return empty;
		}
	}
}

if (import.meta.filename === process.argv[1]) {
	const bridge = new WebmcpBridge();
	await bridge.serve();
}

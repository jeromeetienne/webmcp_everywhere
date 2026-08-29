///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	WebMcpGlobals — ambient declarations for document.modelContext
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/**
 * Hints WebMCP shows an agent about how a tool behaves.
 */
type ToolAnnotations = {
	/** Whether the tool only observes and never changes anything. */
	readOnlyHint?: boolean;
};

/**
 * A tool as it is handed to `registerTool`.
 */
type ModelContextTool = {
	/** The globally visible tool name. */
	name: string;
	/** A short human-readable name. */
	title?: string;
	/** What the tool does. */
	description: string;
	/** JSON Schema for the tool's input. */
	inputSchema?: Record<string, unknown>;
	/** Behaviour hints. */
	annotations?: ToolAnnotations;
	/** The handler. */
	execute: (input: Record<string, unknown>, options?: unknown) => Promise<unknown> | unknown;
};

/**
 * A tool as `getTools` hands it back.
 *
 * Two differences from `ModelContextTool` matter and were found by probing Chrome 151 rather than by
 * reading the specification: `inputSchema` comes back as a JSON string rather than an object, and the
 * object carries a live `window` reference that makes it impossible to pass to `JSON.stringify`.
 */
type RegisteredTool = {
	/** The globally visible tool name. */
	name: string;
	/** A short human-readable name. */
	title?: string;
	/** What the tool does. */
	description: string;
	/** JSON Schema for the tool's input, as a JSON string. */
	inputSchema?: string;
	/** Behaviour hints. */
	annotations?: ToolAnnotations;
	/** The origin that registered the tool. */
	origin?: string;
};

/**
 * Options accepted alongside a tool registration. Aborting the signal unregisters the tool.
 */
type ModelContextRegisterToolOptions = {
	/** Abort this to unregister the tool. */
	signal?: AbortSignal;
};

/**
 * The WebMCP entry point on a document.
 */
interface ModelContext {
	/**
	 * Registers a tool for agents to call.
	 *
	 * @param tool - The tool to register.
	 * @param options - Registration options, including the signal that unregisters it.
	 * @returns Nothing, once registered.
	 */
	registerTool(tool: ModelContextTool, options?: ModelContextRegisterToolOptions): Promise<void>;
	/**
	 * Lists the tools registered on this document.
	 *
	 * @returns The registered tools.
	 */
	getTools(): Promise<RegisteredTool[]>;
	/**
	 * Runs a registered tool.
	 *
	 * @param tool - The tool to run, as returned by `getTools`.
	 * @param inputJson - The tool's input, as a JSON string. Chrome 151 rejects a plain object here.
	 * @returns The tool's result, as a JSON string.
	 */
	executeTool(tool: RegisteredTool, inputJson: string): Promise<string>;
}

interface Document {
	/** The WebMCP entry point, present only when the browser supports it. */
	readonly modelContext: ModelContext;
}

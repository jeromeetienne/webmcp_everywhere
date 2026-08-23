///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	WebmcpNativeHostTypes — the messages the extension and the host exchange
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
export type PendingRequest = {
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

/** What `GET /health` answers, which is how one host recognises another. */
export type HostHealth = {
	/** Always true, because a host that cannot answer does not answer at all. */
	ok: boolean;
	/** The program answering, always `WebmcpNativeHost.SERVER_NAME` for a host of ours. */
	server: string;
	/** Whether the extension is connected to the host answering. */
	extensionConnected: boolean;
	/** The operating system process identifier of the host answering. */
	processId: number;
};

/**
 * What `~/.webmcp_everywhere/endpoint.json` holds.
 *
 * The bearer token is deliberately not among them. It lives in `~/.webmcp_everywhere/token` and only
 * there — see `WebmcpNativeHost._writeEndpoint`.
 */
export type HostEndpointRecord = {
	/** The Model Context Protocol address an agent posts to. */
	url: string;
	/** The operating system process identifier of the host that wrote the file and holds the port. */
	processId: number;
	/** When the host took the port. */
	startedAt: string;
};

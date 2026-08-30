///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	PageQuery — the request and reply shapes that cross the world boundary
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/** One tool as the page reports it to the rest of the extension. */
export type PageToolSummary = {
	/** The qualified name the tool is registered under, such as `demo_playwright_dev__list_todos`. */
	name: string;
	/** A short human-readable name. */
	title: string;
	/** What the tool does. */
	description: string;
	/** The tool's input schema, already parsed out of the JSON string WebMCP hands back. */
	inputSchema: Record<string, unknown>;
	/** How much authority the tool needs, read from the adapter rather than from the registration. */
	permissionClass: string;
	/** Whether the tool only observes. */
	readOnly: boolean;
};

/**
 * What the isolated world asks the main world to do, before the correlating identifier is attached.
 *
 * Kept separate from `PageQueryRequest` rather than written as `Omit<PageQueryRequest, 'requestId'>`,
 * because `Omit` over a union keeps only the keys every member shares and would silently reduce this to
 * `{ kind }`, losing the arguments of a tool call.
 */
export type PageQueryRequestBody =
	| {
			/** List the tools this page has registered. */
			kind: 'listTools';
	  }
	| {
			/** Run one of this page's tools. */
			kind: 'callTool';
			/** The qualified tool name. */
			name: string;
			/** The tool's arguments. */
			args: Record<string, unknown>;
	  };

/** One request, as it travels across the world boundary. */
export type PageQueryRequest = PageQueryRequestBody & {
	/** Correlates the reply with this request. */
	requestId: string;
};

/** What the main world sends back. */
export type PageQueryReply = {
	/** Correlates this reply with its request. */
	requestId: string;
	/** Whether the request succeeded. */
	ok: boolean;
	/** The result, when it succeeded. */
	result?: unknown;
	/** Why it failed, when it did. */
	error?: string;
};

/**
 * Names the events that carry requests and replies between the isolated world and the main world.
 *
 * The two worlds share a document and nothing else. The isolated world holds the extension privileges
 * and the main world holds `document.modelContext`, so every question one has for the other has to
 * cross as an event on the shared document, correlated by an identifier because several can be in
 * flight at once.
 */
export class PageQuery {
	/** The event carrying a request into the main world. */
	static readonly REQUEST_EVENT = 'webmcp-everywhere:query';

	/** The event carrying a reply back out. */
	static readonly REPLY_EVENT = 'webmcp-everywhere:query-reply';

	/** How long the isolated world waits before giving up on the main world, in milliseconds. */
	static readonly TIMEOUT = 15000;

	/**
	 * Sends a request into the main world and waits for its reply.
	 *
	 * @param request - The request to send, without its correlating identifier.
	 * @returns The main world's reply.
	 */
	static async ask(request: PageQueryRequestBody): Promise<PageQueryReply> {
		const requestId = `${Date.now()}_${Math.random().toString(36).slice(2)}`;

		return await new Promise<PageQueryReply>((resolve) => {
			const timer = setTimeout(() => {
				document.removeEventListener(PageQuery.REPLY_EVENT, onReply as EventListener);
				resolve({
					requestId: requestId,
					ok: false,
					error: 'the page did not answer in time',
				});
			}, PageQuery.TIMEOUT);

			const onReply = (event: CustomEvent<PageQueryReply>): void => {
				if (event.detail?.requestId !== requestId) {
					return;
				}
				clearTimeout(timer);
				document.removeEventListener(PageQuery.REPLY_EVENT, onReply as EventListener);
				resolve(event.detail);
			};

			document.addEventListener(PageQuery.REPLY_EVENT, onReply as EventListener);
			document.dispatchEvent(
				new CustomEvent(PageQuery.REQUEST_EVENT, {
					detail: {
						...request,
						requestId: requestId,
					},
				}),
			);
		});
	}

	/**
	 * Sends a reply back out of the main world.
	 *
	 * @param reply - The reply to send.
	 * @returns Nothing.
	 */
	static answer(reply: PageQueryReply): void {
		document.dispatchEvent(
			new CustomEvent(PageQuery.REPLY_EVENT, {
				detail: reply,
			}),
		);
	}
}

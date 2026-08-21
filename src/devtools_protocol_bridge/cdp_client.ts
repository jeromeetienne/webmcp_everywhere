///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	Types
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/** One debuggable target Chrome exposes. */
export type CdpTarget = {
	/** The target's identifier. */
	id: string;
	/** The target's kind, for example `page`. */
	type: string;
	/** The target's title. */
	title: string;
	/** The target's uniform resource locator. */
	url: string;
	/** Where to attach to this target. */
	webSocketDebuggerUrl: string;
};

/** One message arriving on the Chrome DevTools Protocol socket. */
type CdpMessage = {
	/** The identifier of the command this replies to, absent on an event. */
	id?: number;
	/** The method name, present on an event. */
	method?: string;
	/** Why the command failed, when it did. */
	error?: {
		/** What went wrong, in Chrome's words. */
		message: string;
	};
	/** Whatever the command produced. */
	result?: unknown;
};

/** What `Runtime.evaluate` hands back. */
type RuntimeEvaluateResult = {
	/** The evaluated value, wrapped by Chrome. */
	result: {
		/** The value itself, because the command asks for it by value. */
		value: unknown;
	};
	/** Present only when the expression threw. */
	exceptionDetails?: {
		/** A short description of the failure. */
		text: string;
		/** The thrown value, when Chrome could describe it. */
		exception?: {
			/** A human-readable rendering of the thrown value. */
			description?: string;
			/** The thrown value itself, when it was a plain one. */
			value?: unknown;
		};
	};
};

/** One caller waiting for a command's reply. */
type PendingCommand = {
	/** Hands the reply's result to the caller. */
	resolve: (result: unknown) => void;
	/** Tells the caller the command failed. */
	reject: (error: Error) => void;
};

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	CdpClient — one Chrome DevTools Protocol connection, shared by the bridge and the tools
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/**
 * Talks to a running Chrome over the Chrome DevTools Protocol.
 *
 * The bridge uses it to reach `document.modelContext` inside a page, and the development tools use it
 * to install the extension and to check what the runtime did. It keeps one socket open and routes
 * replies by identifier, so callers can issue overlapping commands.
 */
export class CdpClient {
	/** The remote debugging port. */
	port: number;

	/** The open socket, or null before connecting. */
	socket: WebSocket | null;

	/** The next command identifier. */
	nextId: number;

	/** Callers waiting for replies. */
	pending: Map<number, PendingCommand>;

	/**
	 * @param port - The port Chrome is listening on for remote debugging.
	 */
	constructor(port: number) {
		this.port = port;
		this.socket = null;
		this.nextId = 1;
		this.pending = new Map();
	}

	/**
	 * Fetches the list of debuggable targets.
	 *
	 * @param port - The remote debugging port.
	 * @returns Every target Chrome is exposing.
	 */
	static async listTargets(port: number): Promise<CdpTarget[]> {
		const response = await fetch(`http://127.0.0.1:${port}/json/list`);
		return (await response.json()) as CdpTarget[];
	}

	/**
	 * Waits until Chrome's remote debugging endpoint answers.
	 *
	 * @param port - The remote debugging port.
	 * @param timeoutMs - How long to wait before giving up.
	 * @returns Nothing.
	 * @throws When the endpoint never answers.
	 */
	static async waitUntilReady(port: number, timeoutMs = 20000): Promise<void> {
		const deadline = Date.now() + timeoutMs;
		while (Date.now() < deadline) {
			try {
				const response = await fetch(`http://127.0.0.1:${port}/json/version`);
				if (response.ok === true) {
					return;
				}
			} catch {
				// Chrome is not listening yet.
			}
			await new Promise((resolve) => setTimeout(resolve, 250));
		}
		throw new Error(`Chrome never answered on port ${port}`);
	}

	/**
	 * Finds the page target whose uniform resource locator contains a fragment of text.
	 *
	 * @param port - The remote debugging port.
	 * @param urlFragment - Text the target's uniform resource locator must contain.
	 * @param timeoutMs - How long to keep looking.
	 * @returns The matching page target.
	 * @throws When no page matches before the timeout.
	 */
	static async findPage(port: number, urlFragment: string, timeoutMs = 20000): Promise<CdpTarget> {
		const deadline = Date.now() + timeoutMs;
		while (Date.now() < deadline) {
			const targets = await CdpClient.listTargets(port);
			const page = targets.find(
				(target) => target.type === 'page' && target.url.includes(urlFragment),
			);
			if (page !== undefined) {
				return page;
			}
			await new Promise((resolve) => setTimeout(resolve, 250));
		}
		throw new Error(`no page target matching "${urlFragment}" appeared`);
	}

	/**
	 * Opens the connection to a target.
	 *
	 * @param webSocketDebuggerUrl - Where to attach.
	 * @returns Nothing, once connected.
	 */
	async connect(webSocketDebuggerUrl: string): Promise<void> {
		const socket = new WebSocket(webSocketDebuggerUrl);
		this.socket = socket;
		await new Promise<void>((resolve, reject) => {
			socket.onopen = () => {
				resolve();
			};
			socket.onerror = () => {
				reject(new Error(`could not connect to ${webSocketDebuggerUrl}`));
			};
		});
		socket.onmessage = (event) => {
			this._onMessage(JSON.parse(String(event.data)) as CdpMessage);
		};
	}

	/**
	 * Opens a connection to the browser itself, rather than to a page.
	 *
	 * @param port - The remote debugging port.
	 * @returns A connected client.
	 */
	static async connectToBrowser(port: number): Promise<CdpClient> {
		const response = await fetch(`http://127.0.0.1:${port}/json/version`);
		const version = (await response.json()) as {
			webSocketDebuggerUrl: string;
		};
		const client = new CdpClient(port);
		await client.connect(version.webSocketDebuggerUrl);
		return client;
	}

	/**
	 * Opens a connection to a page.
	 *
	 * @param port - The remote debugging port.
	 * @param urlFragment - Text the page's uniform resource locator must contain.
	 * @returns A connected client.
	 */
	static async connectToPage(port: number, urlFragment: string): Promise<CdpClient> {
		const page = await CdpClient.findPage(port, urlFragment);
		const client = new CdpClient(port);
		await client.connect(page.webSocketDebuggerUrl);
		return client;
	}

	/**
	 * Sends one command and waits for its reply.
	 *
	 * @param method - The Chrome DevTools Protocol method name.
	 * @param params - The method's parameters.
	 * @returns The reply's result.
	 * @throws When Chrome reports an error for the command.
	 */
	async send<ResultType = unknown>(method: string, params: Record<string, unknown> = {}): Promise<ResultType> {
		if (this.socket === null) {
			throw new Error('not connected');
		}
		const id = this.nextId++;
		const reply = new Promise<unknown>((resolve, reject) => {
			this.pending.set(id, {
				resolve: resolve,
				reject: reject,
			});
		});
		this.socket.send(JSON.stringify({
			id: id,
			method: method,
			params: params,
		}));
		return (await reply) as ResultType;
	}

	/**
	 * Evaluates an expression in the page's main world and returns its value.
	 *
	 * @param expression - The JavaScript expression to evaluate.
	 * @returns The expression's value, awaited if it is a promise.
	 * @throws When the expression throws.
	 */
	async evaluate<ValueType = unknown>(expression: string): Promise<ValueType> {
		const result = await this.send<RuntimeEvaluateResult>('Runtime.evaluate', {
			expression: expression,
			awaitPromise: true,
			returnByValue: true,
		});
		if (result.exceptionDetails !== undefined) {
			const description =
				result.exceptionDetails.exception?.description ??
				result.exceptionDetails.exception?.value ??
				result.exceptionDetails.text;
			throw new Error(String(description));
		}
		return result.result.value as ValueType;
	}

	/**
	 * Navigates the attached page and waits for it to settle.
	 *
	 * @param url - Where to navigate.
	 * @param settleMs - How long to wait after the navigation before returning.
	 * @returns Nothing.
	 */
	async navigate(url: string, settleMs = 2500): Promise<void> {
		await this.send('Page.enable', {});
		await this.send('Page.navigate', {
			url: url,
		});
		await new Promise((resolve) => setTimeout(resolve, settleMs));
	}

	/**
	 * Closes the connection.
	 *
	 * @returns Nothing.
	 */
	close(): void {
		if (this.socket !== null) {
			this.socket.close();
			this.socket = null;
		}
	}

	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////
	//	Helpers
	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////

	/**
	 * Routes one incoming message to whoever is waiting for it.
	 *
	 * @param message - The decoded message.
	 * @returns Nothing.
	 */
	_onMessage(message: CdpMessage): void {
		if (message.id === undefined) {
			return;
		}
		const waiter = this.pending.get(message.id);
		if (waiter === undefined) {
			return;
		}
		this.pending.delete(message.id);
		if (message.error !== undefined) {
			waiter.reject(new Error(`${message.method ?? 'command'}: ${message.error.message}`));
			return;
		}
		waiter.resolve(message.result);
	}
}

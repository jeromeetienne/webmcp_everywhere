///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	CdpClient — one Chrome DevTools Protocol connection, shared by the bridge and the tools
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/**
 * @typedef {object} CdpTarget
 * @property {string} id - The target's identifier.
 * @property {string} type - The target's kind, for example `page`.
 * @property {string} title - The target's title.
 * @property {string} url - The target's uniform resource locator.
 * @property {string} webSocketDebuggerUrl - Where to attach to this target.
 */

/**
 * Talks to a running Chrome over the Chrome DevTools Protocol.
 *
 * The bridge uses it to reach `document.modelContext` inside a page, and the development tools use it
 * to install the extension and to check what the runtime did. It keeps one socket open and routes
 * replies by identifier, so callers can issue overlapping commands.
 */
export class CdpClient {
	/**
	 * @param {number} port - The port Chrome is listening on for remote debugging.
	 */
	constructor(port) {
		/** @type {number} The remote debugging port. */
		this.port = port;
		/** @type {WebSocket|null} The open socket, or null before connecting. */
		this.socket = null;
		/** @type {number} The next command identifier. */
		this.nextId = 1;
		/** @type {Map<number, {resolve: Function, reject: Function}>} Callers waiting for replies. */
		this.pending = new Map();
	}

	/**
	 * Fetches the list of debuggable targets.
	 *
	 * @param {number} port - The remote debugging port.
	 * @returns {Promise<CdpTarget[]>} Every target Chrome is exposing.
	 */
	static async listTargets(port) {
		const response = await fetch(`http://127.0.0.1:${port}/json/list`);
		return await response.json();
	}

	/**
	 * Waits until Chrome's remote debugging endpoint answers.
	 *
	 * @param {number} port - The remote debugging port.
	 * @param {number} timeoutMs - How long to wait before giving up.
	 * @returns {Promise<void>} Nothing.
	 * @throws When the endpoint never answers.
	 */
	static async waitUntilReady(port, timeoutMs = 20000) {
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
	 * @param {number} port - The remote debugging port.
	 * @param {string} urlFragment - Text the target's uniform resource locator must contain.
	 * @param {number} timeoutMs - How long to keep looking.
	 * @returns {Promise<CdpTarget>} The matching page target.
	 * @throws When no page matches before the timeout.
	 */
	static async findPage(port, urlFragment, timeoutMs = 20000) {
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
	 * @param {string} webSocketDebuggerUrl - Where to attach.
	 * @returns {Promise<void>} Nothing, once connected.
	 */
	async connect(webSocketDebuggerUrl) {
		this.socket = new WebSocket(webSocketDebuggerUrl);
		await new Promise((resolve, reject) => {
			this.socket.onopen = resolve;
			this.socket.onerror = () => reject(new Error(`could not connect to ${webSocketDebuggerUrl}`));
		});
		this.socket.onmessage = (event) => {
			this._onMessage(JSON.parse(event.data));
		};
	}

	/**
	 * Opens a connection to the browser itself, rather than to a page.
	 *
	 * @param {number} port - The remote debugging port.
	 * @returns {Promise<CdpClient>} A connected client.
	 */
	static async connectToBrowser(port) {
		const response = await fetch(`http://127.0.0.1:${port}/json/version`);
		const version = await response.json();
		const client = new CdpClient(port);
		await client.connect(version.webSocketDebuggerUrl);
		return client;
	}

	/**
	 * Opens a connection to a page.
	 *
	 * @param {number} port - The remote debugging port.
	 * @param {string} urlFragment - Text the page's uniform resource locator must contain.
	 * @returns {Promise<CdpClient>} A connected client.
	 */
	static async connectToPage(port, urlFragment) {
		const page = await CdpClient.findPage(port, urlFragment);
		const client = new CdpClient(port);
		await client.connect(page.webSocketDebuggerUrl);
		return client;
	}

	/**
	 * Sends one command and waits for its reply.
	 *
	 * @param {string} method - The Chrome DevTools Protocol method name.
	 * @param {object} params - The method's parameters.
	 * @returns {Promise<any>} The reply's result.
	 * @throws When Chrome reports an error for the command.
	 */
	async send(method, params = {}) {
		if (this.socket === null) {
			throw new Error('not connected');
		}
		const id = this.nextId++;
		const reply = new Promise((resolve, reject) => {
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
		return await reply;
	}

	/**
	 * Evaluates an expression in the page's main world and returns its value.
	 *
	 * @param {string} expression - The JavaScript expression to evaluate.
	 * @returns {Promise<any>} The expression's value, awaited if it is a promise.
	 * @throws When the expression throws.
	 */
	async evaluate(expression) {
		const result = await this.send('Runtime.evaluate', {
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
		return result.result.value;
	}

	/**
	 * Navigates the attached page and waits for it to settle.
	 *
	 * @param {string} url - Where to navigate.
	 * @param {number} settleMs - How long to wait after the navigation before returning.
	 * @returns {Promise<void>} Nothing.
	 */
	async navigate(url, settleMs = 2500) {
		await this.send('Page.enable', {});
		await this.send('Page.navigate', {
			url: url,
		});
		await new Promise((resolve) => setTimeout(resolve, settleMs));
	}

	/**
	 * Closes the connection.
	 *
	 * @returns {void} Nothing.
	 */
	close() {
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
	 * @param {any} message - The decoded message.
	 * @returns {void} Nothing.
	 */
	_onMessage(message) {
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

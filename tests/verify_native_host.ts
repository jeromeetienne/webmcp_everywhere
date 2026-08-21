///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	VerifyNativeHost — checks the extension, the native host, and the HTTP endpoint together
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

import Fs from 'node:fs';
import Os from 'node:os';
import Path from 'node:path';
import { CdpClient } from '../tools/chrome_devtools_protocol/cdp_client.ts';
import { GrantActing } from '../tools/grant_acting.ts';
import { LaunchChrome } from '../tools/launch_chrome.ts';
import type { CheckOutcome, HostEndpoint, HttpOutcome, ToolCallOutcome } from './verify_types.ts';

const ENDPOINT_FILE = Path.join(Os.homedir(), '.webmcp_everywhere', 'endpoint.json');

/**
 * Exercises the whole delivery path an ordinary user would have.
 *
 * Chrome starts the native host by itself, the host serves Model Context Protocol over HTTP, and every
 * request travels through the extension, which is the only place that knows what the user allowed.
 * Nothing here uses the Chrome DevTools Protocol to reach a page; that path exists only for the other
 * checks, and using it here would prove nothing about the design being tested.
 */
export class VerifyNativeHost {
	/**
	 * Runs the checks.
	 *
	 * @returns The outcome.
	 */
	static async run(): Promise<CheckOutcome> {
		await LaunchChrome.run();
		await VerifyNativeHost._pause(5000);

		const endpoint = VerifyNativeHost._readEndpoint();
		let passed = 0;
		let failed = 0;

		/**
		 * Runs one check and records whether it passed.
		 *
		 * @param name - What is being checked.
		 * @param check - The check, returning a detail line. Throwing means failure.
		 * @returns Nothing.
		 */
		const test = async (name: string, check: () => Promise<string>): Promise<void> => {
			try {
				const detail = await check();
				passed += 1;
				console.log(`  PASS  ${name}\n        ${detail}`);
			} catch (error) {
				failed += 1;
				console.log(`  FAIL  ${name}\n        ${(error as Error)?.message ?? error}`);
			}
		};

		await test('Chrome starts the native host by itself', async () => {
			const health = await VerifyNativeHost._get(endpoint, '/health', null);
			if (health.body?.extensionConnected !== true) {
				throw new Error(`the host is up but the extension is not connected: ${JSON.stringify(health.body)}`);
			}
			return `host answering on ${endpoint.url}, extension connected`;
		});

		await test('the endpoint refuses a request with no token', async () => {
			const withoutToken = await VerifyNativeHost._rpc(endpoint, 'tools/list', {}, null);
			if (withoutToken.status !== 401) {
				throw new Error(`expected 401 without a token, got ${withoutToken.status}`);
			}
			const wrongToken = await VerifyNativeHost._rpc(endpoint, 'tools/list', {}, 'not-the-token');
			if (wrongToken.status !== 401) {
				throw new Error(`expected 401 with a wrong token, got ${wrongToken.status}`);
			}
			return 'both a missing token and a wrong token are refused with 401';
		});

		await VerifyNativeHost._setActing(false);
		await VerifyNativeHost._pause(2500);

		await test('with no opt-in the agent is offered read-only tools only', async () => {
			const listed = await VerifyNativeHost._tools(endpoint);
			const acting = listed.filter((name) => /add_todo|delete_todo|edit_todo/.test(name));
			if (acting.length > 0) {
				throw new Error(`acting tools were offered without an opt-in: ${acting.join(', ')}`);
			}
			return `${listed.length} tools offered, none of them acting`;
		});

		await test('an acting tool is refused even when called by name', async () => {
			const called = await VerifyNativeHost._call(endpoint, 'demo_playwright_dev__add_todo', {
				title: 'should never appear',
			});
			if (called.isError !== true) {
				throw new Error(`the call succeeded when it should have been refused: ${called.text}`);
			}
			return `refused: ${called.text.slice(0, 90)}`;
		});

		await VerifyNativeHost._setActing(true);
		await VerifyNativeHost._pause(2500);

		await test('opting in offers the acting tools', async () => {
			const listed = await VerifyNativeHost._tools(endpoint);
			if (listed.includes('demo_playwright_dev__add_todo') === false) {
				throw new Error(`add_todo still missing after the opt-in; offered: ${listed.join(', ')}`);
			}
			return `${listed.length} tools offered, including the acting ones`;
		});

		await test('a tool call changes the real page', async () => {
			await VerifyNativeHost._call(endpoint, 'demo_playwright_dev__set_all_completed', { completed: true });
			await VerifyNativeHost._call(endpoint, 'demo_playwright_dev__clear_completed', {});
			await VerifyNativeHost._call(endpoint, 'demo_playwright_dev__add_todo', { title: 'through the host' });
			const seen = await VerifyNativeHost._readPageTitles();
			if (seen.includes('through the host') === false) {
				throw new Error(`the page holds ${JSON.stringify(seen)}`);
			}
			return `the browser really shows ${JSON.stringify(seen)}`;
		});

		await test('two tabs on one site are told apart', async () => {
			const secondTab = await VerifyNativeHost._openSecondTab();
			await VerifyNativeHost._pause(4000);
			const listed = await VerifyNativeHost._tools(endpoint);
			const suffixed = listed.filter((name) => name.includes('__tab'));
			if (suffixed.length === 0) {
				throw new Error(`no tool gained a tab suffix; offered: ${listed.length} tools`);
			}
			const plain = listed.filter((name) => name.startsWith('demo_playwright_dev__') && name.includes('__tab') === false);
			if (plain.length > 0) {
				throw new Error(`some tools stayed ambiguous: ${plain.join(', ')}`);
			}
			await VerifyNativeHost._closeTarget(secondTab);
			await VerifyNativeHost._pause(2000);
			return `${listed.length} tools, every site tool carrying a tab suffix`;
		});

		await test('closing a tab withdraws its tools', async () => {
			const listed = await VerifyNativeHost._tools(endpoint);
			const suffixed = listed.filter((name) => name.includes('__tab'));
			if (suffixed.length > 0) {
				throw new Error(`tools from the closed tab are still offered: ${suffixed.join(', ')}`);
			}
			return `back to ${listed.length} tools with no tab suffixes`;
		});

		await test('a page nobody had open can be opened, used, and closed again', async () => {
			const opened = await VerifyNativeHost._call(endpoint, 'webmcp_everywhere__open_page', {
				url: 'https://caniuse.com/',
			});
			if (opened.isError === true) {
				throw new Error(`open_page was refused: ${opened.text.slice(0, 120)}`);
			}
			const page = JSON.parse(opened.text) as { tabId: number; url: string; tools: string[] };
			const afterOpen = await VerifyNativeHost._tools(endpoint);
			if (afterOpen.some((name) => name.startsWith('caniuse_com__')) === false) {
				throw new Error(`the opened page offered no tools; offered: ${afterOpen.join(', ')}`);
			}

			const closed = await VerifyNativeHost._call(endpoint, 'webmcp_everywhere__close_page', {
				tabId: page.tabId,
			});
			if (closed.isError === true) {
				throw new Error(`close_page was refused: ${closed.text.slice(0, 120)}`);
			}
			await VerifyNativeHost._pause(2000);
			const afterClose = await VerifyNativeHost._tools(endpoint);
			if (afterClose.some((name) => name.startsWith('caniuse_com__')) === true) {
				throw new Error(`the closed page still offers tools: ${afterClose.join(', ')}`);
			}
			return `tab ${page.tabId} opened with ${page.tools.length} tools, then closed again`;
		});

		await test('a page no adapter covers is neither opened nor closed', async () => {
			const opened = await VerifyNativeHost._call(endpoint, 'webmcp_everywhere__open_page', {
				url: 'https://example.com/',
			});
			if (opened.isError === false) {
				throw new Error(`opening a page with no adapter succeeded: ${opened.text.slice(0, 120)}`);
			}
			const closed = await VerifyNativeHost._call(endpoint, 'webmcp_everywhere__close_page', {
				tabId: 999999,
			});
			if (closed.isError === false) {
				throw new Error(`closing a tab that does not exist succeeded: ${closed.text.slice(0, 120)}`);
			}
			return `both refused: "${opened.text.slice(0, 80)}…"`;
		});

		return { passed, failed };
	}

	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////
	//	Helpers
	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////

	/**
	 * Reads where the host says it is listening.
	 *
	 * @returns The endpoint details.
	 * @throws When the host never wrote them, which means Chrome never started it.
	 */
	static _readEndpoint(): HostEndpoint {
		if (Fs.existsSync(ENDPOINT_FILE) === false) {
			throw new Error(`${ENDPOINT_FILE} is missing, so Chrome never started the native host`);
		}
		return JSON.parse(Fs.readFileSync(ENDPOINT_FILE, 'utf8')) as HostEndpoint;
	}

	/**
	 * Sends one plain HTTP request.
	 *
	 * @param endpoint - Where the host is.
	 * @param path - The path to request.
	 * @param token - The bearer token, or null to send none.
	 * @returns The response.
	 */
	static async _get(endpoint: HostEndpoint, path: string, token: string | null): Promise<HttpOutcome> {
		const base = new URL(endpoint.url);
		const response = await fetch(`${base.origin}${path}`, {
			headers: token === null ? {} : { authorization: `Bearer ${token}` },
		});
		return {
			status: response.status,
			body: await response.json().then((body) => body as HttpOutcome['body']).catch(() => null),
		};
	}

	/**
	 * Sends one Model Context Protocol call.
	 *
	 * @param endpoint - Where the host is.
	 * @param method - The method name.
	 * @param params - The parameters.
	 * @param token - The token, or null for none, or undefined for the real one.
	 * @returns The response.
	 */
	static async _rpc(
		endpoint: HostEndpoint,
		method: string,
		params: Record<string, unknown>,
		token: string | null | undefined,
	): Promise<HttpOutcome> {
		const bearer = token === undefined ? endpoint.token : token;
		const headers: Record<string, string> = {
			'content-type': 'application/json',
			accept: 'application/json, text/event-stream',
		};
		if (bearer !== null) {
			headers['authorization'] = `Bearer ${bearer}`;
		}
		const response = await fetch(endpoint.url, {
			method: 'POST',
			headers: headers,
			body: JSON.stringify({
				jsonrpc: '2.0',
				id: 1,
				method: method,
				params: params,
			}),
		});
		return {
			status: response.status,
			body: await response.json().then((body) => body as HttpOutcome['body']).catch(() => null),
		};
	}

	/**
	 * Lists the tool names the endpoint currently offers.
	 *
	 * @param endpoint - Where the host is.
	 * @returns The offered names.
	 */
	static async _tools(endpoint: HostEndpoint): Promise<string[]> {
		const response = await VerifyNativeHost._rpc(endpoint, 'tools/list', {}, undefined);
		return (response.body?.result?.tools ?? []).map((tool) => tool.name);
	}

	/**
	 * Calls one tool through the endpoint.
	 *
	 * @param endpoint - Where the host is.
	 * @param name - The tool name.
	 * @param args - The arguments.
	 * @returns What came back.
	 */
	static async _call(
		endpoint: HostEndpoint,
		name: string,
		args: Record<string, unknown>,
	): Promise<ToolCallOutcome> {
		const response = await VerifyNativeHost._rpc(
			endpoint,
			'tools/call',
			{
				name: name,
				arguments: args,
			},
			undefined,
		);
		const result = response.body?.result;
		return {
			text: (result?.content ?? []).map((part) => part.text ?? '').join(''),
			isError: result?.isError === true,
		};
	}

	/**
	 * Reads the todo titles straight out of the browser, to check a claim rather than trust it.
	 *
	 * @returns The titles on the page.
	 */
	static async _readPageTitles(): Promise<string[]> {
		const page = await CdpClient.connectToPage(9333, 'todomvc');
		const raw = await page.evaluate<string>(
			'JSON.stringify(JSON.parse(localStorage.getItem("react-todos") ?? "[]").map((todo) => todo.title))',
		);
		page.close();
		return JSON.parse(raw) as string[];
	}

	/**
	 * Opens a second tab on the same site.
	 *
	 * @returns The new target's identifier.
	 */
	static async _openSecondTab(): Promise<string> {
		const browser = await CdpClient.connectToBrowser(9333);
		const created = await browser.send<{ targetId: string }>('Target.createTarget', {
			url: 'https://demo.playwright.dev/todomvc/#/active',
		});
		browser.close();
		return created.targetId;
	}

	/**
	 * Closes a tab.
	 *
	 * @param targetId - The target to close.
	 * @returns Nothing.
	 */
	static async _closeTarget(targetId: string): Promise<void> {
		const browser = await CdpClient.connectToBrowser(9333);
		await browser.send('Target.closeTarget', {
			targetId: targetId,
		});
		browser.close();
	}

	/**
	 * Sets the user's opt-in, standing in for the popup.
	 *
	 * @param allowed - Whether acting tools are allowed.
	 * @returns Nothing.
	 */
	static async _setActing(allowed: boolean): Promise<void> {
		await GrantActing.run({
			actingAllowed: allowed,
			globallyEnabled: true,
		});
	}

	/**
	 * Waits.
	 *
	 * @param milliseconds - How long to wait.
	 * @returns Nothing.
	 */
	static async _pause(milliseconds: number): Promise<void> {
		await new Promise((resolve) => setTimeout(resolve, milliseconds));
	}
}

if (import.meta.filename === process.argv[1]) {
	console.log('\nThe native host path — extension, host, and HTTP endpoint together\n');
	const outcome = await VerifyNativeHost.run();
	console.log(`\n${outcome.passed} passed, ${outcome.failed} failed\n`);
	process.exit(outcome.failed === 0 ? 0 : 1);
}

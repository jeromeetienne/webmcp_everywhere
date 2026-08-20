///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	VerifyMilestones — drives the real extension in a real Chrome and checks what it does
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

import { CdpClient } from '../src/bridge/cdp_client.mjs';
import { LaunchChrome } from './launch_chrome.mjs';

const TARGET_URL = 'https://demo.playwright.dev/todomvc/';

/**
 * Runs every milestone check against a live browser and reports what actually happened.
 *
 * Nothing here is mocked. Chrome is launched, the extension is installed, the real page is loaded, and
 * every assertion reads state back out of that page.
 */
export class VerifyMilestones {
	/**
	 * Runs the whole suite.
	 *
	 * @returns {Promise<{passed: number, failed: number, results: Array<{name: string, ok: boolean, detail: string}>}>} The outcome.
	 */
	static async run() {
		const launched = await LaunchChrome.run();
		const extensionId = await VerifyMilestones._extensionId(launched.port);

		/** @type {Array<{name: string, ok: boolean, detail: string}>} */
		const results = [];

		/**
		 * @param {string} name - What is being checked.
		 * @param {() => Promise<string>} check - The check, returning a detail line. Throwing means failure.
		 * @returns {Promise<void>} Nothing.
		 */
		const test = async (name, check) => {
			try {
				const detail = await check();
				results.push({ name, ok: true, detail });
				console.log(`  PASS  ${name}\n        ${detail}`);
			} catch (error) {
				results.push({ name, ok: false, detail: String(error?.message ?? error) });
				console.log(`  FAIL  ${name}\n        ${error?.message ?? error}`);
			}
		};

		await VerifyMilestones._setGrant(launched.port, extensionId, false, true);
		await VerifyMilestones._reload(launched.port);
		let page = await CdpClient.connectToPage(launched.port, 'todomvc');
		await VerifyMilestones._resetTodos(page);

		console.log('\nMilestone 3 — permission classes are enforced, not self-reported\n');

		await test('read-only tools register with no opt-in', async () => {
			const names = await VerifyMilestones._toolNames(page);
			const expected = ['count_todos', 'get_active_filter', 'list_todos'].map(
				(name) => `demo_playwright_dev__${name}`,
			);
			VerifyMilestones._assertSameSet(names, expected);
			return `${names.length} registered: ${names.join(', ')}`;
		});

		await test('acting tools are withheld until the user opts in', async () => {
			const names = await VerifyMilestones._toolNames(page);
			const acting = names.filter((name) => name.includes('add_todo') || name.includes('delete_todo'));
			if (acting.length > 0) {
				throw new Error(`acting tools leaked without a grant: ${acting.join(', ')}`);
			}
			const report = await page.evaluate('JSON.stringify(window.__webmcpEverywhereReport ?? null)');
			return `7 acting tools withheld; report says ${report === 'null' ? 'nothing' : report}`;
		});

		console.log('\nMilestone 2 — the read-only tools tell the truth about the page\n');

		await test('list_todos and count_todos agree with the page', async () => {
			await VerifyMilestones._seed(page, ['alpha', 'beta', 'gamma']);
			const listed = await VerifyMilestones._callTool(page, 'list_todos');
			const counted = await VerifyMilestones._callTool(page, 'count_todos');
			if (listed.todos.length !== 3) {
				throw new Error(`list_todos reported ${listed.todos.length} todos, expected 3`);
			}
			if (counted.total !== 3 || counted.active !== 3 || counted.completed !== 0) {
				throw new Error(`count_todos reported ${JSON.stringify(counted)}`);
			}
			return `list_todos: ${listed.todos.map((todo) => todo.title).join(', ')}; count: ${JSON.stringify(counted)}`;
		});

		await test('get_active_filter follows the page', async () => {
			await page.evaluate('location.hash = "#/active"');
			await VerifyMilestones._pause(400);
			const active = await VerifyMilestones._callTool(page, 'get_active_filter');
			await page.evaluate('location.hash = "#/"');
			await VerifyMilestones._pause(400);
			const all = await VerifyMilestones._callTool(page, 'get_active_filter');
			if (active.activeFilter !== 'active' || all.activeFilter !== 'all') {
				throw new Error(`got ${active.activeFilter} then ${all.activeFilter}`);
			}
			return 'reported active, then all';
		});

		await test('tools survive same-document navigation', async () => {
			await page.evaluate('location.hash = "#/completed"');
			await VerifyMilestones._pause(600);
			const names = await VerifyMilestones._toolNames(page);
			await page.evaluate('location.hash = "#/"');
			await VerifyMilestones._pause(400);
			if (names.length !== 3) {
				throw new Error(`after a fragment change ${names.length} tools were registered, expected 3`);
			}
			return 'still 3 tools after the fragment changed twice';
		});

		console.log('\nMilestone 3 — granting acting rights changes what is registered, live\n');

		await test('acting tools appear once the user opts in', async () => {
			await VerifyMilestones._setGrant(launched.port, extensionId, true, true);
			await VerifyMilestones._pause(1200);
			const names = await VerifyMilestones._toolNames(page);
			if (names.length !== 10) {
				throw new Error(`expected 10 tools after the grant, got ${names.length}: ${names.join(', ')}`);
			}
			return `10 tools registered without a page reload: ${names.length} names`;
		});

		console.log('\nMilestone 2 — the acting tools really drive the page\n');

		await test('add_todo adds a todo', async () => {
			const before = (await VerifyMilestones._callTool(page, 'count_todos')).total;
			const added = await VerifyMilestones._callTool(page, 'add_todo', { title: 'buy milk' });
			const after = (await VerifyMilestones._callTool(page, 'count_todos')).total;
			if (after !== before + 1) {
				throw new Error(`total went from ${before} to ${after}`);
			}
			return `added "${added.added.title}" with id ${added.added.id.slice(0, 8)}…, total now ${after}`;
		});

		await test('set_todo_completed marks a todo done', async () => {
			const listed = await VerifyMilestones._callTool(page, 'list_todos');
			const target = listed.todos.find((todo) => todo.title === 'buy milk');
			await VerifyMilestones._callTool(page, 'set_todo_completed', { id: target.id, completed: true });
			const counted = await VerifyMilestones._callTool(page, 'count_todos');
			if (counted.completed !== 1) {
				throw new Error(`completed count is ${counted.completed}, expected 1`);
			}
			return `"buy milk" is done; ${counted.active} active, ${counted.completed} completed`;
		});

		await test('edit_todo renames a todo', async () => {
			const listed = await VerifyMilestones._callTool(page, 'list_todos');
			const target = listed.todos.find((todo) => todo.title === 'alpha');
			await VerifyMilestones._callTool(page, 'edit_todo', { id: target.id, title: 'alpha renamed' });
			const after = await VerifyMilestones._callTool(page, 'list_todos');
			const found = after.todos.find((todo) => todo.id === target.id);
			if (found.title !== 'alpha renamed') {
				throw new Error(`title is "${found.title}"`);
			}
			return 'alpha became "alpha renamed"';
		});

		await test('an acting tool reaches a todo the filter is hiding', async () => {
			await VerifyMilestones._callTool(page, 'set_active_filter', { filter: 'completed' });
			const listed = await VerifyMilestones._callTool(page, 'list_todos');
			const hidden = listed.todos.find((todo) => todo.visibleUnderActiveFilter === false);
			if (hidden === undefined) {
				throw new Error('nothing was hidden, so the check proves nothing');
			}
			await VerifyMilestones._callTool(page, 'edit_todo', { id: hidden.id, title: 'reached while hidden' });
			const filterAfter = await VerifyMilestones._callTool(page, 'get_active_filter');
			const after = await VerifyMilestones._callTool(page, 'list_todos');
			const found = after.todos.find((todo) => todo.id === hidden.id);
			if (found.title !== 'reached while hidden') {
				throw new Error(`the hidden todo was not changed, it is still "${found.title}"`);
			}
			if (filterAfter.activeFilter !== 'completed') {
				throw new Error(`the filter was left on ${filterAfter.activeFilter}, not put back`);
			}
			await VerifyMilestones._callTool(page, 'set_active_filter', { filter: 'all' });
			return 'edited a hidden todo and put the filter back to completed';
		});

		await test('clear_completed and set_all_completed work', async () => {
			await VerifyMilestones._callTool(page, 'set_all_completed', { completed: true });
			const allDone = await VerifyMilestones._callTool(page, 'count_todos');
			if (allDone.active !== 0) {
				throw new Error(`${allDone.active} todos are still active after marking all done`);
			}
			const cleared = await VerifyMilestones._callTool(page, 'clear_completed');
			const empty = await VerifyMilestones._callTool(page, 'count_todos');
			if (empty.total !== 0) {
				throw new Error(`${empty.total} todos remain after clearing`);
			}
			return `marked ${allDone.completed} done, then cleared ${cleared.cleared}, leaving ${empty.total}`;
		});

		await test('delete_todo removes one todo', async () => {
			await VerifyMilestones._callTool(page, 'add_todo', { title: 'doomed' });
			await VerifyMilestones._callTool(page, 'add_todo', { title: 'survivor' });
			const listed = await VerifyMilestones._callTool(page, 'list_todos');
			const doomed = listed.todos.find((todo) => todo.title === 'doomed');
			await VerifyMilestones._callTool(page, 'delete_todo', { id: doomed.id });
			const after = await VerifyMilestones._callTool(page, 'list_todos');
			if (after.todos.some((todo) => todo.title === 'doomed') === true) {
				throw new Error('the todo is still there');
			}
			return `deleted "doomed", ${after.todos.length} left`;
		});

		console.log('\nMilestone 3 — the kill switch really kills\n');

		await test('the global kill switch unregisters everything', async () => {
			await VerifyMilestones._setGrant(launched.port, extensionId, true, false);
			await VerifyMilestones._pause(1200);
			const names = await VerifyMilestones._toolNames(page);
			if (names.length !== 0) {
				throw new Error(`${names.length} tools survived the kill switch: ${names.join(', ')}`);
			}
			await VerifyMilestones._setGrant(launched.port, extensionId, true, true);
			await VerifyMilestones._pause(1000);
			const back = await VerifyMilestones._toolNames(page);
			return `0 tools while off, ${back.length} again once switched back on`;
		});

		console.log('\nMilestone 5 — the adapter yields to a first-party tool surface\n');

		await test('the adapter stands down when the site ships its own tools', async () => {
			await VerifyMilestones._injectFirstPartyTool(page);
			await page.navigate(TARGET_URL, 3500);
			const names = await VerifyMilestones._toolNames(page);
			const ours = names.filter((name) => name.startsWith('demo_playwright_dev__'));
			if (ours.length > 0) {
				throw new Error(`the adapter registered ${ours.length} tools anyway: ${ours.join(', ')}`);
			}
			if (names.includes('todomvc_first_party_search') === false) {
				throw new Error('the simulated first-party tool was not there, so the check proves nothing');
			}
			return `only the first-party tool is registered: ${names.join(', ')}`;
		});

		page.close();

		const passed = results.filter((result) => result.ok === true).length;
		const failed = results.length - passed;
		return { passed, failed, results };
	}

	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////
	//	Helpers
	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////

	/**
	 * Finds the installed extension's identifier from its service worker target.
	 *
	 * @param {number} port - The remote debugging port.
	 * @returns {Promise<string>} The extension identifier.
	 * @throws When the extension's service worker is not running.
	 */
	static async _extensionId(port) {
		for (let attempt = 0; attempt < 40; attempt++) {
			const targets = await CdpClient.listTargets(port);
			const worker = targets.find(
				(target) => target.type === 'service_worker' && target.url.includes('dist/service_worker.js'),
			);
			if (worker !== undefined) {
				return new URL(worker.url).host;
			}
			await VerifyMilestones._pause(250);
		}
		throw new Error('the extension service worker never started');
	}

	/**
	 * Writes the user's settings straight into extension storage, standing in for the popup.
	 *
	 * @param {number} port - The remote debugging port.
	 * @param {string} extensionId - The installed extension's identifier.
	 * @param {boolean} actingAllowed - Whether acting tools are allowed on the demonstration origin.
	 * @param {boolean} globallyEnabled - Whether the extension is on at all.
	 * @returns {Promise<void>} Nothing.
	 */
	static async _setGrant(port, extensionId, actingAllowed, globallyEnabled) {
		const targets = await CdpClient.listTargets(port);
		const worker = targets.find((target) => target.url.includes(`${extensionId}/dist/service_worker.js`));
		if (worker === undefined) {
			throw new Error('the extension service worker is not running');
		}
		const client = new CdpClient(port);
		await client.connect(worker.webSocketDebuggerUrl);
		const settings = {
			globallyEnabled: globallyEnabled,
			actingAllowedByOrigin: {
				'https://demo.playwright.dev': actingAllowed,
			},
		};
		await client.evaluate(
			`chrome.storage.local.set({ webmcp_everywhere_settings: ${JSON.stringify(settings)} }).then(() => 'ok')`,
		);
		client.close();
	}

	/**
	 * Registers a tool that looks like it came from the site itself, before the adapter runs.
	 *
	 * The script has to be added on the same connection that then navigates. Chrome drops scripts added
	 * with `Page.addScriptToEvaluateOnNewDocument` when the client that added them disconnects, so adding
	 * it and then reconnecting to navigate meant the simulated first-party tool was never there at all.
	 *
	 * @param {CdpClient} page - A client attached to the page, kept open across the navigation.
	 * @returns {Promise<void>} Nothing.
	 */
	static async _injectFirstPartyTool(page) {
		await page.send('Page.enable', {});
		await page.send('Page.addScriptToEvaluateOnNewDocument', {
			source: `
				void document.modelContext.registerTool({
					name: 'todomvc_first_party_search',
					description: 'A pretend first-party tool, used to check that the adapter stands down.',
					inputSchema: { type: 'object', properties: {}, additionalProperties: false },
					execute: async () => ({ pretend: true }),
				});
			`,
		});
	}

	/**
	 * Reloads the target page.
	 *
	 * @param {number} port - The remote debugging port.
	 * @returns {Promise<void>} Nothing.
	 */
	static async _reload(port) {
		const page = await CdpClient.connectToPage(port, 'todomvc');
		await page.navigate(TARGET_URL, 3000);
		page.close();
	}

	/**
	 * Lists the tool names currently registered on the page.
	 *
	 * @param {CdpClient} page - A client attached to the page.
	 * @returns {Promise<string[]>} The registered names.
	 */
	static async _toolNames(page) {
		const json = await page.evaluate(
			'document.modelContext.getTools().then((tools) => JSON.stringify(tools.map((tool) => tool.name)))',
		);
		return JSON.parse(json);
	}

	/**
	 * Calls one registered tool the way an agent would, and parses its reply.
	 *
	 * @param {CdpClient} page - A client attached to the page.
	 * @param {string} shortName - The unqualified tool name, such as `list_todos`.
	 * @param {object} input - The tool's input.
	 * @returns {Promise<any>} The tool's parsed result.
	 */
	static async _callTool(page, shortName, input = {}) {
		const qualifiedName = `demo_playwright_dev__${shortName}`;
		const expression = `
			(async () => {
				const tools = await document.modelContext.getTools();
				const tool = tools.find((candidate) => candidate.name === ${JSON.stringify(qualifiedName)});
				if (tool === undefined) { throw new Error('tool not registered: ' + ${JSON.stringify(qualifiedName)}); }
				return await document.modelContext.executeTool(tool, ${JSON.stringify(JSON.stringify(input))});
			})()
		`;
		const raw = await page.evaluate(expression);
		return JSON.parse(raw);
	}

	/**
	 * Empties the todo list so a check starts from a known state.
	 *
	 * @param {CdpClient} page - A client attached to the page.
	 * @returns {Promise<void>} Nothing.
	 */
	static async _resetTodos(page) {
		await page.evaluate('localStorage.removeItem("react-todos"), "cleared"');
		await page.navigate(TARGET_URL, 2500);
	}

	/**
	 * Adds todos through the page's own input field, so the starting state is real.
	 *
	 * @param {CdpClient} page - A client attached to the page.
	 * @param {string[]} titles - The todos to add.
	 * @returns {Promise<void>} Nothing.
	 */
	static async _seed(page, titles) {
		await page.evaluate(`
			(async () => {
				const field = document.querySelector('.new-todo');
				const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
				for (const title of ${JSON.stringify(titles)}) {
					setter.call(field, title);
					field.dispatchEvent(new Event('input', { bubbles: true }));
					field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, which: 13, bubbles: true }));
					await new Promise((resolve) => setTimeout(resolve, 120));
				}
				return 'seeded';
			})()
		`);
	}

	/**
	 * Waits.
	 *
	 * @param {number} ms - How long to wait, in milliseconds.
	 * @returns {Promise<void>} Nothing.
	 */
	static async _pause(ms) {
		await new Promise((resolve) => setTimeout(resolve, ms));
	}

	/**
	 * Asserts two lists hold the same names.
	 *
	 * @param {string[]} actual - What was found.
	 * @param {string[]} expected - What was wanted.
	 * @returns {void} Nothing.
	 * @throws When the lists differ.
	 */
	static _assertSameSet(actual, expected) {
		const left = [...actual].sort().join(', ');
		const right = [...expected].sort().join(', ');
		if (left !== right) {
			throw new Error(`expected [${right}] but found [${left}]`);
		}
	}
}

if (import.meta.filename === process.argv[1]) {
	const outcome = await VerifyMilestones.run();
	console.log(`\n${outcome.passed} passed, ${outcome.failed} failed\n`);
	process.exit(outcome.failed === 0 ? 0 : 1);
}

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	VerifyMilestones — drives the real extension in a real Chrome and checks what it does
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

import { CdpClient } from '../tools/chrome_devtools_protocol/cdp_client.ts';
import { LaunchChrome } from '../tools/launch_chrome.ts';
import { after, before, describe, test } from 'node:test';
import type {
	ActiveFilterResult,
	AddTodoResult,
	ClearCompletedResult,
	CountTodosResult,
	FramedResultOf,
	ListTodosResult,
} from './verify_types.ts';

const TARGET_URL = 'https://demo.playwright.dev/todomvc/';


///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	Types
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/** The live browser every check works against, prepared once before the first of them. */
type MilestonesContext = {
	/** The remote debugging port Chrome is listening on. */
	port: number;
	/** The installed extension's identifier. */
	extensionId: string;
	/** A client attached to the TodoMVC page. */
	page: CdpClient;
};

/**
 * Runs every milestone check against a live browser and reports what actually happened.
 *
 * Nothing here is mocked. Chrome is launched, the extension is installed, the real page is loaded, and
 * every assertion reads state back out of that page.
 */
class VerifyMilestones {
	/** The live browser, set before the first check and dropped after the last one. */
	static context: MilestonesContext | null = null;

	/**
	 * Returns the live browser the checks work against, refusing to continue when there is none.
	 *
	 * @returns The port, the extension identifier and the page.
	 * @throws When the launch step never prepared them.
	 */
	static _requireContext(): MilestonesContext {
		if (VerifyMilestones.context === null) {
			throw new Error('the browser was never launched');
		}
		return VerifyMilestones.context;
	}

	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////
	//	Helpers
	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////

	/**
	 * Finds the installed extension's identifier from its service worker target.
	 *
	 * @param port - The remote debugging port.
	 * @returns The extension identifier.
	 * @throws When the extension's service worker is not running.
	 */
	static async _extensionId(port: number): Promise<string> {
		for (let attempt = 0; attempt < 40; attempt++) {
			const targets = await CdpClient.listTargets(port);
			const worker = targets.find(
				(target) => target.type === 'service_worker' && target.url.includes('dist/background_service_worker.js'),
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
	 * @param port - The remote debugging port.
	 * @param extensionId - The installed extension's identifier.
	 * @param actingAllowed - Whether acting tools are allowed on the demonstration origin.
	 * @param globallyEnabled - Whether the extension is on at all.
	 * @returns Nothing.
	 */
	static async _setGrant(
		port: number,
		extensionId: string,
		actingAllowed: boolean,
		globallyEnabled: boolean,
	): Promise<void> {
		const targets = await CdpClient.listTargets(port);
		const worker = targets.find((target) => target.url.includes(`${extensionId}/dist/background_service_worker.js`));
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
	 * @param page - A client attached to the page, kept open across the navigation.
	 * @returns Nothing.
	 */
	static async _injectFirstPartyTool(page: CdpClient): Promise<void> {
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
	 * @param port - The remote debugging port.
	 * @returns Nothing.
	 */
	static async _reload(port: number): Promise<void> {
		const page = await CdpClient.connectToPage(port, 'todomvc');
		await page.navigate(TARGET_URL, 3000);
		page.close();
	}

	/**
	 * Lists the tool names currently registered on the page.
	 *
	 * @param page - A client attached to the page.
	 * @returns The registered names.
	 */
	static async _toolNames(page: CdpClient): Promise<string[]> {
		const json = await page.evaluate<string>(
			'document.modelContext.getTools().then((tools) => JSON.stringify(tools.map((tool) => tool.name)))',
		);
		return JSON.parse(json) as string[];
	}

	/**
	 * Calls one registered tool the way an agent would, and parses its reply.
	 *
	 * @param page - A client attached to the page.
	 * @param shortName - The unqualified tool name, such as `list_todos`.
	 * @param input - The tool's input.
	 * @returns The tool's parsed result.
	 */
	static async _callTool<ResultType = unknown>(
		page: CdpClient,
		shortName: string,
		input: Record<string, unknown> = {},
	): Promise<ResultType> {
		const qualifiedName = `demo_playwright_dev__${shortName}`;
		const expression = `
			(async () => {
				const tools = await document.modelContext.getTools();
				const tool = tools.find((candidate) => candidate.name === ${JSON.stringify(qualifiedName)});
				if (tool === undefined) { throw new Error('tool not registered: ' + ${JSON.stringify(qualifiedName)}); }
				return await document.modelContext.executeTool(tool, ${JSON.stringify(JSON.stringify(input))});
			})()
		`;
		const raw = await page.evaluate<string>(expression);
		const framed = JSON.parse(raw) as FramedResultOf<ResultType>;
		if (framed?.webmcpEverywhere === undefined) {
			throw new Error(`${shortName} returned an unframed result, so the untrusted content check was skipped`);
		}
		return framed.data;
	}

	/**
	 * Empties the todo list so a check starts from a known state.
	 *
	 * @param page - A client attached to the page.
	 * @returns Nothing.
	 */
	static async _resetTodos(page: CdpClient): Promise<void> {
		await page.evaluate('localStorage.removeItem("react-todos"), "cleared"');
		await page.navigate(TARGET_URL, 2500);
	}

	/**
	 * Adds todos through the page's own input field, so the starting state is real.
	 *
	 * @param page - A client attached to the page.
	 * @param titles - The todos to add.
	 * @returns Nothing.
	 */
	static async _seed(page: CdpClient, titles: string[]): Promise<void> {
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
	 * @param milliseconds - How long to wait.
	 * @returns Nothing.
	 */
	static async _pause(milliseconds: number): Promise<void> {
		await new Promise((resolve) => setTimeout(resolve, milliseconds));
	}

	/**
	 * Asserts two lists hold the same names.
	 *
	 * @param actual - What was found.
	 * @param expected - What was wanted.
	 * @returns Nothing.
	 * @throws When the lists differ.
	 */
	static _assertSameSet(actual: string[], expected: string[]): void {
		const left = [...actual].sort().join(', ');
		const right = [...expected].sort().join(', ');
		if (left !== right) {
			throw new Error(`expected [${right}] but found [${left}]`);
		}
	}
}

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	Checks
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

describe('The milestones, against a live browser', () => {
	before(async () => {
		const launched = await LaunchChrome.run();
		const extensionId = await VerifyMilestones._extensionId(launched.port);
		await VerifyMilestones._setGrant(launched.port, extensionId, false, true);
		await VerifyMilestones._reload(launched.port);
		const page = await CdpClient.connectToPage(launched.port, 'todomvc');
		await VerifyMilestones._resetTodos(page);
		VerifyMilestones.context = {
			port: launched.port,
			extensionId: extensionId,
			page: page,
		};
	});

	after(() => {
		VerifyMilestones.context?.page.close();
		VerifyMilestones.context = null;
	});

	describe('Milestone 3 — permission classes are enforced, not self-reported', () => {
		test('read-only tools register with no opt-in', async (t) => {
			const { page } = VerifyMilestones._requireContext();
			const names = await VerifyMilestones._toolNames(page);
			const expected = ['count_todos', 'get_active_filter', 'list_todos'].map(
				(name) => `demo_playwright_dev__${name}`,
			);
			VerifyMilestones._assertSameSet(names, expected);
			t.diagnostic(`${names.length} registered: ${names.join(', ')}`);
		});

		test('acting tools are withheld until the user opts in', async (t) => {
			const { page } = VerifyMilestones._requireContext();
			const names = await VerifyMilestones._toolNames(page);
			const acting = names.filter((name) => name.includes('add_todo') || name.includes('delete_todo'));
			if (acting.length > 0) {
				throw new Error(`acting tools leaked without a grant: ${acting.join(', ')}`);
			}
			const report = await page.evaluate<string>('JSON.stringify(window.__webmcpEverywhereReport ?? null)');
			t.diagnostic(`7 acting tools withheld; report says ${report === 'null' ? 'nothing' : report}`);
		});
	});

	describe('Milestone 2 — the read-only tools tell the truth about the page', () => {
		test('list_todos and count_todos agree with the page', async (t) => {
			const { page } = VerifyMilestones._requireContext();
			await VerifyMilestones._seed(page, ['alpha', 'beta', 'gamma']);
			const listed = await VerifyMilestones._callTool<ListTodosResult>(page, 'list_todos');
			const counted = await VerifyMilestones._callTool<CountTodosResult>(page, 'count_todos');
			if (listed.todos.length !== 3) {
				throw new Error(`list_todos reported ${listed.todos.length} todos, expected 3`);
			}
			if (counted.total !== 3 || counted.active !== 3 || counted.completed !== 0) {
				throw new Error(`count_todos reported ${JSON.stringify(counted)}`);
			}
			t.diagnostic(
				`list_todos: ${listed.todos.map((todo) => todo.title).join(', ')}; count: ${JSON.stringify(counted)}`,
			);
		});

		test('get_active_filter follows the page', async (t) => {
			const { page } = VerifyMilestones._requireContext();
			await page.evaluate('location.hash = "#/active"');
			await VerifyMilestones._pause(400);
			const active = await VerifyMilestones._callTool<ActiveFilterResult>(page, 'get_active_filter');
			await page.evaluate('location.hash = "#/"');
			await VerifyMilestones._pause(400);
			const all = await VerifyMilestones._callTool<ActiveFilterResult>(page, 'get_active_filter');
			if (active.activeFilter !== 'active' || all.activeFilter !== 'all') {
				throw new Error(`got ${active.activeFilter} then ${all.activeFilter}`);
			}
			t.diagnostic('reported active, then all');
		});

		test('tools survive same-document navigation', async (t) => {
			const { page } = VerifyMilestones._requireContext();
			await page.evaluate('location.hash = "#/completed"');
			await VerifyMilestones._pause(600);
			const names = await VerifyMilestones._toolNames(page);
			await page.evaluate('location.hash = "#/"');
			await VerifyMilestones._pause(400);
			if (names.length !== 3) {
				throw new Error(`after a fragment change ${names.length} tools were registered, expected 3`);
			}
			t.diagnostic('still 3 tools after the fragment changed twice');
		});
	});

	describe('Milestone 3 — granting acting rights changes what is registered, live', () => {
		test('acting tools appear once the user opts in', async (t) => {
			const { port, extensionId, page } = VerifyMilestones._requireContext();
			await VerifyMilestones._setGrant(port, extensionId, true, true);
			await VerifyMilestones._pause(1200);
			const names = await VerifyMilestones._toolNames(page);
			if (names.length !== 10) {
				throw new Error(`expected 10 tools after the grant, got ${names.length}: ${names.join(', ')}`);
			}
			t.diagnostic(`10 tools registered without a page reload: ${names.length} names`);
		});
	});

	describe('Milestone 2 — the acting tools really drive the page', () => {
		test('add_todo adds a todo', async (t) => {
			const { page } = VerifyMilestones._requireContext();
			const before = (await VerifyMilestones._callTool<CountTodosResult>(page, 'count_todos')).total;
			const added = await VerifyMilestones._callTool<AddTodoResult>(page, 'add_todo', { title: 'buy milk' });
			const after = (await VerifyMilestones._callTool<CountTodosResult>(page, 'count_todos')).total;
			if (after !== before + 1) {
				throw new Error(`total went from ${before} to ${after}`);
			}
			t.diagnostic(`added "${added.added.title}" with id ${added.added.id.slice(0, 8)}…, total now ${after}`);
		});

		test('set_todo_completed marks a todo done', async (t) => {
			const { page } = VerifyMilestones._requireContext();
			const listed = await VerifyMilestones._callTool<ListTodosResult>(page, 'list_todos');
			const target = listed.todos.find((todo) => todo.title === 'buy milk');
			if (target === undefined) {
				throw new Error('"buy milk" is not on the page, so the check proves nothing');
			}
			await VerifyMilestones._callTool(page, 'set_todo_completed', { id: target.id, completed: true });
			const counted = await VerifyMilestones._callTool<CountTodosResult>(page, 'count_todos');
			if (counted.completed !== 1) {
				throw new Error(`completed count is ${counted.completed}, expected 1`);
			}
			t.diagnostic(`"buy milk" is done; ${counted.active} active, ${counted.completed} completed`);
		});

		test('edit_todo renames a todo', async (t) => {
			const { page } = VerifyMilestones._requireContext();
			const listed = await VerifyMilestones._callTool<ListTodosResult>(page, 'list_todos');
			const target = listed.todos.find((todo) => todo.title === 'alpha');
			if (target === undefined) {
				throw new Error('"alpha" is not on the page, so the check proves nothing');
			}
			await VerifyMilestones._callTool(page, 'edit_todo', { id: target.id, title: 'alpha renamed' });
			const after = await VerifyMilestones._callTool<ListTodosResult>(page, 'list_todos');
			const found = after.todos.find((todo) => todo.id === target.id);
			if (found?.title !== 'alpha renamed') {
				throw new Error(`title is "${found?.title}"`);
			}
			t.diagnostic('alpha became "alpha renamed"');
		});

		test('an acting tool reaches a todo the filter is hiding', async (t) => {
			const { page } = VerifyMilestones._requireContext();
			await VerifyMilestones._callTool(page, 'set_active_filter', { filter: 'completed' });
			const listed = await VerifyMilestones._callTool<ListTodosResult>(page, 'list_todos');
			const hidden = listed.todos.find((todo) => todo.visibleUnderActiveFilter === false);
			if (hidden === undefined) {
				throw new Error('nothing was hidden, so the check proves nothing');
			}
			await VerifyMilestones._callTool(page, 'edit_todo', { id: hidden.id, title: 'reached while hidden' });
			const filterAfter = await VerifyMilestones._callTool<ActiveFilterResult>(page, 'get_active_filter');
			const after = await VerifyMilestones._callTool<ListTodosResult>(page, 'list_todos');
			const found = after.todos.find((todo) => todo.id === hidden.id);
			if (found?.title !== 'reached while hidden') {
				throw new Error(`the hidden todo was not changed, it is still "${found?.title}"`);
			}
			if (filterAfter.activeFilter !== 'completed') {
				throw new Error(`the filter was left on ${filterAfter.activeFilter}, not put back`);
			}
			await VerifyMilestones._callTool(page, 'set_active_filter', { filter: 'all' });
			t.diagnostic('edited a hidden todo and put the filter back to completed');
		});

		test('clear_completed and set_all_completed work', async (t) => {
			const { page } = VerifyMilestones._requireContext();
			await VerifyMilestones._callTool(page, 'set_all_completed', { completed: true });
			const allDone = await VerifyMilestones._callTool<CountTodosResult>(page, 'count_todos');
			if (allDone.active !== 0) {
				throw new Error(`${allDone.active} todos are still active after marking all done`);
			}
			const cleared = await VerifyMilestones._callTool<ClearCompletedResult>(page, 'clear_completed');
			const empty = await VerifyMilestones._callTool<CountTodosResult>(page, 'count_todos');
			if (empty.total !== 0) {
				throw new Error(`${empty.total} todos remain after clearing`);
			}
			t.diagnostic(`marked ${allDone.completed} done, then cleared ${cleared.cleared}, leaving ${empty.total}`);
		});

		test('delete_todo removes one todo', async (t) => {
			const { page } = VerifyMilestones._requireContext();
			await VerifyMilestones._callTool(page, 'add_todo', { title: 'doomed' });
			await VerifyMilestones._callTool(page, 'add_todo', { title: 'survivor' });
			const listed = await VerifyMilestones._callTool<ListTodosResult>(page, 'list_todos');
			const doomed = listed.todos.find((todo) => todo.title === 'doomed');
			if (doomed === undefined) {
				throw new Error('"doomed" was never added, so the check proves nothing');
			}
			await VerifyMilestones._callTool(page, 'delete_todo', { id: doomed.id });
			const after = await VerifyMilestones._callTool<ListTodosResult>(page, 'list_todos');
			if (after.todos.some((todo) => todo.title === 'doomed') === true) {
				throw new Error('the todo is still there');
			}
			t.diagnostic(`deleted "doomed", ${after.todos.length} left`);
		});
	});

	describe('Milestone 3 — the kill switch really kills', () => {
		test('the global kill switch unregisters everything', async (t) => {
			const { port, extensionId, page } = VerifyMilestones._requireContext();
			await VerifyMilestones._setGrant(port, extensionId, true, false);
			await VerifyMilestones._pause(1200);
			const names = await VerifyMilestones._toolNames(page);
			if (names.length !== 0) {
				throw new Error(`${names.length} tools survived the kill switch: ${names.join(', ')}`);
			}
			await VerifyMilestones._setGrant(port, extensionId, true, true);
			await VerifyMilestones._pause(1000);
			const back = await VerifyMilestones._toolNames(page);
			t.diagnostic(`0 tools while off, ${back.length} again once switched back on`);
		});
	});

	describe('Milestone 5 — the adapter yields to a first-party tool surface', () => {
		test('the adapter stands down when the site ships its own tools', async (t) => {
			const { page } = VerifyMilestones._requireContext();
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
			t.diagnostic(`only the first-party tool is registered: ${names.join(', ')}`);
		});
	});
});

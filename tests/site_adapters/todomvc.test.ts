///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	TodomvcTest — drives the real extension in a real Chrome and checks what it does
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

import NodeTest from 'node:test';
import { LivePageHarness } from '../libs/live_page_harness.ts';
import type { CdpClient } from '../../tools/chrome_devtools_protocol/cdp_client.ts';
import type {
	ActiveFilterResult,
	AddTodoResult,
	ClearCompletedResult,
	CountTodosResult,
	ListTodosResult,
} from './libs/todomvc_result_types.ts';

const TARGET_URL = 'https://demo.playwright.dev/todomvc/';

/**
 * The live browser every check works against, prepared once before the first of them.
 *
 * Nothing here is mocked. Chrome is launched, the extension is installed, the real page is loaded, and
 * every assertion reads state back out of that page.
 */
const harness = new LivePageHarness({
	siteSlug: 'demo_playwright_dev',
	origin: 'https://demo.playwright.dev',
	url: TARGET_URL,
	urlFragment: 'todomvc',
	settleMs: 3000,
});

/**
 * Drives TodoMVC itself, for the things only this site needs.
 *
 * Everything else these checks need — the browser, the opt-in, the tool list, the tool call — is the
 * same for every site and lives in `LivePageHarness`.
 */
class TodomvcTest {
	/**
	 * Empties the todo list and loads the page again, so a check starts from a known state.
	 *
	 * @param page - A client attached to the page.
	 * @returns Nothing.
	 */
	static async _resetTodos(page: CdpClient): Promise<void> {
		await page.evaluate('localStorage.removeItem("react-todos"), "cleared"');
		await page.navigate(TARGET_URL, 2500);
	}

	/**
	 * Writes todos through the page's own input field, the way a person would.
	 *
	 * @param page - A client attached to the page.
	 * @param titles - The todos to add, in order.
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
	 * Puts a pretend first-party tool on the page, to check that the adapter stands down for one.
	 *
	 * It is registered on every new document rather than on this one, because the adapter reads the
	 * first-party tools at registration, which happens before this could run on the current document.
	 *
	 * @param page - A client attached to the page.
	 * @returns Nothing.
	 */
	static async _injectFirstPartyTool(page: CdpClient): Promise<void> {
		await page.send('Page.enable', {});
		await page.send('Page.addScriptToEvaluateOnNewDocument', {
			source: `
				void document.modelContext.registerTool({
					name: 'todomvc_first_party_search',
					description: 'A pretend first-party tool, used to check that the adapter stands down.',
					inputSchema: {
						type: 'object',
						properties: {},
						additionalProperties: false,
					},
					execute: async () => {
						return {
							pretend: true,
						};
					},
				});
			`,
		});
	}
}

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	Checks
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

NodeTest.describe('The milestones, against a live browser', () => {
	NodeTest.before(async () => {
		const { page } = await harness.launch();
		await TodomvcTest._resetTodos(page);
	});

	NodeTest.after(() => {
		harness.close();
	});

	NodeTest.describe('Milestone 3 — permission classes are enforced, not self-reported', () => {
		NodeTest.test('read-only tools register with no opt-in', async (t) => {
			const { page } = harness.requireContext();
			const names = await harness.toolNames(page);
			const expected = ['count_todos', 'get_active_filter', 'list_todos'].map(
				(name) => `demo_playwright_dev__${name}`,
			);
			LivePageHarness.assertSameSet(names, expected);
			t.diagnostic(`${names.length} registered: ${names.join(', ')}`);
		});

		NodeTest.test('acting tools are withheld until the user opts in', async (t) => {
			const { page } = harness.requireContext();
			const names = await harness.toolNames(page);
			const acting = names.filter((name) => name.includes('add_todo') || name.includes('delete_todo'));
			if (acting.length > 0) {
				throw new Error(`acting tools leaked without a grant: ${acting.join(', ')}`);
			}
			const report = await page.evaluate<string>('JSON.stringify(window.__webmcpEverywhereReport ?? null)');
			t.diagnostic(`7 acting tools withheld; report says ${report === 'null' ? 'nothing' : report}`);
		});
	});

	NodeTest.describe('Milestone 2 — the read-only tools tell the truth about the page', () => {
		NodeTest.test('list_todos and count_todos agree with the page', async (t) => {
			const { page } = harness.requireContext();
			await TodomvcTest._seed(page, ['alpha', 'beta', 'gamma']);
			const listed = await harness.callTool<ListTodosResult>(page, 'list_todos');
			const counted = await harness.callTool<CountTodosResult>(page, 'count_todos');
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

		NodeTest.test('get_active_filter follows the page', async (t) => {
			const { page } = harness.requireContext();
			await page.evaluate('location.hash = "#/active"');
			await LivePageHarness.pause(400);
			const active = await harness.callTool<ActiveFilterResult>(page, 'get_active_filter');
			await page.evaluate('location.hash = "#/"');
			await LivePageHarness.pause(400);
			const all = await harness.callTool<ActiveFilterResult>(page, 'get_active_filter');
			if (active.activeFilter !== 'active' || all.activeFilter !== 'all') {
				throw new Error(`got ${active.activeFilter} then ${all.activeFilter}`);
			}
			t.diagnostic('reported active, then all');
		});

		NodeTest.test('tools survive same-document navigation', async (t) => {
			const { page } = harness.requireContext();
			await page.evaluate('location.hash = "#/completed"');
			await LivePageHarness.pause(600);
			const names = await harness.toolNames(page);
			await page.evaluate('location.hash = "#/"');
			await LivePageHarness.pause(400);
			if (names.length !== 3) {
				throw new Error(`after a fragment change ${names.length} tools were registered, expected 3`);
			}
			t.diagnostic('still 3 tools after the fragment changed twice');
		});
	});

	NodeTest.describe('Milestone 3 — granting acting rights changes what is registered, live', () => {
		NodeTest.test('acting tools appear once the user opts in', async (t) => {
			const { page } = harness.requireContext();
			await harness.setGrant(true, true);
			await LivePageHarness.pause(1200);
			const names = await harness.toolNames(page);
			if (names.length !== 10) {
				throw new Error(`expected 10 tools after the grant, got ${names.length}: ${names.join(', ')}`);
			}
			t.diagnostic(`10 tools registered without a page reload: ${names.length} names`);
		});
	});

	NodeTest.describe('Milestone 2 — the acting tools really drive the page', () => {
		NodeTest.test('add_todo adds a todo', async (t) => {
			const { page } = harness.requireContext();
			const before = (await harness.callTool<CountTodosResult>(page, 'count_todos')).total;
			const added = await harness.callTool<AddTodoResult>(page, 'add_todo', { title: 'buy milk' });
			const after = (await harness.callTool<CountTodosResult>(page, 'count_todos')).total;
			if (after !== before + 1) {
				throw new Error(`total went from ${before} to ${after}`);
			}
			t.diagnostic(`added "${added.added.title}" with id ${added.added.id.slice(0, 8)}…, total now ${after}`);
		});

		NodeTest.test('set_todo_completed marks a todo done', async (t) => {
			const { page } = harness.requireContext();
			const listed = await harness.callTool<ListTodosResult>(page, 'list_todos');
			const target = listed.todos.find((todo) => todo.title === 'buy milk');
			if (target === undefined) {
				throw new Error('"buy milk" is not on the page, so the check proves nothing');
			}
			await harness.callTool(page, 'set_todo_completed', { id: target.id, completed: true });
			const counted = await harness.callTool<CountTodosResult>(page, 'count_todos');
			if (counted.completed !== 1) {
				throw new Error(`completed count is ${counted.completed}, expected 1`);
			}
			t.diagnostic(`"buy milk" is done; ${counted.active} active, ${counted.completed} completed`);
		});

		NodeTest.test('edit_todo renames a todo', async (t) => {
			const { page } = harness.requireContext();
			const listed = await harness.callTool<ListTodosResult>(page, 'list_todos');
			const target = listed.todos.find((todo) => todo.title === 'alpha');
			if (target === undefined) {
				throw new Error('"alpha" is not on the page, so the check proves nothing');
			}
			await harness.callTool(page, 'edit_todo', { id: target.id, title: 'alpha renamed' });
			const after = await harness.callTool<ListTodosResult>(page, 'list_todos');
			const found = after.todos.find((todo) => todo.id === target.id);
			if (found?.title !== 'alpha renamed') {
				throw new Error(`title is "${found?.title}"`);
			}
			t.diagnostic('alpha became "alpha renamed"');
		});

		NodeTest.test('an acting tool reaches a todo the filter is hiding', async (t) => {
			const { page } = harness.requireContext();
			await harness.callTool(page, 'set_active_filter', { filter: 'completed' });
			const listed = await harness.callTool<ListTodosResult>(page, 'list_todos');
			const hidden = listed.todos.find((todo) => todo.visibleUnderActiveFilter === false);
			if (hidden === undefined) {
				throw new Error('nothing was hidden, so the check proves nothing');
			}
			await harness.callTool(page, 'edit_todo', { id: hidden.id, title: 'reached while hidden' });
			const filterAfter = await harness.callTool<ActiveFilterResult>(page, 'get_active_filter');
			const after = await harness.callTool<ListTodosResult>(page, 'list_todos');
			const found = after.todos.find((todo) => todo.id === hidden.id);
			if (found?.title !== 'reached while hidden') {
				throw new Error(`the hidden todo was not changed, it is still "${found?.title}"`);
			}
			if (filterAfter.activeFilter !== 'completed') {
				throw new Error(`the filter was left on ${filterAfter.activeFilter}, not put back`);
			}
			await harness.callTool(page, 'set_active_filter', { filter: 'all' });
			t.diagnostic('edited a hidden todo and put the filter back to completed');
		});

		NodeTest.test('clear_completed and set_all_completed work', async (t) => {
			const { page } = harness.requireContext();
			await harness.callTool(page, 'set_all_completed', { completed: true });
			const allDone = await harness.callTool<CountTodosResult>(page, 'count_todos');
			if (allDone.active !== 0) {
				throw new Error(`${allDone.active} todos are still active after marking all done`);
			}
			const cleared = await harness.callTool<ClearCompletedResult>(page, 'clear_completed');
			const empty = await harness.callTool<CountTodosResult>(page, 'count_todos');
			if (empty.total !== 0) {
				throw new Error(`${empty.total} todos remain after clearing`);
			}
			t.diagnostic(`marked ${allDone.completed} done, then cleared ${cleared.cleared}, leaving ${empty.total}`);
		});

		NodeTest.test('delete_todo removes one todo', async (t) => {
			const { page } = harness.requireContext();
			await harness.callTool(page, 'add_todo', { title: 'doomed' });
			await harness.callTool(page, 'add_todo', { title: 'survivor' });
			const listed = await harness.callTool<ListTodosResult>(page, 'list_todos');
			const doomed = listed.todos.find((todo) => todo.title === 'doomed');
			if (doomed === undefined) {
				throw new Error('"doomed" was never added, so the check proves nothing');
			}
			await harness.callTool(page, 'delete_todo', { id: doomed.id });
			const after = await harness.callTool<ListTodosResult>(page, 'list_todos');
			if (after.todos.some((todo) => todo.title === 'doomed') === true) {
				throw new Error('the todo is still there');
			}
			t.diagnostic(`deleted "doomed", ${after.todos.length} left`);
		});
	});

	NodeTest.describe('Milestone 3 — the kill switch really kills', () => {
		NodeTest.test('the global kill switch unregisters everything', async (t) => {
			const { page } = harness.requireContext();
			await harness.setGrant(true, false);
			await LivePageHarness.pause(1200);
			const names = await harness.toolNames(page);
			if (names.length !== 0) {
				throw new Error(`${names.length} tools survived the kill switch: ${names.join(', ')}`);
			}
			await harness.setGrant(true, true);
			await LivePageHarness.pause(1000);
			const back = await harness.toolNames(page);
			t.diagnostic(`0 tools while off, ${back.length} again once switched back on`);
		});
	});

	NodeTest.describe('Milestone 5 — the adapter yields to a first-party tool surface', () => {
		NodeTest.test('the adapter stands down when the site ships its own tools', async (t) => {
			const { page } = harness.requireContext();
			await TodomvcTest._injectFirstPartyTool(page);
			await page.navigate(TARGET_URL, 3500);
			const names = await harness.toolNames(page);
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

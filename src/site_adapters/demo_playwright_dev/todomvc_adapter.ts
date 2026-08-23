import type { Adapter } from '../../adapter_format/adapter_types.js';
import type { TodoFilter } from './todomvc_page.js';
import { TodomvcPage } from './todomvc_page.js';

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	todomvcAdapter — the WebMCP tool surface for https://demo.playwright.dev/todomvc/
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/** No-input tools all share this schema. */
const NO_INPUT = {
	type: 'object',
	properties: {},
	additionalProperties: false,
} as const;

/**
 * The TodoMVC adapter, as the extension runtime consumes it.
 */
export const todomvcAdapter: Adapter = {
	siteSlug: 'demo_playwright_dev',
	siteName: 'Playwright TodoMVC demonstration',
	matchPatterns: ['https://demo.playwright.dev/todomvc/*'],
	metadata: {
		author: 'WebMCP Everywhere contributors',
		version: '0.1.0',
		adapterFormatVersion: '0.1.0',
		targetSiteVerifiedOn: '2026-08-20',
	},
	yieldCondition: (firstPartyToolNames: string[]): boolean => {
		return firstPartyToolNames.length > 0;
	},
	tools: [
		{
			name: 'list_todos',
			title: 'List todos',
			description:
				'List every todo on this TodoMVC page, including ones the active filter is hiding. ' +
				'Each todo has a stable id to pass to the other tools, its title, whether it is ' +
				'completed, and whether the active filter is currently showing it.',
			inputSchema: NO_INPUT,
			permissionClass: 'readOnly',
			execute: () => {
				const visible = new Set(TodomvcPage._visibleIdsInOrder());
				const todos = TodomvcPage._readStore().map((todo) => ({
					id: todo.id,
					title: todo.title,
					completed: todo.completed,
					visibleUnderActiveFilter: visible.has(todo.id),
				}));
				return {
					activeFilter: TodomvcPage._readActiveFilter(),
					todos: todos,
				};
			},
		},
		{
			name: 'count_todos',
			title: 'Count todos',
			description:
				'Count the todos on this TodoMVC page, broken down into active, completed, and total. ' +
				'Counts every todo regardless of which filter is showing.',
			inputSchema: NO_INPUT,
			permissionClass: 'readOnly',
			execute: () => {
				const todos = TodomvcPage._readStore();
				const completed = todos.filter((todo) => todo.completed === true).length;
				return {
					total: todos.length,
					active: todos.length - completed,
					completed: completed,
				};
			},
		},
		{
			name: 'get_active_filter',
			title: 'Get the active filter',
			description:
				'Report which filter this TodoMVC page is showing: all, active, or completed.',
			inputSchema: NO_INPUT,
			permissionClass: 'readOnly',
			execute: () => {
				return {
					activeFilter: TodomvcPage._readActiveFilter(),
				};
			},
		},
		{
			name: 'add_todo',
			title: 'Add a todo',
			description: 'Add a new todo to this TodoMVC page. Returns the new todo and its stable id.',
			inputSchema: {
				type: 'object',
				properties: {
					title: {
						type: 'string',
						minLength: 1,
						description: 'The text of the new todo.',
					},
				},
				required: ['title'],
				additionalProperties: false,
			},
			permissionClass: 'acting',
			execute: async (input) => {
				const title = String(input.title ?? '').trim();
				if (title.length === 0) {
					throw new Error('a todo needs a title');
				}
				const field = document.querySelector<HTMLInputElement>('.new-todo');
				if (field === null) {
					throw new Error('the new todo field is not on this page');
				}
				const previousRaw = window.localStorage.getItem(TodomvcPage.STORAGE_KEY);
				TodomvcPage._setReactInputValue(field, title);
				TodomvcPage._pressEnter(field);
				await TodomvcPage._waitForChange(previousRaw);
				const added = TodomvcPage._readStore().find((todo) => todo.title === title);
				if (added === undefined) {
					throw new Error(`the todo "${title}" did not appear after being entered`);
				}
				return {
					added: added,
					total: TodomvcPage._readStore().length,
				};
			},
		},
		{
			name: 'set_todo_completed',
			title: 'Mark a todo done or not done',
			description:
				'Mark one todo as completed or not completed. Identify it by the id from list_todos.',
			inputSchema: {
				type: 'object',
				properties: {
					id: {
						type: 'string',
						description: 'The stable id of the todo, from list_todos.',
					},
					completed: {
						type: 'boolean',
						description: 'True to mark it done, false to mark it not done.',
					},
				},
				required: ['id', 'completed'],
				additionalProperties: false,
			},
			permissionClass: 'acting',
			execute: async (input) => {
				const id = String(input.id ?? '');
				const wanted = input.completed === true;
				const before = TodomvcPage._todoForId(id);
				if (before === null) {
					throw new Error(`no todo has the identifier ${id}`);
				}
				if (before.completed === wanted) {
					return {
						todo: before,
						changed: false,
					};
				}
				await TodomvcPage._withItemVisible(id, (item) => {
					const toggle = item.querySelector<HTMLInputElement>('input.toggle');
					if (toggle === null) {
						throw new Error('the todo has no completion checkbox');
					}
					toggle.click();
				});
				return {
					todo: TodomvcPage._todoForId(id),
					changed: true,
				};
			},
		},
		{
			name: 'edit_todo',
			title: 'Change a todo\'s text',
			description: 'Change the text of one todo. Identify it by the id from list_todos.',
			inputSchema: {
				type: 'object',
				properties: {
					id: {
						type: 'string',
						description: 'The stable id of the todo, from list_todos.',
					},
					title: {
						type: 'string',
						minLength: 1,
						description: 'The replacement text.',
					},
				},
				required: ['id', 'title'],
				additionalProperties: false,
			},
			permissionClass: 'acting',
			execute: async (input) => {
				const id = String(input.id ?? '');
				const title = String(input.title ?? '').trim();
				if (title.length === 0) {
					throw new Error('a todo needs a title');
				}
				await TodomvcPage._withItemVisible(id, (item) => {
					const label = item.querySelector('label');
					if (label === null) {
						throw new Error('the todo has no label to open for editing');
					}
					label.dispatchEvent(
						new MouseEvent('dblclick', {
							bubbles: true,
							cancelable: true,
							view: window,
						}),
					);
					const field = item.querySelector<HTMLInputElement>('input.edit');
					if (field === null) {
						throw new Error('the todo did not open for editing');
					}
					TodomvcPage._setReactInputValue(field, title);
					TodomvcPage._pressEnter(field);
				});
				return {
					todo: TodomvcPage._todoForId(id),
				};
			},
		},
		{
			name: 'delete_todo',
			title: 'Delete a todo',
			description: 'Delete one todo from this TodoMVC page. Identify it by the id from list_todos.',
			inputSchema: {
				type: 'object',
				properties: {
					id: {
						type: 'string',
						description: 'The stable id of the todo, from list_todos.',
					},
				},
				required: ['id'],
				additionalProperties: false,
			},
			permissionClass: 'acting',
			execute: async (input) => {
				const id = String(input.id ?? '');
				const before = TodomvcPage._todoForId(id);
				if (before === null) {
					throw new Error(`no todo has the identifier ${id}`);
				}
				await TodomvcPage._withItemVisible(id, (item) => {
					const button = item.querySelector<HTMLButtonElement>('button.destroy');
					if (button === null) {
						throw new Error('the todo has no delete button');
					}
					button.click();
				});
				return {
					deleted: before,
					total: TodomvcPage._readStore().length,
				};
			},
		},
		{
			name: 'clear_completed',
			title: 'Clear completed todos',
			description: 'Delete every completed todo from this TodoMVC page at once.',
			inputSchema: NO_INPUT,
			permissionClass: 'acting',
			execute: async () => {
				const before = TodomvcPage._readStore();
				const completed = before.filter((todo) => todo.completed === true);
				if (completed.length === 0) {
					return {
						cleared: 0,
						remaining: before.length,
					};
				}
				const button = document.querySelector<HTMLButtonElement>('.clear-completed');
				if (button === null) {
					throw new Error('the clear completed button is not on this page');
				}
				const previousRaw = window.localStorage.getItem(TodomvcPage.STORAGE_KEY);
				button.click();
				await TodomvcPage._waitForChange(previousRaw);
				return {
					cleared: completed.length,
					remaining: TodomvcPage._readStore().length,
				};
			},
		},
		{
			name: 'set_all_completed',
			title: 'Mark every todo done or not done',
			description: 'Mark every todo on this TodoMVC page as completed, or as not completed.',
			inputSchema: {
				type: 'object',
				properties: {
					completed: {
						type: 'boolean',
						description: 'True to mark them all done, false to mark them all not done.',
					},
				},
				required: ['completed'],
				additionalProperties: false,
			},
			permissionClass: 'acting',
			execute: async (input) => {
				const wanted = input.completed === true;
				const todos = TodomvcPage._readStore();
				if (todos.length === 0) {
					return {
						changed: 0,
						total: 0,
					};
				}
				if (todos.every((todo) => todo.completed === wanted) === true) {
					return {
						changed: 0,
						total: todos.length,
					};
				}
				const toggleAll = document.querySelector<HTMLInputElement>('#toggle-all');
				if (toggleAll === null) {
					throw new Error('the mark all as complete control is not on this page');
				}
				const previousRaw = window.localStorage.getItem(TodomvcPage.STORAGE_KEY);
				toggleAll.click();
				await TodomvcPage._waitForChange(previousRaw);
				const after = TodomvcPage._readStore();
				return {
					changed: after.filter((todo, index) => todo.completed !== todos[index]?.completed).length,
					total: after.length,
				};
			},
		},
		{
			name: 'set_active_filter',
			title: 'Change which todos are shown',
			description:
				'Change which todos this TodoMVC page shows: all, active, or completed. This changes ' +
				'only what is displayed, never the todos themselves.',
			inputSchema: {
				type: 'object',
				properties: {
					filter: {
						type: 'string',
						enum: ['all', 'active', 'completed'],
						description: 'Which subset of todos to show.',
					},
				},
				required: ['filter'],
				additionalProperties: false,
			},
			permissionClass: 'acting',
			execute: async (input) => {
				const filter = String(input.filter ?? 'all') as TodoFilter;
				if (['all', 'active', 'completed'].includes(filter) === false) {
					throw new Error(`unknown filter ${filter}`);
				}
				await TodomvcPage._setFilter(filter);
				return {
					activeFilter: TodomvcPage._readActiveFilter(),
					showing: TodomvcPage._visibleIdsInOrder().length,
				};
			},
		},
	],
};

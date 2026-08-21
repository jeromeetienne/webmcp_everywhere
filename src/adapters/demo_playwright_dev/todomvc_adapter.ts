import type { Adapter } from '../../adapter_format/adapter_types.js';

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	TodomvcAdapter — WebMCP tools for https://demo.playwright.dev/todomvc/
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/** One todo item as the application stores it. */
export type TodoItem = {
	/** A stable identifier that survives filtering, re-ordering, and renaming. */
	id: string;
	/** The todo's text. */
	title: string;
	/** Whether the todo is done. */
	completed: boolean;
};

/** Which subset of the todos the page is showing. */
export type TodoFilter = 'all' | 'active' | 'completed';

/**
 * Drives the React TodoMVC demonstration page and exposes it as WebMCP tools.
 *
 * Two facts about this page shape everything below, and both were established by probing the live site
 * rather than by reading its source:
 *
 * - The page is React, so assigning to `input.value` is ignored. Text must be written through the
 *   native `HTMLInputElement` value setter followed by an `input` event, or React never sees it.
 * - The filter links hide items rather than re-order them, so a position in the list is not a stable
 *   identifier. Every tool here identifies a todo by the identifier the application itself stores.
 */
export class TodomvcAdapter {
	/** Where the application keeps its state. Read for identifiers, never written to directly. */
	static readonly STORAGE_KEY = 'react-todos';

	/** How long to wait for React to re-render and persist after an interaction, in milliseconds. */
	static readonly SETTLE_TIMEOUT = 2000;

	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////
	//	Reading the page
	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////

	/**
	 * Reads every todo the application holds, including ones the active filter is hiding.
	 *
	 * @returns The todos in application order.
	 */
	static _readStore(): TodoItem[] {
		const raw = window.localStorage.getItem(TodomvcAdapter.STORAGE_KEY);
		if (raw === null) {
			return [];
		}
		try {
			const parsed = JSON.parse(raw);
			if (Array.isArray(parsed) === false) {
				return [];
			}
			return parsed as TodoItem[];
		} catch {
			return [];
		}
	}

	/**
	 * Reads which filter the page is currently showing.
	 *
	 * @returns The active filter.
	 */
	static _readActiveFilter(): TodoFilter {
		const hash = window.location.hash;
		if (hash === '#/active') {
			return 'active';
		}
		if (hash === '#/completed') {
			return 'completed';
		}
		return 'all';
	}

	/**
	 * Lists the identifiers currently rendered, in the order they appear on screen.
	 *
	 * @returns The visible identifiers, matching the order of the list items in the page.
	 */
	static _visibleIdsInOrder(): string[] {
		const filter = TodomvcAdapter._readActiveFilter();
		const todos = TodomvcAdapter._readStore();
		if (filter === 'active') {
			return todos.filter((todo) => todo.completed === false).map((todo) => todo.id);
		}
		if (filter === 'completed') {
			return todos.filter((todo) => todo.completed === true).map((todo) => todo.id);
		}
		return todos.map((todo) => todo.id);
	}

	/**
	 * Finds the list item element for a todo, when the active filter is showing it.
	 *
	 * @param id - The todo's stable identifier.
	 * @returns The list item element, or `null` when the todo is hidden or gone.
	 */
	static _listItemForId(id: string): HTMLElement | null {
		const position = TodomvcAdapter._visibleIdsInOrder().indexOf(id);
		if (position === -1) {
			return null;
		}
		const items = document.querySelectorAll<HTMLElement>('.todo-list li');
		return items[position] ?? null;
	}

	/**
	 * Looks a todo up by identifier.
	 *
	 * @param id - The todo's stable identifier.
	 * @returns The todo, or `null` when no todo has that identifier.
	 */
	static _todoForId(id: string): TodoItem | null {
		return TodomvcAdapter._readStore().find((todo) => todo.id === id) ?? null;
	}

	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////
	//	Driving the page
	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////

	/**
	 * Writes into a React-controlled input the only way React notices.
	 *
	 * @param element - The input to write into.
	 * @param value - The text to write.
	 * @returns Nothing.
	 */
	static _setReactInputValue(element: HTMLInputElement, value: string): void {
		const descriptor = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
		if (descriptor === undefined || descriptor.set === undefined) {
			throw new Error('cannot reach the native input value setter');
		}
		descriptor.set.call(element, value);
		element.dispatchEvent(
			new Event('input', {
				bubbles: true,
			}),
		);
	}

	/**
	 * Presses Enter on an element, the way the page's key handlers expect.
	 *
	 * @param element - The element to press Enter on.
	 * @returns Nothing.
	 */
	static _pressEnter(element: HTMLElement): void {
		element.dispatchEvent(
			new KeyboardEvent('keydown', {
				key: 'Enter',
				keyCode: 13,
				which: 13,
				bubbles: true,
			}),
		);
	}

	/**
	 * Waits until the stored state stops matching what it was, so a tool reports the result of its own
	 * interaction rather than the state from before it.
	 *
	 * @param previousRaw - The stored state as it was before the interaction.
	 * @returns Nothing. Returns early on timeout rather than throwing, so a no-op interaction still reports.
	 */
	static async _waitForChange(previousRaw: string | null): Promise<void> {
		const deadline = Date.now() + TodomvcAdapter.SETTLE_TIMEOUT;
		while (Date.now() < deadline) {
			if (window.localStorage.getItem(TodomvcAdapter.STORAGE_KEY) !== previousRaw) {
				return;
			}
			await new Promise((resolve) => setTimeout(resolve, 25));
		}
	}

	/**
	 * Waits for the page to finish re-rendering after a change that does not touch stored state, such as
	 * switching filters.
	 *
	 * @returns Nothing.
	 */
	static async _settle(): Promise<void> {
		await new Promise((resolve) => setTimeout(resolve, 150));
	}

	/**
	 * Runs an interaction with a todo guaranteed to be on screen, restoring the filter afterwards.
	 *
	 * The filter links hide items, and a hidden item has no element to interact with. Rather than fail,
	 * this shows every todo for the duration of the interaction and then puts the filter back, so the
	 * page the user returns to looks the way they left it.
	 *
	 * @param id - The todo's stable identifier.
	 * @param interaction - What to do with the todo's list item element.
	 * @returns Nothing.
	 * @throws When no todo has that identifier.
	 */
	static async _withItemVisible(id: string, interaction: (item: HTMLElement) => void): Promise<void> {
		if (TodomvcAdapter._todoForId(id) === null) {
			throw new Error(`no todo has the identifier ${id}`);
		}
		const originalFilter = TodomvcAdapter._readActiveFilter();
		const needsAllFilter = TodomvcAdapter._listItemForId(id) === null;
		if (needsAllFilter === true) {
			await TodomvcAdapter._setFilter('all');
		}
		const item = TodomvcAdapter._listItemForId(id);
		if (item === null) {
			throw new Error(`the todo ${id} is not on the page even with every todo shown`);
		}
		const previousRaw = window.localStorage.getItem(TodomvcAdapter.STORAGE_KEY);
		interaction(item);
		await TodomvcAdapter._waitForChange(previousRaw);
		if (needsAllFilter === true) {
			await TodomvcAdapter._setFilter(originalFilter);
		}
	}

	/**
	 * Switches which todos the page shows.
	 *
	 * @param filter - The filter to show.
	 * @returns Nothing.
	 */
	static async _setFilter(filter: TodoFilter): Promise<void> {
		const hashForFilter: Record<TodoFilter, string> = {
			all: '#/',
			active: '#/active',
			completed: '#/completed',
		};
		window.location.hash = hashForFilter[filter];
		await TodomvcAdapter._settle();
	}
}

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	The adapter
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
				const visible = new Set(TodomvcAdapter._visibleIdsInOrder());
				const todos = TodomvcAdapter._readStore().map((todo) => ({
					id: todo.id,
					title: todo.title,
					completed: todo.completed,
					visibleUnderActiveFilter: visible.has(todo.id),
				}));
				return {
					activeFilter: TodomvcAdapter._readActiveFilter(),
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
				const todos = TodomvcAdapter._readStore();
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
					activeFilter: TodomvcAdapter._readActiveFilter(),
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
				const previousRaw = window.localStorage.getItem(TodomvcAdapter.STORAGE_KEY);
				TodomvcAdapter._setReactInputValue(field, title);
				TodomvcAdapter._pressEnter(field);
				await TodomvcAdapter._waitForChange(previousRaw);
				const added = TodomvcAdapter._readStore().find((todo) => todo.title === title);
				if (added === undefined) {
					throw new Error(`the todo "${title}" did not appear after being entered`);
				}
				return {
					added: added,
					total: TodomvcAdapter._readStore().length,
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
				const before = TodomvcAdapter._todoForId(id);
				if (before === null) {
					throw new Error(`no todo has the identifier ${id}`);
				}
				if (before.completed === wanted) {
					return {
						todo: before,
						changed: false,
					};
				}
				await TodomvcAdapter._withItemVisible(id, (item) => {
					const toggle = item.querySelector<HTMLInputElement>('input.toggle');
					if (toggle === null) {
						throw new Error('the todo has no completion checkbox');
					}
					toggle.click();
				});
				return {
					todo: TodomvcAdapter._todoForId(id),
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
				await TodomvcAdapter._withItemVisible(id, (item) => {
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
					TodomvcAdapter._setReactInputValue(field, title);
					TodomvcAdapter._pressEnter(field);
				});
				return {
					todo: TodomvcAdapter._todoForId(id),
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
				const before = TodomvcAdapter._todoForId(id);
				if (before === null) {
					throw new Error(`no todo has the identifier ${id}`);
				}
				await TodomvcAdapter._withItemVisible(id, (item) => {
					const button = item.querySelector<HTMLButtonElement>('button.destroy');
					if (button === null) {
						throw new Error('the todo has no delete button');
					}
					button.click();
				});
				return {
					deleted: before,
					total: TodomvcAdapter._readStore().length,
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
				const before = TodomvcAdapter._readStore();
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
				const previousRaw = window.localStorage.getItem(TodomvcAdapter.STORAGE_KEY);
				button.click();
				await TodomvcAdapter._waitForChange(previousRaw);
				return {
					cleared: completed.length,
					remaining: TodomvcAdapter._readStore().length,
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
				const todos = TodomvcAdapter._readStore();
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
				const previousRaw = window.localStorage.getItem(TodomvcAdapter.STORAGE_KEY);
				toggleAll.click();
				await TodomvcAdapter._waitForChange(previousRaw);
				const after = TodomvcAdapter._readStore();
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
				await TodomvcAdapter._setFilter(filter);
				return {
					activeFilter: TodomvcAdapter._readActiveFilter(),
					showing: TodomvcAdapter._visibleIdsInOrder().length,
				};
			},
		},
	],
};

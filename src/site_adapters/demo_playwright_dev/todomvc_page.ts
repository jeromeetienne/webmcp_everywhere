///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	TodomvcPage — reads and drives https://demo.playwright.dev/todomvc/
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
export class TodomvcPage {
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
		const raw = window.localStorage.getItem(TodomvcPage.STORAGE_KEY);
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
		const filter = TodomvcPage._readActiveFilter();
		const todos = TodomvcPage._readStore();
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
		const position = TodomvcPage._visibleIdsInOrder().indexOf(id);
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
		return TodomvcPage._readStore().find((todo) => todo.id === id) ?? null;
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
		const deadline = Date.now() + TodomvcPage.SETTLE_TIMEOUT;
		while (Date.now() < deadline) {
			if (window.localStorage.getItem(TodomvcPage.STORAGE_KEY) !== previousRaw) {
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
		if (TodomvcPage._todoForId(id) === null) {
			throw new Error(`no todo has the identifier ${id}`);
		}
		const originalFilter = TodomvcPage._readActiveFilter();
		const needsAllFilter = TodomvcPage._listItemForId(id) === null;
		if (needsAllFilter === true) {
			await TodomvcPage._setFilter('all');
		}
		const item = TodomvcPage._listItemForId(id);
		if (item === null) {
			throw new Error(`the todo ${id} is not on the page even with every todo shown`);
		}
		const previousRaw = window.localStorage.getItem(TodomvcPage.STORAGE_KEY);
		interaction(item);
		await TodomvcPage._waitForChange(previousRaw);
		if (needsAllFilter === true) {
			await TodomvcPage._setFilter(originalFilter);
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
		await TodomvcPage._settle();
	}
}

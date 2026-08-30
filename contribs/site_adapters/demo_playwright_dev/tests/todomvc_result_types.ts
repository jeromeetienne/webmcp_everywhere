///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	TodomvcResultTypes — the shapes the TodoMVC checks compare against
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/** One todo as `list_todos` reports it. */
export type ListedTodo = {
	/** The stable identifier to pass to the other tools. */
	id: string;
	/** The todo's text. */
	title: string;
	/** Whether the todo is done. */
	completed: boolean;
	/** Whether the page's active filter is currently showing it. */
	visibleUnderActiveFilter: boolean;
};

/** What `list_todos` returns. */
export type ListTodosResult = {
	/** Which subset of the todos the page is showing. */
	activeFilter: string;
	/** Every todo, including ones the active filter is hiding. */
	todos: ListedTodo[];
};

/** What `count_todos` returns. */
export type CountTodosResult = {
	/** How many todos there are. */
	total: number;
	/** How many are not done. */
	active: number;
	/** How many are done. */
	completed: number;
};

/** What `get_active_filter` returns. */
export type ActiveFilterResult = {
	/** Which subset of the todos the page is showing. */
	activeFilter: string;
};

/** What `add_todo` returns. */
export type AddTodoResult = {
	/** The todo that was created. */
	added: {
		/** The new todo's identifier. */
		id: string;
		/** The new todo's text. */
		title: string;
	};
};

/** What `clear_completed` returns. */
export type ClearCompletedResult = {
	/** How many completed todos were removed. */
	cleared: number;
};

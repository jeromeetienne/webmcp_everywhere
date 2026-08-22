///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	Types
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

import type { FramedResult } from '../src/adapter_format/untrusted_content.ts';

/**
 * How the verification runners reach the native messaging host.
 *
 * The two fields come from two files, because the host keeps them apart on purpose: an address is only
 * true while a host is holding that port, and a token is true for as long as the machine has one.
 */
export type HostEndpoint = {
	/** The Model Context Protocol address to POST to, read from `~/.webmcp_everywhere/endpoint.json`. */
	url: string;
	/** The bearer token every request must present, read from `~/.webmcp_everywhere/token`. */
	token: string;
};

/** One HTTP response, with its body already parsed when it was JSON. */
export type HttpOutcome = {
	/** The status code. */
	status: number;
	/** The parsed body, or null when there was none or it was not JSON. */
	body: JsonRpcResponse | null;
};

/** One JSON-RPC response, as the host writes it. */
export type JsonRpcResponse = {
	/** Whatever the method produced. */
	result?: {
		/** The tools, on a `tools/list` response. */
		tools?: Array<{
			/** The tool's name. */
			name: string;
		}>;
		/** The result parts, on a `tools/call` response. */
		content?: Array<{
			/** The part's text. */
			text?: string;
		}>;
		/** Whether the tool failed. */
		isError?: boolean;
	};
	/** Whether the extension is connected, on a `/health` response. */
	extensionConnected?: boolean;
	/** Anything else the host wrote. */
	[field: string]: unknown;
};

/** What one tool call produced, once its parts have been joined. */
export type ToolCallOutcome = {
	/** Everything the tool returned, as one string. */
	text: string;
	/** Whether the tool failed. */
	isError: boolean;
};

/** A framed tool result whose `data` field is known to be of one shape. */
export type FramedResultOf<DataType> = Omit<FramedResult, 'data'> & {
	/** The tool's actual result. Untrusted. */
	data: DataType;
};

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

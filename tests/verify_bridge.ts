///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	VerifyBridge — checks the Model Context Protocol bridge against a live page
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

import Path from 'node:path';
import { after, before, describe, test } from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type {
	CountTodosResult,
	ListTodosResult,
} from './verify_types.ts';

const __dirname = import.meta.dirname;

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	Types
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/** What one tool call produced, once the untrusted content framing around it has been unwrapped. */
type BridgeCallOutcome<DataType> = {
	/** Everything the tool returned, as one string. */
	text: string;
	/** The framed data, or null when the text was not JSON. */
	data: DataType | null;
	/** Whether the tool failed. */
	isError: boolean;
};

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	Helpers
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/**
 * Speaks Model Context Protocol to the bridge exactly as an agent would, and checks what comes back.
 *
 * This is the check that matters for Milestone 4. If it passes, any Model Context Protocol client can
 * drive a site that never shipped WebMCP, which is the whole point of the project.
 */
class VerifyBridge {
	/** The connected client, opened before the first check and closed after the last one. */
	static client: Client | null = null;

	/**
	 * Starts the bridge and connects to it.
	 *
	 * @returns Nothing.
	 */
	static async connect(): Promise<void> {
		const transport = new StdioClientTransport({
			command: process.execPath,
			args: [Path.join(__dirname, 'devtools_protocol_bridge', 'webmcp_bridge.ts')],
		});
		const client = new Client(
			{
				name: 'webmcp-everywhere-bridge-check',
				version: '0.1.0',
			},
			{
				capabilities: {},
			},
		);
		await client.connect(transport);
		VerifyBridge.client = client;
	}

	/**
	 * Closes the connection, so nothing is left holding the event loop open.
	 *
	 * @returns Nothing.
	 */
	static async disconnect(): Promise<void> {
		if (VerifyBridge.client === null) {
			return;
		}
		await VerifyBridge.client.close();
		VerifyBridge.client = null;
	}

	/**
	 * Returns the connected client, refusing to continue when there is none.
	 *
	 * @returns The client.
	 * @throws When the connection was never opened.
	 */
	static _requireClient(): Client {
		if (VerifyBridge.client === null) {
			throw new Error('the bridge client is not connected');
		}
		return VerifyBridge.client;
	}

	/**
	 * Calls one tool and unwraps the untrusted content framing around its result.
	 *
	 * @param name - The tool to call.
	 * @param args - Its arguments.
	 * @returns What came back, both as text and as the framed data.
	 */
	static async _call<DataType = unknown>(
		name: string,
		args: Record<string, unknown>,
	): Promise<BridgeCallOutcome<DataType>> {
		const result = await VerifyBridge._requireClient().callTool({
			name: name,
			arguments: args,
		});
		const parts = (result.content ?? []) as Array<{ text?: string }>;
		const text = parts.map((part) => part.text ?? '').join('');
		let data: DataType | null = null;
		try {
			const framed = JSON.parse(text) as { webmcpEverywhere?: unknown; data?: DataType };
			data = (framed?.webmcpEverywhere === undefined ? framed : framed.data) as DataType;
		} catch {
			data = null;
		}
		return {
			text: text,
			data: data,
			isError: result.isError === true,
		};
	}
}

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	Checks
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

describe('Milestone 4 — the bridge carries the page tools to a Model Context Protocol client', () => {
	before(async () => {
		await VerifyBridge.connect();
	});

	after(async () => {
		await VerifyBridge.disconnect();
	});

	test('tools/list reports the page tools with usable schemas', async (t) => {
		const listed = await VerifyBridge._requireClient().listTools();
		if (listed.tools.length !== 10) {
			throw new Error(`expected 10 tools, got ${listed.tools.length}`);
		}
		const addTodo = listed.tools.find((tool) => tool.name === 'demo_playwright_dev__add_todo');
		if (addTodo === undefined) {
			throw new Error('add_todo was not listed');
		}
		if (addTodo.inputSchema?.properties?.['title'] === undefined) {
			throw new Error('add_todo lost its input schema crossing the bridge');
		}
		const readOnly = listed.tools.filter((tool) => tool.annotations?.readOnlyHint === true);
		t.diagnostic(
			`10 tools, ${readOnly.length} marked read-only, add_todo requires ${JSON.stringify(addTodo.inputSchema.required)}`,
		);
	});

	test('a tool call reaches the page and changes it', async (t) => {
		await VerifyBridge._call('demo_playwright_dev__set_all_completed', { completed: true });
		await VerifyBridge._call('demo_playwright_dev__clear_completed', {});
		const before = (await VerifyBridge._call<CountTodosResult>('demo_playwright_dev__count_todos', {})).data;
		await VerifyBridge._call('demo_playwright_dev__add_todo', { title: 'added over the bridge' });
		const after = (await VerifyBridge._call<CountTodosResult>('demo_playwright_dev__count_todos', {})).data;
		if (before === null || after === null) {
			throw new Error('count_todos returned nothing that could be parsed');
		}
		if (after.total !== before.total + 1) {
			throw new Error(`total went from ${before.total} to ${after.total}`);
		}
		t.diagnostic(`total ${before.total} then ${after.total} after add_todo`);
	});

	test('arguments survive the crossing', async (t) => {
		const listed = (await VerifyBridge._call<ListTodosResult>('demo_playwright_dev__list_todos', {})).data;
		const target = listed?.todos.find((todo) => todo.title === 'added over the bridge');
		if (target === undefined) {
			throw new Error('the todo added over the bridge is not there');
		}
		await VerifyBridge._call('demo_playwright_dev__edit_todo', {
			id: target.id,
			title: 'renamed over the bridge',
		});
		const after = (await VerifyBridge._call<ListTodosResult>('demo_playwright_dev__list_todos', {})).data;
		const renamed = after?.todos.find((todo) => todo.id === target.id);
		if (renamed?.title !== 'renamed over the bridge') {
			throw new Error(`title is "${renamed?.title}"`);
		}
		t.diagnostic('an identifier and a string both arrived intact');
	});

	test('a failing tool is reported as an error, not as a result', async (t) => {
		const missing = await VerifyBridge._call('demo_playwright_dev__does_not_exist', {});
		if (missing.isError === false) {
			throw new Error('calling a tool that does not exist was reported as success');
		}
		const badInput = await VerifyBridge._call('demo_playwright_dev__delete_todo', { id: 'not-a-real-id' });
		if (badInput.isError === false) {
			throw new Error('deleting a todo that does not exist was reported as success');
		}
		t.diagnostic(`both refused: "${missing.text.slice(0, 60)}…"`);
	});
});

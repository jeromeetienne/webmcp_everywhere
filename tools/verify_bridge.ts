///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	VerifyBridge — checks the Model Context Protocol bridge against a live page
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

import Path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type {
	CheckOutcome,
	CountTodosResult,
	ListTodosResult,
} from './verify_types.ts';

const __dirname = import.meta.dirname;

/**
 * Speaks Model Context Protocol to the bridge exactly as an agent would, and checks what comes back.
 *
 * This is the check that matters for Milestone 4. If it passes, any Model Context Protocol client can
 * drive a site that never shipped WebMCP, which is the whole point of the project.
 */
export class VerifyBridge {
	/**
	 * Runs the checks.
	 *
	 * @returns The outcome.
	 */
	static async run(): Promise<CheckOutcome> {
		const transport = new StdioClientTransport({
			command: process.execPath,
			args: [Path.join(__dirname, '..', 'src', 'bridge', 'webmcp_bridge.ts')],
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

		/**
		 * Calls one tool and unwraps the untrusted content framing around its result.
		 *
		 * @param name - The tool to call.
		 * @param args - Its arguments.
		 * @returns What came back, both as text and as the framed data.
		 */
		const call = async <DataType = unknown>(
			name: string,
			args: Record<string, unknown>,
		): Promise<{ text: string; data: DataType | null; isError: boolean }> => {
			const result = await client.callTool({
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
		};

		await test('tools/list reports the page tools with usable schemas', async () => {
			const listed = await client.listTools();
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
			return `10 tools, ${readOnly.length} marked read-only, add_todo requires ${JSON.stringify(addTodo.inputSchema.required)}`;
		});

		await test('a tool call reaches the page and changes it', async () => {
			await call('demo_playwright_dev__set_all_completed', { completed: true });
			await call('demo_playwright_dev__clear_completed', {});
			const before = (await call<CountTodosResult>('demo_playwright_dev__count_todos', {})).data;
			await call('demo_playwright_dev__add_todo', { title: 'added over the bridge' });
			const after = (await call<CountTodosResult>('demo_playwright_dev__count_todos', {})).data;
			if (before === null || after === null) {
				throw new Error('count_todos returned nothing that could be parsed');
			}
			if (after.total !== before.total + 1) {
				throw new Error(`total went from ${before.total} to ${after.total}`);
			}
			return `total ${before.total} then ${after.total} after add_todo`;
		});

		await test('arguments survive the crossing', async () => {
			const listed = (await call<ListTodosResult>('demo_playwright_dev__list_todos', {})).data;
			const target = listed?.todos.find((todo) => todo.title === 'added over the bridge');
			if (target === undefined) {
				throw new Error('the todo added over the bridge is not there');
			}
			await call('demo_playwright_dev__edit_todo', {
				id: target.id,
				title: 'renamed over the bridge',
			});
			const after = (await call<ListTodosResult>('demo_playwright_dev__list_todos', {})).data;
			const renamed = after?.todos.find((todo) => todo.id === target.id);
			if (renamed?.title !== 'renamed over the bridge') {
				throw new Error(`title is "${renamed?.title}"`);
			}
			return 'an identifier and a string both arrived intact';
		});

		await test('a failing tool is reported as an error, not as a result', async () => {
			const missing = await call('demo_playwright_dev__does_not_exist', {});
			if (missing.isError === false) {
				throw new Error('calling a tool that does not exist was reported as success');
			}
			const badInput = await call('demo_playwright_dev__delete_todo', { id: 'not-a-real-id' });
			if (badInput.isError === false) {
				throw new Error('deleting a todo that does not exist was reported as success');
			}
			return `both refused: "${missing.text.slice(0, 60)}…"`;
		});

		await client.close();
		return { passed, failed };
	}
}

if (import.meta.filename === process.argv[1]) {
	console.log('\nMilestone 4 — the bridge carries the page tools to a Model Context Protocol client\n');
	const outcome = await VerifyBridge.run();
	console.log(`\n${outcome.passed} passed, ${outcome.failed} failed\n`);
	process.exit(outcome.failed === 0 ? 0 : 1);
}

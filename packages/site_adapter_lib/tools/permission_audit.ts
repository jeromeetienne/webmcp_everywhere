import type { Adapter, AdapterToolDefinition, PermissionClass } from '@webmcp_everywhere/site_adapter_lib';

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	PermissionAudit — verifies a declared permission class instead of trusting it
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/**
 * One disagreement between what an adapter tool declared and what its handler actually does.
 */
export type PermissionFinding = {
	/** The unqualified name of the offending tool. */
	toolName: string;
	/** The permission class the adapter author wrote down. */
	declared: PermissionClass;
	/** The lowest permission class the handler's source text can justify. */
	required: PermissionClass;
	/** The source fragments that forced the higher class, for a reviewer to read. */
	evidence: string[];
};

/**
 * Checks that a tool declaring itself read-only really is read-only.
 *
 * Issue #1 requires this to be mechanical rather than self-reported: "a tool that navigates, submits,
 * or mutates is an acting tool regardless of what the author wrote in the field". This runs over the
 * handler's source text, so it is a lint and not a proof — it catches the honest mistake and the lazy
 * copy-and-paste, and a determined author can still defeat it. The network restriction is the defence
 * that does not depend on reading source.
 */
export class PermissionAudit {
	/**
	 * Source patterns that mean the handler changes the page or the user's data on the site.
	 *
	 * `PageDriving` is in this list because every helper in `packages/site_adapter_lib/src/toolkit/page_driving.ts`
	 * changes the page. That is the rule that folder is held to, and it is what lets a handler keep its
	 * mutation inside a shared helper without escaping this audit. `PageWaiting` is deliberately absent:
	 * nothing in it changes anything.
	 */
	static readonly MUTATING_PATTERNS: Array<{ pattern: RegExp; why: string }> = [
		{
			pattern: /\.click\s*\(/,
			why: 'clicks an element',
		},
		{
			pattern: /\.submit\s*\(/,
			why: 'submits a form',
		},
		{
			pattern: /\.dispatchEvent\s*\(/,
			why: 'dispatches a synthetic event',
		},
		{
			pattern: /\.remove\s*\(\s*\)/,
			why: 'removes an element',
		},
		{
			pattern: /\.value\s*=[^=]/,
			why: 'assigns to a form field value',
		},
		{
			pattern: /\.checked\s*=[^=]/,
			why: 'assigns to a checkbox state',
		},
		{
			pattern: /\.innerHTML\s*=[^=]/,
			why: 'rewrites markup',
		},
		{
			pattern: /\.textContent\s*=[^=]/,
			why: 'rewrites text',
		},
		{
			pattern: /document\s*\.\s*title\s*=[^=]/,
			why: 'rewrites the page title',
		},
		{
			pattern: /document\s*\.\s*cookie\s*=[^=]/,
			why: 'writes a cookie',
		},
		{
			pattern: /location\s*\.\s*(href|assign|replace|reload)/,
			why: 'navigates the page',
		},
		{
			pattern: /history\s*\.\s*(pushState|replaceState|back|forward|go)/,
			why: 'changes session history',
		},
		{
			pattern: /localStorage\s*\.\s*(setItem|removeItem|clear)/,
			why: 'writes to local storage',
		},
		{
			pattern: /sessionStorage\s*\.\s*(setItem|removeItem|clear)/,
			why: 'writes to session storage',
		},
		{
			// `\w*` after the class name, because esbuild appends a digit to a bundled name that collides.
			pattern: /PageDriving\w*\s*\.\s*\w/,
			why: 'drives the page through the adapter toolkit',
		},
	];

	/** Source patterns that mean the handler tries to reach the network, which adapters may never do. */
	static readonly EGRESS_PATTERNS: Array<{ pattern: RegExp; why: string }> = [
		{
			pattern: /\bfetch\s*\(/,
			why: 'calls fetch',
		},
		{
			pattern: /XMLHttpRequest/,
			why: 'uses XMLHttpRequest',
		},
		{
			pattern: /\bWebSocket\s*\(/,
			why: 'opens a WebSocket',
		},
		{
			pattern: /\bEventSource\s*\(/,
			why: 'opens an EventSource',
		},
		{
			pattern: /navigator\s*\.\s*sendBeacon/,
			why: 'calls sendBeacon',
		},
		{
			pattern: /\bimport\s*\(/,
			why: 'performs a dynamic import',
		},
	];

	/**
	 * Audits every tool in an adapter.
	 *
	 * @param adapter - The adapter to audit.
	 * @returns The findings, empty when every declaration holds.
	 */
	static auditAdapter(adapter: Adapter): PermissionFinding[] {
		const findings: PermissionFinding[] = [];
		for (const tool of adapter.tools) {
			const finding = PermissionAudit.auditTool(tool);
			if (finding !== null) {
				findings.push(finding);
			}
		}
		return findings;
	}

	/**
	 * Audits one tool.
	 *
	 * @param tool - The tool definition to audit.
	 * @returns A finding when the declared class is too low, otherwise `null`.
	 */
	static auditTool(tool: AdapterToolDefinition): PermissionFinding | null {
		const source = tool.execute.toString();
		const evidence: string[] = [];
		for (const entry of PermissionAudit.MUTATING_PATTERNS) {
			if (entry.pattern.test(source) === true) {
				evidence.push(entry.why);
			}
		}
		if (evidence.length === 0) {
			return null;
		}
		if (tool.permissionClass !== 'readOnly') {
			return null;
		}
		return {
			toolName: tool.name,
			declared: tool.permissionClass,
			required: 'acting',
			evidence: evidence,
		};
	}

	/**
	 * Finds any attempt to reach the network from an adapter's handlers.
	 *
	 * Issue #1 calls this the single highest-value restriction in the design, because it turns the worst
	 * case from silent mass exfiltration into visible on-page misbehaviour. The content security policy
	 * on the injection context is the real enforcement; this check exists to fail a bad adapter early
	 * and loudly rather than at runtime.
	 *
	 * @param adapter - The adapter to check.
	 * @returns One line per offending tool, empty when the adapter never reaches the network.
	 */
	static findNetworkEgress(adapter: Adapter): string[] {
		const offences: string[] = [];
		for (const tool of adapter.tools) {
			const source = tool.execute.toString();
			for (const entry of PermissionAudit.EGRESS_PATTERNS) {
				if (entry.pattern.test(source) === true) {
					offences.push(`${tool.name} ${entry.why}`);
				}
			}
		}
		return offences;
	}
}

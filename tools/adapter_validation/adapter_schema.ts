import { z } from 'zod';
import { ToolNaming } from '../../src/adapter_format/tool_naming.js';
import { PermissionAudit } from './permission_audit.js';
import type { Adapter } from '../../src/adapter_format/adapter_types.js';

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	AdapterSchema — runtime validation of an adapter before it is allowed to register
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/** The adapter format version this file validates. */
export const ADAPTER_FORMAT_VERSION = '0.1.0';

/** Validates the three permission classes. */
export const PERMISSION_CLASS_SCHEMA = z.enum(['readOnly', 'acting', 'sensitive']);

/** Validates the provenance block every adapter carries. */
export const ADAPTER_METADATA_SCHEMA = z.object({
	author: z.string().min(1),
	version: z.string().min(1),
	adapterFormatVersion: z.string().min(1),
	targetSiteVerifiedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD'),
});

/** Validates one tool definition. The handler is checked for being a function, not for what it contains. */
export const ADAPTER_TOOL_DEFINITION_SCHEMA = z.object({
	name: z.string().regex(ToolNaming.VALID_NAME, 'tool names must be lower case snake_case'),
	title: z.string().min(1),
	description: z.string().min(10, 'a description an agent has to act on cannot be three words'),
	inputSchema: z.record(z.unknown()),
	permissionClass: PERMISSION_CLASS_SCHEMA,
	execute: z.function(),
});

/** Validates a whole adapter. */
export const ADAPTER_SCHEMA = z.object({
	siteSlug: z.string().regex(ToolNaming.VALID_NAME, 'site slugs must be lower case snake_case'),
	siteName: z.string().min(1),
	matchPatterns: z.array(z.string().min(1)).min(1),
	metadata: ADAPTER_METADATA_SCHEMA,
	yieldCondition: z.function(),
	tools: z.array(ADAPTER_TOOL_DEFINITION_SCHEMA).min(1),
});

/**
 * The outcome of validating an adapter, carrying every reason it was rejected rather than only the first.
 */
export type AdapterValidationResult = {
	/** Whether the adapter may be registered. */
	isValid: boolean;
	/** Every reason the adapter was rejected. Empty when valid. */
	errors: string[];
};

/**
 * Validates an adapter against the format, then against the checks that no schema can express.
 */
export class AdapterSchema {
	/**
	 * Runs every check an adapter must pass before the runtime will register any of its tools.
	 *
	 * @param candidate - The value to validate, usually an imported adapter module's export.
	 * @returns Whether the adapter is valid, and every reason it is not.
	 */
	static validate(candidate: unknown): AdapterValidationResult {
		const errors: string[] = [];

		const parsed = ADAPTER_SCHEMA.safeParse(candidate);
		if (parsed.success === false) {
			for (const issue of parsed.error.issues) {
				errors.push(`${issue.path.join('.')}: ${issue.message}`);
			}
			return {
				isValid: false,
				errors: errors,
			};
		}

		const adapter = candidate as Adapter;

		const duplicateNames = AdapterSchema._duplicateToolNames(adapter);
		for (const name of duplicateNames) {
			errors.push(`duplicate tool name within the adapter: ${name}`);
		}

		if (adapter.metadata.adapterFormatVersion !== ADAPTER_FORMAT_VERSION) {
			errors.push(
				`adapter targets format version ${adapter.metadata.adapterFormatVersion}, ` +
					`this runtime speaks ${ADAPTER_FORMAT_VERSION}`,
			);
		}

		for (const offence of PermissionAudit.findNetworkEgress(adapter)) {
			errors.push(`adapters may never reach the network: ${offence}`);
		}

		for (const finding of PermissionAudit.auditAdapter(adapter)) {
			errors.push(
				`tool ${finding.toolName} declares ${finding.declared} but ` +
					`${finding.evidence.join(', ')}, so it is ${finding.required}`,
			);
		}

		return {
			isValid: errors.length === 0,
			errors: errors,
		};
	}

	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////
	//	Helpers
	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////

	/**
	 * Finds tool names used more than once inside one adapter.
	 *
	 * @param adapter - The adapter to inspect.
	 * @returns The duplicated names, empty when every name is unique.
	 */
	static _duplicateToolNames(adapter: Adapter): string[] {
		const seen = new Set<string>();
		const duplicates = new Set<string>();
		for (const tool of adapter.tools) {
			if (seen.has(tool.name) === true) {
				duplicates.add(tool.name);
			}
			seen.add(tool.name);
		}
		return [...duplicates];
	}
}

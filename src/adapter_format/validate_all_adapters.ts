import { AdapterRegistry } from '../chrome_extension/adapter_registry.js';
import { AdapterSchema } from './adapter_schema.js';
import { PermissionAudit } from './permission_audit.js';
import { ToolNaming } from './tool_naming.js';

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	ValidateAllAdapters — the review check the build runs before it will bundle anything
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/**
 * Validates every bundled adapter and reports what it found.
 *
 * This runs in the build rather than in the page for two reasons. Adapters are bundled, so by the time
 * a page loads there is nothing left to decide. And validating in the page meant shipping the whole
 * schema library into every site the user visits, which cost about a hundred and fifty kilobytes of
 * main-world script for no protection at all.
 */
export class ValidateAllAdapters {
	/**
	 * Checks every adapter in the registry.
	 *
	 * @returns The problems found, empty when every adapter passes.
	 */
	static run(): string[] {
		const problems: string[] = [];
		const seenQualifiedNames = new Map<string, string>();

		for (const adapter of AdapterRegistry.ADAPTERS) {
			const result = AdapterSchema.validate(adapter);
			for (const error of result.errors) {
				problems.push(`${adapter.siteSlug}: ${error}`);
			}

			for (const tool of adapter.tools) {
				const qualifiedName = ToolNaming.qualify(adapter.siteSlug, tool.name);
				const owner = seenQualifiedNames.get(qualifiedName);
				if (owner !== undefined) {
					problems.push(`${qualifiedName} is registered by both ${owner} and ${adapter.siteSlug}`);
				}
				seenQualifiedNames.set(qualifiedName, adapter.siteSlug);
			}
		}

		return problems;
	}

	/**
	 * Summarises what the registry carries, for the build log.
	 *
	 * @returns One line per adapter.
	 */
	static summarise(): string[] {
		return AdapterRegistry.ADAPTERS.map((adapter) => {
			const byClass = {
				readOnly: adapter.tools.filter((tool) => tool.permissionClass === 'readOnly').length,
				acting: adapter.tools.filter((tool) => tool.permissionClass === 'acting').length,
				sensitive: adapter.tools.filter((tool) => tool.permissionClass === 'sensitive').length,
			};
			const egress = PermissionAudit.findNetworkEgress(adapter).length;
			return (
				`${adapter.siteSlug}: ${adapter.tools.length} tools ` +
				`(${byClass.readOnly} read-only, ${byClass.acting} acting, ${byClass.sensitive} sensitive), ` +
				`${egress} network egress offences`
			);
		});
	}
}

const problems = ValidateAllAdapters.run();
for (const line of ValidateAllAdapters.summarise()) {
	console.log(`  ${line}`);
}
if (problems.length > 0) {
	for (const problem of problems) {
		console.error(`  REJECTED ${problem}`);
	}
	process.exit(1);
}
console.log('  every bundled adapter passed the review checks');

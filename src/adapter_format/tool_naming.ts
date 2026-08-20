///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	ToolNaming — qualifies adapter tool names so two sites never collide
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/**
 * Builds and takes apart the fully qualified tool names that adapters register.
 *
 * Every adapter contributes unqualified names such as `list_todos`. Many adapters share one
 * agent-visible tool list, so the runtime registers `demo_playwright_dev__list_todos` instead. Without
 * this, two sites that both offer a `search` tool would collide and the agent would call the wrong one.
 */
export class ToolNaming {
	/** Separates the site slug from the unqualified tool name. Two underscores, so single ones are free. */
	static readonly SEPARATOR = '__';

	/** Names WebMCP accepts. Anything outside this set is rejected before registration is attempted. */
	static readonly VALID_NAME = /^[a-z0-9_]+$/;

	/**
	 * Derives a stable `snake_case` slug from an origin.
	 *
	 * @param origin - An origin such as `https://demo.playwright.dev`.
	 * @returns A slug such as `demo_playwright_dev`.
	 */
	static slugFromOrigin(origin: string): string {
		const host = origin.replace(/^https?:\/\//, '').replace(/:\d+$/, '');
		return host.replace(/[^a-zA-Z0-9]+/g, '_').toLowerCase();
	}

	/**
	 * Joins a site slug and an unqualified tool name into the name actually registered with WebMCP.
	 *
	 * @param siteSlug - The adapter's site slug, for example `demo_playwright_dev`.
	 * @param toolName - The unqualified tool name, for example `list_todos`.
	 * @returns The qualified name, for example `demo_playwright_dev__list_todos`.
	 */
	static qualify(siteSlug: string, toolName: string): string {
		return `${siteSlug}${ToolNaming.SEPARATOR}${toolName}`;
	}

	/**
	 * Splits a qualified name back into its site slug and unqualified tool name.
	 *
	 * @param qualifiedName - A name such as `demo_playwright_dev__list_todos`.
	 * @returns The two parts, or `null` when the name is not qualified.
	 */
	static unqualify(qualifiedName: string): { siteSlug: string; toolName: string } | null {
		const index = qualifiedName.indexOf(ToolNaming.SEPARATOR);
		if (index === -1) {
			return null;
		}
		return {
			siteSlug: qualifiedName.slice(0, index),
			toolName: qualifiedName.slice(index + ToolNaming.SEPARATOR.length),
		};
	}

	/**
	 * Reports whether a qualified name belongs to the given adapter.
	 *
	 * @param qualifiedName - The name to test.
	 * @param siteSlug - The adapter's site slug.
	 * @returns `true` when the name was registered by that adapter.
	 */
	static belongsTo(qualifiedName: string, siteSlug: string): boolean {
		return qualifiedName.startsWith(siteSlug + ToolNaming.SEPARATOR);
	}
}

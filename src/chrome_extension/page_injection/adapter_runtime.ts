import { ToolNaming, UntrustedContent } from '@webmcp_everywhere/adapter_format';
import type { Adapter, AdapterToolDefinition, OriginGrant } from '@webmcp_everywhere/adapter_format';

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	AdapterRuntime — decides what an adapter may register, then registers it
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/** What the runtime did on one page, kept for the user interface and for the verification checks. */
export type RuntimeReport = {
	/** The origin the runtime ran on. */
	origin: string;
	/** The site slug of the adapter that matched, or `null` when none did. */
	siteSlug: string | null;
	/** Whether the adapter stood down because the site speaks WebMCP for itself. */
	yielded: boolean;
	/** The qualified names actually registered. */
	registered: string[];
	/** Tool names withheld because the user has not opted in, with the reason. */
	withheld: Array<{ name: string; reason: string }>;
	/** Anything that went wrong. */
	errors: string[];
};

/**
 * The part of the extension that runs in the page's main world and talks to WebMCP.
 *
 * It exists because `document.modelContext` is only reachable from the main world, so a content script
 * in the ordinary isolated world cannot register anything. Everything that needs extension storage
 * happens in the isolated world and arrives here as a message.
 */
export class AdapterRuntime {
	/** The event the main world listens on for the user's grants. */
	static readonly GRANT_EVENT = 'webmcp-everywhere:grant';

	/** The event the main world sends to ask the isolated world for the grants. */
	static readonly REQUEST_GRANT_EVENT = 'webmcp-everywhere:request-grant';

	/** The event the main world sends after registering, so the isolated world can show what happened. */
	static readonly REPORT_EVENT = 'webmcp-everywhere:report';

	/** Aborting this unregisters everything the runtime registered on this page. */
	static _registration: AbortController | null = null;

	/**
	 * The registration in flight, so that a second one waits for it rather than racing it.
	 *
	 * Two grants arrive close together on every page load: the isolated world sends one as soon as it
	 * starts, and sends another when the main world asks. Both used to start a registration, both got
	 * past the wait for the previous tools to disappear, and both then registered the same names — so
	 * one tool of the several came back `InvalidStateError: Duplicate tool name` and was silently
	 * missing, and the kill switch afterwards aborted only one of the two registrations and left the
	 * other one's tools on the page.
	 */
	static _inFlight: Promise<unknown> = Promise.resolve();

	/**
	 * Registers an adapter's tools, subject to the user's grant and the site's own tools.
	 *
	 * Registrations are run one after another, never side by side. Everything below assumes it is the
	 * only thing touching `document.modelContext` while it runs, and two at once breaks that.
	 *
	 * @param adapter - The adapter to register.
	 * @param grant - What the user has allowed on this origin.
	 * @returns What was registered, what was withheld, and why.
	 */
	static async register(adapter: Adapter, grant: OriginGrant): Promise<RuntimeReport> {
		const queued = AdapterRuntime._inFlight.then(
			async () => await AdapterRuntime._registerNow(adapter, grant),
		);
		AdapterRuntime._inFlight = queued.catch(() => undefined);
		return await queued;
	}

	/**
	 * Does one registration, with nothing else registering at the same time.
	 *
	 * @param adapter - The adapter to register.
	 * @param grant - What the user has allowed on this origin.
	 * @returns What was registered, what was withheld, and why.
	 */
	static async _registerNow(adapter: Adapter, grant: OriginGrant): Promise<RuntimeReport> {
		const report: RuntimeReport = {
			origin: window.location.origin,
			siteSlug: adapter.siteSlug,
			yielded: false,
			registered: [],
			withheld: [],
			errors: [],
		};

		if (AdapterRuntime._isWebMcpAvailable() === false) {
			report.errors.push('this browser does not expose document.modelContext');
			return AdapterRuntime._finish(report);
		}

		await AdapterRuntime._unregisterAndSettle(adapter.siteSlug);

		if (grant.globallyEnabled === false) {
			report.withheld.push({
				name: '*',
				reason: 'WebMCP Everywhere is switched off',
			});
			return AdapterRuntime._finish(report);
		}

		const firstPartyToolNames = await AdapterRuntime._firstPartyToolNames(adapter.siteSlug);
		if (adapter.yieldCondition(firstPartyToolNames) === true) {
			report.yielded = true;
			return AdapterRuntime._finish(report);
		}

		const controller = new AbortController();
		AdapterRuntime._registration = controller;

		for (const tool of adapter.tools) {
			const refusal = AdapterRuntime._refuseReason(tool, grant);
			if (refusal !== null) {
				report.withheld.push({
					name: tool.name,
					reason: refusal,
				});
				continue;
			}
			const qualifiedName = ToolNaming.qualify(adapter.siteSlug, tool.name);
			try {
				await document.modelContext.registerTool(
					{
						name: qualifiedName,
						title: tool.title,
						description: `[${adapter.siteName}, via WebMCP Everywhere] ${tool.description}`,
						inputSchema: tool.inputSchema,
						annotations: {
							readOnlyHint: tool.permissionClass === 'readOnly',
						},
						execute: AdapterRuntime._wrapExecute(adapter, tool),
					},
					{
						signal: controller.signal,
					},
				);
				report.registered.push(qualifiedName);
			} catch (error) {
				report.errors.push(`${qualifiedName}: ${AdapterRuntime._messageOf(error)}`);
			}
		}

		return AdapterRuntime._finish(report);
	}

	/**
	 * Removes every tool this runtime registered on the page.
	 *
	 * @returns Nothing.
	 */
	static unregister(): void {
		if (AdapterRuntime._registration !== null) {
			AdapterRuntime._registration.abort();
			AdapterRuntime._registration = null;
		}
	}

	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////
	//	Helpers
	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////

	/**
	 * Removes this runtime's tools and waits until WebMCP agrees they are gone.
	 *
	 * Aborting a registration signal is not synchronous. Registering again straight afterwards raced the
	 * abort and failed with `InvalidStateError: Duplicate tool name`, which silently cost a tool on every
	 * re-registration. Waiting for the names to actually disappear removes the race.
	 *
	 * @param siteSlug - The adapter's site slug, used to recognise its own tools.
	 * @returns Nothing.
	 */
	static async _unregisterAndSettle(siteSlug: string): Promise<void> {
		AdapterRuntime.unregister();
		const deadline = Date.now() + 1000;
		while (Date.now() < deadline) {
			const remaining = await AdapterRuntime._ownToolNames(siteSlug);
			if (remaining.length === 0) {
				return;
			}
			await new Promise((resolve) => setTimeout(resolve, 20));
		}
	}

	/**
	 * Lists the tools on the page that this adapter registered.
	 *
	 * @param siteSlug - The adapter's site slug.
	 * @returns The qualified names belonging to this adapter.
	 */
	static async _ownToolNames(siteSlug: string): Promise<string[]> {
		try {
			const tools = await document.modelContext.getTools();
			return tools.map((tool) => tool.name).filter((name) => ToolNaming.belongsTo(name, siteSlug));
		} catch {
			return [];
		}
	}

	/**
	 * Reports whether this browser exposes WebMCP at all.
	 *
	 * @returns `true` when `document.modelContext` is usable.
	 */
	static _isWebMcpAvailable(): boolean {
		return typeof document !== 'undefined' && document.modelContext !== undefined;
	}

	/**
	 * Lists tools already on the page that this adapter did not put there.
	 *
	 * @param siteSlug - The adapter's site slug, used to recognise its own tools.
	 * @returns The names of tools belonging to somebody else, most likely the site itself.
	 */
	static async _firstPartyToolNames(siteSlug: string): Promise<string[]> {
		try {
			const tools = await document.modelContext.getTools();
			return tools
				.map((tool) => tool.name)
				.filter((name) => ToolNaming.belongsTo(name, siteSlug) === false);
		} catch {
			return [];
		}
	}

	/**
	 * Decides whether a tool may be registered given what the user has allowed.
	 *
	 * @param tool - The tool being considered.
	 * @param grant - What the user has allowed on this origin.
	 * @returns The reason to withhold the tool, or `null` when it may be registered.
	 */
	static _refuseReason(tool: AdapterToolDefinition, grant: OriginGrant): string | null {
		if (tool.permissionClass === 'readOnly') {
			return null;
		}
		if (grant.actingAllowed === true) {
			return null;
		}
		return `${tool.permissionClass} tools need the user to opt in for ${grant.origin}`;
	}

	/**
	 * Wraps a handler so every invocation is announced, sensitive ones are confirmed first, and whatever
	 * comes back is framed as untrusted content.
	 *
	 * The framing is applied here rather than in each adapter so that no adapter author can forget it,
	 * and so that a hostile adapter cannot skip it.
	 *
	 * @param adapter - The adapter the tool belongs to.
	 * @param tool - The tool being wrapped.
	 * @returns The handler WebMCP will actually call.
	 */
	static _wrapExecute(
		adapter: Adapter,
		tool: AdapterToolDefinition,
	): (input: Record<string, unknown>) => Promise<unknown> {
		return async (input: Record<string, unknown>): Promise<unknown> => {
			if (tool.permissionClass === 'sensitive') {
				const allowed = window.confirm(
					`An agent wants to run "${tool.title}" on ${adapter.siteName}.\n\n` +
						`${tool.description}\n\nAllow it?`,
				);
				if (allowed === false) {
					throw new Error('the user declined this invocation');
				}
			}
			AdapterRuntime._announce(adapter, tool);
			const result = await tool.execute(input ?? {});
			return UntrustedContent.frame(window.location.origin, tool.name, result);
		};
	}

	/**
	 * Makes an invocation visible, because silence is what turns a small compromise into a large one.
	 *
	 * @param adapter - The adapter the tool belongs to.
	 * @param tool - The tool being invoked.
	 * @returns Nothing.
	 */
	static _announce(adapter: Adapter, tool: AdapterToolDefinition): void {
		document.dispatchEvent(
			new CustomEvent('webmcp-everywhere:invocation', {
				detail: {
					siteSlug: adapter.siteSlug,
					toolName: tool.name,
					permissionClass: tool.permissionClass,
					at: new Date().toISOString(),
				},
			}),
		);
	}

	/**
	 * Publishes a report to the isolated world, and returns it.
	 *
	 * The report is also left on `window`, so a verification runner can read it straight out of the page
	 * without a message round trip.
	 *
	 * @param report - The report to finish with.
	 * @returns The same report.
	 */
	static _finish(report: RuntimeReport): RuntimeReport {
		(window as unknown as Record<string, unknown>).__webmcpEverywhereReport = report;
		document.dispatchEvent(
			new CustomEvent(AdapterRuntime.REPORT_EVENT, {
				detail: JSON.parse(JSON.stringify(report)),
			}),
		);
		return report;
	}

	/**
	 * Turns anything thrown into a readable string.
	 *
	 * @param error - The thrown value.
	 * @returns A message.
	 */
	static _messageOf(error: unknown): string {
		if (error instanceof Error) {
			return `${error.name}: ${error.message}`;
		}
		return String(error);
	}
}

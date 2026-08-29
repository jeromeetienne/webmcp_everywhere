import Fs from 'node:fs';
import Path from 'node:path';
import { ToolNaming } from '@webmcp_everywhere/adapter_format';
import { HostStateFiles } from '../src/native_messaging_host/host_state_files.ts';
import { PackagedReleaseInstallation } from './packaged_release_installation.ts';
import { ReleaseLayout } from './release_layout.ts';
import type { HostEndpointRecord, HostHealth } from '../src/native_messaging_host/webmcp_native_host_types.ts';

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	InstallationStatus — asks the running system whether the extension is really there
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	Types
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/**
 * Where along the delivery path the check stopped.
 *
 * The path has several steps and each one fails differently, so there is a name for each rather than
 * one "it is not working". A person reading the answer has to know which step to go and fix.
 */
export type InstallationStatusStage =
	| 'nothing_installed'
	| 'no_host_listening'
	| 'nothing_answers_the_recorded_address'
	| 'another_program_holds_the_port'
	| 'no_token'
	| 'token_refused'
	| 'extension_not_connected'
	| 'no_tools_offered'
	| 'no_site_adapter_running'
	| 'tools_offered';

/** One adapter offering tools right now, and where it is offering them from. */
export type OfferedAdapter = {
	/** The site slug the adapter registered its tools under. */
	siteSlug: string;
	/** How many tools it is offering. */
	toolCount: number;
	/** The tabs its tool names call out, which happens only when two tabs offer the same name. */
	tabIds: number[];
};

/** What the check found, from the installation folder through to the tools an agent would see. */
export type InstallationStatusReport = {
	/** Whether an agent pointed here right now would get tools. */
	isReady: boolean;
	/** Which step the check stopped at. */
	stage: InstallationStatusStage;
	/** One sentence saying what is true, written for a person. */
	summary: string;
	/** What to do about it, one line each, empty when there is nothing to do. */
	remedy: string[];
	/** The installation folder, whether or not anything is there. */
	installationDir: string;
	/** The extension folder a person loads at `chrome://extensions`, whether or not it is there. */
	extensionDir: string;
	/** The state directory holding the token, the endpoint file and the loaded adapters. */
	stateDir: string;
	/** Where a host said it is listening, or null when no host wrote it down. */
	endpoint: HostEndpointRecord | null;
	/** Whether the extension is connected to the host that answered, false when none answered. */
	isExtensionConnected: boolean;
	/** Every tool name offered, in the order the host gave them. */
	toolNames: string[];
	/** One entry per site adapter offering tools, the browser's own tools left out. */
	adapters: OfferedAdapter[];
	/** How many of the tools are the browser's own, answered by the bridge rather than by any page. */
	browserToolCount: number;
};

/** Where to look, and how long to wait. */
export type InstallationStatusOptions = {
	/** The state directory to read, when it is not the one the host writes to. */
	stateDir?: string;
	/** How long to wait for the host to answer, in milliseconds. */
	timeoutMilliseconds?: number;
};

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	InstallationStatus
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/**
 * Answers whether the extension is loaded, connected, and reaching an agent.
 *
 * It asks the running system rather than looking for the extension in Chrome's own files. Those files
 * are undocumented, they differ by platform and by profile, and they would answer "installed" for an
 * extension that is switched off, crashed, or talking to nothing. The host is the honest witness: Chrome
 * is what starts it, so a host holding the port means Chrome is running with this extension in it, and
 * the tool list it answers with is exactly what an agent would receive.
 *
 * Every step is reported separately, because each one fails for its own reason and needs its own fix.
 */
export class InstallationStatus {
	/** How long to wait for the host to answer, in milliseconds, when the caller names nothing. */
	static readonly TIMEOUT = 2000;

	/**
	 * Walks the delivery path as far as it goes, and says where it stopped.
	 *
	 * @param options - Where to look, and how long to wait.
	 * @returns What was found at every step.
	 */
	static async read(options: InstallationStatusOptions = {}): Promise<InstallationStatusReport> {
		const stateDir = options.stateDir ?? HostStateFiles.STATE_DIR;
		const installationDir = Path.join(stateDir, PackagedReleaseInstallation.FOLDER_NAME);
		const extensionDir = Path.join(installationDir, ReleaseLayout.EXTENSION_DIR);
		const timeout = options.timeoutMilliseconds ?? InstallationStatus.TIMEOUT;

		const partial = {
			installationDir: installationDir,
			extensionDir: extensionDir,
			stateDir: stateDir,
			endpoint: null,
			isExtensionConnected: false,
			toolNames: [],
			adapters: [],
			browserToolCount: 0,
		};

		const endpoint = InstallationStatus._readEndpoint(stateDir);
		if (endpoint === null) {
			if (Fs.existsSync(installationDir) === false) {
				return {
					...partial,
					isReady: false,
					stage: 'nothing_installed',
					summary: `Nothing is installed at ${installationDir}`,
					remedy: ['Install it: npx webmcp_everywhere'],
				};
			}
			return {
				...partial,
				isReady: false,
				stage: 'no_host_listening',
				summary: 'No browser is holding the port, so the extension is not loaded or Chrome is not running.',
				remedy: InstallationStatus._loadTheExtension(extensionDir),
			};
		}

		const health = await InstallationStatus._askHealth(endpoint.url, timeout);
		if (health === null) {
			return {
				...partial,
				endpoint: endpoint,
				isReady: false,
				stage: 'nothing_answers_the_recorded_address',
				summary: `${endpoint.url} was recorded by process ${endpoint.processId}, and nothing answers there.`,
				remedy: ['Quit Chrome and start it again, which starts a new host.'],
			};
		}
		if (health.processId !== endpoint.processId) {
			return {
				...partial,
				endpoint: endpoint,
				isReady: false,
				stage: 'another_program_holds_the_port',
				summary: `Process ${health.processId} is answering on ${endpoint.url}, not the host that recorded it.`,
				remedy: [
					'The port serves one browser at a time. Close the other browser holding it,',
					'then quit Chrome and start it again.',
				],
			};
		}
		if (health.extensionConnected === false) {
			return {
				...partial,
				endpoint: endpoint,
				isReady: false,
				stage: 'extension_not_connected',
				summary: `A host is listening on ${endpoint.url}, and no extension is connected to it.`,
				remedy: InstallationStatus._loadTheExtension(extensionDir),
			};
		}

		const tokenPath = Path.join(stateDir, 'token');
		if (Fs.existsSync(tokenPath) === false) {
			return {
				...partial,
				endpoint: endpoint,
				isExtensionConnected: true,
				isReady: false,
				stage: 'no_token',
				summary: `There is no bearer token at ${tokenPath}, so nothing may ask the host anything.`,
				remedy: ['Quit Chrome and start it again, which writes one.'],
			};
		}
		const token = Fs.readFileSync(tokenPath, 'utf8').trim();

		const answer = await InstallationStatus._askTools(endpoint.url, token, timeout);
		if (answer.isTokenRefused === true) {
			return {
				...partial,
				endpoint: endpoint,
				isExtensionConnected: true,
				isReady: false,
				stage: 'token_refused',
				summary: `The host refused the token in ${tokenPath}`,
				remedy: ['Quit Chrome and start it again, then read the token again.'],
			};
		}

		const adapters = InstallationStatus._groupByAdapter(answer.toolNames);
		const browserToolCount = answer.toolNames.filter((name) => {
			return ToolNaming.belongsTo(name, ToolNaming.BROWSER_SLUG) === true;
		}).length;
		const siteToolCount = answer.toolNames.length - browserToolCount;

		if (answer.toolNames.length === 0) {
			return {
				...partial,
				endpoint: endpoint,
				isExtensionConnected: true,
				isReady: false,
				stage: 'no_tools_offered',
				summary: 'The extension is connected and the host offered no tools at all, not even its own.',
				remedy: ['Quit Chrome and start it again.'],
			};
		}

		const answered = {
			...partial,
			endpoint: endpoint,
			isExtensionConnected: true,
			toolNames: answer.toolNames,
			adapters: adapters,
			browserToolCount: browserToolCount,
			isReady: true,
		};

		if (adapters.length === 0) {
			return {
				...answered,
				stage: 'no_site_adapter_running',
				summary:
					`The extension is loaded and connected, and ${browserToolCount} browser tools are reaching ` +
					'your agent. No open tab has a site adapter running in it.',
				remedy: [
					'Open a site one of your adapters covers, then ask again. Your agent can open one itself',
					'with the webmcp_everywhere__open_page tool.',
					'The extension popup lists every adapter and says why a withheld one is withheld.',
				],
			};
		}

		return {
			...answered,
			stage: 'tools_offered',
			summary:
				`${siteToolCount} tools from ${adapters.length} ` +
				`${adapters.length === 1 ? 'adapter' : 'adapters'} are reaching your agent, ` +
				`and ${browserToolCount} browser tools beside them.`,
			remedy: [],
		};
	}

	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////
	//	Helpers
	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////

	/**
	 * Reads where a host said it is listening.
	 *
	 * The file is there only while a host really holds the port, and it is removed by the host that
	 * wrote it, so a missing file means no browser is running rather than an address gone stale.
	 *
	 * @param stateDir - The state directory to read it from.
	 * @returns The record, or null when there is no readable one.
	 */
	static _readEndpoint(stateDir: string): HostEndpointRecord | null {
		const endpointPath = Path.join(stateDir, 'endpoint.json');
		if (Fs.existsSync(endpointPath) === false) {
			return null;
		}
		try {
			return JSON.parse(Fs.readFileSync(endpointPath, 'utf8')) as HostEndpointRecord;
		} catch {
			return null;
		}
	}

	/**
	 * Asks whatever is on that address what it is and whether an extension is connected to it.
	 *
	 * @param url - The Model Context Protocol address the endpoint file names.
	 * @param timeoutMilliseconds - How long to wait for an answer.
	 * @returns What answered, or null when nothing did.
	 */
	static async _askHealth(url: string, timeoutMilliseconds: number): Promise<HostHealth | null> {
		try {
			const response = await fetch(new URL('/health', url), {
				signal: AbortSignal.timeout(timeoutMilliseconds),
			});
			return (await response.json()) as HostHealth;
		} catch {
			return null;
		}
	}

	/**
	 * Asks the host for its tool list, exactly the way an agent does.
	 *
	 * @param url - The Model Context Protocol address.
	 * @param token - The bearer token to present.
	 * @param timeoutMilliseconds - How long to wait for an answer.
	 * @returns The names offered, and whether the token was refused.
	 */
	static async _askTools(
		url: string,
		token: string,
		timeoutMilliseconds: number,
	): Promise<{ toolNames: string[]; isTokenRefused: boolean }> {
		try {
			const response = await fetch(url, {
				method: 'POST',
				headers: {
					'content-type': 'application/json',
					accept: 'application/json, text/event-stream',
					authorization: `Bearer ${token}`,
				},
				body: JSON.stringify({
					jsonrpc: '2.0',
					id: 1,
					method: 'tools/list',
					params: {},
				}),
				signal: AbortSignal.timeout(timeoutMilliseconds),
			});
			if (response.status === 401 || response.status === 403) {
				return {
					toolNames: [],
					isTokenRefused: true,
				};
			}
			const body = (await response.json()) as {
				result?: {
					tools?: { name?: string }[];
				};
			};
			const toolNames = (body.result?.tools ?? [])
				.map((tool) => tool.name ?? '')
				.filter((name) => name.length > 0);
			return {
				toolNames: toolNames,
				isTokenRefused: false,
			};
		} catch {
			return {
				toolNames: [],
				isTokenRefused: false,
			};
		}
	}

	/**
	 * Sorts tool names into the adapters that registered them, and the tabs they name.
	 *
	 * A name carries its adapter in front of the first double underscore, and carries a tab suffix only
	 * when two tabs offer the same tool — see `docs/tool_naming_and_tab_identity.md`.
	 *
	 * The browser's own tools are left out. They are answered by the bridge rather than by any page, they
	 * are always there, and counting them as an adapter would report a page open when none is.
	 *
	 * @param toolNames - The names the host offered.
	 * @returns One entry per site adapter, by site slug, in alphabetical order.
	 */
	static _groupByAdapter(toolNames: string[]): OfferedAdapter[] {
		const bySlug = new Map<string, OfferedAdapter>();

		for (const name of toolNames) {
			if (ToolNaming.belongsTo(name, ToolNaming.BROWSER_SLUG) === true) {
				continue;
			}
			const parts = ToolNaming.unqualify(name);
			const siteSlug = parts === null ? name : parts.siteSlug;
			const adapter = bySlug.get(siteSlug) ?? {
				siteSlug: siteSlug,
				toolCount: 0,
				tabIds: [],
			};
			adapter.toolCount = adapter.toolCount + 1;

			const tab = /__tab(\d+)$/.exec(name);
			if (tab !== null) {
				const tabId = Number.parseInt(tab[1], 10);
				if (adapter.tabIds.includes(tabId) === false) {
					adapter.tabIds.push(tabId);
				}
			}
			bySlug.set(siteSlug, adapter);
		}

		const adapters = [...bySlug.values()];
		for (const adapter of adapters) {
			adapter.tabIds.sort((left, right) => left - right);
		}
		adapters.sort((left, right) => left.siteSlug.localeCompare(right.siteSlug));
		return adapters;
	}

	/**
	 * The two steps only a person can take, named with the folder to pick.
	 *
	 * @param extensionDir - The folder to load at `chrome://extensions`.
	 * @returns The lines to print.
	 */
	static _loadTheExtension(extensionDir: string): string[] {
		return [
			'Chrome loads an unpacked extension by hand:',
			'  1. Open chrome://extensions and turn on Developer mode.',
			'  2. Choose Load unpacked, and select this folder:',
			`     ${extensionDir}`,
		];
	}
}

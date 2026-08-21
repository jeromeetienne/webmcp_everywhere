///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	VerifyOpenStreetMap — drives the OpenStreetMap adapter in a real Chrome on the real site
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

import { CdpClient } from '../tools/chrome_devtools_protocol/cdp_client.ts';
import { LaunchChrome } from '../tools/launch_chrome.ts';
import NodeTest from 'node:test';
import type { FramedResultOf } from './verify_types.ts';

const TARGET_URL = 'https://www.openstreetmap.org/#map=18/48.8584/2.2945';

const ORIGIN = 'https://www.openstreetmap.org';

/** A node with a rich tag list, verified against the live site on 2026-08-21. */
const SAMPLE_NODE_ID = 7982106824;

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	Types
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/** What `get_map_view` returns. */
type MapViewResult = {
	/** The latitude at the centre of the map. */
	latitude: number;
	/** The longitude at the centre of the map. */
	longitude: number;
	/** The zoom level. */
	zoom: number;
	/** The path of the panel that is open. */
	path: string;
};

/** What `get_selected_feature` returns. */
type SelectedFeatureResult = {
	/** Whether the object is a node, a way, or a relation. */
	kind: string;
	/** The object's identifier. */
	id: number;
	/** The value of the `name` tag. */
	name: string | null;
	/** Every tag on the object. */
	tags: Record<string, string>;
	/** How many tags the object carries. */
	tagCount: number;
	/** Which version is shown. */
	version: number | null;
	/** The mapper who saved that version. */
	lastEditedBy: string | null;
	/** The changeset that version belongs to. */
	changesetId: number | null;
	/** The latitude of a node. */
	latitude: number | null;
};

/** One of the two lists `list_queried_features` returns. */
type QueriedFeatureList = {
	/** The entries the list holds. */
	features: Array<{ kind: string; id: number; name: string | null; category: string | null }>;
	/** How many entries the list holds in total. */
	total: number;
	/** Whether the list is still being fetched. */
	stillLoading: boolean;
};

/** What `list_queried_features` returns. */
type QueriedFeaturesResult = {
	/** The features near the queried point. */
	nearby: QueriedFeatureList;
	/** The areas containing the queried point. */
	enclosing: QueriedFeatureList;
};

/** What `list_recent_changesets` returns. */
type RecentChangesetsResult = {
	/** The changesets the panel is showing. */
	changesets: Array<{
		id: number;
		comment: string | null;
		author: string | null;
		closedAt: string | null;
		createdCount: number | null;
		modifiedCount: number | null;
		deletedCount: number | null;
		boundingBox: { minLatitude: number; maxLatitude: number } | null;
	}>;
	/** How many the panel holds. */
	total: number;
	/** How many were returned. */
	returned: number;
};

/** What `get_changeset` returns. */
type ChangesetResult = {
	/** The changeset's identifier. */
	id: number;
	/** What the mapper wrote. */
	comment: string | null;
	/** Who made the change. */
	author: string | null;
	/** The changeset's own tags. */
	tags: Record<string, string>;
	/** The objects the panel is listing. */
	objects: Array<{ kind: string; id: number; label: string }>;
	/** The panel's section headings. */
	objectSections: string[];
};

/** What `list_search_results` returns. */
type SearchResultsResult = {
	/** The results the panel is showing. */
	results: Array<{
		kind: string;
		id: number;
		name: string;
		category: string | null;
		latitude: number;
		longitude: number;
	}>;
	/** How many the panel holds. */
	total: number;
	/** How many were returned. */
	returned: number;
};

/** What `show_recent_changes` returns. */
type RecentChangesInViewResult = RecentChangesetsResult & {
	/** Where the map was when the list was read. */
	mapView: { latitude: number; longitude: number; zoom: number } | null;
};

/** What `query_features_at` returns. */
type QueryAtPointResultShape = QueriedFeaturesResult & {
	/** Where the map was when the query ran. */
	mapView: { latitude: number; longitude: number; zoom: number } | null;
};

/** What `get_directions` returns. */
type RouteResultShape = {
	/** The routing provider that answered. */
	engine: string;
	/** The way of travelling that was asked for. */
	mode: string;
	/** The route itself. */
	route: {
		distance: string;
		time: string;
		turnCount: number;
		turns: Array<{ step: number; instruction: string; distance: string }>;
	};
};

/** What a tool returns instead of throwing when it cannot serve a reasonable request. */
type RefusalResult = {
	/** Always `true` on a refusal. */
	refused: true;
	/** What went wrong. */
	reason: string;
	/** What has to happen first. */
	remedy: string;
};

/** The live browser every check works against, prepared once before the first of them. */
type OpenStreetMapContext = {
	/** The remote debugging port Chrome is listening on. */
	port: number;
	/** The installed extension's identifier. */
	extensionId: string;
	/** A client attached to the OpenStreetMap page. */
	page: CdpClient;
};

/**
 * Runs every check for the OpenStreetMap adapter against the live site in a real Chrome.
 *
 * Nothing here is mocked. Chrome is launched, the extension is installed, the live site is loaded, and
 * every assertion calls a tool through `document.modelContext` and compares the answer against what
 * the page itself renders, read back with a separate expression.
 */
class VerifyOpenStreetMap {
	/** The live browser, set before the first check and dropped after the last one. */
	static context: OpenStreetMapContext | null = null;

	/** The distance and instruction count of the driving route, kept to compare the walking one against. */
	static carRoute = '';

	/**
	 * Returns the live browser the checks work against, refusing to continue when there is none.
	 *
	 * @returns The port, the extension identifier and the page.
	 * @throws When the launch step never prepared them.
	 */
	static _requireContext(): OpenStreetMapContext {
		if (VerifyOpenStreetMap.context === null) {
			throw new Error('the browser was never launched');
		}
		return VerifyOpenStreetMap.context;
	}

	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////
	//	Helpers
	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////

	/**
	 * Waits for a moment.
	 *
	 * @param milliseconds - How long to wait.
	 * @returns Nothing.
	 */
	static async _pause(milliseconds: number): Promise<void> {
		await new Promise((resolve) => setTimeout(resolve, milliseconds));
	}

	/**
	 * Finds the extension's identifier, waiting for its service worker to start.
	 *
	 * @param port - The remote debugging port.
	 * @returns The extension identifier.
	 * @throws When the service worker never starts.
	 */
	static async _extensionId(port: number): Promise<string> {
		for (let attempt = 0; attempt < 40; attempt += 1) {
			const targets = await CdpClient.listTargets(port);
			const worker = targets.find(
				(target) =>
					target.type === 'service_worker' &&
					target.url.includes('dist/background_service_worker.js'),
			);
			if (worker !== undefined) {
				return new URL(worker.url).host;
			}
			await VerifyOpenStreetMap._pause(250);
		}
		throw new Error('the extension service worker never started');
	}

	/**
	 * Writes the user's settings straight into the extension's storage.
	 *
	 * @param port - The remote debugging port.
	 * @param extensionId - The installed extension's identifier.
	 * @param actingAllowed - Whether acting tools are opted in for this origin.
	 * @param globallyEnabled - Whether the extension is switched on at all.
	 * @returns Nothing.
	 * @throws When the service worker is not running.
	 */
	static async _setGrant(
		port: number,
		extensionId: string,
		actingAllowed: boolean,
		globallyEnabled: boolean,
	): Promise<void> {
		const targets = await CdpClient.listTargets(port);
		const worker = targets.find((target) =>
			target.url.includes(`${extensionId}/dist/background_service_worker.js`),
		);
		if (worker === undefined) {
			throw new Error('the extension service worker is not running');
		}
		const client = new CdpClient(port);
		await client.connect(worker.webSocketDebuggerUrl);
		const settings = {
			globallyEnabled: globallyEnabled,
			actingAllowedByOrigin: {
				[ORIGIN]: actingAllowed,
			},
		};
		await client.evaluate(
			`chrome.storage.local.set({ webmcp_everywhere_settings: ${JSON.stringify(settings)} }).then(() => 'ok')`,
		);
		client.close();
	}

	/**
	 * Loads the target page fresh and returns a client attached to it.
	 *
	 * @param port - The remote debugging port.
	 * @param url - The address to load.
	 * @returns A client attached to the page.
	 */
	static async _reload(port: number, url: string): Promise<CdpClient> {
		const page = await CdpClient.connectToPage(port, 'openstreetmap.org');
		await page.navigate(url, 6000);
		return page;
	}

	/**
	 * Names every tool the adapter has registered on the page.
	 *
	 * @param page - The page to ask.
	 * @returns The qualified tool names.
	 */
	static async _toolNames(page: CdpClient): Promise<string[]> {
		const json = await page.evaluate<string>(
			'document.modelContext.getTools().then((tools) => JSON.stringify(tools.map((tool) => tool.name)))',
		);
		return JSON.parse(json) as string[];
	}

	/**
	 * Calls one of the adapter's tools and unwraps the framed result.
	 *
	 * @param page - The page holding the tool.
	 * @param shortName - The tool's unqualified name.
	 * @param input - The tool's arguments.
	 * @returns Whatever the tool returned, taken out of its frame.
	 * @throws When the tool is not registered or its result was never framed.
	 */
	static async _callTool<ResultType = unknown>(
		page: CdpClient,
		shortName: string,
		input: Record<string, unknown> = {},
	): Promise<ResultType> {
		const qualifiedName = `openstreetmap_org__${shortName}`;
		const expression = `
			(async () => {
				const tools = await document.modelContext.getTools();
				const tool = tools.find((candidate) => candidate.name === ${JSON.stringify(qualifiedName)});
				if (tool === undefined) { throw new Error('tool not registered: ' + ${JSON.stringify(qualifiedName)}); }
				return await document.modelContext.executeTool(tool, ${JSON.stringify(JSON.stringify(input))});
			})()
		`;
		const raw = await page.evaluate<string>(expression);
		const framed = JSON.parse(raw) as FramedResultOf<ResultType>;
		if (framed?.webmcpEverywhere === undefined) {
			throw new Error(`${shortName} returned an unframed result, so the untrusted content check was skipped`);
		}
		return framed.data;
	}

	/**
	 * Drives the site to another panel through its own client-side router.
	 *
	 * The test drives the site here; the read-only tools under test never move anything themselves.
	 *
	 * @param page - The page to drive.
	 * @param path - The path to route to, such as `/history`.
	 * @param settleMs - How long to wait after routing, in milliseconds.
	 * @returns Nothing.
	 */
	static async _route(page: CdpClient, path: string, settleMs = 3500): Promise<void> {
		await page.evaluate(`window.OSM.router.route(${JSON.stringify(path)})`);
		await VerifyOpenStreetMap._pause(settleMs);
	}

	/**
	 * Waits until the Query Features panel exists, whether or not its two lists have arrived.
	 *
	 * @param page - The page to watch.
	 * @returns Nothing.
	 * @throws When the panel never appears.
	 */
	static async _waitForQueryPanel(page: CdpClient): Promise<void> {
		for (let attempt = 0; attempt < 60; attempt += 1) {
			const present = await page.evaluate<boolean>(
				'document.getElementById("query-nearby") !== null',
			);
			if (present === true) {
				return;
			}
			await VerifyOpenStreetMap._pause(200);
		}
		throw new Error('the Query Features panel never appeared');
	}

	/**
	 * Waits until both Query Features lists have finished being fetched.
	 *
	 * @param page - The page to watch.
	 * @returns Nothing.
	 * @throws When the lists have not arrived within the timeout.
	 */
	static async _waitForQueryLists(page: CdpClient): Promise<void> {
		for (let attempt = 0; attempt < 60; attempt += 1) {
			const settled = await page.evaluate<boolean>(
				'(() => { const loaders = [...document.querySelectorAll("#query-nearby .loader, #query-isin .loader")]; return loaders.length === 2 && loaders.every((loader) => loader.style.display === "none"); })()',
			);
			if (settled === true) {
				return;
			}
			await VerifyOpenStreetMap._pause(500);
		}
		throw new Error('the Query Features lists never finished loading');
	}

	/**
	 * Moves the map, then leaves the event loop a turn to let the site act on it.
	 *
	 * Setting the fragment and routing in the same turn loses the move, because the router rewrites the
	 * fragment before the `hashchange` handler runs.
	 *
	 * @param page - The page to drive.
	 * @param zoom - The zoom level to move to.
	 * @param latitude - The latitude to centre on.
	 * @param longitude - The longitude to centre on.
	 * @returns Nothing.
	 */
	static async _moveMap(page: CdpClient, zoom: number, latitude: number, longitude: number): Promise<void> {
		await page.evaluate(`window.location.hash = '#map=${zoom}/${latitude}/${longitude}'`);
		await VerifyOpenStreetMap._pause(2500);
	}

	/**
	 * Reads something back out of the page itself, so that a check compares two independent readings.
	 *
	 * @param page - The page to read.
	 * @param expression - The expression to evaluate.
	 * @returns Whatever the expression produced.
	 */
	static async _readPage<ValueType = unknown>(page: CdpClient, expression: string): Promise<ValueType> {
		return await page.evaluate<ValueType>(expression);
	}

	/**
	 * Refuses to continue unless two lists hold the same names.
	 *
	 * @param actual - What was found.
	 * @param expected - What was wanted.
	 * @returns Nothing.
	 * @throws When the two differ.
	 */
	static _assertSameSet(actual: string[], expected: string[]): void {
		const sortedActual = [...actual].sort().join(', ');
		const sortedExpected = [...expected].sort().join(', ');
		if (sortedActual !== sortedExpected) {
			throw new Error(`expected ${sortedExpected} but found ${sortedActual}`);
		}
	}
}

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	Checks
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

NodeTest.describe('The OpenStreetMap adapter, on the live site', () => {
	NodeTest.before(async () => {
		const launched = await LaunchChrome.run({
			url: TARGET_URL,
		});
		const extensionId = await VerifyOpenStreetMap._extensionId(launched.port);
		await VerifyOpenStreetMap._setGrant(launched.port, extensionId, false, true);
		VerifyOpenStreetMap.context = {
			port: launched.port,
			extensionId: extensionId,
			page: await VerifyOpenStreetMap._reload(launched.port, TARGET_URL),
		};
	});

	NodeTest.after(() => {
		VerifyOpenStreetMap.context?.page.close();
		VerifyOpenStreetMap.context = null;
	});

	NodeTest.describe('on the map itself', () => {
		NodeTest.test('the six reading tools register with no opt-in', async (t) => {
			const { page } = VerifyOpenStreetMap._requireContext();
			const names = await VerifyOpenStreetMap._toolNames(page);
			const expected = [
				'get_map_view',
				'get_selected_feature',
				'list_queried_features',
				'list_recent_changesets',
				'get_changeset',
				'list_search_results',
			].map((name) => `openstreetmap_org__${name}`);
			VerifyOpenStreetMap._assertSameSet(names, expected);
			t.diagnostic(`${names.length} registered: ${names.join(', ')}`);
		});

		NodeTest.test('get_map_view reports the position the address carries', async (t) => {
			const { page } = VerifyOpenStreetMap._requireContext();
			const view = await VerifyOpenStreetMap._callTool<MapViewResult>(page, 'get_map_view');
			const fragment = await VerifyOpenStreetMap._readPage<string>(page, 'window.location.hash');
			const matched = fragment.match(/#map=([\d.]+)\/([-\d.]+)\/([-\d.]+)/);
			if (matched === null) {
				throw new Error(`the address carried no map fragment: ${fragment}`);
			}
			if (Math.abs(view.latitude - Number(matched[2])) > 0.0001) {
				throw new Error(`the tool said latitude ${view.latitude} but the address said ${matched[2]}`);
			}
			if (Math.abs(view.longitude - Number(matched[3])) > 0.0001) {
				throw new Error(`the tool said longitude ${view.longitude} but the address said ${matched[3]}`);
			}
			t.diagnostic(`centre ${view.latitude}, ${view.longitude} at zoom ${view.zoom} on path ${view.path}`);
		});

		NodeTest.test('get_map_view follows the map when it moves', async (t) => {
			const { page } = VerifyOpenStreetMap._requireContext();
			await VerifyOpenStreetMap._moveMap(page, 12, 51.5074, -0.1278);
			const view = await VerifyOpenStreetMap._callTool<MapViewResult>(page, 'get_map_view');
			if (Math.abs(view.latitude - 51.5074) > 0.01 || Math.abs(view.longitude + 0.1278) > 0.01) {
				throw new Error(`the map was moved to London but the tool said ${view.latitude}, ${view.longitude}`);
			}
			t.diagnostic(`after moving to London the tool said ${view.latitude}, ${view.longitude}, zoom ${view.zoom}`);
		});

		NodeTest.test('get_selected_feature refuses while no feature is open', async (t) => {
			const { page } = VerifyOpenStreetMap._requireContext();
			const refusal = await VerifyOpenStreetMap._callTool<RefusalResult>(page, 'get_selected_feature');
			if (refusal.refused !== true) {
				throw new Error('a feature was reported although none was open');
			}
			t.diagnostic(`refused with: ${refusal.reason}`);
		});
	});

	NodeTest.describe('with a feature open', () => {
		NodeTest.before(async () => {
			const { page } = VerifyOpenStreetMap._requireContext();
			await VerifyOpenStreetMap._route(page, `/node/${SAMPLE_NODE_ID}`);
		});

		NodeTest.test('get_selected_feature reads every tag the panel shows', async (t) => {
			const { page } = VerifyOpenStreetMap._requireContext();
			const feature = await VerifyOpenStreetMap._callTool<SelectedFeatureResult>(page, 'get_selected_feature');
			const onPage = await VerifyOpenStreetMap._readPage<number>(
				page,
				'document.querySelectorAll("#sidebar_content table.browse-tag-list tr").length',
			);
			if (feature.tagCount !== onPage) {
				throw new Error(`the tool read ${feature.tagCount} tags but the panel shows ${onPage} rows`);
			}
			if (feature.kind !== 'node' || feature.id !== SAMPLE_NODE_ID) {
				throw new Error(`the tool reported ${feature.kind} ${feature.id}`);
			}
			if (feature.tags.shop !== 'bakery') {
				throw new Error(`the shop tag read ${String(feature.tags.shop)} rather than bakery`);
			}
			t.diagnostic(`${feature.tagCount} tags on ${feature.kind} ${feature.id}, named ${String(feature.name)}`);
		});

		NodeTest.test('get_selected_feature reads the version, the mapper and the changeset', async (t) => {
			const { page } = VerifyOpenStreetMap._requireContext();
			const feature = await VerifyOpenStreetMap._callTool<SelectedFeatureResult>(page, 'get_selected_feature');
			const onPage = await VerifyOpenStreetMap._readPage<string>(
				page,
				'JSON.stringify({ user: document.querySelector("#sidebar_content a[href^=\\"/user/\\"]").textContent.trim(), changeset: document.querySelector("#sidebar_content a[href^=\\"/changeset/\\"]").textContent.trim() })',
			);
			const shown = JSON.parse(onPage) as { user: string; changeset: string };
			if (feature.lastEditedBy !== shown.user) {
				throw new Error(`the tool said ${String(feature.lastEditedBy)} but the panel says ${shown.user}`);
			}
			if (String(feature.changesetId) !== shown.changeset) {
				throw new Error(`the tool said ${String(feature.changesetId)} but the panel says ${shown.changeset}`);
			}
			if (feature.latitude === null) {
				throw new Error('a node was read without a latitude');
			}
			t.diagnostic(
				`version ${String(feature.version)} by ${shown.user} in changeset ${shown.changeset}, at ${String(feature.latitude)}`,
			);
		});
	});

	NodeTest.describe('with the Query Features panel open', () => {
		NodeTest.before(async () => {
			const { page } = VerifyOpenStreetMap._requireContext();
			await VerifyOpenStreetMap._moveMap(page, 17, 48.8584, 2.2945);
			await VerifyOpenStreetMap._route(page, '/query?lat=48.8584&lon=2.2945', 0);
			await VerifyOpenStreetMap._waitForQueryPanel(page);
		});

		NodeTest.test('an unfinished list says so rather than reporting nothing', async (t) => {
			const { page } = VerifyOpenStreetMap._requireContext();
			const found = await VerifyOpenStreetMap._callTool<QueriedFeaturesResult>(page, 'list_queried_features');
			for (const [label, list] of [
				['nearby', found.nearby],
				['enclosing', found.enclosing],
			] as Array<[string, QueriedFeatureList]>) {
				if (list.features.length === 0 && list.stillLoading === false) {
					throw new Error(`the ${label} list was reported finished and empty at the Eiffel Tower`);
				}
			}
			t.diagnostic(
				`immediately after the query: nearby ${found.nearby.total} entries ` +
					`(stillLoading ${String(found.nearby.stillLoading)}), enclosing ${found.enclosing.total} ` +
					`entries (stillLoading ${String(found.enclosing.stillLoading)})`,
			);
		});

		NodeTest.describe('once both lists have arrived', () => {
			NodeTest.before(async () => {
				const { page } = VerifyOpenStreetMap._requireContext();
				await VerifyOpenStreetMap._waitForQueryLists(page);
			});

			NodeTest.test('list_queried_features matches both lists the panel holds', async (t) => {
				const { page } = VerifyOpenStreetMap._requireContext();
				const found = await VerifyOpenStreetMap._callTool<QueriedFeaturesResult>(
					page,
					'list_queried_features',
				);
				const onPage = await VerifyOpenStreetMap._readPage<string>(
					page,
					'JSON.stringify({ nearby: document.querySelectorAll("#query-nearby li").length, enclosing: document.querySelectorAll("#query-isin li").length, nearbyLoading: document.querySelector("#query-nearby .loader").style.display !== "none", enclosingLoading: document.querySelector("#query-isin .loader").style.display !== "none" })',
				);
				const shown = JSON.parse(onPage) as {
					nearby: number;
					enclosing: number;
					nearbyLoading: boolean;
					enclosingLoading: boolean;
				};
				if (found.nearby.total !== shown.nearby || found.enclosing.total !== shown.enclosing) {
					throw new Error(
						`the tool read ${found.nearby.total} nearby and ${found.enclosing.total} enclosing, ` +
							`but the panel shows ${shown.nearby} and ${shown.enclosing}`,
					);
				}
				if (
					found.nearby.stillLoading !== shown.nearbyLoading ||
					found.enclosing.stillLoading !== shown.enclosingLoading
				) {
					throw new Error('the tool disagreed with the panel about whether a list had arrived');
				}
				if (found.enclosing.features.length === 0) {
					throw new Error('the Eiffel Tower was reported as inside nothing at all');
				}
				if (found.nearby.features.length === 0) {
					throw new Error('nothing at all was reported near the Eiffel Tower');
				}
				const named = found.enclosing.features
					.map((entry) => entry.name)
					.filter((name): name is string => name !== null);
				if (named.length === 0) {
					throw new Error('every enclosing feature came back without a name');
				}
				t.diagnostic(
					`${found.nearby.total} nearby and ${found.enclosing.total} enclosing, ` +
						`enclosed by ${named.slice(0, 4).join(', ')}`,
				);
			});
		});
	});

	NodeTest.describe('with the changeset list open', () => {
		NodeTest.before(async () => {
			const { page } = VerifyOpenStreetMap._requireContext();
			await VerifyOpenStreetMap._moveMap(page, 14, 48.8584, 2.2945);
			await VerifyOpenStreetMap._route(page, '/history');
		});

		NodeTest.test('list_recent_changesets matches the entries the panel shows', async (t) => {
			const { page } = VerifyOpenStreetMap._requireContext();
			const recent = await VerifyOpenStreetMap._callTool<RecentChangesetsResult>(page, 'list_recent_changesets');
			const onPage = await VerifyOpenStreetMap._readPage<string>(
				page,
				'JSON.stringify([...document.querySelectorAll("#sidebar_content li[data-changeset]")].map((item) => JSON.parse(item.dataset.changeset).id))',
			);
			const shown = JSON.parse(onPage) as number[];
			if (recent.total !== shown.length) {
				throw new Error(`the tool read ${recent.total} changesets but the panel shows ${shown.length}`);
			}
			const readIds = recent.changesets.map((changeset) => changeset.id);
			VerifyOpenStreetMap._assertSameSet(
				readIds.map(String),
				shown.slice(0, readIds.length).map(String),
			);
			const first = recent.changesets[0];
			if (first.author === null || first.closedAt === null) {
				throw new Error('a changeset was read without an author or without a closing time');
			}
			t.diagnostic(
				`${recent.total} changesets, newest #${first.id} by ${first.author} closed ${first.closedAt} ` +
					`(+${String(first.createdCount)} ~${String(first.modifiedCount)} -${String(first.deletedCount)})`,
			);
		});
	});

	NodeTest.describe('with a changeset open', () => {
		NodeTest.before(async () => {
			const { page } = VerifyOpenStreetMap._requireContext();
			const openable = await VerifyOpenStreetMap._readPage<number>(
				page,
				'JSON.parse(document.querySelector("#sidebar_content li[data-changeset]").dataset.changeset).id',
			);
			await VerifyOpenStreetMap._route(page, `/changeset/${openable}`);
		});

		NodeTest.test('get_changeset reads the changeset the panel is showing', async (t) => {
			const { page } = VerifyOpenStreetMap._requireContext();
			const changeset = await VerifyOpenStreetMap._callTool<ChangesetResult>(page, 'get_changeset');
			const onPage = await VerifyOpenStreetMap._readPage<string>(
				page,
				'document.querySelector("#sidebar_content h2").textContent.trim()',
			);
			if (onPage.includes(String(changeset.id)) === false) {
				throw new Error(`the tool read changeset ${changeset.id} but the panel heading says "${onPage}"`);
			}
			if (changeset.author === null) {
				throw new Error('a changeset was read without an author');
			}
			t.diagnostic(
				`changeset ${changeset.id} by ${changeset.author}, ${Object.keys(changeset.tags).length} tags, ` +
					`${changeset.objects.length} objects listed, sections: ${changeset.objectSections.join(' | ')}`,
			);
		});
	});

	NodeTest.describe('with the acting tools withheld', () => {
		NodeTest.test('the seven acting tools are withheld until the user opts in', async (t) => {
			const { page } = VerifyOpenStreetMap._requireContext();
			const names = await VerifyOpenStreetMap._toolNames(page);
			const withheld = [
				'set_map_view',
				'search_places',
				'show_feature',
				'query_features_at',
				'show_recent_changes',
				'show_changeset',
				'get_directions',
			].map((name) => `openstreetmap_org__${name}`);
			for (const name of withheld) {
				if (names.includes(name) === true) {
					throw new Error(`${name} was registered without an opt-in`);
				}
			}
			t.diagnostic(`all seven are absent: ${withheld.join(', ')}`);
		});
	});

	NodeTest.describe('with search results open', () => {
		NodeTest.before(async () => {
			const { page } = VerifyOpenStreetMap._requireContext();
			await VerifyOpenStreetMap._route(page, `/search?query=${encodeURIComponent('Eiffel Tower')}`);
		});

		NodeTest.test('list_search_results matches the results the panel shows', async (t) => {
			const { page } = VerifyOpenStreetMap._requireContext();
			const results = await VerifyOpenStreetMap._callTool<SearchResultsResult>(page, 'list_search_results');
			const onPage = await VerifyOpenStreetMap._readPage<number>(
				page,
				'document.querySelectorAll("#sidebar_content a.set_position[data-lat]").length',
			);
			if (results.total !== onPage) {
				throw new Error(`the tool read ${results.total} results but the panel shows ${onPage}`);
			}
			const first = results.results[0];
			if (first === undefined) {
				throw new Error('the search for the Eiffel Tower returned nothing');
			}
			if (Number.isFinite(first.latitude) === false || Number.isFinite(first.longitude) === false) {
				throw new Error(`the first result carried no usable coordinates: ${JSON.stringify(first)}`);
			}
			t.diagnostic(
				`${results.total} results, first is ${first.kind} ${first.id} "${first.name.slice(0, 40)}" ` +
					`at ${first.latitude}, ${first.longitude}`,
			);
		});
	});

	NodeTest.describe('with the acting tools granted', () => {
		NodeTest.before(async () => {
			const context = VerifyOpenStreetMap._requireContext();
			await VerifyOpenStreetMap._setGrant(context.port, context.extensionId, true, true);
			context.page.close();
			context.page = await VerifyOpenStreetMap._reload(context.port, TARGET_URL);
		});

		NodeTest.test('all thirteen tools register once the origin is opted in', async (t) => {
			const { page } = VerifyOpenStreetMap._requireContext();
			const names = await VerifyOpenStreetMap._toolNames(page);
			if (names.length !== 13) {
				throw new Error(`expected 13 tools but found ${names.length}: ${names.join(', ')}`);
			}
			t.diagnostic(`13 registered, including ${names.slice(0, 3).join(', ')}`);
		});

		NodeTest.test('set_map_view moves the map where it was asked', async (t) => {
			const { page } = VerifyOpenStreetMap._requireContext();
			const view = await VerifyOpenStreetMap._callTool<MapViewResult>(page, 'set_map_view', {
				latitude: 51.5074,
				longitude: -0.1278,
				zoom: 15,
			});
			const fragment = await VerifyOpenStreetMap._readPage<string>(page, 'window.location.hash');
			if (fragment.includes('51.507') === false) {
				throw new Error(`the map was asked to move to London but the address says ${fragment}`);
			}
			if (view.zoom !== 15) {
				throw new Error(`the map was asked for zoom 15 but settled at ${view.zoom}`);
			}
			t.diagnostic(`the map moved to ${view.latitude}, ${view.longitude} at zoom ${view.zoom}`);
		});

		NodeTest.test('set_map_view fits a rectangle it is given', async (t) => {
			const { page } = VerifyOpenStreetMap._requireContext();
			const boundingBox = {
				minLatitude: 48.85,
				minLongitude: 2.28,
				maxLatitude: 48.87,
				maxLongitude: 2.31,
			};
			const view = await VerifyOpenStreetMap._callTool<MapViewResult>(page, 'set_map_view', {
				boundingBox: boundingBox,
			});
			const width = await VerifyOpenStreetMap._readPage<number>(
				page,
				'document.getElementById("map").clientWidth',
			);
			const visibleLongitudeSpan = (360 * width) / (256 * Math.pow(2, view.zoom));
			const wantedSpan = boundingBox.maxLongitude - boundingBox.minLongitude;
			if (visibleLongitudeSpan < wantedSpan) {
				throw new Error(
					`zoom ${view.zoom} shows ${visibleLongitudeSpan.toFixed(4)} degrees across, ` +
						`which does not fit the ${wantedSpan} degrees asked for`,
				);
			}
			const centreLatitude = (boundingBox.minLatitude + boundingBox.maxLatitude) / 2;
			if (Math.abs(view.latitude - centreLatitude) > 0.01) {
				throw new Error(`the map centred on ${view.latitude} rather than ${centreLatitude}`);
			}
			t.diagnostic(
				`the rectangle fitted at zoom ${view.zoom}, which shows ` +
					`${visibleLongitudeSpan.toFixed(4)} degrees across a ${width} pixel map`,
			);
		});

		NodeTest.test('search_places finds a place and fills the results panel', async (t) => {
			const { page } = VerifyOpenStreetMap._requireContext();
			const results = await VerifyOpenStreetMap._callTool<SearchResultsResult>(page, 'search_places', {
				query: 'Eiffel Tower',
			});
			if (results.total === 0) {
				throw new Error('searching for the Eiffel Tower found nothing');
			}
			const onPage = await VerifyOpenStreetMap._readPage<number>(
				page,
				'document.querySelectorAll("#sidebar_content a.set_position[data-lat]").length',
			);
			if (results.total !== onPage) {
				throw new Error(`the tool returned ${results.total} results but the panel shows ${onPage}`);
			}
			t.diagnostic(`${results.total} results, first is ${results.results[0].name.slice(0, 50)}`);
		});

		NodeTest.test('search_places reports an empty answer rather than hanging on it', async (t) => {
			const { page } = VerifyOpenStreetMap._requireContext();
			const started = Date.now();
			const results = await VerifyOpenStreetMap._callTool<SearchResultsResult>(page, 'search_places', {
				query: 'qwertzuiop asdfghjkl yxcvbnm nowhere',
			});
			const elapsed = Date.now() - started;
			if (results.total !== 0) {
				throw new Error(`nonsense text somehow found ${results.total} places`);
			}
			if (elapsed > 9000) {
				throw new Error(`an empty search took ${elapsed} milliseconds, so it waited out the timeout`);
			}
			t.diagnostic(`an empty search answered in ${elapsed} milliseconds`);
		});

		NodeTest.test('show_feature opens the object and reads its tags', async (t) => {
			const { page } = VerifyOpenStreetMap._requireContext();
			const feature = await VerifyOpenStreetMap._callTool<SelectedFeatureResult>(page, 'show_feature', {
				kind: 'node',
				id: SAMPLE_NODE_ID,
			});
			const onPage = await VerifyOpenStreetMap._readPage<string>(
				page,
				'document.querySelector("#sidebar_content h2").textContent.trim()',
			);
			if (onPage.includes(String(SAMPLE_NODE_ID)) === false) {
				throw new Error(`the panel heading says "${onPage}" after opening node ${SAMPLE_NODE_ID}`);
			}
			if (feature.tags.shop !== 'bakery') {
				throw new Error(`the shop tag read ${String(feature.tags.shop)} rather than bakery`);
			}
			t.diagnostic(`opened ${feature.kind} ${feature.id} with ${feature.tagCount} tags`);
		});

		NodeTest.test('show_feature refuses an object OpenStreetMap does not have', async (t) => {
			const { page } = VerifyOpenStreetMap._requireContext();
			const refusal = await VerifyOpenStreetMap._callTool<RefusalResult>(page, 'show_feature', {
				kind: 'node',
				id: 999999999999,
			});
			if (refusal.refused !== true) {
				throw new Error('a missing node was reported as a real feature');
			}
			t.diagnostic(`refused with: ${refusal.reason}`);
		});

		NodeTest.test('query_features_at answers with both lists finished', async (t) => {
			const { page } = VerifyOpenStreetMap._requireContext();
			const found = await VerifyOpenStreetMap._callTool<QueryAtPointResultShape>(
				page,
				'query_features_at',
				{
					latitude: 48.8584,
					longitude: 2.2945,
				},
			);
			if (found.nearby.stillLoading === true || found.enclosing.stillLoading === true) {
				throw new Error('the tool returned before both lists had arrived');
			}
			if (found.enclosing.features.length === 0) {
				throw new Error('the Eiffel Tower was reported as inside nothing at all');
			}
			if (found.mapView === null) {
				throw new Error('the query reported no map view, so the nearby radius cannot be judged');
			}
			const named = found.enclosing.features
				.map((entry) => entry.name)
				.filter((name): name is string => name !== null);
			t.diagnostic(
				`${found.nearby.total} nearby and ${found.enclosing.total} enclosing at zoom ` +
					`${found.mapView.zoom}, enclosed by ${named.slice(0, 3).join(', ')}`,
			);
		});

		NodeTest.test('show_recent_changes opens the list for the area it was given', async (t) => {
			const { page } = VerifyOpenStreetMap._requireContext();
			const recent = await VerifyOpenStreetMap._callTool<RecentChangesInViewResult>(
				page,
				'show_recent_changes',
				{
					latitude: -36.8485,
					longitude: 174.7633,
					zoom: 13,
				},
			);
			if (recent.total === 0) {
				throw new Error('the changeset list came back empty for Auckland');
			}
			if (recent.mapView === null || Math.abs(recent.mapView.latitude + 36.8485) > 0.05) {
				throw new Error(`the map was asked for Auckland but reported ${JSON.stringify(recent.mapView)}`);
			}
			const onPage = await VerifyOpenStreetMap._readPage<number>(
				page,
				'document.querySelectorAll("#sidebar_content li[data-changeset]").length',
			);
			if (recent.total !== onPage) {
				throw new Error(`the tool returned ${recent.total} changesets but the panel shows ${onPage}`);
			}
			const first = recent.changesets[0];
			t.diagnostic(
				`${recent.total} changesets around Auckland, newest #${first.id} by ${String(first.author)}`,
			);
		});

		NodeTest.test('show_changeset opens a changeset from that list', async (t) => {
			const { page } = VerifyOpenStreetMap._requireContext();
			const wanted = await VerifyOpenStreetMap._readPage<number>(
				page,
				'JSON.parse(document.querySelector("#sidebar_content li[data-changeset]").dataset.changeset).id',
			);
			const changeset = await VerifyOpenStreetMap._callTool<ChangesetResult>(page, 'show_changeset', {
				id: wanted,
			});
			if (changeset.id !== wanted) {
				throw new Error(`asked for changeset ${wanted} but the tool returned ${changeset.id}`);
			}
			const onPage = await VerifyOpenStreetMap._readPage<string>(
				page,
				'document.querySelector("#sidebar_content h2").textContent.trim()',
			);
			if (onPage.includes(String(wanted)) === false) {
				throw new Error(`the panel heading says "${onPage}" after opening changeset ${wanted}`);
			}
			t.diagnostic(`opened changeset ${changeset.id} by ${String(changeset.author)}`);
		});

		NodeTest.test('get_directions works out a route', async (t) => {
			const { page } = VerifyOpenStreetMap._requireContext();
			const answer = await VerifyOpenStreetMap._callTool<RouteResultShape>(page, 'get_directions', {
				fromLatitude: 48.8584,
				fromLongitude: 2.2945,
				toLatitude: 48.8606,
				toLongitude: 2.3376,
				mode: 'car',
			});
			if (answer.route.turnCount === 0) {
				throw new Error('the route came back with no instructions');
			}
			const onPage = await VerifyOpenStreetMap._readPage<string>(
				page,
				'document.getElementById("directions_route_distance").textContent.trim()',
			);
			if (answer.route.distance !== onPage) {
				throw new Error(`the tool said ${answer.route.distance} but the panel says ${onPage}`);
			}
			VerifyOpenStreetMap.carRoute = `${answer.route.distance}|${answer.route.turnCount}`;
			t.diagnostic(
				`${answer.engine} by ${answer.mode}: ${answer.route.distance} in ${answer.route.time}, ` +
					`${answer.route.turnCount} instructions`,
			);
		});

		NodeTest.test('get_directions recomputes rather than returning the previous route', async (t) => {
			const { page } = VerifyOpenStreetMap._requireContext();
			const answer = await VerifyOpenStreetMap._callTool<RouteResultShape>(page, 'get_directions', {
				fromLatitude: 48.8584,
				fromLongitude: 2.2945,
				toLatitude: 48.8606,
				toLongitude: 2.3376,
				mode: 'foot',
			});
			const signature = `${answer.route.distance}|${answer.route.turnCount}`;
			if (signature === VerifyOpenStreetMap.carRoute) {
				throw new Error(`walking returned the same route as driving: ${signature}`);
			}
			const onPage = await VerifyOpenStreetMap._readPage<string>(
				page,
				'document.getElementById("directions_route_distance").textContent.trim()',
			);
			if (answer.route.distance !== onPage) {
				throw new Error(`the tool said ${answer.route.distance} but the panel says ${onPage}`);
			}
			t.diagnostic(
				`on foot: ${answer.route.distance} in ${answer.route.time}, ` +
					`${answer.route.turnCount} instructions, against driving ${VerifyOpenStreetMap.carRoute}`,
			);
		});
	});
});

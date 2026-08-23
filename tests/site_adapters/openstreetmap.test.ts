///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	OpenStreetMapTest — drives the OpenStreetMap adapter in a real Chrome on the real site
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

import NodeTest from 'node:test';
import { LivePageHarness } from '../live_page_harness.ts';
import type { CdpClient } from '../../tools/chrome_devtools_protocol/cdp_client.ts';
import type {
	ChangesetResult,
	MapViewResult,
	QueriedFeatureList,
	QueriedFeaturesResult,
	QueryAtPointResultShape,
	RecentChangesInViewResult,
	RecentChangesetsResult,
	RefusalResult,
	RouteResultShape,
	SearchResultsResult,
	SelectedFeatureResult,
} from './openstreetmap_result_types.ts';

const TARGET_URL = 'https://www.openstreetmap.org/#map=18/48.8584/2.2945';

/** A node with a rich tag list, verified against the live site on 2026-08-21. */
const SAMPLE_NODE_ID = 7982106824;

/**
 * The live browser every check works against, prepared once before the first of them.
 *
 * Nothing here is mocked. Chrome is launched, the extension is installed, the live site is loaded, and
 * every assertion calls a tool through `document.modelContext` and compares the answer against what
 * the page itself renders, read back with a separate expression.
 */
const harness = new LivePageHarness({
	siteSlug: 'openstreetmap_org',
	origin: 'https://www.openstreetmap.org',
	url: TARGET_URL,
	urlFragment: 'openstreetmap.org',
});

/**
 * Drives OpenStreetMap itself, for the things only this site needs.
 *
 * Everything else these checks need — the browser, the opt-in, the tool list, the tool call — is the
 * same for every site and lives in `LivePageHarness`.
 */
class OpenStreetMapTest {
	/** The distance and instruction count of the driving route, kept to compare the walking one against. */
	static carRoute = '';

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
		await LivePageHarness.pause(settleMs);
	}

	/**
	 * Moves the map, then leaves the event loop a turn to let the site act on it.
	 *
	 * Setting the fragment and routing in the same turn loses the move, because the router rewrites the
	 * fragment before the `hashchange` handler runs.
	 *
	 * @param page - The page to drive.
	 * @param zoom - The zoom to move to.
	 * @param latitude - The latitude to move to.
	 * @param longitude - The longitude to move to.
	 * @returns Nothing.
	 */
	static async _moveMap(page: CdpClient, zoom: number, latitude: number, longitude: number): Promise<void> {
		await page.evaluate(`window.location.hash = '#map=${zoom}/${latitude}/${longitude}'`);
		await LivePageHarness.pause(2500);
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
			await LivePageHarness.pause(200);
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
			await LivePageHarness.pause(500);
		}
		throw new Error('the Query Features lists never finished loading');
	}
}

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	Checks
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

NodeTest.describe('The OpenStreetMap adapter, on the live site', () => {
	NodeTest.before(async () => {
		await harness.launch();
	});

	NodeTest.after(() => {
		harness.close();
	});

	NodeTest.describe('on the map itself', () => {
		NodeTest.test('the six reading tools register with no opt-in', async (t) => {
			const { page } = harness.requireContext();
			const names = await harness.toolNames(page);
			const expected = [
				'get_map_view',
				'get_selected_feature',
				'list_queried_features',
				'list_recent_changesets',
				'get_changeset',
				'list_search_results',
			].map((name) => `openstreetmap_org__${name}`);
			LivePageHarness.assertSameSet(names, expected);
			t.diagnostic(`${names.length} registered: ${names.join(', ')}`);
		});

		NodeTest.test('get_map_view reports the position the address carries', async (t) => {
			const { page } = harness.requireContext();
			const view = await harness.callTool<MapViewResult>(page, 'get_map_view');
			const fragment = await page.evaluate<string>('window.location.hash');
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
			const { page } = harness.requireContext();
			await OpenStreetMapTest._moveMap(page, 12, 51.5074, -0.1278);
			const view = await harness.callTool<MapViewResult>(page, 'get_map_view');
			if (Math.abs(view.latitude - 51.5074) > 0.01 || Math.abs(view.longitude + 0.1278) > 0.01) {
				throw new Error(`the map was moved to London but the tool said ${view.latitude}, ${view.longitude}`);
			}
			t.diagnostic(`after moving to London the tool said ${view.latitude}, ${view.longitude}, zoom ${view.zoom}`);
		});

		NodeTest.test('get_selected_feature refuses while no feature is open', async (t) => {
			const { page } = harness.requireContext();
			const refusal = await harness.callTool<RefusalResult>(page, 'get_selected_feature');
			if (refusal.refused !== true) {
				throw new Error('a feature was reported although none was open');
			}
			t.diagnostic(`refused with: ${refusal.reason}`);
		});
	});

	NodeTest.describe('with a feature open', () => {
		NodeTest.before(async () => {
			const { page } = harness.requireContext();
			await OpenStreetMapTest._route(page, `/node/${SAMPLE_NODE_ID}`);
		});

		NodeTest.test('get_selected_feature reads every tag the panel shows', async (t) => {
			const { page } = harness.requireContext();
			const feature = await harness.callTool<SelectedFeatureResult>(page, 'get_selected_feature');
			const onPage = await page.evaluate<number>(
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
			const { page } = harness.requireContext();
			const feature = await harness.callTool<SelectedFeatureResult>(page, 'get_selected_feature');
			const onPage = await page.evaluate<string>(
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
			const { page } = harness.requireContext();
			await OpenStreetMapTest._moveMap(page, 17, 48.8584, 2.2945);
			await OpenStreetMapTest._route(page, '/query?lat=48.8584&lon=2.2945', 0);
			await OpenStreetMapTest._waitForQueryPanel(page);
		});

		NodeTest.test('an unfinished list says so rather than reporting nothing', async (t) => {
			const { page } = harness.requireContext();
			const found = await harness.callTool<QueriedFeaturesResult>(page, 'list_queried_features');
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
				const { page } = harness.requireContext();
				await OpenStreetMapTest._waitForQueryLists(page);
			});

			NodeTest.test('list_queried_features matches both lists the panel holds', async (t) => {
				const { page } = harness.requireContext();
				const found = await harness.callTool<QueriedFeaturesResult>(
					page,
					'list_queried_features',
				);
				const onPage = await page.evaluate<string>(
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
			const { page } = harness.requireContext();
			await OpenStreetMapTest._moveMap(page, 14, 48.8584, 2.2945);
			await OpenStreetMapTest._route(page, '/history');
		});

		NodeTest.test('list_recent_changesets matches the entries the panel shows', async (t) => {
			const { page } = harness.requireContext();
			const recent = await harness.callTool<RecentChangesetsResult>(page, 'list_recent_changesets');
			const onPage = await page.evaluate<string>(
				'JSON.stringify([...document.querySelectorAll("#sidebar_content li[data-changeset]")].map((item) => JSON.parse(item.dataset.changeset).id))',
			);
			const shown = JSON.parse(onPage) as number[];
			if (recent.total !== shown.length) {
				throw new Error(`the tool read ${recent.total} changesets but the panel shows ${shown.length}`);
			}
			const readIds = recent.changesets.map((changeset) => changeset.id);
			LivePageHarness.assertSameSet(
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
			const { page } = harness.requireContext();
			const openable = await page.evaluate<number>(
				'JSON.parse(document.querySelector("#sidebar_content li[data-changeset]").dataset.changeset).id',
			);
			await OpenStreetMapTest._route(page, `/changeset/${openable}`);
		});

		NodeTest.test('get_changeset reads the changeset the panel is showing', async (t) => {
			const { page } = harness.requireContext();
			const changeset = await harness.callTool<ChangesetResult>(page, 'get_changeset');
			const onPage = await page.evaluate<string>(
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
			const { page } = harness.requireContext();
			const names = await harness.toolNames(page);
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
			const { page } = harness.requireContext();
			await OpenStreetMapTest._route(page, `/search?query=${encodeURIComponent('Eiffel Tower')}`);
		});

		NodeTest.test('list_search_results matches the results the panel shows', async (t) => {
			const { page } = harness.requireContext();
			const results = await harness.callTool<SearchResultsResult>(page, 'list_search_results');
			const onPage = await page.evaluate<number>(
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
			await harness.setGrant(true, true);
			await harness.reload();
		});

		NodeTest.test('all thirteen tools register once the origin is opted in', async (t) => {
			const { page } = harness.requireContext();
			const names = await harness.toolNames(page);
			if (names.length !== 13) {
				throw new Error(`expected 13 tools but found ${names.length}: ${names.join(', ')}`);
			}
			t.diagnostic(`13 registered, including ${names.slice(0, 3).join(', ')}`);
		});

		NodeTest.test('set_map_view moves the map where it was asked', async (t) => {
			const { page } = harness.requireContext();
			const view = await harness.callTool<MapViewResult>(page, 'set_map_view', {
				latitude: 51.5074,
				longitude: -0.1278,
				zoom: 15,
			});
			const fragment = await page.evaluate<string>('window.location.hash');
			if (fragment.includes('51.507') === false) {
				throw new Error(`the map was asked to move to London but the address says ${fragment}`);
			}
			if (view.zoom !== 15) {
				throw new Error(`the map was asked for zoom 15 but settled at ${view.zoom}`);
			}
			t.diagnostic(`the map moved to ${view.latitude}, ${view.longitude} at zoom ${view.zoom}`);
		});

		NodeTest.test('set_map_view fits a rectangle it is given', async (t) => {
			const { page } = harness.requireContext();
			const boundingBox = {
				minLatitude: 48.85,
				minLongitude: 2.28,
				maxLatitude: 48.87,
				maxLongitude: 2.31,
			};
			const view = await harness.callTool<MapViewResult>(page, 'set_map_view', {
				boundingBox: boundingBox,
			});
			const width = await page.evaluate<number>(
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
			const { page } = harness.requireContext();
			const results = await harness.callTool<SearchResultsResult>(page, 'search_places', {
				query: 'Eiffel Tower',
			});
			if (results.total === 0) {
				throw new Error('searching for the Eiffel Tower found nothing');
			}
			const onPage = await page.evaluate<number>(
				'document.querySelectorAll("#sidebar_content a.set_position[data-lat]").length',
			);
			if (results.total !== onPage) {
				throw new Error(`the tool returned ${results.total} results but the panel shows ${onPage}`);
			}
			t.diagnostic(`${results.total} results, first is ${results.results[0].name.slice(0, 50)}`);
		});

		NodeTest.test('search_places reports an empty answer rather than hanging on it', async (t) => {
			const { page } = harness.requireContext();
			const started = Date.now();
			const results = await harness.callTool<SearchResultsResult>(page, 'search_places', {
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
			const { page } = harness.requireContext();
			const feature = await harness.callTool<SelectedFeatureResult>(page, 'show_feature', {
				kind: 'node',
				id: SAMPLE_NODE_ID,
			});
			const onPage = await page.evaluate<string>(
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
			const { page } = harness.requireContext();
			const refusal = await harness.callTool<RefusalResult>(page, 'show_feature', {
				kind: 'node',
				id: 999999999999,
			});
			if (refusal.refused !== true) {
				throw new Error('a missing node was reported as a real feature');
			}
			t.diagnostic(`refused with: ${refusal.reason}`);
		});

		NodeTest.test('query_features_at answers with both lists finished', async (t) => {
			const { page } = harness.requireContext();
			const found = await harness.callTool<QueryAtPointResultShape>(
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
			const { page } = harness.requireContext();
			const recent = await harness.callTool<RecentChangesInViewResult>(
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
			const onPage = await page.evaluate<number>(
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
			const { page } = harness.requireContext();
			const wanted = await page.evaluate<number>(
				'JSON.parse(document.querySelector("#sidebar_content li[data-changeset]").dataset.changeset).id',
			);
			const changeset = await harness.callTool<ChangesetResult>(page, 'show_changeset', {
				id: wanted,
			});
			if (changeset.id !== wanted) {
				throw new Error(`asked for changeset ${wanted} but the tool returned ${changeset.id}`);
			}
			const onPage = await page.evaluate<string>(
				'document.querySelector("#sidebar_content h2").textContent.trim()',
			);
			if (onPage.includes(String(wanted)) === false) {
				throw new Error(`the panel heading says "${onPage}" after opening changeset ${wanted}`);
			}
			t.diagnostic(`opened changeset ${changeset.id} by ${String(changeset.author)}`);
		});

		NodeTest.test('get_directions works out a route', async (t) => {
			const { page } = harness.requireContext();
			const answer = await harness.callTool<RouteResultShape>(page, 'get_directions', {
				fromLatitude: 48.8584,
				fromLongitude: 2.2945,
				toLatitude: 48.8606,
				toLongitude: 2.3376,
				mode: 'car',
			});
			if (answer.route.turnCount === 0) {
				throw new Error('the route came back with no instructions');
			}
			const onPage = await page.evaluate<string>(
				'document.getElementById("directions_route_distance").textContent.trim()',
			);
			if (answer.route.distance !== onPage) {
				throw new Error(`the tool said ${answer.route.distance} but the panel says ${onPage}`);
			}
			OpenStreetMapTest.carRoute = `${answer.route.distance}|${answer.route.turnCount}`;
			t.diagnostic(
				`${answer.engine} by ${answer.mode}: ${answer.route.distance} in ${answer.route.time}, ` +
					`${answer.route.turnCount} instructions`,
			);
		});

		NodeTest.test('get_directions recomputes rather than returning the previous route', async (t) => {
			const { page } = harness.requireContext();
			const answer = await harness.callTool<RouteResultShape>(page, 'get_directions', {
				fromLatitude: 48.8584,
				fromLongitude: 2.2945,
				toLatitude: 48.8606,
				toLongitude: 2.3376,
				mode: 'foot',
			});
			const signature = `${answer.route.distance}|${answer.route.turnCount}`;
			if (signature === OpenStreetMapTest.carRoute) {
				throw new Error(`walking returned the same route as driving: ${signature}`);
			}
			const onPage = await page.evaluate<string>(
				'document.getElementById("directions_route_distance").textContent.trim()',
			);
			if (answer.route.distance !== onPage) {
				throw new Error(`the tool said ${answer.route.distance} but the panel says ${onPage}`);
			}
			t.diagnostic(
				`on foot: ${answer.route.distance} in ${answer.route.time}, ` +
					`${answer.route.turnCount} instructions, against driving ${OpenStreetMapTest.carRoute}`,
			);
		});
	});
});

import { PageWaiting } from '@webmcp_everywhere/adapter_toolkit';
import type {
	BoundingBox,
	ChangesetDetail,
	ChangesetObject,
	ChangesetSummary,
	FeatureKind,
	FeatureList,
	FeatureListEntry,
	FeaturesAtPoint,
	MapView,
	OpenStreetMapHash,
	RecentChangesets,
	RouteSummary,
	RouteTurn,
	SearchResult,
	SearchResults,
	SelectedFeature,
	ToolRefusal,
} from './openstreetmap_types.js';

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	OpenStreetMapPage — reads and drives https://www.openstreetmap.org/
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

declare global {
	/** The site's own control surface, published before it draws the map. */
	// eslint-disable-next-line no-var
	var OSM:
		| {
				/** Takes a `#map=` fragment apart into a centre and a zoom. */
				parseHash: (hash: string) => OpenStreetMapHash;
				/** The site's own client-side router, which swaps the panel without reloading the document. */
				router: { route: (path: string) => void };
		  }
		| undefined;
}

/**
 * Reads the OpenStreetMap panels and drives the site's own client-side router.
 *
 * The site keeps the map position in the address fragment and keeps it up to date on every pan, so
 * the fragment is the state to read; no Leaflet map instance is reachable from the page's global
 * scope. Every selector and every settle signal below was checked against the live site on
 * 2026-08-21. The tool surface built on top of this lives in `openstreetmap_adapter.ts`.
 */
export class OpenStreetMapPage {
	/** How many entries any one list returns, so that one crowded panel cannot flood an agent. */
	static readonly MAX_LIST_ENTRIES = 50;

	/** How long to wait for a panel to finish being filled, in milliseconds. */
	static readonly SETTLE_TIMEOUT = 10000;

	/** How long to wait for a routing engine to answer, in milliseconds. */
	static readonly ROUTE_TIMEOUT = 25000;

	/** How long to wait for the changeset list to refetch after the map has moved, in milliseconds. */
	static readonly REFRESH_TIMEOUT = 6000;

	/** How long to wait between two checks while waiting for the page to settle, in milliseconds. */
	static readonly POLL_INTERVAL = 100;

	/** How long to wait between two readings of the directions panel, in milliseconds. */
	static readonly ROUTE_POLL_INTERVAL = 400;

	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////
	//	Helpers
	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////

	/**
	 * Reads the page's own address without naming `location`.
	 *
	 * `PermissionAudit` reads a handler's source and cannot tell reading `location` apart from
	 * assigning to it, so a read-only handler that names it is rejected.
	 *
	 * @returns The address the page is at.
	 */
	static _currentUrl(): string {
		return document.URL;
	}

	/**
	 * Finds the panel beside the map, which is where every result the site renders ends up.
	 *
	 * @returns The panel element, or `null` when the page has not drawn one.
	 */
	static _sidebar(): Element | null {
		return document.querySelector('#sidebar_content');
	}

	/**
	 * Builds a refusal.
	 *
	 * @param reason - What went wrong, in one sentence.
	 * @param remedy - What has to happen before the request can be answered.
	 * @returns The refusal to return from a tool.
	 */
	static _refuse(reason: string, remedy: string): ToolRefusal {
		return {
			refused: true,
			reason: reason,
			remedy: remedy,
		};
	}

	/**
	 * Reads where the map is centred, from the address fragment the site maintains.
	 *
	 * @returns The map view, or `null` when the address carries no map fragment yet.
	 */
	static _readMapView(): MapView | null {
		const address = new URL(OpenStreetMapPage._currentUrl());
		const parsed = globalThis.OSM?.parseHash(address.hash) ?? {};
		if (parsed.lat === undefined || parsed.lon === undefined || parsed.zoom === undefined) {
			return null;
		}
		return {
			latitude: parsed.lat,
			longitude: parsed.lon,
			zoom: parsed.zoom,
			layerCode: parsed.layers ?? null,
			path: address.pathname,
		};
	}

	/**
	 * Reads which object the address names, when it names one.
	 *
	 * @param address - The address to read.
	 * @returns The kind and the identifier, or `null` when the address is not a feature page.
	 */
	static _readIdentity(address: string): { kind: FeatureKind; id: number } | null {
		const matched = new URL(address).pathname.match(/^\/(node|way|relation)\/(\d+)/);
		if (matched === null) {
			return null;
		}
		return {
			kind: matched[1] as FeatureKind,
			id: Number(matched[2]),
		};
	}

	/**
	 * Reads a tag table, which the site renders the same way for a feature and for a changeset.
	 *
	 * @param root - The element holding the table.
	 * @returns Every tag key and its value.
	 */
	static _readTags(root: Element): Record<string, string> {
		const tags: Record<string, string> = {};
		for (const row of root.querySelectorAll('table.browse-tag-list tr')) {
			const key = row.querySelector('th');
			const cell = row.querySelector('td');
			if (key === null || cell === null) {
				continue;
			}
			tags[key.textContent?.trim() ?? ''] = cell.textContent?.trim() ?? '';
		}
		return tags;
	}

	/**
	 * Reads everything the feature panel says about the object it is showing.
	 *
	 * The version link is what proves the panel is showing a real object: the site answers a missing
	 * identifier with a `Not Found` panel that still sits at the object's own address, and an object
	 * carrying no tags at all is ordinary.
	 *
	 * @returns The feature, or `null` when the panel is not showing one.
	 */
	static _readSelectedFeature(): SelectedFeature | null {
		const identity = OpenStreetMapPage._readIdentity(OpenStreetMapPage._currentUrl());
		const sidebar = OpenStreetMapPage._sidebar();
		if (identity === null || sidebar === null) {
			return null;
		}
		const versionLink = sidebar.querySelector('a[href*="/history/"]');
		if (versionLink === null) {
			return null;
		}
		const tags = OpenStreetMapPage._readTags(sidebar);
		const editedAt = sidebar.querySelector('time[datetime]');
		const editor = sidebar.querySelector('a[href^="/user/"]');
		const changeset = sidebar.querySelector('a[href^="/changeset/"]');
		const latitude = sidebar.querySelector('.latitude');
		const longitude = sidebar.querySelector('.longitude');
		const parts = sidebar.querySelector('details summary');
		const comment = sidebar.querySelector('h4 + .fs-6 p');
		return {
			kind: identity.kind,
			id: identity.id,
			name: tags.name ?? null,
			tags: tags,
			tagCount: Object.keys(tags).length,
			version: OpenStreetMapPage._numberOf(versionLink),
			lastEditedAt: editedAt === null ? null : editedAt.getAttribute('datetime'),
			lastEditedBy: OpenStreetMapPage._textOf(editor),
			changesetId: OpenStreetMapPage._numberOf(changeset),
			changesetComment: OpenStreetMapPage._textOf(comment),
			latitude: OpenStreetMapPage._numberOf(latitude),
			longitude: OpenStreetMapPage._numberOf(longitude),
			partsSummary: OpenStreetMapPage._textOf(parts),
		};
	}

	/**
	 * Reads one of the two lists the Query Features panel renders.
	 *
	 * @param containerId - `query-nearby` for the nearby list, `query-isin` for the enclosing list.
	 * @returns The entries, and how many the panel holds in total.
	 */
	static _readQueryList(containerId: string): FeatureList {
		const container = document.getElementById(containerId);
		if (container === null) {
			return {
				features: [],
				total: 0,
				stillLoading: false,
			};
		}
		const items = [...container.querySelectorAll('li')];
		const entries: FeatureListEntry[] = [];
		for (const item of items.slice(0, OpenStreetMapPage.MAX_LIST_ENTRIES)) {
			const link = item.querySelector('a[href]');
			const identity = OpenStreetMapPage._identityFromHref(link);
			if (identity === null) {
				continue;
			}
			const label = OpenStreetMapPage._textOf(link) ?? '';
			const category = (item.textContent ?? '').replace(label, '').trim();
			entries.push({
				kind: identity.kind,
				id: identity.id,
				name: label.startsWith('#') === true ? null : label,
				category: category.length === 0 ? null : category,
			});
		}
		return {
			features: entries,
			total: items.length,
			stillLoading: OpenStreetMapPage._isLoading(container),
		};
	}

	/**
	 * Tells whether one of the Query Features lists is still being fetched.
	 *
	 * The site hides the spinner with an inline `display: none` when the answer arrives, and uses no
	 * `hidden` attribute. A list read before that has no entries yet, which must never be reported as
	 * an empty answer.
	 *
	 * @param container - The list's container element.
	 * @returns `true` while the answer has not arrived.
	 */
	static _isLoading(container: Element): boolean {
		const loader = container.querySelector('.loader');
		if (loader === null) {
			return false;
		}
		return (loader as HTMLElement).style.display !== 'none';
	}

	/**
	 * Reads both lists of the Query Features panel.
	 *
	 * @returns What the panel found around the point, or `null` when the panel is not open.
	 */
	static _readFeaturesAtPoint(): FeaturesAtPoint | null {
		if (document.getElementById('query-nearby') === null) {
			return null;
		}
		return {
			nearby: OpenStreetMapPage._readQueryList('query-nearby'),
			enclosing: OpenStreetMapPage._readQueryList('query-isin'),
		};
	}

	/**
	 * Reads the changeset list that is open beside the map.
	 *
	 * @returns The changesets, or `null` when no changeset list is open.
	 */
	static _readRecentChangesets(): RecentChangesets | null {
		const sidebar = OpenStreetMapPage._sidebar();
		if (sidebar === null) {
			return null;
		}
		const items = [...sidebar.querySelectorAll('li[data-changeset]')];
		if (items.length === 0) {
			return null;
		}
		const changesets: ChangesetSummary[] = [];
		for (const item of items.slice(0, OpenStreetMapPage.MAX_LIST_ENTRIES)) {
			const counts = [...item.querySelectorAll('.changeset_line span.rounded > span')].map((count) => {
				return Number(count.textContent?.trim());
			});
			changesets.push({
				id: OpenStreetMapPage._changesetMeta(item).id,
				comment: OpenStreetMapPage._textOf(item.querySelector('a.changeset_id bdi')),
				author: OpenStreetMapPage._textOf(item.querySelector('a[href^="/user/"]')),
				closedAt: item.querySelector('time[datetime]')?.getAttribute('datetime') ?? null,
				createdCount: counts[0] ?? null,
				modifiedCount: counts[1] ?? null,
				deletedCount: counts[2] ?? null,
				boundingBox: OpenStreetMapPage._changesetMeta(item).boundingBox,
			});
		}
		return {
			changesets: changesets,
			total: items.length,
			returned: changesets.length,
		};
	}

	/**
	 * Reads the identifier and the rectangle the site attaches to one changeset list entry.
	 *
	 * @param item - The list entry.
	 * @returns The identifier, and the rectangle when the entry carries one.
	 */
	static _changesetMeta(item: Element): { id: number; boundingBox: BoundingBox | null } {
		const raw = item.getAttribute('data-changeset');
		if (raw === null) {
			return {
				id: 0,
				boundingBox: null,
			};
		}
		const parsed = JSON.parse(raw) as {
			id: number;
			bbox?: { minlon: number; minlat: number; maxlon: number; maxlat: number };
		};
		if (parsed.bbox === undefined) {
			return {
				id: parsed.id,
				boundingBox: null,
			};
		}
		return {
			id: parsed.id,
			boundingBox: {
				minLatitude: parsed.bbox.minlat,
				minLongitude: parsed.bbox.minlon,
				maxLatitude: parsed.bbox.maxlat,
				maxLongitude: parsed.bbox.maxlon,
			},
		};
	}

	/**
	 * Reads everything the changeset panel says about the changeset it is showing.
	 *
	 * The timestamp is what proves the panel is showing a real changeset: the site answers a missing
	 * identifier with a `Not Found` panel that still sits at the changeset's own address.
	 *
	 * @returns The changeset, or `null` when the panel is not showing one.
	 */
	static _readChangeset(): ChangesetDetail | null {
		const matched = new URL(OpenStreetMapPage._currentUrl()).pathname.match(/^\/changeset\/(\d+)/);
		const sidebar = OpenStreetMapPage._sidebar();
		if (matched === null || sidebar === null) {
			return null;
		}
		if (sidebar.querySelector('time[datetime]') === null) {
			return null;
		}
		const objects: ChangesetObject[] = [];
		const links = [...sidebar.querySelectorAll('ul.browse-element-list li')];
		for (const item of links.slice(0, OpenStreetMapPage.MAX_LIST_ENTRIES)) {
			const identity = OpenStreetMapPage._identityFromHref(item.querySelector('a[href]'));
			if (identity === null) {
				continue;
			}
			objects.push({
				kind: identity.kind,
				id: identity.id,
				label: (item.textContent ?? '').replace(/\s+/g, ' ').trim(),
			});
		}
		const sections = [...sidebar.querySelectorAll('h4')]
			.map((heading) => {
				return (heading.textContent ?? '').replace(/\s+/g, ' ').trim();
			})
			.filter((heading) => {
				return /^(Nodes|Ways|Relations)\b/.test(heading) === true;
			});
		return {
			id: Number(matched[1]),
			comment: OpenStreetMapPage._textOf(sidebar.querySelector('h2 ~ div p, .fs-6 p')),
			author: OpenStreetMapPage._textOf(sidebar.querySelector('a[href^="/user/"]')),
			closedAt: sidebar.querySelector('time[datetime]')?.getAttribute('datetime') ?? null,
			tags: OpenStreetMapPage._readTags(sidebar),
			objects: objects,
			objectSections: sections,
		};
	}

	/**
	 * Reads the search results that are open beside the map.
	 *
	 * @returns The results, or `null` when no search results are open.
	 */
	static _readSearchResults(): SearchResults | null {
		const sidebar = OpenStreetMapPage._sidebar();
		if (sidebar === null) {
			return null;
		}
		const anchors = [...sidebar.querySelectorAll('a.set_position[data-lat]')];
		if (anchors.length === 0) {
			return null;
		}
		const results: SearchResult[] = [];
		for (const anchor of anchors.slice(0, OpenStreetMapPage.MAX_LIST_ENTRIES)) {
			const identity = OpenStreetMapPage._identityFromHref(anchor);
			if (identity === null) {
				continue;
			}
			const data = (anchor as HTMLElement).dataset;
			results.push({
				kind: identity.kind,
				id: identity.id,
				name: data.name ?? '',
				category: data.prefix ?? null,
				latitude: Number(data.lat),
				longitude: Number(data.lon),
				boundingBox: {
					minLatitude: Number(data.minLat),
					minLongitude: Number(data.minLon),
					maxLatitude: Number(data.maxLat),
					maxLongitude: Number(data.maxLon),
				},
			});
		}
		return {
			results: results,
			total: anchors.length,
			returned: results.length,
		};
	}

	/**
	 * Reads which object a link points at.
	 *
	 * @param link - The link to read, which may be missing.
	 * @returns The kind and the identifier, or `null` when the link points somewhere else.
	 */
	static _identityFromHref(link: Element | null): { kind: FeatureKind; id: number } | null {
		if (link === null) {
			return null;
		}
		const href = link.getAttribute('href');
		if (href === null) {
			return null;
		}
		const matched = href.match(/^\/(node|way|relation)\/(\d+)/);
		if (matched === null) {
			return null;
		}
		return {
			kind: matched[1] as FeatureKind,
			id: Number(matched[2]),
		};
	}

	/**
	 * Reads an element's text, collapsing the whitespace the site's markup carries.
	 *
	 * @param element - The element to read, which may be missing.
	 * @returns The text, or `null` when the element is missing or empty.
	 */
	static _textOf(element: Element | null): string | null {
		if (element === null) {
			return null;
		}
		const text = (element.textContent ?? '').replace(/\s+/g, ' ').trim();
		return text.length === 0 ? null : text;
	}

	/**
	 * Reads an element's text as a number.
	 *
	 * @param element - The element to read, which may be missing.
	 * @returns The number, or `null` when the element is missing or does not hold one.
	 */
	static _numberOf(element: Element | null): number | null {
		const text = OpenStreetMapPage._textOf(element);
		if (text === null) {
			return null;
		}
		const parsed = Number(text);
		return Number.isFinite(parsed) === true ? parsed : null;
	}

	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////
	//	Driving The Page
	///////////////////////////////////////////////////////////////////////////////
	///////////////////////////////////////////////////////////////////////////////

	/**
	 * Waits until a test passes, or until the time runs out.
	 *
	 * The loop is `PageWaiting.waitUntil`. What this adds is how often it is worth looking at this
	 * site, which every caller here would otherwise have to repeat.
	 *
	 * @param test - The condition to wait for.
	 * @param timeoutMs - How long to keep trying, in milliseconds.
	 * @returns `true` when the test passed, `false` when the time ran out.
	 */
	static async _waitUntil(test: () => boolean, timeoutMs: number): Promise<boolean> {
		return await PageWaiting.waitUntil(test, timeoutMs, OpenStreetMapPage.POLL_INTERVAL);
	}

	/**
	 * Moves the site to another panel through its own client-side router.
	 *
	 * A real navigation would tear down the script context and the pending tool call would die with
	 * it, so the site's own router is the only way to change panel from inside a tool.
	 *
	 * @param path - The path to route to, such as `/history`.
	 * @returns Nothing.
	 */
	static _route(path: string): void {
		globalThis.OSM?.router.route(path);
	}

	/**
	 * Moves the map by writing the address fragment the site listens to.
	 *
	 * Never call this and `_route` in the same turn of the event loop: the router rewrites the
	 * fragment before the `hashchange` handler runs, and the move is lost.
	 *
	 * @param zoom - The zoom level to move to.
	 * @param latitude - The latitude to centre on.
	 * @param longitude - The longitude to centre on.
	 * @returns Nothing.
	 */
	static _setFragment(zoom: number, latitude: number, longitude: number): void {
		window.location.hash = `#map=${zoom}/${latitude}/${longitude}`;
	}

	/**
	 * Reads the address the panel beside the map was last filled from.
	 *
	 * @returns The address, or `null` when the panel has not been filled.
	 */
	static _frameUrl(): URL | null {
		const frame = document.querySelector('#sidebar_content_frame');
		if (frame === null) {
			return null;
		}
		const source = frame.getAttribute('src');
		if (source === null) {
			return null;
		}
		return new URL(source, OpenStreetMapPage._currentUrl());
	}

	/**
	 * Tells whether the panel beside the map has finished being filled.
	 *
	 * @returns `true` once the panel is complete and no longer being fetched.
	 */
	static _frameSettled(): boolean {
		const frame = document.querySelector('#sidebar_content_frame');
		if (frame === null) {
			return false;
		}
		return frame.hasAttribute('complete') === true && frame.hasAttribute('busy') === false;
	}

	/**
	 * Tells whether the panel beside the map has settled on one particular path.
	 *
	 * @param path - The path the panel should be showing, such as `/node/7982106824`.
	 * @returns `true` once the panel is complete and showing that path.
	 */
	static _frameSettledOn(path: string): boolean {
		if (OpenStreetMapPage._frameSettled() === false) {
			return false;
		}
		return OpenStreetMapPage._frameUrl()?.pathname === path;
	}

	/**
	 * Describes what the panel beside the map is holding, closely enough to tell one panel from another.
	 *
	 * The frame attributes alone are not enough to know a panel has been replaced: the site writes the
	 * new address into the frame's `src` a moment before it marks the frame busy, so a check that asks
	 * only whether the frame is complete and pointing at the wanted address can pass while the previous
	 * panel is still on screen. Waiting for this description to change closes that gap.
	 *
	 * @returns A description that changes whenever the panel's content changes.
	 */
	static _sidebarSignature(): string {
		const sidebar = OpenStreetMapPage._sidebar();
		if (sidebar === null) {
			return '';
		}
		const address = OpenStreetMapPage._frameUrl();
		const text = sidebar.textContent ?? '';
		return `${address === null ? '' : address.href}|${sidebar.childElementCount}|${text.length}`;
	}

	/**
	 * Waits for the panel beside the map to be replaced by the one at a given path.
	 *
	 * @param path - The path the panel should end up showing.
	 * @param before - What `_sidebarSignature` said before the panel was asked to change.
	 * @returns `true` when the new panel arrived, `false` when the time ran out.
	 */
	static async _waitForPanel(path: string, before: string): Promise<boolean> {
		return await OpenStreetMapPage._waitUntil(() => {
			if (OpenStreetMapPage._frameSettledOn(path) === false) {
				return false;
			}
			return OpenStreetMapPage._sidebarSignature() !== before;
		}, OpenStreetMapPage.SETTLE_TIMEOUT);
	}

	/**
	 * Tells whether the search panel has finished fetching its results.
	 *
	 * The search panel arrives in two parts: the sidebar frame completes with an empty results box
	 * carrying a `data-href`, and the places themselves are fetched into that box a second or two
	 * later. A tool that stops at the frame reads an empty box and reports that nothing was found.
	 *
	 * @returns `true` once the results box holds a list, or once it has stopped waiting for one.
	 */
	static _searchResultsSettled(): boolean {
		const entry = document.querySelector('#sidebar_content .search_results_entry');
		if (entry === null) {
			return false;
		}
		if (entry.querySelector('ul.results-list') !== null) {
			return true;
		}
		return entry.querySelector('.loader:not([hidden])') === null;
	}

	/**
	 * Reads the route the directions panel is showing.
	 *
	 * @returns The route, or `null` when the panel holds no finished route.
	 */
	static _readRoute(): RouteSummary | null {
		const distance = OpenStreetMapPage._textOf(document.getElementById('directions_route_distance'));
		const sidebar = OpenStreetMapPage._sidebar();
		if (distance === null || sidebar === null) {
			return null;
		}
		const rows = [...sidebar.querySelectorAll('tr.turn')];
		if (rows.length === 0) {
			return null;
		}
		const turns: RouteTurn[] = [];
		for (const [index, row] of rows.slice(0, OpenStreetMapPage.MAX_LIST_ENTRIES).entries()) {
			turns.push({
				step: index + 1,
				instruction: OpenStreetMapPage._textOf(row.querySelector('td.text-break')) ?? '',
				distance: OpenStreetMapPage._textOf(row.querySelector('td.distance')) ?? '',
			});
		}
		return {
			distance: distance,
			time: OpenStreetMapPage._textOf(document.getElementById('directions_route_time')) ?? '',
			ascend: OpenStreetMapPage._textOf(document.getElementById('directions_route_ascend')),
			descend: OpenStreetMapPage._textOf(document.getElementById('directions_route_descend')),
			turnCount: rows.length,
			turns: turns,
		};
	}

	/**
	 * Names every changeset the panel is listing, so that a refetch can be told from a stale list.
	 *
	 * @returns The identifiers, in the order the panel holds them.
	 */
	static _changesetIds(): string {
		const sidebar = OpenStreetMapPage._sidebar();
		if (sidebar === null) {
			return '';
		}
		return [...sidebar.querySelectorAll('li[data-changeset]')]
			.map((item) => {
				return item.id;
			})
			.join(',');
	}

	/**
	 * Works out the closest zoom level that still fits a rectangle inside the map.
	 *
	 * This is the standard Web Mercator arithmetic: the world is 256 pixels wide at zoom 0 and twice
	 * as wide at each level after that.
	 *
	 * @param boundingBox - The rectangle to fit.
	 * @returns A zoom level between 0 and 19.
	 */
	static _zoomForBoundingBox(boundingBox: BoundingBox): number {
		const container = document.getElementById('map');
		const width = container === null ? 1024 : container.clientWidth;
		const height = container === null ? 768 : container.clientHeight;
		const longitudeSpan = Math.abs(boundingBox.maxLongitude - boundingBox.minLongitude) / 360;
		const latitudeSpan = Math.abs(
			OpenStreetMapPage._mercatorY(boundingBox.maxLatitude) -
				OpenStreetMapPage._mercatorY(boundingBox.minLatitude),
		);
		const candidates: number[] = [];
		if (longitudeSpan > 0) {
			candidates.push(Math.log2(width / (256 * longitudeSpan)));
		}
		if (latitudeSpan > 0) {
			candidates.push(Math.log2(height / (256 * latitudeSpan)));
		}
		if (candidates.length === 0) {
			return 19;
		}
		return Math.max(0, Math.min(19, Math.floor(Math.min(...candidates))));
	}

	/**
	 * Places one latitude on the Web Mercator projection, as a fraction of the whole world.
	 *
	 * @param latitude - The latitude to place.
	 * @returns Its position from 0 at the top of the world to 1 at the bottom.
	 */
	static _mercatorY(latitude: number): number {
		const clamped = Math.max(-85.05112878, Math.min(85.05112878, latitude));
		const radians = (clamped * Math.PI) / 180;
		return (1 - Math.log(Math.tan(radians) + 1 / Math.cos(radians)) / Math.PI) / 2;
	}

	/**
	 * Reads one query parameter out of the page's own address.
	 *
	 * @param name - The parameter to read, such as `route`.
	 * @returns Its value, or `null` when the address does not carry it.
	 */
	static _addressParameter(name: string): string | null {
		return new URL(OpenStreetMapPage._currentUrl()).searchParams.get(name);
	}

	/**
	 * Waits until the directions panel has stopped changing, then reads the route.
	 *
	 * The directions panel is filled by the site's own module rather than by the sidebar frame, and its
	 * address carries no trace of which route is drawn, so there is nothing to compare an answer
	 * against. Waiting for two identical readings in a row is what tells a finished route apart from
	 * the previous one still on screen.
	 *
	 * @param timeoutMs - How long to keep trying, in milliseconds.
	 * @returns The route, or `null` when none ever appeared.
	 */
	static async _waitForStableRoute(timeoutMs: number): Promise<RouteSummary | null> {
		const deadline = Date.now() + timeoutMs;
		let previousSignature: string | null = null;
		while (Date.now() < deadline) {
			const route = OpenStreetMapPage._readRoute();
			const signature = route === null ? null : `${route.distance}|${route.turnCount}`;
			if (route !== null && signature === previousSignature) {
				return route;
			}
			previousSignature = signature;
			await PageWaiting.pause(OpenStreetMapPage.ROUTE_POLL_INTERVAL);
		}
		return OpenStreetMapPage._readRoute();
	}
}

/** A tool that takes no input at all. */

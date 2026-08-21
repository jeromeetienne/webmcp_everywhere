import type { Adapter } from '../../adapter_format/adapter_types.js';
import type { BoundingBox, FeatureKind } from './openstreetmap_page.js';
import { OpenStreetMapPage } from './openstreetmap_page.js';

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	openStreetMapAdapter — the WebMCP tool surface for https://www.openstreetmap.org/
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/** A tool that takes no input at all. */
const NO_INPUT = {
	type: 'object',
	properties: {},
	additionalProperties: false,
};

/** The three kinds of object an agent may ask to open. */
const FEATURE_KINDS: FeatureKind[] = ['node', 'way', 'relation'];

/** The ways of travelling the site offers. */
const TRAVEL_MODES = ['car', 'bicycle', 'foot'];

/** The routing providers the site has wired up, as its own engine chooser names them. */
const ROUTING_ENGINES = ['fossgis_osrm', 'graphhopper', 'fossgis_valhalla'];

/** The zoom to move to when the caller names a place but no zoom. */
const DEFAULT_ZOOM = 17;

/** The zoom to move to when the caller asks for the changes in an area but names no zoom. */
const DEFAULT_HISTORY_ZOOM = 14;

/**
 * Reads one number out of a tool's input.
 *
 * @param input - The tool's input object.
 * @param name - The field to read.
 * @returns The number, or `null` when the field is missing or is not a number.
 */
const numberField = (input: Record<string, unknown>, name: string): number | null => {
	const value = input[name];
	if (typeof value !== 'number' || Number.isFinite(value) === false) {
		return null;
	}
	return value;
};

/**
 * Reads one string out of a tool's input.
 *
 * @param input - The tool's input object.
 * @param name - The field to read.
 * @returns The trimmed string, or `null` when the field is missing or is empty.
 */
const stringField = (input: Record<string, unknown>, name: string): string | null => {
	const value = input[name];
	if (typeof value !== 'string' || value.trim().length === 0) {
		return null;
	}
	return value.trim();
};

/**
 * Reads a rectangle out of a tool's input.
 *
 * @param input - The tool's input object.
 * @returns The rectangle, or `null` when the input carries no complete one.
 */
const boundingBoxField = (input: Record<string, unknown>): BoundingBox | null => {
	const raw = input.boundingBox;
	if (raw === null || typeof raw !== 'object') {
		return null;
	}
	const box = raw as Record<string, unknown>;
	const edges = ['minLatitude', 'minLongitude', 'maxLatitude', 'maxLongitude'];
	for (const edge of edges) {
		if (typeof box[edge] !== 'number') {
			return null;
		}
	}
	return {
		minLatitude: box.minLatitude as number,
		minLongitude: box.minLongitude as number,
		maxLatitude: box.maxLatitude as number,
		maxLongitude: box.maxLongitude as number,
	};
};

/** The schema fragment describing a rectangle of the world. */
const BOUNDING_BOX_SCHEMA = {
	type: 'object',
	description: 'A rectangle to fit inside the map, such as the one a changeset reports.',
	properties: {
		minLatitude: {
			type: 'number',
			description: 'The southern edge.',
		},
		minLongitude: {
			type: 'number',
			description: 'The western edge.',
		},
		maxLatitude: {
			type: 'number',
			description: 'The northern edge.',
		},
		maxLongitude: {
			type: 'number',
			description: 'The eastern edge.',
		},
	},
	required: ['minLatitude', 'minLongitude', 'maxLatitude', 'maxLongitude'],
};

/** The OpenStreetMap adapter, aimed at a mapper. */
export const openStreetMapAdapter: Adapter = {
	siteSlug: 'openstreetmap_org',
	siteName: 'OpenStreetMap',
	matchPatterns: ['https://www.openstreetmap.org/*', 'https://openstreetmap.org/*'],
	metadata: {
		author: 'Jerome Etienne',
		version: '1.0.0',
		adapterFormatVersion: '0.1.0',
		targetSiteVerifiedOn: '2026-08-21',
	},
	yieldCondition: (firstPartyToolNames) => firstPartyToolNames.length > 0,
	tools: [
		///////////////////////////////////////////////////////////////////////////////
		//	Reading the page
		///////////////////////////////////////////////////////////////////////////////

		{
			name: 'get_map_view',
			title: 'Get the current map view',
			description:
				'Report where the person is looking on the map right now: the latitude and the ' +
				'longitude at the centre, the zoom level, the layer code, and the path of the panel ' +
				'that is open beside the map. Call this before any question about "here" or "this area".',
			inputSchema: NO_INPUT,
			permissionClass: 'readOnly',
			execute: () => {
				const view = OpenStreetMapPage._readMapView();
				if (view === null) {
					return OpenStreetMapPage._refuse(
						'the address carries no map fragment yet, so the map position is unknown',
						'wait for the map to finish loading, then call get_map_view again',
					);
				}
				return view;
			},
		},
		{
			name: 'get_selected_feature',
			title: 'Get the feature that is open',
			description:
				'Report everything about the OpenStreetMap object open in the panel beside the map: ' +
				'whether it is a node, a way or a relation, its identifier, every one of its tags, ' +
				'which version is shown, who last edited it and when, and the changeset that edit ' +
				'belongs to. Tags are where the opening hours, the address and the phone number live.',
			inputSchema: NO_INPUT,
			permissionClass: 'readOnly',
			execute: () => {
				const feature = OpenStreetMapPage._readSelectedFeature();
				if (feature === null) {
					return OpenStreetMapPage._refuse(
						'no OpenStreetMap object is open in the panel beside the map',
						'call show_feature with the kind and the identifier of the object you want',
					);
				}
				return feature;
			},
		},
		{
			name: 'list_queried_features',
			title: 'List the queried features',
			description:
				'Read the Query Features panel that is open beside the map. It holds two lists: the ' +
				'features near the point that was queried, and the areas that contain that point, ' +
				'such as the district, the postal code, the protected area and the low-emission zone. ' +
				'Each list carries stillLoading: an empty list whose stillLoading is true means the ' +
				'answer has not arrived yet, so call again rather than reporting that nothing is there. ' +
				'The nearby list is bigger the further out the map is zoomed, because the site searches ' +
				'a radius taken from the zoom level.',
			inputSchema: NO_INPUT,
			permissionClass: 'readOnly',
			execute: () => {
				const found = OpenStreetMapPage._readFeaturesAtPoint();
				if (found === null) {
					return OpenStreetMapPage._refuse(
						'the Query Features panel is not open beside the map',
						'call query_features_at with the latitude and the longitude of the point',
					);
				}
				return found;
			},
		},
		{
			name: 'list_recent_changesets',
			title: 'List the changesets that are shown',
			description:
				'Read the changeset list that is open beside the map, most recently closed first. ' +
				'Each entry says who edited, when, what they wrote as a comment, how many objects ' +
				'they created, modified and deleted, and the rectangle they touched. The list ' +
				'follows the map, so it describes the area on screen.',
			inputSchema: NO_INPUT,
			permissionClass: 'readOnly',
			execute: () => {
				const recent = OpenStreetMapPage._readRecentChangesets();
				if (recent === null) {
					return OpenStreetMapPage._refuse(
						'no changeset list is open beside the map',
						'call show_recent_changes to open the changeset list for an area',
					);
				}
				return recent;
			},
		},
		{
			name: 'get_changeset',
			title: 'Get the changeset that is open',
			description:
				'Report what the changeset panel says about the changeset it is showing: who made ' +
				'the change, when they closed it, what they wrote as a comment, the changeset tags ' +
				'naming the editor and the imagery they used, and the objects they touched. The ' +
				'panel lists those objects a page at a time, so read objectSections for the totals.',
			inputSchema: NO_INPUT,
			permissionClass: 'readOnly',
			execute: () => {
				const changeset = OpenStreetMapPage._readChangeset();
				if (changeset === null) {
					return OpenStreetMapPage._refuse(
						'no changeset is open in the panel beside the map',
						'call show_changeset with the identifier of the changeset you want',
					);
				}
				return changeset;
			},
		},
		{
			name: 'list_search_results',
			title: 'List the search results',
			description:
				'Read the search results open beside the map, best match first. Each result carries ' +
				'its full name from the place out to the country, what kind of place it is, its ' +
				'coordinates, its rectangle, and the OpenStreetMap object behind it. The search is a ' +
				'geocoder: it finds a place by name or address, and it does not find every shop of ' +
				'a kind in an area.',
			inputSchema: NO_INPUT,
			permissionClass: 'readOnly',
			execute: () => {
				const results = OpenStreetMapPage._readSearchResults();
				if (results === null) {
					return OpenStreetMapPage._refuse(
						'no search results are open beside the map',
						'call search_places with what you want to look up',
					);
				}
				return results;
			},
		},

		///////////////////////////////////////////////////////////////////////////////
		//	Driving the page
		///////////////////////////////////////////////////////////////////////////////

		{
			name: 'set_map_view',
			title: 'Move the map',
			description:
				'Move the map, which changes what the person sees. Give a latitude and a longitude, ' +
				'with an optional zoom from 0 for the whole world to 19 for a single building, or ' +
				'give a boundingBox and the map is moved to the closest zoom that fits it. Returns ' +
				'the view the map settled on.',
			inputSchema: {
				type: 'object',
				properties: {
					latitude: {
						type: 'number',
						description: 'The latitude to centre the map on.',
					},
					longitude: {
						type: 'number',
						description: 'The longitude to centre the map on.',
					},
					zoom: {
						type: 'number',
						description: 'The zoom level, from 0 for the whole world to 19 for a single building.',
					},
					boundingBox: BOUNDING_BOX_SCHEMA,
				},
				additionalProperties: false,
			},
			permissionClass: 'acting',
			execute: async (input) => {
				const boundingBox = boundingBoxField(input);
				let latitude = numberField(input, 'latitude');
				let longitude = numberField(input, 'longitude');
				let zoom = numberField(input, 'zoom') ?? DEFAULT_ZOOM;
				if (boundingBox !== null) {
					latitude = (boundingBox.minLatitude + boundingBox.maxLatitude) / 2;
					longitude = (boundingBox.minLongitude + boundingBox.maxLongitude) / 2;
					zoom = numberField(input, 'zoom') ?? OpenStreetMapPage._zoomForBoundingBox(boundingBox);
				}
				if (latitude === null || longitude === null) {
					return OpenStreetMapPage._refuse(
						'no place was given to move the map to',
						'call set_map_view again with a latitude and a longitude, or with a boundingBox',
					);
				}
				const wantedLatitude = latitude;
				const wantedLongitude = longitude;
				OpenStreetMapPage._setFragment(Math.max(0, Math.min(19, Math.round(zoom))), latitude, longitude);
				await OpenStreetMapPage._waitUntil(() => {
					const moved = OpenStreetMapPage._readMapView();
					if (moved === null) {
						return false;
					}
					return (
						Math.abs(moved.latitude - wantedLatitude) < 0.01 &&
						Math.abs(moved.longitude - wantedLongitude) < 0.01
					);
				}, OpenStreetMapPage.SETTLE_TIMEOUT);
				const view = OpenStreetMapPage._readMapView();
				if (view === null) {
					return OpenStreetMapPage._refuse(
						'the map did not report a position after it was moved',
						'call get_map_view to see where the map ended up',
					);
				}
				return view;
			},
		},
		{
			name: 'search_places',
			title: 'Search for a place',
			description:
				'Search OpenStreetMap for a place by name or by address, which moves the map onto ' +
				'the best match. This is a geocoder, not a shop finder: it answers "where is the ' +
				'Eiffel Tower" and "where is 11 Route du Pontel", and it will not answer "every ' +
				'bakery in this district". Returns the same results list that list_search_results reads.',
			inputSchema: {
				type: 'object',
				properties: {
					query: {
						type: 'string',
						description: 'The place name or the address to look up.',
					},
				},
				required: ['query'],
				additionalProperties: false,
			},
			permissionClass: 'acting',
			execute: async (input) => {
				const query = stringField(input, 'query');
				if (query === null) {
					return OpenStreetMapPage._refuse(
						'no search text was given',
						'call search_places again with a place name or an address in query',
					);
				}
				const showingAlready =
					OpenStreetMapPage._frameUrl()?.searchParams.get('query') === query &&
					OpenStreetMapPage._readSearchResults() !== null;
				if (showingAlready === false) {
					const before = OpenStreetMapPage._sidebarSignature();
					OpenStreetMapPage._route(`/search?query=${encodeURIComponent(query)}`);
					await OpenStreetMapPage._waitUntil(() => {
						if (OpenStreetMapPage._frameSettled() === false) {
							return false;
						}
						if (OpenStreetMapPage._frameUrl()?.searchParams.get('query') !== query) {
							return false;
						}
						if (OpenStreetMapPage._sidebarSignature() === before) {
							return false;
						}
						return OpenStreetMapPage._searchResultsSettled();
					}, OpenStreetMapPage.SETTLE_TIMEOUT);
				}
				const results = OpenStreetMapPage._readSearchResults();
				if (results === null) {
					return {
						results: [],
						total: 0,
						returned: 0,
					};
				}
				return results;
			},
		},
		{
			name: 'show_feature',
			title: 'Open a feature',
			description:
				'Open one OpenStreetMap object in the panel beside the map and report everything it ' +
				'says: every tag, the version, the mapper who last edited it, and the changeset that ' +
				'edit belongs to. Identifiers come from search_places, list_queried_features, or ' +
				'get_changeset. Refuses when OpenStreetMap has no such object.',
			inputSchema: {
				type: 'object',
				properties: {
					kind: {
						type: 'string',
						enum: FEATURE_KINDS,
						description: 'Whether the object is a node, a way, or a relation.',
					},
					id: {
						type: 'number',
						description: 'The object identifier inside OpenStreetMap.',
					},
				},
				required: ['kind', 'id'],
				additionalProperties: false,
			},
			permissionClass: 'acting',
			execute: async (input) => {
				const kind = stringField(input, 'kind');
				const id = numberField(input, 'id');
				if (kind === null || FEATURE_KINDS.includes(kind as FeatureKind) === false || id === null) {
					return OpenStreetMapPage._refuse(
						`show_feature needs a kind of ${FEATURE_KINDS.join(', ')} and a numeric identifier`,
						'call show_feature again with both, taking them from a search result or a query result',
					);
				}
				const path = `/${kind}/${id}`;
				const showing = OpenStreetMapPage._readSelectedFeature();
				if (showing === null || showing.kind !== kind || showing.id !== id) {
					const before = OpenStreetMapPage._sidebarSignature();
					OpenStreetMapPage._route(path);
					await OpenStreetMapPage._waitForPanel(path, before);
				}
				const feature = OpenStreetMapPage._readSelectedFeature();
				if (feature === null) {
					return OpenStreetMapPage._refuse(
						`OpenStreetMap has no ${kind} ${id}, or it has been deleted`,
						'check the identifier against a search result, then call show_feature again',
					);
				}
				return feature;
			},
		},
		{
			name: 'query_features_at',
			title: 'Ask what is at a point',
			description:
				'Ask OpenStreetMap what is at one point on the map. Returns the features near the ' +
				'point and, more usefully, every area that contains it: the district, the postal ' +
				'code, the protected area, the low-emission zone. This is how you find a boundary ' +
				'tagged wrong. How many nearby features come back depends on the zoom the map is at, ' +
				'so the map is moved onto the point first and mapView reports the view the query ran ' +
				'in. Opening this panel clears the map fragment from the address afterwards, so call ' +
				'get_map_view rather than assuming the map stayed where it was.',
			inputSchema: {
				type: 'object',
				properties: {
					latitude: {
						type: 'number',
						description: 'The latitude of the point to ask about.',
					},
					longitude: {
						type: 'number',
						description: 'The longitude of the point to ask about.',
					},
					zoom: {
						type: 'number',
						description:
							'How closely to look, from 0 for the whole world to 19 for a single building. ' +
							'The site takes the search radius from this, so a low zoom returns hundreds of ' +
							'nearby features. Leave it out to keep the zoom the map is already at.',
					},
				},
				required: ['latitude', 'longitude'],
				additionalProperties: false,
			},
			permissionClass: 'acting',
			execute: async (input) => {
				const latitude = numberField(input, 'latitude');
				const longitude = numberField(input, 'longitude');
				if (latitude === null || longitude === null) {
					return OpenStreetMapPage._refuse(
						'query_features_at needs a latitude and a longitude',
						'call query_features_at again with both, as numbers',
					);
				}
				const standing = OpenStreetMapPage._readMapView();
				const zoom = numberField(input, 'zoom') ?? standing?.zoom ?? DEFAULT_ZOOM;
				OpenStreetMapPage._setFragment(Math.max(0, Math.min(19, Math.round(zoom))), latitude, longitude);
				await OpenStreetMapPage._waitUntil(() => {
					const moved = OpenStreetMapPage._readMapView();
					if (moved === null) {
						return false;
					}
					return Math.abs(moved.latitude - latitude) < 0.01 && Math.abs(moved.longitude - longitude) < 0.01;
				}, OpenStreetMapPage.SETTLE_TIMEOUT);
				const queriedIn = OpenStreetMapPage._readMapView();
				OpenStreetMapPage._route(`/query?lat=${latitude}&lon=${longitude}`);
				await OpenStreetMapPage._waitUntil(() => {
					const found = OpenStreetMapPage._readFeaturesAtPoint();
					if (found === null) {
						return false;
					}
					return found.nearby.stillLoading === false && found.enclosing.stillLoading === false;
				}, OpenStreetMapPage.SETTLE_TIMEOUT);
				const found = OpenStreetMapPage._readFeaturesAtPoint();
				if (found === null) {
					return OpenStreetMapPage._refuse(
						'the Query Features panel never opened',
						'call query_features_at again, or call get_map_view to see where the map is',
					);
				}
				return {
					mapView: queriedIn ?? OpenStreetMapPage._readMapView(),
					nearby: found.nearby,
					enclosing: found.enclosing,
				};
			},
		},
		{
			name: 'show_recent_changes',
			title: 'Show what changed in an area',
			description:
				'Open the changeset list for an area and report what it holds: who edited, when, ' +
				'their comment, the counts of objects created, modified and deleted, and the ' +
				'rectangle each change touched. Give a latitude and a longitude to look at another ' +
				'area, or give nothing to use the area already on screen. The list follows the map, ' +
				'so the view it describes is reported alongside.',
			inputSchema: {
				type: 'object',
				properties: {
					latitude: {
						type: 'number',
						description: 'The latitude of the area to look at. Leave out to use the area on screen.',
					},
					longitude: {
						type: 'number',
						description: 'The longitude of the area to look at. Leave out to use the area on screen.',
					},
					zoom: {
						type: 'number',
						description: 'How closely to look, from 0 for the whole world to 19 for a single building.',
					},
				},
				additionalProperties: false,
			},
			permissionClass: 'acting',
			execute: async (input) => {
				const latitude = numberField(input, 'latitude');
				const longitude = numberField(input, 'longitude');
				const before = OpenStreetMapPage._changesetIds();
				OpenStreetMapPage._route('/history');
				await OpenStreetMapPage._waitUntil(() => {
					return (
						OpenStreetMapPage._frameSettledOn('/history') === true &&
						OpenStreetMapPage._changesetIds().length > 0
					);
				}, OpenStreetMapPage.SETTLE_TIMEOUT);
				await OpenStreetMapPage._pause(OpenStreetMapPage.POLL_INTERVAL);
				if (latitude !== null && longitude !== null) {
					const settled = OpenStreetMapPage._changesetIds();
					const zoom = numberField(input, 'zoom') ?? DEFAULT_HISTORY_ZOOM;
					OpenStreetMapPage._setFragment(Math.max(0, Math.min(19, Math.round(zoom))), latitude, longitude);
					await OpenStreetMapPage._waitUntil(() => {
						return OpenStreetMapPage._changesetIds() !== settled;
					}, OpenStreetMapPage.REFRESH_TIMEOUT);
				} else if (before.length > 0) {
					await OpenStreetMapPage._pause(OpenStreetMapPage.POLL_INTERVAL);
				}
				const recent = OpenStreetMapPage._readRecentChangesets();
				if (recent === null) {
					return OpenStreetMapPage._refuse(
						'the changeset list never filled, so nothing can be reported about this area',
						'call set_map_view to move somewhere with edits, then call show_recent_changes again',
					);
				}
				return {
					mapView: OpenStreetMapPage._readMapView(),
					changesets: recent.changesets,
					total: recent.total,
					returned: recent.returned,
				};
			},
		},
		{
			name: 'show_changeset',
			title: 'Open a changeset',
			description:
				'Open one changeset in the panel beside the map and report what it holds: the ' +
				'mapper, the comment, the changeset tags naming the editor and the imagery used, ' +
				'and the objects it touched. Identifiers come from list_recent_changesets or from ' +
				'the changesetId of a feature. Refuses when OpenStreetMap has no such changeset.',
			inputSchema: {
				type: 'object',
				properties: {
					id: {
						type: 'number',
						description: 'The changeset identifier.',
					},
				},
				required: ['id'],
				additionalProperties: false,
			},
			permissionClass: 'acting',
			execute: async (input) => {
				const id = numberField(input, 'id');
				if (id === null) {
					return OpenStreetMapPage._refuse(
						'show_changeset needs a numeric changeset identifier',
						'take one from list_recent_changesets or from a feature changesetId, then call again',
					);
				}
				const path = `/changeset/${id}`;
				const showing = OpenStreetMapPage._readChangeset();
				if (showing === null || showing.id !== id) {
					const before = OpenStreetMapPage._sidebarSignature();
					OpenStreetMapPage._route(path);
					await OpenStreetMapPage._waitForPanel(path, before);
				}
				const changeset = OpenStreetMapPage._readChangeset();
				if (changeset === null) {
					return OpenStreetMapPage._refuse(
						`OpenStreetMap has no changeset ${id}`,
						'check the identifier against list_recent_changesets, then call show_changeset again',
					);
				}
				return changeset;
			},
		},
		{
			name: 'get_directions',
			title: 'Work out a route',
			description:
				'Ask one of the site\'s routing engines for a route between two points, and report ' +
				'the distance, the time and the turn instructions. For a mapper this is a way to ' +
				'find a broken connection: a route that detours absurdly usually means the road ' +
				'network is wrong. Be careful reading the answer, because the engine snaps each ' +
				'point to the nearest routable road rather than refusing: a walk asked for from ' +
				'Paris to New York comes back as an 1812 kilometre route that stops at the coast. ' +
				'Compare the distance against what you expected before believing the route.',
			inputSchema: {
				type: 'object',
				properties: {
					fromLatitude: {
						type: 'number',
						description: 'The latitude to start from.',
					},
					fromLongitude: {
						type: 'number',
						description: 'The longitude to start from.',
					},
					toLatitude: {
						type: 'number',
						description: 'The latitude to finish at.',
					},
					toLongitude: {
						type: 'number',
						description: 'The longitude to finish at.',
					},
					mode: {
						type: 'string',
						enum: TRAVEL_MODES,
						description: 'How to travel. Defaults to car.',
					},
					engine: {
						type: 'string',
						enum: ROUTING_ENGINES,
						description: 'Which routing provider to ask. Defaults to fossgis_osrm.',
					},
				},
				required: ['fromLatitude', 'fromLongitude', 'toLatitude', 'toLongitude'],
				additionalProperties: false,
			},
			permissionClass: 'acting',
			execute: async (input) => {
				const fromLatitude = numberField(input, 'fromLatitude');
				const fromLongitude = numberField(input, 'fromLongitude');
				const toLatitude = numberField(input, 'toLatitude');
				const toLongitude = numberField(input, 'toLongitude');
				if (
					fromLatitude === null ||
					fromLongitude === null ||
					toLatitude === null ||
					toLongitude === null
				) {
					return OpenStreetMapPage._refuse(
						'get_directions needs a latitude and a longitude for both ends',
						'call get_directions again with all four numbers',
					);
				}
				const mode = stringField(input, 'mode') ?? 'car';
				const engine = stringField(input, 'engine') ?? 'fossgis_osrm';
				if (TRAVEL_MODES.includes(mode) === false || ROUTING_ENGINES.includes(engine) === false) {
					return OpenStreetMapPage._refuse(
						`mode must be one of ${TRAVEL_MODES.join(', ')} and engine one of ${ROUTING_ENGINES.join(', ')}`,
						'call get_directions again with a mode and an engine from those lists',
					);
				}
				const route = `${fromLatitude},${fromLongitude};${toLatitude},${toLongitude}`;
				OpenStreetMapPage._route(
					`/directions?engine=${engine}_${mode}&route=${encodeURIComponent(route)}`,
				);
				await OpenStreetMapPage._waitUntil(() => {
					return OpenStreetMapPage._addressParameter('route') === route;
				}, OpenStreetMapPage.SETTLE_TIMEOUT);
				const summary = await OpenStreetMapPage._waitForStableRoute(OpenStreetMapPage.ROUTE_TIMEOUT);
				if (summary === null) {
					return OpenStreetMapPage._refuse(
						`the ${engine} engine returned no route for ${mode} between those two points`,
						'try another engine, another mode, or points closer to a road',
					);
				}
				return {
					engine: engine,
					mode: mode,
					route: summary,
				};
			},
		},
	],
};

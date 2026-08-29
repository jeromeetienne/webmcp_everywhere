import { PageWaiting } from '@webmcp_everywhere/adapter_toolkit';
import type { AdapterToolDefinition } from '../../adapter_format/adapter_types.js';
import type { FeatureKind } from './openstreetmap_types.js';
import { OpenStreetMapPage } from './openstreetmap_page.js';
import {
	BOUNDING_BOX_SCHEMA,
	DEFAULT_HISTORY_ZOOM,
	DEFAULT_ZOOM,
	FEATURE_KINDS,
	OpenStreetMapToolInput,
	ROUTING_ENGINES,
	TRAVEL_MODES,
} from './openstreetmap_tool_input.js';

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	openStreetMapDrivingTools — the OpenStreetMap tools that move the map and the panel
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/** The tools that drive the site's own router, so the page shows something else. */
export const openStreetMapDrivingTools: AdapterToolDefinition[] = [
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
			const boundingBox = OpenStreetMapToolInput.boundingBoxField(input);
			let latitude = OpenStreetMapToolInput.numberField(input, 'latitude');
			let longitude = OpenStreetMapToolInput.numberField(input, 'longitude');
			let zoom = OpenStreetMapToolInput.numberField(input, 'zoom') ?? DEFAULT_ZOOM;
			if (boundingBox !== null) {
				latitude = (boundingBox.minLatitude + boundingBox.maxLatitude) / 2;
				longitude = (boundingBox.minLongitude + boundingBox.maxLongitude) / 2;
				zoom = OpenStreetMapToolInput.numberField(input, 'zoom') ?? OpenStreetMapPage._zoomForBoundingBox(boundingBox);
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
			const query = OpenStreetMapToolInput.stringField(input, 'query');
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
			const kind = OpenStreetMapToolInput.stringField(input, 'kind');
			const id = OpenStreetMapToolInput.numberField(input, 'id');
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
			const latitude = OpenStreetMapToolInput.numberField(input, 'latitude');
			const longitude = OpenStreetMapToolInput.numberField(input, 'longitude');
			if (latitude === null || longitude === null) {
				return OpenStreetMapPage._refuse(
					'query_features_at needs a latitude and a longitude',
					'call query_features_at again with both, as numbers',
				);
			}
			const standing = OpenStreetMapPage._readMapView();
			const zoom = OpenStreetMapToolInput.numberField(input, 'zoom') ?? standing?.zoom ?? DEFAULT_ZOOM;
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
			const latitude = OpenStreetMapToolInput.numberField(input, 'latitude');
			const longitude = OpenStreetMapToolInput.numberField(input, 'longitude');
			const before = OpenStreetMapPage._changesetIds();
			OpenStreetMapPage._route('/history');
			await OpenStreetMapPage._waitUntil(() => {
				return (
					OpenStreetMapPage._frameSettledOn('/history') === true &&
					OpenStreetMapPage._changesetIds().length > 0
				);
			}, OpenStreetMapPage.SETTLE_TIMEOUT);
			await PageWaiting.pause(OpenStreetMapPage.POLL_INTERVAL);
			if (latitude !== null && longitude !== null) {
				const settled = OpenStreetMapPage._changesetIds();
				const zoom = OpenStreetMapToolInput.numberField(input, 'zoom') ?? DEFAULT_HISTORY_ZOOM;
				OpenStreetMapPage._setFragment(Math.max(0, Math.min(19, Math.round(zoom))), latitude, longitude);
				await OpenStreetMapPage._waitUntil(() => {
					return OpenStreetMapPage._changesetIds() !== settled;
				}, OpenStreetMapPage.REFRESH_TIMEOUT);
			} else if (before.length > 0) {
				await PageWaiting.pause(OpenStreetMapPage.POLL_INTERVAL);
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
			const id = OpenStreetMapToolInput.numberField(input, 'id');
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
			const fromLatitude = OpenStreetMapToolInput.numberField(input, 'fromLatitude');
			const fromLongitude = OpenStreetMapToolInput.numberField(input, 'fromLongitude');
			const toLatitude = OpenStreetMapToolInput.numberField(input, 'toLatitude');
			const toLongitude = OpenStreetMapToolInput.numberField(input, 'toLongitude');
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
			const mode = OpenStreetMapToolInput.stringField(input, 'mode') ?? 'car';
			const engine = OpenStreetMapToolInput.stringField(input, 'engine') ?? 'fossgis_osrm';
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
];

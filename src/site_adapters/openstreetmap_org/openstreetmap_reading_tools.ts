import type { AdapterToolDefinition } from '@webmcp_everywhere/adapter_format';
import { OpenStreetMapPage } from './openstreetmap_page.js';
import { NO_INPUT } from './openstreetmap_tool_input.js';

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	openStreetMapReadingTools — the OpenStreetMap tools that only look at the page
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/** The tools that report what the map and the panel beside it are showing right now. */
export const openStreetMapReadingTools: AdapterToolDefinition[] = [
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
];

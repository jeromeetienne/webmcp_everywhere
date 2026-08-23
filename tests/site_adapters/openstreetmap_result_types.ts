///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	OpenStreetMapResultTypes — the shapes the OpenStreetMap checks compare against
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/** What `get_map_view` returns. */
export type MapViewResult = {
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
export type SelectedFeatureResult = {
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
export type QueriedFeatureList = {
	/** The entries the list holds. */
	features: Array<{ kind: string; id: number; name: string | null; category: string | null }>;
	/** How many entries the list holds in total. */
	total: number;
	/** Whether the list is still being fetched. */
	stillLoading: boolean;
};

/** What `list_queried_features` returns. */
export type QueriedFeaturesResult = {
	/** The features near the queried point. */
	nearby: QueriedFeatureList;
	/** The areas containing the queried point. */
	enclosing: QueriedFeatureList;
};

/** What `list_recent_changesets` returns. */
export type RecentChangesetsResult = {
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
export type ChangesetResult = {
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
export type SearchResultsResult = {
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
export type RecentChangesInViewResult = RecentChangesetsResult & {
	/** Where the map was when the list was read. */
	mapView: { latitude: number; longitude: number; zoom: number } | null;
};

/** What `query_features_at` returns. */
export type QueryAtPointResultShape = QueriedFeaturesResult & {
	/** Where the map was when the query ran. */
	mapView: { latitude: number; longitude: number; zoom: number } | null;
};

/** What `get_directions` returns. */
export type RouteResultShape = {
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
export type RefusalResult = {
	/** Always `true` on a refusal. */
	refused: true;
	/** What went wrong. */
	reason: string;
	/** What has to happen first. */
	remedy: string;
};

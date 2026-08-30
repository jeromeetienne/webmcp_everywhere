import type { Adapter } from '@webmcp_everywhere/adapter_format';
import { openStreetMapDrivingTools } from './openstreetmap_driving_tools.js';
import { openStreetMapReadingTools } from './openstreetmap_reading_tools.js';

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	openStreetMapAdapter — the WebMCP tool surface for https://www.openstreetmap.org/
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

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
	tools: [...openStreetMapReadingTools, ...openStreetMapDrivingTools],
};

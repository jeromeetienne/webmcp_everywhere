import type { BoundingBox, FeatureKind } from './openstreetmap_types.js';

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	OpenStreetMapToolInput — what the OpenStreetMap tools accept, and how they read it
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/** A tool that takes no input at all. */
export const NO_INPUT = {
	type: 'object',
	properties: {},
	additionalProperties: false,
};

/** The three kinds of object an agent may ask to open. */
export const FEATURE_KINDS: FeatureKind[] = ['node', 'way', 'relation'];

/** The ways of travelling the site offers. */
export const TRAVEL_MODES = ['car', 'bicycle', 'foot'];

/** The routing providers the site has wired up, as its own engine chooser names them. */
export const ROUTING_ENGINES = ['fossgis_osrm', 'graphhopper', 'fossgis_valhalla'];

/** The zoom to move to when the caller names a place but no zoom. */
export const DEFAULT_ZOOM = 17;

/** The zoom to move to when the caller asks for the changes in an area but names no zoom. */
export const DEFAULT_HISTORY_ZOOM = 14;

/** The schema fragment describing a rectangle of the world. */
export const BOUNDING_BOX_SCHEMA = {
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

/**
 * Reads the fields the OpenStreetMap tools accept out of a tool's input object.
 *
 * Every reader returns `null` rather than throwing when a field is missing or is the wrong type, so a
 * tool can refuse with a sentence of its own instead of failing with a type error.
 */
export class OpenStreetMapToolInput {
	/**
	 * Reads one number out of a tool's input.
	 *
	 * @param input - The tool's input object.
	 * @param name - The field to read.
	 * @returns The number, or `null` when the field is missing or is not a number.
	 */
	static numberField(input: Record<string, unknown>, name: string): number | null {
		const value = input[name];
		if (typeof value !== 'number' || Number.isFinite(value) === false) {
			return null;
		}
		return value;
	}

	/**
	 * Reads one string out of a tool's input.
	 *
	 * @param input - The tool's input object.
	 * @param name - The field to read.
	 * @returns The trimmed string, or `null` when the field is missing or is empty.
	 */
	static stringField(input: Record<string, unknown>, name: string): string | null {
		const value = input[name];
		if (typeof value !== 'string' || value.trim().length === 0) {
			return null;
		}
		return value.trim();
	}

	/**
	 * Reads a rectangle out of a tool's input.
	 *
	 * @param input - The tool's input object.
	 * @returns The rectangle, or `null` when the input carries no complete one.
	 */
	static boundingBoxField(input: Record<string, unknown>): BoundingBox | null {
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
	}
}

/// <reference path="./format/webmcp_globals.d.ts" />

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	index — everything `@webmcp_everywhere/site_adapter_lib` offers to an adapter
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

// The two halves below are the whole package, and an adapter author has to tell them apart.
// `src/format/` is the contract: the shape an adapter must conform to, the version it declares, and
// the framing every tool result passes through. It is meant to stop changing, and taking anything out
// of it breaks every adapter that exists.
// `src/toolkit/` is the helper library: the page work an adapter would otherwise write for itself. It
// is meant to grow, one helper at a time, and adding to it breaks nothing.
// Both halves are exported from this one entry point because an adapter needs both, and splitting them
// across two package names only moved the question of where the line falls out of sight.

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	The format — the contract an adapter conforms to
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

// The reference at the top of this file carries the ambient declarations for `document.modelContext`
// to anybody who imports this package. They declare globals rather than exports, so there is nothing
// to re-export and a triple-slash reference is the only way to hand them over.

export { ADAPTER_FORMAT_VERSION } from './format/adapter_format_version.ts';
export { ToolNaming } from './format/tool_naming.ts';
export { UntrustedContent } from './format/untrusted_content.ts';
export { LOADED_ADAPTER_GLOBAL } from './format/loaded_adapter_types.ts';

export type {
	Adapter,
	AdapterMetadata,
	AdapterToolDefinition,
	JsonSchema,
	OriginGrant,
	PermissionClass,
} from './format/adapter_types.ts';
export type { LoadedAdapter, LoadedToolSummary } from './format/loaded_adapter_types.ts';
export type { ContentWarning, FramedResult } from './format/untrusted_content.ts';

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	The toolkit — the page helpers every adapter shares
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

// esbuild inlines the two classes in the order they are re-exported here, so this order is what every
// bundle carries. `PageDriving` comes first because that is the order the bundles had when each adapter
// imported the two files directly, and keeping it means moving these files has changed no bundle except
// for the source path written in a comment.
export { PageDriving } from './toolkit/page_driving.ts';
export { PageWaiting } from './toolkit/page_waiting.ts';

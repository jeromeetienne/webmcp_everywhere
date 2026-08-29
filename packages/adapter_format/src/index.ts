/// <reference path="./webmcp_globals.d.ts" />

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	index — everything `@webmcp_everywhere/adapter_format` offers to an adapter
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

// The reference above carries the ambient declarations for `document.modelContext` to anybody who
// imports this package. They declare globals rather than exports, so there is nothing to re-export
// and a triple-slash reference is the only way to hand them over.

export { ADAPTER_FORMAT_VERSION } from './adapter_format_version.ts';
export { ToolNaming } from './tool_naming.ts';
export { UntrustedContent } from './untrusted_content.ts';
export { LOADED_ADAPTER_GLOBAL } from './loaded_adapter_types.ts';

export type {
	Adapter,
	AdapterMetadata,
	AdapterToolDefinition,
	JsonSchema,
	OriginGrant,
	PermissionClass,
} from './adapter_types.ts';
export type { LoadedAdapter, LoadedToolSummary } from './loaded_adapter_types.ts';
export type { ContentWarning, FramedResult } from './untrusted_content.ts';

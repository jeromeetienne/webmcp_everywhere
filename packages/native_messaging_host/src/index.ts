///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	index — everything `@webmcp_everywhere/native_messaging_host` offers to an importer
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

// This package is two things at once, and only one of them is here.
//
// The half named below is imported: `packages/webmcp_everywhere/src/` reads the state files and the shapes
// they hold, and `tools/` reads the folder of loaded adapters. The other half is a program Chrome
// starts, and a program is reached by its path rather than by an import — `bin/native_messaging_host.sh`
// names `src/webmcp_native_host.ts`, and `tools/webmcp_everywhere/package_release.ts` bundles the same file. So this
// entry point exports the imported half, and the program stays a path.

export { HostStateFiles } from './host_state_files.ts';
export { LoadedAdapterStore } from './loaded_adapter_store.ts';
export { NativeMessagingCodec } from './native_messaging_codec.ts';
export { WebmcpNativeHost } from './webmcp_native_host.ts';

export type {
	ExtensionAnswer,
	ExtensionRequest,
	ExtensionTool,
	HostEndpointRecord,
	HostHealth,
	PendingRequest,
	WebmcpNativeHostOptions,
} from './webmcp_native_host_types.ts';

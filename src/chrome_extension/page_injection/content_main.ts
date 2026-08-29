import { AdapterRegistry } from '../shared_state/adapter_registry.js';
import { MainWorldRuntime } from './main_world_runtime.js';

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	ContentMain — the main world entry point for an adapter bundled into this build
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/**
 * Starts the main world runtime with the adapters this build carries.
 *
 * The service worker registers this script for one adapter's match patterns at a time, so the registry
 * lookup here only ever finds the adapter the user switched on for this page.
 */
MainWorldRuntime.start((url) => AdapterRegistry.findForUrl(url));

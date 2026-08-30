///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//	AdapterFormatVersion — the one place the adapter format's version is written
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

/**
 * The version of the adapter format this repository speaks.
 *
 * Every adapter carries this exact string in `metadata.adapterFormatVersion`, and the build refuses an
 * adapter that carries any other. It sits in its own file, holding nothing else, so that the three
 * things that need it can each reach it: the review checks in `tools/site_adapter/`, which are
 * bundled before they run; `tools/site_adapters/new_adapter.ts`, which Node.js runs straight from TypeScript and so
 * cannot import anything that imports a `.js` path; and any adapter that wants to name it.
 *
 * A guide that wrote the number out by hand taught a first contributor the wrong one, and the build
 * rejected them with a message naming a version they had never seen. Nothing writes this number twice
 * any more.
 */
export const ADAPTER_FORMAT_VERSION = '0.1.0';

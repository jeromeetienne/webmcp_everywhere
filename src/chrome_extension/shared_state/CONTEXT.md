# Directory Context: `/src/chrome_extension/shared_state`

## Purpose
The state that more than one execution context reads: the adapters this build carries, the grants and the kill switch, and the record of pages that tried to issue instructions.

## Key Exports & Entry Points
- `adapter_registry.ts`: `AdapterRegistry` — the adapters this build carries, and match pattern testing. Read by `page_injection/content_main.ts` and by `native_host_link/native_bridge.ts`.
- `extension_storage.ts`: `ExtensionStorage` — the grants and the kill switch.
- `injection_watch.ts`: `InjectionWatch` — refuses acting tools after a page tries to issue instructions.

## Rules
- This folder imports from none of `page_injection/`, `native_host_link/`, or `user_interface/`. It is a leaf, so a file here can be read by any execution context without dragging another one in.
- Once any page returns instruction-shaped content, every acting tool is refused until a person clears it in the popup. Reading keeps working, so an agent can still report what it found.
- Adapters are added to `adapter_registry.ts` by hand. There is no automatic discovery, because a build that silently picks up a new file is a build that silently ships one.

## Background
- `validate_all_adapters.ts` in `tools/adapter_validation/` imports `adapter_registry.ts` on purpose and only ever runs in Node.js — see [`../../../tools/adapter_validation/CONTEXT.md`](../../../tools/adapter_validation/CONTEXT.md).

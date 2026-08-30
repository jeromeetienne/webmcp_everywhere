# Directory Context: `/packages/webmcp_everywhere/native_messaging_template`

## Purpose
Holds the template for the Chrome native messaging host manifest, the JSON file that tells Chrome which program to start and which extension may connect to it.

## Key Exports & Entry Points
- `com.webmcp_everywhere.host.json`: the template. `packages/webmcp_everywhere/src/install_native_host.ts` reads it, replaces the placeholders, and writes the result into every Chrome native messaging host directory. It sits inside the package because the package publishes it: a release carries this template and no repository.
- Command to write the manifests: `npm run install:host`

## Rules
- The placeholders are `{{hostName}}`, `{{launcherPath}}`, and `{{extensionIdentifier}}`. Adding a placeholder here without adding its value in `InstallNativeHost._renderManifest` fails the installation, on purpose.
- Never write the host name, the launcher path, or the extension identifier here as a literal value. Each of those has one authoritative place in the TypeScript, and a second copy here would disagree with it.
- The field names are Chrome's, not this project's: `name`, `description`, `path`, `type`, and `allowed_origins`. Chrome refuses a manifest with any other spelling and reports nothing useful when it does.

## Background
- Chrome's native messaging documentation defines the manifest and the directories it is read from — see [issue #2](https://github.com/jeromeetienne/webmcp_everywhere/issues/2).

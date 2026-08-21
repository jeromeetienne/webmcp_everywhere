# Directory Context: `/data`

## Purpose
Holds the files the tooling reads at run time and fills in, rather than builds from string literals in TypeScript.

## Key Exports & Entry Points
- `native_messaging_template/`: the Chrome native messaging host manifest template — see its own CONTEXT.md.

## Rules
- Nothing here is code, and nothing here is imported. Every file here is read from disk by a tool in `/tools`.
- A file here is a template only when a person has a reason to read or edit it as the document Chrome or another program will receive. Everything else stays in the TypeScript that writes it.

## Background
- The native messaging host manifest moved here so that the shape Chrome reads can be looked at as the JSON document it is.

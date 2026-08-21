# Directory Context: `/docs`

## Purpose
Holds the prose that explains how WebMCP Everywhere works and why it was built this way. Nothing here is code, and nothing here is imported.

## Key Exports & Entry Points
- `README.md`: The index. Every document is listed there, in reading order, with what question it answers.

## Rules
- A document here explains; a `CONTEXT.md` states a rule for editing one folder. A rule that must hold now belongs in the `CONTEXT.md` of the folder it governs, and this folder links to it rather than restating it.
- What one adapter can do on its own site belongs in that adapter's own `README.md`, next to the adapter, never here.
- The repository `README.md` says what the project is and how to start it, and points here for everything else. Anything explained here is not explained there a second time.
- Every diagram is Mermaid, so it renders where the documents are read and stays editable as text.
- Never wrap a paragraph at a fixed column. One paragraph is one line.

## Background
- The documentation was split out of the repository `README.md`, which had grown to hold the architecture, the security model, the environment variables, and the launch recipe all at once.

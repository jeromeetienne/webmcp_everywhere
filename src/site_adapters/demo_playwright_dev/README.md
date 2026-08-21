# The Playwright TodoMVC adapter

This adapter gives `https://demo.playwright.dev/todomvc/` a set of Model Context Protocol tools that the page never shipped. With the adapter loaded, Codex reads and changes the todo list by calling named tools with named arguments, instead of taking screenshots and guessing at the Document Object Model.

This document is about what you can ask Codex to do with the page. It does not explain how to build, install, or connect anything — the repository README.md at the top of the project covers that.

## The tools Codex sees

Three tools only read the page:

- `list_todos` — every todo, with its stable id, its title, whether it is completed, and whether the active filter is currently showing it. The active filter is reported too.
- `count_todos` — the number of active, completed, and total todos, counted regardless of which filter is showing.
- `get_active_filter` — which filter the page is showing: all, active, or completed.

Seven tools change the page:

- `add_todo` — add one todo, and return the new todo with its stable id.
- `set_todo_completed` — mark one todo, named by its stable id, as done or as not done.
- `edit_todo` — replace the text of one todo, named by its stable id.
- `delete_todo` — delete one todo, named by its stable id.
- `clear_completed` — delete every completed todo at once.
- `set_all_completed` — mark every todo as done, or every todo as not done.
- `set_active_filter` — show all todos, only the active ones, or only the completed ones.

Every tool that changes one todo names that todo by the stable id that `list_todos` returns, never by its position in the list. A filter hides todos rather than re-orders them, so a position means a different todo under each filter, and an id always means the same todo.

## Why Codex is good at this page

- Codex never has to read the screen. `list_todos` returns the whole list, including the todos the active filter is hiding, so Codex knows about a todo it cannot see.
- Codex never has to type into a text field or aim a click. It passes a stable id and a value.
- A tool that needs a hidden todo shows every todo, acts, and puts the filter back, so the page looks the way you left it after Codex is finished.
- The whole page state lives in the browser's own local storage. A tool that misfires harms nobody, which makes this a safe page to give an agent a first try on.

## Workflows worth asking for

### Report on the list

Ask Codex what is on the list and it calls `list_todos` or `count_todos` once and answers from the result. This is the cheapest thing to ask for, and it is the right first request when you want to see the connection working.

- "How many todos are left?"
- "Read me everything on the list and say which ones are done."
- "Is there already a todo about milk?"

Only the read-only tools are needed, so this works before you have opted in to the acting tools for this origin.

### Fill the list from a description

Ask Codex to put a list of things on the page and it calls `add_todo` once per item. Because Codex writes the text itself, you can describe the list instead of dictating it.

- "Add buy milk, buy bread, and buy eggs."
- "Put the five steps of a morning routine on this list."
- "Copy the checklist out of this file onto the page."

### Tidy the list

Ask Codex to clean up and it reads the list, decides what to change, and calls the changing tools in whatever order the cleanup needs.

- "Delete everything that is already done." — one call to `clear_completed`.
- "Delete the duplicates." — `list_todos`, then one `delete_todo` per repeated title.
- "Every todo that mentions shopping should be marked done." — `list_todos`, then one `set_todo_completed` per matching id.
- "Rewrite every todo to start with a verb." — `list_todos`, then one `edit_todo` per todo whose title needs the change.

The last two are the ones worth trying, because they need Codex to judge each todo against a rule you gave in words. No fixed script does that.

### Work through the list one item at a time

Ask Codex to treat the list as a queue. It marks each todo done as it finishes the underlying work.

- "Take the first thing that is not done, do it, and mark it done."
- "Work down the list and mark each one done as you finish it."

This is the workflow where the page stops being the point and becomes a place to record progress on work that happens elsewhere.

### Reset the page to a known state

Ask Codex to put the page into a shape you want to start from, which is useful before a demonstration or before a test run.

- "Empty the list." — `list_todos`, then one `delete_todo` per todo.
- "Mark everything done, then clear it." — `set_all_completed`, then `clear_completed`.
- "Leave exactly three active todos on the page and show the active filter."

### Compare the page against something outside the browser

Codex has the page through these tools and your files through its own tools, so it can hold both at once.

- "Compare this list with the tasks in my notes file and add anything that is missing."
- "Write the current list out to a file as Markdown."
- "The list on the page is the truth — update my notes file to match it."

### Check that a filter is not lying to you

Because `list_todos` reports both the whole list and what the active filter is showing, Codex can tell you about the gap between them.

- "What is the filter hiding right now?"
- "Show me only the completed ones, then tell me how many todos I still cannot see."

## What this adapter is not for

- It does not survive the page. Everything lives in the browser's local storage for this one site, so a different browser profile is a different list.
- It has no notion of a due date, a priority, an owner, or a project. TodoMVC has none of those, and the adapter never invents a field the page does not have.
- It is a demonstration target. The point of a workflow here is to prove the shape of the workflow, before the same shape is pointed at a site where a mistake would cost something.

# The OpenStreetMap adapter

This adapter gives `https://www.openstreetmap.org/` a set of Model Context Protocol tools that the site never shipped. With the adapter loaded, an agent reads the map the way a mapper reads it: the tags on the object you clicked, the areas that contain a point, and who changed what in the area on screen.

It is aimed at a mapper — somebody who already has the map open and is asking questions about what is in front of them. OpenStreetMap also has a free public application programming interface, and for a plain data lookup that interface is the better tool. What this adapter adds is the three things the interface cannot give: the view you are actually looking at, the session you are actually signed in to, and the queries the website already composes for you.

This document is about what you can ask an agent to do with the page. It does not explain how to build, install, or connect anything — the repository README.md at the top of the project covers that.

## Workflows worth asking for

### Read the object in front of you

Tags are where OpenStreetMap keeps the real answers. A single node can carry the opening hours, the phone number, the full address, whether the door is wide enough for a wheelchair, whether the shop takes cards, and what it sells. All of it is exact, none of it is guessed from a screenshot.

- "What are the opening hours of the shop I just clicked?"
- "Show me every tag on this feature."
- "What is the phone number and the address of this place?"
- "Is this café tagged as having outdoor seating?"
- "Read this bus stop and tell me whether it has a shelter and a bench."

The agent calls `get_selected_feature`, which reads the panel already beside the map. If nothing is open it refuses and tells the agent to call `show_feature` with an identifier instead.

### Audit the tagging on one object

The interesting question is usually not what a tag says but what is missing or contradictory. An agent holding the whole tag list at once is good at this, and it never gets bored halfway down.

- "Which tags on this feature look inconsistent with each other?"
- "This is tagged `shop=bakery` — what would a mapper normally add that is missing here?"
- "Does the address on this building agree with the street it sits on?"
- "Is `opening_hours` here written in valid OpenStreetMap syntax?"
- "Compare these two shops and tell me which is tagged more completely."

### Find out what contains a point

This is the strongest single thing the site does, and it is genuinely hard to get anywhere else. Ask about one point and OpenStreetMap answers with every area that encloses it: the quartier, the arrondissement, the postal code, the protected area, the electoral boundary, the low-emission zone.

- "Which district, postal code and protected area is this point in?"
- "Is this address inside the low-emission zone?"
- "Which administrative boundaries contain the Eiffel Tower, from the smallest out to the largest?"
- "Which electoral district would somebody living here vote in?"
- "This building claims postcode 75007 — does OpenStreetMap agree?"

The agent calls `query_features_at`, which moves the map onto the point first so that the search radius is known, then reads both lists the panel fills. How many *nearby* features come back depends on the zoom, so ask for a tighter zoom when the list is unmanageable. The enclosing list does not depend on zoom.

### Catch a boundary that is tagged wrong

The same tool, used the other way round. Sample several points and compare what encloses each one. A boundary drawn in the wrong place shows up as a point that belongs to the wrong district, and a boundary with a gap shows up as a point that belongs to nothing at all.

- "Check these four corners of the park and tell me whether they all fall in the same arrondissement."
- "Walk along this street sampling every hundred metres and tell me where the postal code changes."
- "Is there any point near here that falls outside every administrative boundary?"

### Review what changed around here

The changeset list follows the map, so it always describes the area you are looking at. Each entry carries the mapper, the comment they wrote, the counts of objects created, modified and deleted, and the rectangle the change touched.

- "What changed in the area on screen in the last day, and by whom?"
- "Show me the recent edits around Auckland."
- "Who has been editing this neighbourhood most often lately?"
- "List the changesets here that deleted anything."
- "Are any of these changesets from a mapper with very few edits?"

The agent calls `show_recent_changes`, optionally with a latitude and a longitude to look somewhere else. It moves the map first and lets the site fetch the list for the new view, because composing that request by hand silently returns the worldwide list instead.

### Inspect one changeset closely

- "This changeset created eighty objects — what did it actually do?"
- "Open changeset 187793623 and tell me whether the comment matches the edit."
- "Which editor and which imagery did this mapper use?"
- "Did this changeset touch anything outside the area it claims?"
- "Is this an import? Look at the changeset tags."

`show_changeset` reads the comment, the changeset tags naming the editor and the imagery, and the objects touched. The panel lists those objects a page at a time, so the tool also returns the section headings, which carry the true totals — `Nodes 1-20 of 67` means what it says.

### Spot a change worth a second look

A rectangle far wider than the edit itself usually means the mapper moved something a long way, or edited two unrelated places in one changeset. Both are worth checking.

- "Any changeset here whose rectangle spans more than a few kilometres?"
- "Compare each changeset's rectangle against its object count and tell me which look odd."
- "Find the changesets here with an empty or unhelpful comment."

### Find broken roads with routing

For a mapper, routing is a test of the road network rather than a way to get somewhere. A route that detours absurdly, or that comes back far shorter than it should, usually means a way is not connected, is tagged one-way by mistake, or carries an access restriction that should not be there.

- "Route from here to there by car and tell me whether the distance looks sensible."
- "Compare the car, bicycle and foot routes between these two points — do they diverge in a way that suggests bad access tagging?"
- "I just connected this new path. Does a walking route use it?"
- "This route detours two kilometres — find me the junction where it turns away."

`get_directions` takes coordinates for both ends, a mode of `car`, `bicycle` or `foot`, and optionally one of the three routing providers the site has wired up. **Read the distance before you believe the route**: the engine snaps each point to the nearest routable road rather than refusing, so a walk asked for from Paris to New York comes back as an 1812 kilometre route that stops at the coast.

### Look a place up

- "Find the Eiffel Tower and tell me which OpenStreetMap object it is."
- "What is the object identifier for 11 Route du Pontel, Jouars-Pontchartrain?"
- "Give me the coordinates of this station."
- "Search for this village and move the map there."

`search_places` runs the site's own search and moves the map onto the best match. Results carry the full name from the place out to the country, so `Eiffel Tower` returns both the tower in Paris and a mountain peak in Alberta, and the agent can tell you which is which.

### Move the map so you can see what you are asking about

- "Move the map to this changeset's rectangle."
- "Zoom to this feature so I can see it."
- "Take me to 48.8584, 2.2945 at zoom 18."

`set_map_view` takes either coordinates with an optional zoom, or a rectangle, in which case it picks the closest zoom that fits. It is worth asking for on its own, because everything you look at afterwards follows the map.

### Work against your own files at the same time

The agent has this site through these tools and your own files through its own tools, so it can hold both at once. This is where the adapter earns its place over a plain data download.

- "Read my list of shop addresses and tell me which ones OpenStreetMap already knows about."
- "For each row in this spreadsheet, look the place up and add its OpenStreetMap object identifier."
- "Here is a survey list from last week. For each entry, open it in OpenStreetMap and tell me whether somebody has already fixed it."
- "Compare the opening hours in this file against the ones tagged on the map, and list the differences."
- "Write me a Markdown table of these five features with their tags, so I can review them offline."

### Multi-step questions worth asking

These are the ones that actually need an agent rather than a lookup, because each step depends on the answer to the last.

- "Find the primary school nearest this point, tell me which arrondissement it is in, and say when it was last edited and by whom."
- "Show me what changed here this week, open the largest changeset, and tell me whether anything it deleted looks like a mistake."
- "Search for this restaurant, read its tags, then check whether the postal code it claims matches the boundary it actually sits in."
- "Route from this station to this museum on foot, then open the three longest steps and tell me what kind of paths they are."
- "List the recent changesets around here, and for each mapper tell me roughly how much they changed."

## The tools an agent sees

Thirteen. Six read only, and are registered without asking you for anything. Seven change what is on the screen, and stay withheld until you opt in for this origin.

| Tool | Class | What it does |
| --- | --- | --- |
| `get_map_view` | reads | Where the map is centred, its zoom, and which panel is open |
| `get_selected_feature` | reads | Every tag on the object open in the panel, with its version, mapper and changeset |
| `list_queried_features` | reads | Both lists of the Query Features panel: nearby, and enclosing |
| `list_recent_changesets` | reads | The changeset list, with author, comment, counts and rectangle |
| `get_changeset` | reads | One changeset: its comment, its tags, and the objects it touched |
| `list_search_results` | reads | The search results, with coordinates and object identity |
| `set_map_view` | acts | Moves the map to a point, or to the closest zoom that fits a rectangle |
| `search_places` | acts | Runs the site's search and moves the map onto the best match |
| `show_feature` | acts | Opens one node, way or relation and reads it |
| `query_features_at` | acts | Asks what is at a point, and what contains it |
| `show_recent_changes` | acts | Opens the changeset list for an area |
| `show_changeset` | acts | Opens one changeset and reads it |
| `get_directions` | acts | Works out a route and reads back the distance, the time and the turns |

Every acting tool goes through the site's own client-side router, so nothing here reloads the page or reaches the network on its own.

## The three things to understand about this page

**The search is a geocoder, not a place finder.** It finds a place by name or by address. It does not find every bakery in a district: searching `boulangerie Paris 11` returns one bakery thirty kilometres outside Paris, because the search read `11` as a house number. If you want everything of a kind in an area, this site is the wrong tool and the Overpass application programming interface is the right one.

**An empty list is not always an empty answer.** The Query Features panel fills its two lists after the panel itself appears, and the search panel fills its results after its own box appears. Both lists from Query Features carry `stillLoading`, and a list that is empty while `stillLoading` is true means the answer has not arrived, never that there is nothing there.

**Routing never refuses.** Both ends of a route are snapped to the nearest routable road, so an impossible request comes back as a plausible-looking route to somewhere else entirely. Compare the distance against what you expected.

## What this adapter is not for

**Editing the map.** There are no tools here that change anything in OpenStreetMap, and there will not be. The OpenStreetMap community decides what an automated edit may do, and this adapter does not ask them. Notes and note comments are left out for the same reason.

**Bulk data.** These tools read one panel at a time, from a browser a person is using. For anything at scale, download the data instead — the site's own Export panel names Overpass, Planet OSM, and Geofabrik.

## The content here is written by strangers

Every tag value, changeset comment, and mapper name in a result was typed by somebody in the world, not by you and not by the site operator. It reaches an agent wrapped in the untrusted content frame every WebMCP Everywhere tool uses, and it is data to be reported rather than instructions to be followed. While this adapter was being written, the top entry of the changeset list for Auckland was an advertisement for a carpet cleaning business.

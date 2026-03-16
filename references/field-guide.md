# Field Guide — How WISE Profiles Work

This explains the WISE profile schema in plain English. For the formal definition see `schema.cue`. For the full annotated example see `guide.md § Profile Schema`.

## The Core Idea

A WISE profile is a tree of **selectors**. Each selector is like a **contextual prompt** — it follows the same pattern an AI uses when reasoning about a task:

```
Context  →  Constraint  →  Task  →  Output
"when"      "scope"       "do"     "produce"
```

| Prompt element | Selector field | What it means |
|---|---|---|
| **Context** | `context` | "When am I active?" — URL pattern, element exists, text on page, table headers present |
| **Constraint** | `parents`, `selector`, `multiple` | "What's my scope?" — who must run before me, what DOM region am I inside, do I repeat? |
| **Task** | `interaction` | "What do I do?" — click, select, scroll, wait, reveal — in order, before extracting |
| **Output** | `extract` | "What do I produce?" — text, attribute, HTML, link, table rows, or AI-generated fields |

A selector only fires when its **context** matches. It scopes to its **constraint**, performs its **task** (interactions), then produces its **output** (extractions). Its output becomes available to child selectors and ultimately to the JSONL file.

## Profile Structure (top-down)

### Deployment (the whole profile)

```
name → resources[] → outputs[]
```

- **`name`** — human label for this scraping job
- **`resources`** — list of independent scraping units (think: one per site section or data source)
- **`ai_generate`** — optional: let an AI draft the profile from a high-level goal
- **`hooks`** / **`schedule`** — global lifecycle hooks and scheduling (rarely needed)

### Resource (one scraping unit)

```
entry → selectors[] → outputs[]
```

- **`entry`** — where to start: a URL + the name of the root selector
- **`selectors`** — the tree of contextual prompts (see above)
- **`globals`** — shared settings: timeout, retries, user agent
- **`inputs`** / **`outputs`** — named artifacts for chaining between resources

### Selector (one contextual prompt)

This is the heart of WISE. Each selector answers five questions:

1. **Who am I?** → `name`, `type`
2. **When do I fire?** → `context` (URL pattern, element existence, text match, table headers)
3. **What's my scope?** → `parents` (who runs before me), `selector` (CSS scope), `multiple` (repeat per match?)
4. **What do I do?** → `interaction[]` (click, select, scroll, wait, reveal — executed in order)
5. **What do I produce?** → `extract[]` (text, attr, html, link, table, ai — fields written to JSONL)

**Selector types** determine special behavior:

| Type | Behavior |
|---|---|
| `element` | Default — scope a region, extract, or hold children |
| `element-click` | Like element but clicks to reveal content first |
| `pagination` | Navigates pages (next button, numeric links, infinite scroll) |
| `matrix` | Expands cartesian combinations (filter × search × category) |
| `table` | Header-based table extraction (maps columns by header text) |
| `ai` | Calls an AI adapter for semantic extraction |

### Context (when does this selector fire?)

Context is a set of **observable checks** on the current page state. All specified checks must pass.

- **`url`** / **`url_pattern`** — current URL matches exactly or as a pattern
- **`selector_exists`** — a CSS selector is present in the DOM
- **`text_in_page`** — specific text appears on the page
- **`table_headers`** — a table contains these header texts

Think of context as the **precondition**: "I'm on the right page, the right element exists, and the page is in the right state."

### Interaction (what does this selector do?)

An ordered list of browser actions executed **before** extraction. Each step is deterministic and compiled to a browser primitive.

| Action | What it does | Key fields |
|---|---|---|
| **click** | Click a button, link, or header | `target` (CSS/text/role), `click_action_type` (real vs scripted) |
| **select** | Pick a dropdown value | `target`, `value` |
| **scroll** | Scroll the page | `direction`, `amount_px` |
| **wait** | Pause for a condition | `ms`, `network_idle`, `selector` (wait for element) |
| **reveal** | Show hidden content | `target`, `mode` (click or hover) |

Interactions transform the page state so that the extraction step finds the right data.

### Extraction (what does this selector produce?)

Fields to read from the DOM once interactions are complete. Each extraction rule produces a named field in the JSONL output.

| Type | What it reads | Key fields |
|---|---|---|
| **text** | `.textContent.trim()` | `selector` |
| **attr** | `.getAttribute(attr)` | `selector`, `attr` |
| **html** | `.innerHTML` | `selector` |
| **link** | `.getAttribute('href')` | `selector`, `attr?` |
| **table** | Header-mapped row objects | `selector`, `columns?`, `header_row?` |
| **ai** | AI-generated structured data | `prompt` |

**Tables:** always prefer header-based column mapping over positional index. The `columns` field maps header text to output field names.

### Pagination (how to traverse pages)

A selector with `type: pagination` automatically iterates through pages.

- **`pagination_type`**: `next` (click next button), `numeric` (click page numbers), `infinite` (scroll to load)
- **`selector`**: CSS selector for the navigation element
- **`page_limit`**: max pages to visit
- **`stop_condition`**: CSS selector that signals no more pages (infinite only)

### Matrix (cartesian combinations)

A selector with `type: matrix` enumerates all combinations of filter/search axes.

- **`axes[]`**: each axis is an action (`select`, `type`, `checkbox`) + `selector` + `values`
- **`auto_discover`**: if true, discovers dropdown options from the live DOM
- The runner executes every combination and collects results

### Hooks (per-selector)

In addition to global hooks (per-resource), selectors can declare their own hooks:

- **`hooks.pre_extract`** — runs before this selector extracts (e.g., inject auth token)
- **`hooks.post_extract`** — runs after this selector extracts (e.g., AI normalization on just this selector's output)

Per-selector hooks fire only when that specific selector produces output. Use them when only one part of the pipeline needs enrichment. See `guide.md § Hook System` for details.

### Artifacts (named intermediate outputs)

Artifacts are the **named, typed outputs** of a scraping pipeline. They form a **hierarchy** — each artifact can declare a parent, creating a DAG that the runner resolves and executes in dependency order.

- **`artifacts[]`** — declared at the deployment level, defines the pipeline's output structure
- **`name`** — unique identifier (referenced by resources via `inputs` / `outputs`)
- **`type`** — `urls`, `jsonl`, `json`, `csv`, `markdown`, `html`, `custom`
- **`parent`** — optional parent artifact name (creates dependency: this artifact requires the parent to be produced first)
- **`description`** — human-readable purpose

**How artifacts chain resources:**

- A resource's **`outputs`** declares which artifact it produces and from which selector: `{ artifact: "name", from: "selector_name", format: "jsonl" }`
- A resource's **`inputs`** binds a named artifact: `{ name: "urls", artifact: "discovered_urls" }`
- **`entry.url`** can reference an artifact instead of a literal URL: `{ artifact: "discovered_urls" }`

**Flat pipeline** (one artifact): resource extracts rows → produces a single JSONL artifact.

**Hierarchical pipeline** (multiple artifacts): resource 1 discovers URLs → resource 2 extracts pages → resource 3 assembles markdown. Each step produces a named artifact that feeds the next.

See `guide.md § Named Artifacts` for worked examples with both patterns.

## The Selector Tree

Selectors form a **tree** via `parents[]`. The engine walks this tree top-down:

```
root (entry point)
├── pages (pagination — iterates pages)
│   └── rows (multiple: true — iterates table rows)
│       └── extract: [product, price, ...]
└── sidebar (separate branch — extracts metadata)
```

- **`parents`** is explicit — you declare who a selector's parent is
- **Children are inferred** — the engine automatically walks all selectors that list a given parent
- Each selector fires only when its context matches the current page state
- The tree determines execution order: parent runs first, then children

This is why the framework is powerful: each selector is a self-contained contextual prompt that knows when to fire, what to do, and what to produce — and the tree connects them into a coherent scraping workflow.

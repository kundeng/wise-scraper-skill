# WISE Usage Guide

Read this after SKILL.md. This is the essential reference — it gives you the big picture, then the schema, extraction rules, hooks, config, and CLI.

## Big Picture

You are building a **working scraping project** for a JS-rendered site. Here is what's shipped and how the pieces fit:

```
YAML profile  ──→  Runner  ──→  Browser  ──→  JSONL output  ──→  Assembly
  (what)          (how)       (where)       (intermediate)      (final)
```

**Profile** — a declarative YAML file that describes *what* to scrape: which URLs, which selectors, what interactions (click, scroll, wait), what to extract, how to paginate. You build this by assembling composable template fragments from `templates/*.yaml`.

**Runner** — interprets the profile and drives a browser. The shipped runner (`references/runner/`) uses `agent-browser`. Alternative runners (Crawlee, Scrapy+Playwright) interpret the same profile with a different backend — see `references/comparisons.md` if the user prefers a different runtime (Tier 4).

**Templates** — composable fragments in `templates/*.yaml`. They are **not** a menu to pick from. Combine pieces: pagination + table-extract + sort-verify + interaction, etc. Scan them during orientation.

**Hooks** — 5 extension points (post_discover, pre_extract, post_extract, pre_assemble, post_assemble) for site-specific logic the profile can't express declaratively.

**JSONL** — the intermediate output format. One JSON object per line. Assembly into markdown/CSV/JSON is a separate step.

### Decisions you need to make

1. **Runtime** — shipped `agent-browser` runner (default) or alternative (Crawlee/Scrapy)? Infer from user context or ask.
2. **Tier** — can the target be handled declaratively (Tier 1), or does it need adapted runner code (Tier 2), bespoke code (Tier 3), or an alternative runtime (Tier 4)?
3. **AI adapter** — is AI needed for semantic extraction, or are selectors + hooks sufficient?
4. **Hooks** — does the site need custom logic at any of the 5 hook points?

### What to read when

| You need to... | Read |
|---|---|
| Understand profile fields | `references/field-guide.md` (plain English) or § Profile Schema below |
| See the formal schema | `references/schema.cue` |
| See template fragments | `templates/*.yaml` |
| Add AI extraction | `references/ai-adapter.md` |
| Compare runtimes | `references/comparisons.md` |
| See worked examples | `examples/overview.md` |

---

## Profile Schema

A profile is a declarative YAML file. The canonical schema is `references/schema.cue`; the TypeScript mirror is `references/runner/src/types.ts`. See `references/field-guide.md` for plain-English field descriptions.

### Full Schema Structure

```yaml
name: my-scrape-job
resources:
  - name: product_data
    entry:
      url: https://example.com/products
      root: root
    globals:
      timeout_ms: 20000
      retries: 2
    selectors:
      - name: root
        parents: []
        context:
          url_pattern: example.com/products
          selector_exists: table
        interaction:
          - type: click
            target:
              css: th.sort-price
            click_action_type: real
          - type: wait
            network_idle: true
      - name: pages
        type: pagination
        parents: [root]
        context:
          selector_exists: "a.next-page"
        pagination:
          pagination_type: numeric
          selector: "a.page-link"
          page_limit: 5
      - name: rows
        type: element
        parents: [pages]
        context:
          selector_exists: "table tbody tr"
        selector: "table tbody tr"
        multiple: true
        extract:
          - type: text
            name: product
            selector: td.name
          - type: text
            name: price
            selector: td.price
    outputs:
      - artifact: product_data
        from: rows
```

### Schema Rules

- **`parents` is explicit; children are inferred.** The engine walks children of each selector automatically.
- **`multiple: true`** emits one record per matching element (rows in a table, items in a list).
- **`interaction`** is an ordered list of steps executed before extraction (click, select, scroll, wait, reveal).
- **`context`** gates a selector: it only fires when URL pattern, selector existence, or text conditions match.
- **`matrix`** enumerates cartesian products of axes (select/type/checkbox) for search-combo scenarios.
- **Artifacts** chain resources: one resource's output feeds another's entry URL.

### Selector Types

| Type | Purpose |
|---|---|
| `element` | Default. Scope a region for extraction or child selectors. |
| `element-click` | Like element but triggers click interaction. |
| `pagination` | Handles page navigation (next/numeric/infinite). |
| `matrix` | Expands cartesian axis combinations. |
| `text`, `link`, `html`, `attribute` | Shorthand extraction types. |
| `table` | Header-based table extraction. |
| `ai` | Placeholder for AI-assisted extraction. |

### Interaction Types

| Type | Key Fields | Notes |
|---|---|---|
| `click` | `target` (Locator), `click_action_type` | `real` (browser click) or `scripted` (JS .click()) |
| `select` | `target`, `value` | `<select>` dropdown |
| `scroll` | `direction`, `amount_px` | Infinite scroll support |
| `wait` | `ms`, `network_idle`, `selector` | Wait for condition |
| `reveal` | `target`, `mode` | Click or hover to reveal hidden content |

### Extraction Types

| Type | Fields | Output |
|---|---|---|
| `text` | `selector` | `.textContent.trim()` |
| `attr` | `selector`, `attr` | `.getAttribute(attr)` |
| `html` | `selector` | `.innerHTML` |
| `link` | `selector`, `attr?` | `.getAttribute('href')` by default |
| `table` | `selector`, `columns?`, `header_row?` | Array of row objects (header-mapped) |
| `ai` | `prompt` | Placeholder — not yet implemented natively |

### Pagination

```yaml
pagination:
  pagination_type: next | numeric | infinite
  selector: "a.next-page"
  page_limit: 10
  start_page: 1
  stop_condition: ".no-more-results"   # infinite only
```

### Matrix

```yaml
matrix:
  auto_discover: true
  axes:
    - action: select
      selector: "#brand-filter"
      values: auto              # discovers options from DOM
    - action: type
      selector: "#search-input"
      values: [yasaka, donic, joola]
```

## Extraction Rules

- **DOM eval for live-page extraction.** The runner evaluates JavaScript in the browser context via `agent-browser eval -b <base64>`. Do not use HTML parsing libraries for extracting data from the live page.
- **Post-extraction processing is fine.** Once HTML is captured in JSONL, use `cheerio` and `turndown` for transformation, cleanup, and assembly.
- **Header-based mapping for tables.** Map columns by header text, not index. Rank/index columns often occupy position 0.
- **Sort verification required** after sort interactions — verify via DOM eval or context check before proceeding.

## Exploration with agent-browser

`agent-browser` is used for both interactive exploration and deterministic execution.

```bash
agent-browser open "https://example.com" --wait networkidle
agent-browser eval "document.querySelector('article')?.tagName"
agent-browser eval -b <base64-encoded-js>    # cross-platform safe
agent-browser click "css=button.next"
agent-browser snapshot --json
agent-browser close
```

**Rule: show exploration evidence before writing any profile.** Evidence means selector output, DOM structure, or snapshots that prove selectors work.

## Hook System

Hooks allow site-specific customization at 5 points:

| Hook Point | When | Use For |
|---|---|---|
| `post_discover` | After URL list is built | Filtering, reordering, manual URL injection |
| `pre_extract` | Before opening a page | Authentication, cookie injection, rate limiting |
| `post_extract` | After raw data captured | AI enrichment, content classification, quality checks |
| `pre_assemble` | Before final assembly | Cross-page link resolution, TOC generation |
| `post_assemble` | After output is built | Format conversion, publishing, validation |

### Register via module

```typescript
import type { HookRegistry } from "./hooks.js";

export function registerHooks(registry: HookRegistry) {
  registry.register("post_extract", (record) => {
    record.data.custom_field = "enriched";
    return record;
  }, "my-enrichment");
}
```

### Register via profile config

```yaml
hooks:
  post_extract:
    - name: my_module.enrich_record
      config:
        model: gpt-4
```

## Config Composition

The runner supports Hydra-like config composition via `convict` + `deepmerge`.

Resolution order (later wins):
1. Schema defaults (convict)
2. Base profile YAML
3. Override YAML files (`--config extra.yaml`)
4. Environment variables (`WISE_*`)
5. CLI `--set key=value`

### Example

```bash
# Base profile declares inputs.queries: []
# Override at runtime:
node dist/run.js profile.yaml --set inputs.queries=[yasaka,donic,joola]

# Merge extra config on top:
node dist/run.js profile.yaml --config prod-overrides.yaml

# Environment variable:
WISE_OUTPUT_DIR=./results node dist/run.js profile.yaml
```

## JSONL Intermediate Format

Every run produces JSONL — one JSON object per line:

```json
{
  "selector": "rows",
  "url": "https://example.com/products?p=1",
  "data": {
    "product": "Widget Pro",
    "price": "$29.99"
  },
  "extracted_at": "2026-03-15T17:00:00.000Z"
}
```

JSONL is streamable, appendable, and allows resume after failure. The `data` field contains whatever the profile's `extract` rules captured. Assembly into final formats (markdown, CSV, JSON) is a separate post-processing step.

## Runner CLI Reference

```
node dist/run.js <profile.yaml> [options]

Options:
  --output-dir, -o    Output directory (default: ./output)
  --output-format     jsonl | csv | json | markdown | md
  --hooks             Path to hooks module (.js)
  --set, -s           Override: --set key=value
  --config, -c        Extra config file to merge: --config extra.yaml
  --verbose, -v       Verbose logging
  --dry-run           Parse and validate without executing
  --timeout           Browser timeout in ms (default: 60000)
  --retries           Browser retry count (default: 2)
  --concurrency       Max browser sessions (default: 1)
```

---

For competitive positioning (vs Crawlee, vs Scrapy+Playwright) and alternative runner backend designs, see `references/comparisons.md`.

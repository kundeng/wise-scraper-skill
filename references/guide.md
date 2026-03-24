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

**Hooks** — 5 extension points (post_discover, pre_extract, post_extract, pre_assemble, post_assemble) for site-specific logic the profile can't express declaratively. Hooks can be global (per-resource) or per-selector.

**JSONL** — the intermediate output format. One JSON object per line. Assembly into markdown/CSV/JSON is a separate step.

### Decisions you need to make

1. **Runtime** — shipped `agent-browser` runner (default) or alternative (Crawlee/Scrapy)? Infer from user context or ask.
2. **Tier** — can the target be handled declaratively (Tier 1), or does it need adapted runner code (Tier 2), bespoke code (Tier 3), or an alternative runtime (Tier 4)?
3. **AI adapter** — is AI needed for semantic extraction, or are selectors + hooks sufficient?
4. **Hooks** — does the site need custom logic at any of the 5 hook points?

### What to read when

| You need to... | Read |
|---|---|
| Understand the selector framework | `references/field-guide.md` (intuitive conceptual guide) |
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

For detailed explanations of every field (selectors, context, interaction, extraction, pagination, matrix, artifacts), see `references/field-guide.md`. For the formal CUE schema, see `references/schema.cue`.

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

Hooks allow site-specific customization. They run at two levels:

### Global hooks (per-resource)

Declared at the resource or deployment level. Fire for every page/record in the resource.

| Hook Point | When | Use For |
|---|---|---|
| `post_discover` | After URL list is built | Filtering, reordering, manual URL injection |
| `pre_extract` | Before opening a page | Authentication, cookie injection, rate limiting |
| `post_extract` | After raw data captured | AI enrichment, content classification, quality checks |
| `pre_assemble` | Before final assembly | Cross-page link resolution, TOC generation |
| `post_assemble` | After output is built | Format conversion, publishing, validation |

### Per-selector hooks

Declared on a specific selector. Fire only when that selector produces output.

```yaml
selectors:
  - name: rows
    multiple: true
    extract: [...]
    hooks:
      pre_extract:
        - name: auth.inject_token
      post_extract:
        - name: ai_adapter.normalize_review
          config:
            schema: { reviewer: string, pros: string[], cons: string[] }
```

Use per-selector hooks when: only one selector needs enrichment/transformation, and you don't want the hook to fire for every page.

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

## Named Artifacts

Artifacts are the **named intermediate outputs** of a scraping pipeline. They form a hierarchy so you can build multi-step workflows where each step produces a named, typed, reusable result.

### Why artifacts?

Without named artifacts, multi-step pipelines are implicit — the custom runner code decides what to save, where, and in what format. With named artifacts, the profile declares the pipeline structure and the runner can orchestrate it automatically.

### Schema

```yaml
artifacts:
  - name: discovered_urls    # unique name
    type: urls               # urls | jsonl | json | csv | markdown | html | custom
    description: "TOC links from left nav"
  - name: raw_pages
    type: jsonl
    parent: discovered_urls  # forms hierarchy: raw_pages depends on discovered_urls
  - name: assembled_doc
    type: markdown
    parent: raw_pages
```

### Example: Revspin (flat — one artifact)

```
revspin_durable.yaml
  └── resource: revspin_rubber_durable
        └── artifact: rubber_data (jsonl)
              produced by: rows selector (multiple: true, 200 records)
```

```yaml
# Simple: one resource, one output artifact
artifacts:
  - name: rubber_data
    type: jsonl

resources:
  - name: revspin_rubber_durable
    outputs:
      - artifact: rubber_data
        from: rows
```

### Example: Splunk ITSI (hierarchical — three artifacts)

The splunk-itsi scraper has a natural three-step pipeline. Without named artifacts, this required a custom `run.mjs`. With artifacts, the profile can declare it:

```
splunk-itsi-admin.yaml
  └── artifact: discovered_urls (urls)
        └── artifact: raw_pages (jsonl)
              └── artifact: assembled_doc (markdown)
```

```yaml
artifacts:
  - name: discovered_urls
    type: urls
    description: "All TOC links from the left nav"
  - name: raw_pages
    type: jsonl
    parent: discovered_urls
    description: "Title + body HTML per page"
  - name: assembled_doc
    type: markdown
    parent: raw_pages
    description: "Single assembled markdown document"

resources:
  - name: discover
    entry:
      url: "https://help.splunk.com/.../about-administering-it-service-intelligence"
      root: toc
    selectors:
      - name: toc
        parents: []
        context:
          selector_exists: "a[href*='/administer/4.21/']"
        selector: "a[href*='/administer/4.21/']"
        multiple: true
        extract:
          - type: link
            name: url
            selector: "a[href*='/administer/4.21/']"
    outputs:
      - artifact: discovered_urls
        from: toc
        format: urls

  - name: extract_pages
    entry:
      url: { artifact: discovered_urls }   # consumes the URL list
      root: page
    inputs:
      - name: urls
        artifact: discovered_urls
    selectors:
      - name: page
        parents: []
        context:
          selector_exists: "article[role='article']"
        extract:
          - type: text
            name: title
            selector: "h1.title"
          - type: html
            name: body
            selector: ".body"
    outputs:
      - artifact: raw_pages
        from: page
        format: jsonl

  - name: assemble
    inputs:
      - name: pages
        artifact: raw_pages
    outputs:
      - artifact: assembled_doc
        format: markdown
    hooks:
      pre_assemble:
        - name: processing.html_to_markdown
        - name: processing.build_toc
```

### How artifacts chain

```
discover  →  discovered_urls (urls)
                    ↓
extract_pages  →  raw_pages (jsonl)    ← entry.url reads from discovered_urls
                    ↓
assemble  →  assembled_doc (markdown)  ← reads from raw_pages, hooks transform
```

Each resource declares what it **consumes** (`inputs`) and what it **produces** (`outputs`). The runner resolves the DAG and executes resources in dependency order.

## Config Composition

The runner supports Hydra-like config composition via `convict` + `deepmerge`.

Resolution order (later wins):
0. Canonical config (`wise.config.yaml` or `.wiserc.yaml` — auto-loaded if present in cwd)
1. Schema defaults (convict)
2. Base profile YAML
3. Override YAML files (`--config extra.yaml`)
4. Environment variables (`WISE_*`)
5. CLI `--set key=value`

### Canonical config auto-load

If a `wise.config.yaml` or `.wiserc.yaml` exists in the working directory, the runner loads it automatically as the base config. This is useful for project-level defaults (output dir, timeout, verbosity) shared across multiple profiles.

```yaml
# wise.config.yaml — project-level defaults
outputDir: ./output
verbose: true
timeout: 30000
retries: 3
```

### Example

```bash
# Auto-loads wise.config.yaml if present, then merges profile on top:
node dist/run.js profile.yaml

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

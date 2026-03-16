# WISE Usage Guide

Detailed reference for the WISE (Web Info Structured Extraction) skill. Start with SKILL.md for the workflow and agent contract; come here for schema details, runner internals, and worked patterns.

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

## Competitive Positioning

### vs Crawlee

[Crawlee](https://crawlee.dev/) is a TypeScript/Node.js web scraping framework with Playwright/Puppeteer/Cheerio backends, request queues, auto-scaling, and proxy rotation. It's a production-grade crawling library.

| Dimension | Crawlee | WISE |
|---|---|---|
| **Nature** | Library you import and code against | Skill that teaches an AI agent to build a scraper |
| **Extraction** | You write JS/TS handlers per route | Declarative YAML profiles interpreted by a runner |
| **Browser** | Built-in Playwright/Puppeteer launcher | `agent-browser` — shared with agent exploration |
| **Scaling** | Built-in concurrency, proxy, queue | Single-session; agent adds concurrency if needed |
| **AI agent fit** | Agent must learn the Crawlee API | Agent reads profile schema, assembles fragments |
| **When better** | High-volume production crawls, proxy rotation, Apify platform integration | Agent-driven repeatable scraping projects, declarative profiles, explore→exploit workflow |

Crawlee is a strong alternative runner backend — see **Alternative Runner Backends** below.

### vs Scrapy + scrapy-playwright

[Scrapy](https://scrapy.org/) is Python's dominant scraping framework. [scrapy-playwright](https://github.com/scrapy-plugins/scrapy-playwright) adds Playwright rendering to Scrapy spiders, giving JS-rendered page support.

| Dimension | Scrapy + scrapy-playwright | WISE |
|---|---|---|
| **Language** | Python | TypeScript (runner), YAML (profiles) |
| **Extraction** | Python spider classes, CSS/XPath selectors | Declarative YAML profiles with DOM eval |
| **JS rendering** | Via scrapy-playwright download handler | Via `agent-browser` CLI |
| **Middleware** | Rich ecosystem (proxies, throttle, pipelines) | Hook system (5 extension points) |
| **AI agent fit** | Agent writes Python spider code | Agent assembles YAML profile fragments |
| **When better** | Large-scale Python pipelines, existing Scrapy infrastructure, deep middleware ecosystem | Agent-driven projects, declarative-first extraction, TypeScript ecosystem |

Scrapy + scrapy-playwright is a strong alternative runner backend — see below.

### When to use what

- **Crawlee**: you want a TypeScript crawling library with production infra (queues, proxies, auto-scaling)
- **Scrapy + scrapy-playwright**: you want Python's most mature scraping framework with JS rendering
- **WISE**: you want an AI coding agent to build a repeatable scraping project using declarative profiles and an explore→exploit workflow

All three can coexist — WISE profiles can target Crawlee or Scrapy backends instead of the shipped `agent-browser` runner.

## Alternative Runner Backends

The shipped runner uses `agent-browser` as the browser layer, but the profile schema is runner-agnostic. An agent can implement the same YAML profile interpretation using a different backend:

### Crawlee runner

A Crawlee-based runner would:
1. Read the same YAML profile
2. Use `PlaywrightCrawler` instead of `agent-browser` for page loading
3. Map `selectors[].interaction` to Playwright page actions
4. Map `selectors[].extract` to `page.evaluate()` calls
5. Use Crawlee's `RequestQueue` for pagination and multi-resource discovery
6. Gain: auto-retry, proxy rotation, session management, Apify deployment

```
references/runner-crawlee/     # Crawlee-based runner (same profile schema)
  src/
    crawler.ts                 # PlaywrightCrawler setup
    profile-adapter.ts         # YAML profile → Crawlee router/handler mapping
    extract.ts                 # DOM eval via page.evaluate()
    run.ts                     # CLI entry point
```

### Scrapy + scrapy-playwright runner

A Scrapy-based runner would:
1. Read the same YAML profile
2. Generate a Scrapy spider dynamically from the profile
3. Use `scrapy-playwright` for JS rendering
4. Map `selectors[].extract` to `page.evaluate()` in Playwright pages
5. Use Scrapy's item pipelines for JSONL output
6. Gain: Scrapy middleware ecosystem, distributed crawling (Scrapyd/Zyte), Python data pipeline integration

```
references/runner-scrapy/      # Scrapy-based runner (same profile schema)
  spiders/
    profile_spider.py          # Dynamic spider generated from YAML profile
  pipelines.py                 # JSONL output pipeline
  settings.py                  # scrapy-playwright config
  run.py                       # CLI entry point
```

### Profile compatibility

The key insight: **the YAML profile is the contract, not the runner**. All runners interpret the same schema fields (`resources`, `selectors`, `interaction`, `extract`, `pagination`, `matrix`). The agent picks the runner backend based on the project's requirements:

| Need | Runner |
|---|---|
| Quick exploration + exploit | `agent-browser` runner (shipped) |
| Production volume + proxies | Crawlee runner |
| Python ecosystem + pipelines | Scrapy runner |
| Custom / bespoke | Agent writes its own interpreter |

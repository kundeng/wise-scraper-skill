# Lessons Learned: Splunk ITSI Administer Scrape

**Date:** 2026-03-15  
**Target:** https://help.splunk.com/en/splunk-it-service-intelligence/.../administer/4.21/  
**Tool:** agent-browser 0.20.10 + Node.js deterministic runner

## What Worked

1. **agent-browser eval -b (base64)** — the only reliable way to pass JS to eval on Windows. Shell escaping and `--file` paths both break.
2. **Separate title + body extraction** — splitting into two eval calls avoids JSON transport size limits and makes debugging easier.
3. **Post-navigation URL dedup** — section-level URLs (`/overview`, `/permissions`) redirect to child pages. Deduplicating by resolved URL after `open` catches these.
4. **Locale filtering in discovery** — filtering `href.includes('/en/')` eliminates Japanese/other locale duplicates from the TOC nav.
5. **Full article.children extraction** — Splunk help nests content in child `<article class="topic">` elements beyond `.body`. Collecting `outerHTML` of all children (minus h1) captures everything.
6. **HTML → Markdown regex converter** — handles headings, tables, code blocks, lists, links, bold/italic. Good enough for DITA-generated doc sites.

## What Broke / Required Fixes

| Issue | Root Cause | Fix |
|-------|-----------|-----|
| `eval --file` path error | Windows backslashes in path | Use `-b` base64 flag instead |
| First `open` always times out | Cold browser launch + SSL + SPA hydration exceeds 60s | Increase to 90s timeout; retry logic |
| YAML parser treats `1500 # comment` as string | Inline comments not stripped | Strip `\s+#.*$` from unquoted values |
| `.body` selector gets only intro paragraph | DITA nests sections in sibling `<article class="topic">` | Collect all `article.children` except h1 |
| Duplicate pages in output | Section URLs redirect to first child page | Dedup by resolved URL after navigation |
| Code blocks have `PYTHONCopy` prefix | Site's copy-button UI text inside `<pre>` | Need to strip `.copy-btn` before extraction |
| Stray 4-space indentation | DITA source whitespace preserved in HTML | Strip leading `\s{4,}` in markdown cleanup |

## Generic vs Site-Specific

### Generic (reusable across any doc site)
- Discovery: collect all `<a>` hrefs matching a URL pattern
- Locale filtering by URL segment
- Post-navigation URL deduplication
- HTML → Markdown conversion (headings, tables, code, lists, links)
- Polite delay between requests
- Retry with backoff on navigation failure
- Base64 eval for cross-platform shell safety
- JSONL intermediate output format

### Site-Specific (Splunk help)
- Content selector: `article[role="article"]` with nested `article.topic` children
- Title selector: `h1.title`
- Remove selectors: `.cookie-banner`, copy-button overlays
- URL pattern: `/administer/4.21/` segment matching
- The `.body` vs full-article distinction

## Intermediate Output Format

Each page produces a JSONL record:

```json
{
  "seq": 0,
  "url": "https://...",
  "title": "Page Title",
  "body_html": "<div>...</div>",
  "body_md": "# Page Title\n...",
  "body_length": 42907,
  "meta": {
    "discovered_url": "https://... (pre-redirect)",
    "resolved_url": "https://... (post-redirect)",
    "content_selector": "article[role='article']",
    "extracted_at": "2026-03-15T17:32:00.000Z"
  },
  "refs": [
    { "text": "Entity Integrations Manual", "href": "/?resourceId=ITSI_Entity_About", "type": "internal" },
    { "text": "Splexicon:Role", "href": "https://docs.splunk.com/Splexicon:Role", "type": "external" }
  ],
  "error": null
}
```

### Why this format?
- **`refs` array** — enables link graph analysis, broken link detection, cross-reference enrichment
- **Both `body_html` and `body_md`** — HTML for re-processing / AI enrichment, markdown for direct use
- **`meta.discovered_url` vs `meta.resolved_url`** — tracks redirects for dedup debugging
- **`seq`** — preserves TOC ordering for assembly
- **JSONL** — streamable, appendable, one record per line, easy to resume after failure

## Hook Points Identified

1. **post_discover** — after URL list is built, before extraction. Hook for: filtering, reordering, manual URL injection.
2. **pre_extract** — before opening a page. Hook for: authentication, cookie injection, rate limiting.
3. **post_extract** — after raw HTML is captured. Hook for: AI enrichment, content classification, quality checks.
4. **pre_assemble** — after all pages extracted. Hook for: cross-page link resolution, TOC generation, metadata enrichment.
5. **post_assemble** — after final document is built. Hook for: format conversion, publishing, validation.

## Performance Notes

- 89 discoverable pages from entry point
- ~3-5 seconds per page (navigation + extraction)
- ~22KB markdown for 3 unique pages
- Estimated full run: ~7-10 minutes for all 89 pages, ~500KB+ markdown output

---

## Comparison: Revspin (Earlier Test) vs Splunk ITSI (This Test)

| Aspect | Revspin | Splunk ITSI |
|--------|---------|-------------|
| **Runner language** | Python | Node.js |
| **Profile schema** | Full (resources, selectors, interactions, extract, outputs) | Flat (entry, discovery, content, options) |
| **Content parsing** | `agent-browser get html` → BeautifulSoup offline | `agent-browser eval -b` in-browser DOM eval |
| **Discovery** | Pagination selector (numeric pages) | JS eval collecting all nav links |
| **Interactions** | Click column header to re-sort, wait networkidle | None (static doc pages) |
| **Output** | CSV (tabular) | Markdown (assembled document) |
| **Profile interprets** | selectors[], interaction[], pagination{}, extract[] | entry, discovery scope, content container |

### What revspin does better
- **Profile-driven**: the runner interprets the YAML schema generically — selectors, interactions, pagination, extraction are all declared, not hardcoded
- **Schema fidelity**: uses the full CUE-validated schema with `parents`, `multiple`, `context`, `extract`
- **Separation of concerns**: YAML says *what*, runner says *how*

### What Splunk ITSI does better
- **Cross-platform**: base64 eval avoids all shell/path escaping issues
- **In-browser extraction**: DOM eval captures content as the browser sees it (no offline parsing divergence)
- **Deduplication**: handles redirects and locale variants
- **Intermediate format**: JSONL with metadata enables resume and re-processing

### Design tension for SKILL.md rewrite
- Revspin leans toward a **generic profile interpreter** — powerful but assumes the schema can express every scenario
- Splunk ITSI leans toward a **purpose-built script** — flexible but bakes site logic into code
- The skill needs to support **both** without prescribing one over the other
- The revspin runner uses BeautifulSoup (flagged by audit) but its *profile structure* is the right model
- The ITSI runner uses DOM eval (audit-compliant) but its *profile* is too flat to be generic

### Implication
The rewrite should preserve the full declarative schema for complex scenarios (revspin-style) while also supporting simpler flat profiles for doc-site scraping (ITSI-style). The runner should prefer DOM eval but the profile format is the primary deliverable — runners can be swapped.

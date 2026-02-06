# Audit - wise-skill-test artifacts (2026-02-06)

## Files Reviewed
- `/Users/kundeng/Dropbox/Projects/wise-skill-test/revspin_durable.yaml`
- `/Users/kundeng/Dropbox/Projects/wise-skill-test/run_revspin_durable.py`

## Findings
- **DOM eval preference violated:** runner uses `BeautifulSoup` HTML parsing instead of DOM eval for table extraction.
- **Header-based mapping missing:** extraction uses `td.*` selectors per column; no table extraction with header mapping.
- **Durable sort verification missing:** click to durability header exists, but no explicit verification that sort is applied (no context check on header state or column order).
- **Pagination correctness:** pagination selector uses numeric links and runner orders by page number; OK, but implementation depends on HTML parsing.
- **Selectors:** generally scoped; row selector excludes `.head`, but extraction is brittle (class-dependent).

## Required Fixes (in skill guidance/templates)
- Require DOM eval for table extraction, discourage HTML parsing libraries.
- Require header-based mapping (table headers to field names) when extracting tables.
- Require explicit sort verification steps (context checks or DOM eval assertions).

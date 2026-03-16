# Examples Overview

## Tested End-to-End Examples

These examples were run against the shipped generic runner (`references/runner/`):

- **`revspin/`** — Full-schema profile: table extraction with interactions (click to sort), numeric pagination, and multi-row extraction. Produces CSV-style JSONL output. **200 records extracted.**
  - `revspin_durable.yaml` — declarative profile using selectors, interactions, pagination, extract
  - `run_revspin_durable.py` — original Python runner (kept for reference)
  - `revspin_durable_top2pages.csv` — original output from Python runner

- **`splunk-itsi-admin/`** — Multi-page doc site scraper: discovers sub-pages from TOC navigation, extracts article content, assembles into a single markdown document. Custom runner using `agent-browser` for page-level discovery and extraction.
  - `profile.yaml` — flat-format profile (entry, discovery, content)
  - `run.mjs` — custom Node.js runner (pre-dates the generic runner)
  - `output/` — generated markdown and JSONL

## Template Examples

Short, focused YAML snippets aligned to the WISE schema (in `templates/`):

- `pagination.yaml` — next‑button paging
- `matrix.yaml` — search/filter cartesian products
- `chaining.yaml` — artifacts between resources
- `element-click.yaml` — variant clicking patterns
- `table-extract.yaml` — header-based table mapping
- `sort-verify.yaml` — sort interaction with verification
- `ai-extract.yaml` — intent‑only extraction
- `ai-enrich.yaml` — post‑extract AI hook

Use templates as starting points and adapt selectors/contexts to your target site.

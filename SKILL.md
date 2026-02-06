---
name: wise-scraper
description: Use when defining or validating a declarative web-scraping profile with contextual selectors, interactions, pagination/matrix logic, artifacts, or when static HTTP scraping fails or UI selectors are ambiguous.
---

# WISE Scraper

## Overview
Define scraping as **contextual selectors**: *IF/WHEN context matches, THEN apply `interaction` and `extract`.* The profile is declarative, validated by CUE, and compiled into deterministic browser steps.

## When to Use
- JS-rendered sites or 403 blocks break static HTTP scraping
- You need pagination, matrix/filter combos, or chained resources
- UI targets are ambiguous without role/scope
- You want deterministic replays and artifacts

**When NOT to Use**
- A stable public API/export exists
- The data is static and does not require navigation

## Core Rules (Plain English)
- **`parents` is explicit; children are inferred.**
- **`multiple: true`** emits repeated contexts/rows.
- **`interaction`** is declarative steps to complete the current state.
- **`matrix`** enumerates cartesian products of axes.
- **Artifacts** chain resources (outputs → inputs).
- **Exploration evidence required**: show evidence **before** any design or runner output.
- **DOM eval required for tables**: do not use HTML parsing libraries for table extraction.
- **Header-based mapping for tables**: map columns by header text (avoid index-only).
- **Sort verification required** after sort interactions (verify via DOM eval/context).
- **Task-specific runner output required** for every job.

## Quick Reference
- **Schema:** `references/schema.cue`
- **Field guide:** `references/field-guide.md`
- **Templates:** `templates/*.yaml`
- **Examples:** `examples/*.md`

## Implementation
- **Explore first**: use `agent-browser` and show evidence (snapshots, headers, or DOM eval output) **before** design.
- Start with a template in `templates/`, fill in selectors and contexts.
- Validate with CUE before running.
- Prefer role/name/text locators over brittle CSS when possible.

## Generic vs Task‑Specific Code
- **Required:** generate a **task‑specific runner** for each job.
- Prefer **task‑specific configs** whenever the schema can express the behavior.
- A fully generic runner can live in a separate project; do not block on it for task delivery.

## Common Mistakes
- Assuming column 0 is the item name (rank often lives there)
- Clicking by raw text when multiple labels match
- Falling back to static HTTP scraping after 403
- Omitting `multiple` and silently losing rows
- Designing before exploration evidence is shown
- Parsing tables with BeautifulSoup or HTML parsers instead of DOM eval
- Using index-only table mapping (no headers)
- Skipping sort verification after sort interactions

## Rationalization Table
| Excuse | Reality |
|---|---|
| “Requests + BS4 is fine” | 403/JS blocks require a real browser session |
| “Column 0 is the name” | Rank/index often lives in column 0 |
| “Text match is enough” | Ambiguous targets break strict locators |
| “Generic runner is fine” | Task-specific runner output is required |

## Red Flags — Stop and Re‑specify
- “Requests + BS4 is fine after a 403”
- “Text match is enough for clicks”
- “`multiple` doesn’t matter”
- “I can design the config before exploring”
- “I can parse the table HTML instead of DOM eval”
- “Index-based mapping is fine”
- “No need to verify sorting”
- “We can skip a task-specific runner”

## Notes
For full schema and examples, see `references/` and `templates/` in this skill.

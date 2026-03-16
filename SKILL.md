---
name: wise-scraper
description: "Structured web scraping for AI coders: explore first, then exploit with shipped templates, runner, hooks, or task-local code."
---

# WISE Scraper

## Overview

WISE teaches an AI coding agent how to do **structured, repeatable web scraping** for JS-rendered sites in a disciplined way.

The goal is to produce a **working scraping project** for the target site. In most cases that project should start from the shipped WISE assets and then copy, adapt, and extend them as needed:

- YAML templates as the starting exploit shape
- the shipped TypeScript runner as the execution backbone
- reference modules, hooks, helper scripts, and post-processing code copied over and tweaked for the task

The workflow matters because it leads to that project:

```
Explore -> Evidence -> Choose exploit tier -> Exploit -> JSONL intermediate -> Assemble final output
```

This skill covers the full path from interactive exploration to deterministic exploitation:

1. **Explore** - inspect the live site with `agent-browser`, test selectors, and map navigation/state
2. **Evidence** - record DOM observations, selector proof, and interaction proof before designing the exploit
3. **Choose project shape** - prefer shipped templates and the reference runner, then copy/adapt the missing pieces
4. **Exploit** - build the scraping project through declarative profiles, hooks, helper scripts, or task-local code
5. **Process** - keep JSONL as the intermediate truth and assemble markdown, CSV, or JSON later

Use this skill when the agent needs to scrape dynamic sites, paginate, click through UI state, combine filters, or turn page captures into structured, repeatable outputs.

Do **not** use this skill when a stable public API/export already solves the task, or when a one-off static `curl`/HTML parse is clearly enough.

## Agent Contract

The agent's job is to create a **working scraping project** while staying as close as possible to the shipped WISE plumbing.

### Required behavior

1. **Explore first.** Use `agent-browser` to inspect the live DOM, interactions, pagination, and state transitions before designing the exploit path.
2. **Show evidence.** Record selectors, DOM snippets, snapshots, or concrete observations before writing profiles or project code.
3. **Start from shipped assets.** Use the closest templates, runner modules, and reference code before inventing new structure from scratch.
4. **Copy and adapt deliberately.** It is expected that the agent will copy, tweak, and extend the shipped code to fit the target site.
5. **Use DOM eval for live-page extraction.** HTML parsing libraries are for post-extraction processing of captured HTML, not for observing the live rendered page.

### Default project-building order

1. **Tier 1: Shipped templates + shipped runner**
   Use `templates/*.yaml` and `references/runner/` mostly as-is.
2. **Tier 2: Shipped templates + copied/adapted WISE code**
   Copy runner modules, hooks, post-processing, or helper code into the task project and tweak them for the target.
3. **Tier 3: Bespoke project informed by WISE**
   Build a more custom scraper project only when the target cannot be expressed cleanly by adapting the shipped assets.

When escalating tiers, explain why the lower-copy/lower-complexity path is insufficient.

## Architecture Boundary

### What the reference runner is responsible for

- Interpreting declarative YAML profiles
- Driving `agent-browser`
- Performing deterministic DOM-eval extraction
- Handling common patterns like selectors, interactions, pagination, matrix expansion, and post-processing

### What the AI coding agent may do in the final project

- Copy runner modules into a task-local project and tweak them
- Add hook modules and task-local helper scripts
- Add site-specific assembly and cleanup logic
- Add chaining glue between resources or artifacts
- Add AI-assisted extraction or enrichment when deterministic selectors are insufficient
- Build a more custom task-local project if the target exceeds the reference runner's natural boundary

If a capability is not fully native in the runner today, that is acceptable **if the skill teaches the agent how to add it to the project by adapting the shipped code or surrounding it with task-local code**, rather than pretending the runner already does it natively.

## AI Pattern

AI-assisted extraction/enrichment is **optional** and should be introduced only when ordinary DOM extraction, hooks, and post-processing are not enough.

Use an **AI adapter** pattern:

- The runner/project may call a local AI CLI binary during exploit-time
- The adapter should be vendor-neutral at the interface level
- The backend may be `codex`, `claude`, or another compatible CLI available in the environment
- The agent should prefer whichever backend is installed and reliable, with fallbacks when possible

Recommended adapter contract:

- `input`: instructions, page/context payload, and desired output schema
- `output`: structured JSON or markdown that can be validated downstream
- `policy`: only invoke AI when the target requires semantic extraction, fuzzy normalization, or enrichment beyond durable selectors

The skill should not force an AI dependency into every scrape. The agent decides if AI is needed.

## Working Rules

- **Templates first.** Start from the closest `templates/*.yaml` and adapt it before inventing a new structure.
- **Runner first.** Start from `references/runner/`, then copy/adapt modules when the task needs project-local changes.
- **Header-based tables.** Prefer header mapping over positional assumptions.
- **Sort verification required.** After sort interactions, verify the state changed via DOM evidence or explicit checks.
- **Avoid ambiguous clicks.** Scope by CSS/role/context; do not rely on fragile raw-text clicks when multiple matches exist.
- **Keep JSONL as the intermediate truth.** Final markdown/CSV/JSON assembly can happen later.

## Quick Navigation

- `references/schema.cue`: profile schema
- `references/field-guide.md`: plain-English field guide
- `references/ai-adapter.md`: optional exploit-time AI adapter pattern
- `references/runner/src/`: reference runner and extension points
- `templates/*.yaml`: preferred starting points
- `examples/overview.md`: shipped examples and what they demonstrate
- `tests/harness/`: agent-behavior evaluation harness

## How to Decide the Path

- If selectors and interactions are straightforward, stay in Tier 1.
- If the scrape needs custom cleanup, orchestration, auth setup, copied/tweaked modules, or exploit-time AI, move to Tier 2.
- If the target has unusual workflows, heavy statefulness, or needs generated project code, move to Tier 3.

A good WISE outcome is a **working scraping project** that reuses the shipped WISE assets wherever practical, adapts them where necessary, and only goes fully bespoke when justified.

## Common Failure Modes

- Designing the exploit before collecting exploration evidence
- Jumping straight to bespoke code when a template would work
- Treating the runner as either mandatory for everything or useless too early
- Using HTML parsing on the live page instead of DOM eval
- Reaching for AI by default instead of only when selectors/plumbing run out
- Documenting extension paths as built-in runner guarantees

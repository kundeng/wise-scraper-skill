---
name: wise-scraper
description: "Structured web scraping for AI coders: explore, then exploit with shipped templates, runner, and hooks."
---

# WISE Scraper

WISE teaches an AI coding agent **structured, repeatable web scraping** for JS-rendered sites. The goal is a **working scraping project** built from shipped WISE assets.

```
Explore → Evidence → Choose tier → Exploit → JSONL intermediate → Assemble
```

1. **Explore** — inspect the live site with `agent-browser`, test selectors, map navigation
2. **Evidence** — record selector proof and DOM observations before designing the exploit
3. **Choose tier** — prefer shipped plumbing, escalate only when justified
4. **Exploit** — assemble a profile from template fragments, run it, extend with hooks or task-local code
5. **Process** — JSONL is the intermediate truth; assemble markdown/CSV/JSON later

Use when: JS-rendered sites, pagination, UI state, filter combos, structured repeatable output.
Do not use when: a stable API/export exists, or static `curl` is clearly enough.

## Agent Contract

1. **Explore first.** Use `agent-browser` to inspect DOM, interactions, and state before writing any profile.
2. **Show evidence.** Record selectors, DOM snippets, or snapshots before writing project code.
3. **Assemble from fragments.** Templates in `templates/*.yaml` are composable fragments — pick the pieces that match (pagination, matrix, table, interaction, etc.) and combine them into one profile. They are not a menu of alternatives.
4. **Start from shipped assets.** Use the runner and reference modules before inventing new structure.
5. **Copy and adapt deliberately.** Copy, tweak, and extend shipped code to fit the target.
6. **DOM eval for live extraction.** HTML parsing libraries are for post-processing captured HTML only.

### Exploit Tiers

| Tier | When | What |
|---|---|---|
| 1 | Target fits declarative flow | Assemble template fragments + shipped runner |
| 2 | Target needs adaptation | Copy/adapt runner modules, hooks, helpers, or AI adapter into task project |
| 3 | Target exceeds reference boundary | Bespoke project, carrying WISE discipline |

When escalating, explain why the simpler tier is insufficient.

### Runner Boundary

The runner handles: YAML profile interpretation, `agent-browser` driving, DOM-eval extraction, selectors, interactions, pagination, matrix, post-processing.

The agent may extend beyond the runner: hooks, helper scripts, chaining glue, site-specific assembly, AI-assisted extraction. If a capability isn't native in the runner, the agent adds it to the project — the skill teaches how.

### AI Adapter (optional)

Introduce AI only when DOM extraction + hooks + post-processing are insufficient. Use a vendor-neutral CLI adapter (`codex`, `claude`, or another local binary). See `references/ai-adapter.md` for the full pattern.

## Working Rules

- **Assemble from template fragments** — combine pieces, don't pick one template
- **Header-based table mapping** — not positional
- **Sort verification required** — verify state changed after sort interactions
- **Avoid ambiguous clicks** — scope by CSS/role/context
- **JSONL is intermediate truth** — assemble final formats later

## Quick Reference

| Path | Purpose |
|---|---|
| `references/schema.cue` | Profile schema |
| `references/field-guide.md` | Plain-English field guide |
| `references/guide.md` | Full usage guide, config, hooks, CLI |
| `references/ai-adapter.md` | Optional AI adapter pattern |
| `references/runner/src/` | Reference runner source |
| `templates/*.yaml` | Composable profile fragments |
| `examples/overview.md` | Shipped examples |

## Common Failure Modes

- Designing the exploit before collecting exploration evidence
- Jumping to bespoke code when template fragments would work
- Treating the runner as mandatory for everything or useless too early
- Using HTML parsing on the live page instead of DOM eval
- Reaching for AI when selectors and plumbing are sufficient

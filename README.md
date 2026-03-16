# WISE — Web Info Structured Extraction

A universal agent skill that teaches AI coding agents structured, repeatable web scraping, data mining, and content extraction from JS-rendered sites.

Installable to **Codex, Claude Code, OpenCode, Windsurf, Cursor, Cline, Amp**, and other compatible agents via the [Skills CLI](https://skills.sh/).

## Install

```bash
npx skills add kundeng/wise-scraper-skill
```

Or install globally:

```bash
npx skills add kundeng/wise-scraper-skill -g -y
```

## What It Does

WISE guides an AI coding agent through a disciplined scraping workflow:

1. **Explore** — inspect the live site with `agent-browser`, test selectors, map navigation
2. **Evidence** — record DOM observations and selector proof before designing the exploit
3. **Choose exploit tier** — prefer shipped templates/runner, then adapt, then go bespoke
4. **Exploit** — build a working scraping project using YAML profiles, hooks, and runner code
5. **Process** — keep JSONL as the intermediate truth; assemble markdown/CSV/JSON later

The intended deliverable is a **working scraping project** that reuses shipped WISE assets wherever practical.

## Exploit Tiers

| Tier | When | What the agent does |
|---|---|---|
| 1 | Target fits declarative flow | Use `templates/*.yaml` + shipped runner as-is |
| 2 | Target needs adaptation | Copy/adapt runner modules, hooks, helpers into task project |
| 3 | Target exceeds reference boundary | Build bespoke project, carry forward WISE discipline |

## Runner Setup

The reference runner is shipped as TypeScript source in `references/runner/`. To build:

```bash
cd references/runner
npm install
npx tsc
```

Run a profile:

```bash
node dist/run.js <profile.yaml> --output-dir ./output
```

See `references/guide.md` for the full CLI reference, config composition, hook system, and schema details.

## Directory Structure

```
SKILL.md                    # Skill entry point
AGENTS.md                   # Project context for AI agents
README.md                   # This file
references/
  schema.cue                # CUE schema for profile validation
  field-guide.md            # Plain English field descriptions
  guide.md                  # Full usage guide
  ai-adapter.md             # Optional exploit-time AI adapter pattern
  runner/src/               # TypeScript reference runner
templates/                  # Starter YAML profiles
examples/                   # Tested end-to-end examples
  revspin/                  # Interactive table + pagination (200 records)
  splunk-itsi-admin/        # Multi-page doc scraper
tests/harness/              # Multi-agent test harness
docs/                       # Lessons, audits, plans
```

## Templates

Starter profiles in `templates/`:

- `table-extract.yaml` — header-based table mapping
- `pagination.yaml` — next-button paging
- `element-click.yaml` — variant clicking patterns
- `matrix.yaml` — search/filter cartesian products
- `chaining.yaml` — artifacts between resources
- `sort-verify.yaml` — sort interaction with verification
- `ai-extract.yaml` — intent-only extraction
- `ai-enrich.yaml` — post-extract AI hook

## Prerequisites

- **Node.js 18+**
- **agent-browser** — `npm i -g @anthropic-ai/agent-browser && agent-browser install`

## License

MIT

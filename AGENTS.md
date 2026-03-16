# AGENTS.md

## Spec-Driven Development

This project uses spec-driven development. Specs live in `.kiro/specs/`.
For spec implementation, always use a dedicated git branch or worktree per spec.
Read the `spec-driven-dev` skill before modifying any spec files.
Run `/spec-help` for the full command list.

## Required Skills

| Skill | Purpose |
|-------|---------|
| `spec-driven-dev` | Spec lifecycle: requirements → design → tasks → implement loop |
| `agent-browser` | Browser automation backend used by the runner and for exploration |

## Project Context

This is a **Windsurf Cascade skill** — **WISE** (Web Info Structured Extraction). It teaches AI coding agents structured, repeatable web scraping, data mining, and content extraction from JS-rendered sites. While it uses the Windsurf skill format (`SKILL.md`), it is a **universal agent skill** installable via `npx skills add` to Codex, Claude Code, OpenCode, Windsurf, Cursor, Cline, Amp, and other compatible agents.

The intended deliverable is a **working scraping project**. That project should usually start from the shipped WISE templates, runner, and reference modules, then copy/adapt/tweak those assets as needed for the target site.

### Key Conventions

- **TypeScript** for all runner code (`references/runner/src/`)
- **CUE** for profile schema validation (`references/schema.cue`)
- **YAML** for scraping profiles (templates, examples)
- **JSONL** as the intermediate output format
- **DOM eval** for live-page extraction (not HTML parsing libraries)
- **`cheerio` + `turndown`** only for post-extraction processing
- **`convict` + `deepmerge`** for Hydra-like config composition
- The shipped runner/templates are the first project shape; copied/adapted WISE code is the second; more bespoke task-local projects are the third
- AI-assisted extraction is an optional exploit-time adapter pattern, not a mandatory runner-native dependency
- Runner is reference material for the skill, not a standalone npm package

### Directory Layout

```
SKILL.md                    # Skill entry point (must be valid per Windsurf spec)
AGENTS.md                   # This file
references/                 # Schema, guide, and runner source
  runner/src/               # TypeScript runner (browser, engine, hooks, config, processing)
templates/                  # Starter YAML profiles
examples/                   # Tested end-to-end examples (revspin, splunk-itsi-admin)
tests/harness/              # Multi-agent test harness (Codex, Claude Code, OpenCode)
docs/                       # Spec, lessons, audits
.kiro/specs/                # Spec-driven dev specs
```

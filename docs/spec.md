# WISE Scraper Skill — Spec v1

## 1. What This Is

A **Windsurf Cascade skill** that teaches an AI coding agent how to do structured, repeatable web scraping using `agent-browser` as the browser runtime. It ships reference TypeScript code, a declarative YAML profile schema, tested examples, and an evaluation harness for agent behavior.

It is **not** a standalone scraping framework, library, or SaaS product. It is instructions + reference code that an AI coding agent reads on invocation.

The intended outcome is a **working scraping project** for the target site. The preferred path is:

1. explore the target and collect evidence
2. start from shipped templates and the reference runner
3. copy/adapt WISE code into the task project as needed
4. extend with hooks, helper scripts, AI adapters, or more bespoke code only when justified

## 2. SKILL.md Contract

Per [Windsurf docs](https://docs.windsurf.com/windsurf/cascade/skills):

```yaml
---
name: wise-scraper                    # kebab-case, unique, shown in UI / @mentions
description: <one concise sentence>   # shown to model to decide invocation
---
```

- **`description`** must be ≤ 120 characters. It is a trigger hint, not documentation.
- **Body** is the instructions Cascade reads when the skill fires. Keep it focused — ideally < 80 lines. Heavy reference material goes in supporting files that Cascade can read from the skill folder.

### SKILL.md body sections (in order)

1. **When to use / not use** — 3–5 bullet points max
2. **Workflow** — explore → choose exploit tier → exploit → assemble
3. **Agent contract** — the hard constraints an agent must follow (exploration evidence, templates-first, DOM eval, justified escalation, etc.)
4. **Architecture boundary** — what the runner handles vs what the agent may extend
5. **Quick reference** — table pointing to supporting files
6. **Common mistakes** — short list

Keep examples concise. Heavy schema docs and implementation details live in `references/`.

## 3. File Structure

```
wise-scraper-skill/
├── SKILL.md                          # Skill entry point (< 80 lines)
├── .gitignore
├── references/
│   ├── schema.cue                    # CUE schema for profile validation
│   ├── field-guide.md                # Plain English field descriptions
│   ├── guide.md                      # Detailed usage guide (moved from SKILL.md)
│   └── runner/                       # TypeScript reference runner
│       ├── package.json
│       ├── tsconfig.json
│       └── src/
│           ├── index.ts              # Re-exports all modules
│           ├── types.ts              # Full TS types mirroring schema.cue
│           ├── browser.ts            # agent-browser CLI abstraction
│           ├── engine.ts             # Profile schema interpreter
│           ├── hooks.ts              # 5-point hook system
│           ├── processing.ts         # cheerio + turndown post-extraction
│           ├── config.ts             # convict-based config composition
│           └── run.ts                # CLI entry point
├── templates/                        # Starter YAML profiles
│   ├── single-page.yaml
│   ├── multi-page.yaml
│   ├── pagination.yaml
│   ├── matrix.yaml
│   ├── table-extract.yaml
│   ├── element-click.yaml
│   ├── chaining.yaml
│   ├── sort-verify.yaml
│   ├── ai-extract.yaml
│   └── ai-enrich.yaml
├── examples/                         # Tested end-to-end examples
│   ├── overview.md
│   ├── revspin/                      # Interactive table + pagination (200 records)
│   └── splunk-itsi-admin/            # Multi-page doc scraper
├── tests/
│   └── harness/                      # Agent test harness
│       ├── package.json
│       ├── tsconfig.json
│       └── src/
│           ├── agents.ts             # Unified agent interface (Codex, Claude Code, OpenCode)
│           ├── scenarios.ts          # Test scenario definitions
│           └── run-test.ts           # CLI test runner + report generator
└── docs/
    ├── spec.md                       # THIS FILE
    ├── lessons/                      # Post-mortems from test cases
    ├── audits/
    ├── plans/
    └── skill-tests/
```

## 4. Components

### 4.1 Reference Runner (`references/runner/`)

**Purpose:** executable reference implementation that an agent should try first, then copy/adapt into the task project when required.

| Module | Responsibility |
|---|---|
| `browser.ts` | Wraps `agent-browser` CLI. Base64 eval for cross-platform. Retry logic. |
| `engine.ts` | Interprets profile schema: walks selector tree, runs interactions, handles pagination/matrix, extracts via DOM eval. |
| `hooks.ts` | Extension points for site-specific code and post-processing. |
| `processing.ts` | Post-extraction: `cheerio` (HTML parse), `turndown` (HTML→MD), table→MD, ref extraction, CSV/MD/JSON assembly. |
| `config.ts` | Hydra-like config composition via `convict` + `deepmerge`. Schema defaults → YAML → override files → env → `--set` CLI. |
| `run.ts` | CLI entry: `node dist/run.js <profile.yaml> [--output-dir] [--hooks] [--set k=v] [--config extra.yaml]` |
| `types.ts` | Full TypeScript types mirroring `schema.cue`. |

**Dependencies:** `js-yaml`, `cheerio`, `turndown`, `convict`, `deepmerge`
**Dev deps:** `typescript`, `@types/node`, `@types/turndown`, `@types/convict`, `@types/js-yaml`

**Extraction rule:** DOM eval for live-page data. `cheerio`/`turndown` only for post-extraction processing of captured HTML.

### 4.2 Exploit Tiers

| Tier | Default Use | What the agent should do |
|---|---|---|
| Tier 1 | Target fits declarative runner flow | Reuse templates + reference runner with minimal customization |
| Tier 2 | Target needs project-local adaptation | Copy/adapt runner modules, hooks, helper scripts, post-processing, chaining glue, or an AI adapter into the task project |
| Tier 3 | Target exceeds reference boundary | Build a more bespoke task-local project, but carry forward WISE discipline and artifacts |

### 4.3 Profile Schema (`references/schema.cue`)

Declarative YAML format. Key constructs:

- `resources[]` → entry URL + selector tree + outputs
- `selectors[]` → name, parents, context, type, interaction, extract, pagination, matrix
- `interaction[]` → click, select, scroll, wait, reveal
- `extract[]` → text, attr, html, link, table, ai
- `pagination{}` → next, numeric, infinite
- `matrix{}` → cartesian axes with auto-discover
- `hooks{}` → before/after or per-point
- `inputs{}` → user-configurable parameters (for config composition)

### 4.4 Config Composition (`config.ts`)

Solves: "search axx, bxx, cxx and combine results"

Resolution order (later wins):
1. Schema defaults (convict)
2. Base profile YAML
3. Override YAML files (`--config extra.yaml`)
4. Environment variables (`WISE_*`)
5. CLI `--set key=value`

Profile declares `inputs:` block; runner merges overrides into it before execution.

### 4.5 Test Harness (`tests/harness/`)

**Purpose:** validate the skill works when consumed by a real coding agent.

| File | Responsibility |
|---|---|
| `agents.ts` | Unified `Agent` interface. SDK adapters for Codex (`@openai/codex-sdk`), Claude Code (`@anthropic-ai/claude-code`), OpenCode (`@opencode-ai/sdk`). CLI fallback for any agent binary. All SDKs are optional deps. |
| `scenarios.ts` | Structured test cases for exploration discipline, exploit-tier choice, template reuse, and optional AI adapter usage. |
| `run-test.ts` | CLI runner: `--agent codex|claude|opencode|all`, `--scenario <id>`, `--check`, `--list`. Produces JSON report + matrix view. |

**Agent SDKs are optional deps.** The harness detects which are available and skips the rest. CLI fallback (`codex`, `claude`, `opencode` binaries) works without any SDK installed.

**Test scenarios (current direction):**

| ID | Level | What it tests |
|---|---|---|
| `single-page-article` | Tier 1 | Basic exploration + profile + runner invocation |
| `multi-page-docs` | Tier 1 | Discovery + selector tree + runner |
| `interactive-table` | Tier 1 | click + wait + row extraction |
| `paginated-table` | Tier 1 | pagination selector + page_limit |
| `config-composition` | Tier 2 | inputs, overrides, matrix expansion, justified extension |
| `ai-not-needed` | Policy | prove AI should not be introduced |
| `ai-needed-semantic-extraction` | Tier 2 policy | introduce AI adapter only for semantic normalization |

## 5. Boundaries

### In Scope
- Skill instructions (SKILL.md + supporting files)
- Reference runner (TypeScript, uses agent-browser)
- Profile schema (CUE + types.ts)
- Config composition (convict-based)
- Test harness (multi-agent)
- Examples (revspin, ITSI)
- Templates (starter profiles)

### Out of Scope
- Publishing as an npm package (it's skill reference material)
- Building a standalone web scraping framework
- Mandatory AI extraction in every scrape
- Proxy/auth infrastructure
- Rate limiting / politeness policies (mentioned in guide, not enforced)
- Deployment to CI/CD (test harness is local-only for now)

## 6. Quality Gates

Before declaring v1 complete:

- [ ] SKILL.md is valid per Windsurf spec (short description, < 80 lines body)
- [ ] `references/runner/` compiles clean with `npx tsc`, zero errors
- [ ] Runner passes at least one Tier 1 reference example
- [ ] Test harness compiles clean (agent SDKs optional)
- [ ] Test harness `--check` runs and detects available agents
- [ ] At least one agent test scenario runs end-to-end
- [ ] Harness can score exploration evidence and exploit-tier choice
- [ ] Harness contains paired AI policy tests: one where AI is unnecessary and one where AI is justified
- [ ] All templates are valid YAML that parses without error
- [ ] No stale files (old runners/, tmp files, etc.)

## 7. Open Questions

1. **Should `schema.cue` move into `references/runner/` or stay separate?** Currently separate — agents that don't use the runner still benefit from the schema.
2. **Should templates be validated against schema.cue in CI?** Nice to have, not blocking v1.
3. **Should the test harness support Windsurf/Cascade itself?** Not currently — Cascade doesn't have a programmatic SDK. The skill is tested via other agents that can consume it.

# Requirements Document

## Introduction

Finalize the **WISE** (Web Info Structured Extraction) skill for publication. The skill teaches AI coding agents how to do structured, repeatable web scraping, data mining, and content extraction from JS-rendered sites using `agent-browser` as the browser runtime. It ships reference TypeScript code, a declarative YAML profile schema, tested examples, and a multi-agent test harness.

The codebase already exists in draft form — a TypeScript runner, CUE schema, templates, examples, and a test harness skeleton. This spec covers making everything valid, tested, documented, and publishable.

## Glossary

- **Skill**: A universal agent skill — a `SKILL.md` file with YAML frontmatter plus supporting files. Installable to Codex, Claude Code, OpenCode, Windsurf, Cursor, Cline, Amp, and other compatible agents via `npx skills add`.
- **Profile**: A declarative YAML file describing what to scrape — entry URL, selector tree, interactions, extraction fields.
- **Runner**: The TypeScript reference implementation that interprets profiles and drives `agent-browser`.
- **agent-browser**: Vercel's headless browser CLI used for both exploration and deterministic execution.
- **JSONL**: JSON Lines — one JSON object per line. The intermediate output format.
- **Hook**: An extension point in the runner pipeline where site-specific logic can be injected.
- **Config composition**: Merging defaults, YAML overrides, env vars, and CLI `--set` overrides into a resolved config (Hydra-like).
- **Test harness**: A tool that sends skill test scenarios to coding agents (Codex, Claude Code, OpenCode) and validates results.

## Requirements

### Requirement 1: Valid Skill File

**User Story:** As a Windsurf user, I want the skill to be auto-discoverable and invocable by Cascade, so that I can use it without manual setup.

#### Acceptance Criteria

1.1. WHEN Cascade scans installed skills, THE SKILL.md SHALL have valid YAML frontmatter with `name` and `description` fields.
1.2. WHEN Cascade reads the `description` field, THE description SHALL be ≤ 120 characters and clearly state when to invoke the skill.
1.3. WHEN the skill is invoked, THE SKILL.md body SHALL be ≤ 80 lines and contain only workflow overview, core rules, a reference table, and common mistakes — no code examples, schema docs, or hook API.
1.4. WHEN an agent needs detailed documentation, THE skill folder SHALL contain `references/guide.md` with the full usage guide (profile schema, extraction rules, hook system, exploration commands, JSONL format).

### Requirement 2: Runner Compiles and Runs

**User Story:** As an AI agent, I want the shipped runner to compile and execute without errors, so that I can run profiles immediately.

#### Acceptance Criteria

2.1. WHEN `npx tsc` is run in `references/runner/`, THE build SHALL complete with zero TypeScript errors.
2.2. WHEN `node dist/run.js <profile.yaml>` is run, THE runner SHALL load the profile, interpret the schema, drive `agent-browser`, and produce JSONL output.
2.3. WHEN the runner encounters a missing optional dependency (e.g., `convict`), THE runner SHALL fail gracefully with a clear error message, not a stack trace.

### Requirement 3: Config Composition

**User Story:** As a user, I want to override profile parameters from the CLI (e.g., search terms, page limits), so that I don't have to edit YAML files for each run.

#### Acceptance Criteria

3.1. WHEN the user passes `--set inputs.queries=[axx,bxx,cxx]`, THE runner SHALL merge the override into the profile's `inputs` block before execution.
3.2. WHEN the user passes `--config extra.yaml`, THE runner SHALL deep-merge the extra file on top of the base profile.
3.3. WHEN no overrides are provided, THE runner SHALL use schema defaults and the base profile as-is.
3.4. WHEN an invalid override key is provided, THE runner SHALL warn but not crash.

### Requirement 4: Test Harness Compiles

**User Story:** As a developer, I want the test harness to compile and run `--check` / `--list` without requiring any agent SDK to be installed.

#### Acceptance Criteria

4.1. WHEN `npx tsc` is run in `tests/harness/`, THE build SHALL complete with zero errors even when agent SDKs are not installed.
4.2. WHEN `node dist/run-test.js --list` is run, THE harness SHALL print all available test scenarios.
4.3. WHEN `node dist/run-test.js --check` is run, THE harness SHALL probe each agent SDK and CLI, reporting which are available.
4.4. WHEN an agent SDK is not installed, THE harness SHALL skip that agent gracefully (no crash, no unhandled rejection).

### Requirement 5: End-to-End Validation — Revspin

**User Story:** As a developer, I want evidence that the runner handles interactive table extraction with pagination, so that I can trust it for similar scenarios.

#### Acceptance Criteria

5.1. WHEN the revspin profile (`examples/revspin/revspin_durable.yaml`) is run, THE runner SHALL extract ≥ 100 records with fields: rubber, speed, spin, control, durable, overall.
5.2. WHEN pagination is configured with `page_limit: 2`, THE runner SHALL stop after 2 pages.

### Requirement 6: End-to-End Validation — ITSI

**User Story:** As a developer, I want evidence that the runner handles multi-page doc site scraping, so that I can trust it for doc portals.

#### Acceptance Criteria

6.1. WHEN a full-schema ITSI profile is run, THE runner SHALL discover ≥ 50 sub-page URLs from the TOC navigation.
6.2. WHEN all discovered pages are extracted, THE output JSONL SHALL contain title and body fields for each page.

### Requirement 7: Publish-Ready Repository

**User Story:** As a publisher, I want the repository to be clean, documented, and committable, so that others can install and use the skill.

#### Acceptance Criteria

7.1. THE repository SHALL have a `README.md` that describes installation, usage, and structure.
7.2. THE `.gitignore` SHALL exclude `node_modules/`, `dist/`, and temporary files.
7.3. THE repository SHALL contain no stale files (old `runners/run.mjs` at repo root, orphaned tmp files).
7.4. ALL templates SHALL be valid YAML that parses without error.

### Requirement 8: Competitive Context

**User Story:** As a user evaluating the skill, I want to understand how it differs from Crawl4AI and Firecrawl, so that I can choose the right tool.

#### Acceptance Criteria

8.1. THE skill documentation SHALL include a brief comparison (≤ 20 lines) in `references/guide.md` explaining positioning vs Crawl4AI and Firecrawl.

### Non-Functional

**NF 1**: The runner SHALL work on Windows, macOS, and Linux (agent-browser + base64 eval for cross-platform shell safety).
**NF 2**: The SKILL.md body SHALL be concise enough that it doesn't waste Cascade's context window (< 80 lines).
**NF 3**: All TypeScript code SHALL use strict mode and pass `tsc` with zero errors.

## Out of Scope

- Publishing as an npm package
- AI extraction implementation (placeholder only in schema)
- Proxy/auth infrastructure
- Rate limiting / politeness enforcement
- CI/CD integration for the test harness
- Running the full 89-page ITSI scrape in CI (too slow; manual validation only)

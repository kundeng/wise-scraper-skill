# Tasks: wise-scraper-v1 (WISE — Web Info Structured Extraction)

## Overview

Finalize the WISE skill for publication. Most runner code already exists and compiles. The main work is: rewrite SKILL.md to be valid, create the full guide, integrate config into run.ts, fix the test harness compilation, clean up stale files, write README, and run E2E validation.

## Tasks

- [ ] 1. Skill file and documentation
  - [ ] 1.1 Rewrite SKILL.md — valid frontmatter, ≤ 80 line body
    - Rewrite `SKILL.md`: `description` ≤ 120 chars with keywords (scraping, mining, extraction), body ≤ 80 lines with: when to use, workflow, core rules, reference table, common mistakes
    - **Depends**: —
    - **Requirements**: 1.1, 1.2, 1.3, NF 2
    - **Properties**: 1

  - [ ] 1.2 Create references/guide.md — full usage documentation
    - Move detailed content from current SKILL.md (profile schema, extraction rules, hook API, exploration commands, JSONL format) into `references/guide.md`. Add competitive positioning vs Crawl4AI/Firecrawl (≤ 20 lines).
    - **Depends**: 1.1
    - **Requirements**: 1.4, 8.1
    - **Properties**: 1

  - [ ] 1.3 Create README.md
    - Write repo-level README: what WISE is (universal agent skill), installation (`npx skills add`), runner setup (`npm install && npx tsc`), usage (runner CLI, templates, examples), directory structure, link to guide.md
    - **Depends**: 1.1
    - **Requirements**: 7.1
    - **Properties**: —

  - [ ] 1.4 Write property test for valid skill invocation
    - Script that parses SKILL.md frontmatter, asserts `name` and `description` exist, `description.length ≤ 120`, body line count ≤ 80
    - **Depends**: 1.1
    - **Requirements**: 1.1, 1.2, 1.3
    - **Properties**: 1

- [ ] 2. Runner integration and cleanup
  - [ ] 2.1 Integrate config.ts into run.ts
    - Replace `parseArgs()` in `run.ts` with `loadConfig()` from `config.ts`. Support `--set`, `--config`, `--dry-run`. Keep existing profile loading and output writing.
    - **Depends**: —
    - **Requirements**: 2.2, 3.1, 3.2, 3.3, 3.4
    - **Properties**: 2, 3

  - [ ] 2.2 Verify runner compiles clean
    - Run `npx tsc` in `references/runner/`, fix any errors
    - **Depends**: 2.1
    - **Requirements**: 2.1, NF 3
    - **Properties**: 2

  - [ ] 2.3 Clean stale files
    - Delete `runners/run.mjs` (old root-level runner) if it exists. Verify `.gitignore` covers `node_modules/`, `dist/`, `*.tmp`, `.tmp_eval.js`. Remove `docs/spec.md` (informal, superseded by `.kiro/specs/`).
    - **Depends**: —
    - **Requirements**: 7.2, 7.3
    - **Properties**: —

  - [ ] 2.4 Validate all templates parse
    - Load every `templates/*.yaml` with js-yaml and assert no parse errors
    - **Depends**: —
    - **Requirements**: 7.4
    - **Properties**: —

- [ ] 3. Test harness
  - [ ] 3.1 Fix test harness TS compilation
    - Add type declarations (or `// @ts-ignore`) for optional agent SDK dynamic imports so `npx tsc` in `tests/harness/` exits 0 with zero SDKs installed. Remove unused imports.
    - **Depends**: —
    - **Requirements**: 4.1, 4.4
    - **Properties**: 4

  - [ ] 3.2 Verify harness --list and --check
    - Run `node dist/run-test.js --list` and `--check`. Assert --list prints scenarios, --check probes agents without crashing.
    - **Depends**: 3.1
    - **Requirements**: 4.2, 4.3
    - **Properties**: 4

- [ ] 4. E2E validation
  - [ ] 4.1 E2E — Revspin profile
    - Run `node dist/run.js examples/revspin/revspin_durable.yaml --output-dir ./output/revspin`. Verify ≥ 100 records with rubber/speed/spin/control fields. Requires live `agent-browser`.
    - **Depends**: 2.2
    - **Requirements**: 5.1, 5.2
    - **Properties**: 5

  - [ ] 4.2 E2E — ITSI full-schema profile
    - Write a full-schema ITSI profile (replacing the flat one) that discovers sub-pages from TOC nav and extracts title + body. Run it. Verify ≥ 50 pages in output.
    - **Depends**: 2.2
    - **Requirements**: 6.1, 6.2
    - **Properties**: 6

  - [ ] 4.3 Write property test for config override merge
    - Script that calls `loadConfig(["profile.yaml", "--set", "inputs.queries=[a,b,c]"])` with a test profile and asserts `inputs.queries` equals `["a","b","c"]`
    - **Depends**: 2.1
    - **Requirements**: 3.1, 3.3
    - **Properties**: 3

- [ ] 5. Final
  - [ ] 5.1 Git commit
    - Stage all files, commit: `feat(wise-scraper-v1): finalize skill for publication`
    - **Depends**: 1.1, 1.2, 1.3, 2.1, 2.2, 2.3, 3.1
    - **Requirements**: 7.1, 7.2, 7.3
    - **Properties**: —

## Notes

- E2E tasks (4.1, 4.2) require a live `agent-browser` session and network access. They are manual validation, not CI.
- Harness lint errors for `@anthropic-ai/claude-code` etc. are expected — those are optional deps resolved at runtime via dynamic import.
- The `docs/spec.md` (informal) is superseded by `.kiro/specs/wise-scraper-v1/` and can be deleted.

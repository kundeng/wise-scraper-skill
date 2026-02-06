# Wise-Scraper Finalization Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Finalize the wise-scraper skill, validate templates and generated artifacts, and publish to skills.sh.

**Architecture:** Treat the skill and templates as the product, with TDD-style pressure scenarios for discipline rules and targeted audits for generated configs/runners. Use minimal edits to tighten requirements and add concise verification guidance. Publishing is handled via the `npx skills` CLI.

**Tech Stack:** Markdown (SKILL.md), YAML templates, Python runner (audit only), `npx skills` CLI, git.

### Task 1: Create baseline skill tests (RED)

**Files:**
- Create: `docs/skill-tests/2026-02-06-wise-scraper.md`

**Step 1: Write failing test scenarios (pressure cases)**

```markdown
Scenario A: Agent tries to design config before any exploration evidence.
Scenario B: Agent uses BeautifulSoup/HTML parsing for tables without DOM eval.
Scenario C: Agent skips task-specific runner output or assumes generic runner.
```

**Step 2: Run baseline (no skill), document violations**

Record the agent’s likely behavior and rationalizations. Mark each scenario as FAIL if it violates rules.

**Step 3: Verify baseline failures**

Expected: All 3 scenarios FAIL given current skill gaps.

### Task 2: Audit generated artifacts in test workspace

**Files:**
- Review: `/Users/kundeng/Dropbox/Projects/wise-skill-test/revspin_durable.yaml`
- Review: `/Users/kundeng/Dropbox/Projects/wise-skill-test/run_revspin_durable.py`

**Step 1: Check selector correctness and context**

Confirm selector scoping, pagination selector, row selector, and click target are durable.

**Step 2: Verify header-based mapping for table extraction**

Check that table extraction is header-based (not column index)

**Step 3: Verify durable sort & pagination**

Confirm pagination order uses page numbers and that sort verification is explicit.

**Step 4: Record gaps**

Capture any violations of DOM-eval preference, header mapping, or pagination requirements.

### Task 3: Update skill + templates (GREEN)

**Files:**
- Modify: `/Users/kundeng/.codex/skills/wise-scraper/SKILL.md`
- Modify: `/Users/kundeng/.codex/skills/wise-scraper/templates/pagination.yaml`
- Modify: `/Users/kundeng/.codex/skills/wise-scraper/templates/element-click.yaml` (if needed)
- Modify: `/Users/kundeng/.codex/skills/wise-scraper/references/field-guide.md`

**Step 1: Tighten rule language**

Add explicit ordering: exploration evidence required before design or runner output.

**Step 2: Enforce DOM eval preference**

Add explicit rule against HTML parsing libs and reinforce DOM eval usage.

**Step 3: Require task-specific runner output**

Add a hard requirement and red-flag for missing runner output.

**Step 4: Update templates if gaps found**

Ensure pagination template includes context and durable selectors, and add header mapping guidance.

### Task 4: Re-test scenarios (GREEN)

**Files:**
- Update: `docs/skill-tests/2026-02-06-wise-scraper.md`

**Step 1: Re-run scenarios with updated skill**

Mark each scenario PASS with explicit compliance.

### Task 5: Publish to skills.sh

**Step 1: Validate `npx skills` availability**

Run: `npx skills --help`

**Step 2: Publish**

Run the appropriate publish command from `npx skills` and record output.

### Task 6: Verification and cleanup

**Step 1: Run any skill validation checks**

If available, run a local validation script; otherwise ensure schema and templates are consistent.

**Step 2: Summarize changes and provide publish output**


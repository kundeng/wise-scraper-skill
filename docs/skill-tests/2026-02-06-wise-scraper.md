# Wise-Scraper Skill Test - 2026-02-06

## Baseline (No Skill Applied) - RED

### Scenario A: Design before exploration evidence
**Pressure:** Time + user asks for config ASAP
**Prompt:** “Create the config now; we can explore later.”
**Observed baseline behavior:** Proceeds to design selectors without any evidence.
**Rationalization:** “We already know the page layout; we can fill in later.”
**Result:** FAIL (design precedes evidence)

### Scenario B: HTML parsing vs DOM eval
**Pressure:** Convenience + existing BeautifulSoup code
**Prompt:** “We already pulled HTML; just parse it.”
**Observed baseline behavior:** Uses BeautifulSoup to parse tables.
**Rationalization:** “Parsing HTML is simpler than DOM eval.”
**Result:** FAIL (no DOM eval)

### Scenario C: Task-specific runner output skipped
**Pressure:** Time + generic runner exists
**Prompt:** “Use the generic runner; no need for a task-specific script.”
**Observed baseline behavior:** Reuses generic logic, no per-task runner output.
**Rationalization:** “It’s the same pattern, no need to generate a runner.”
**Result:** FAIL (task-specific runner output missing)

## Expected Pass Criteria (GREEN)
- Evidence-first: explicit requirement and enforced ordering
- DOM eval preference: explicit prohibition of HTML parsing libraries for tables
- Task-specific runner output: required and red-flagged if missing

## Re-test (Skill Applied) - GREEN

### Scenario A: Design before exploration evidence
**Observed behavior:** Explicit rule now forbids design/runner before evidence; would require evidence-first.
**Result:** PASS

### Scenario B: HTML parsing vs DOM eval
**Observed behavior:** Rules explicitly require DOM eval for tables and forbid HTML parsing libs.
**Result:** PASS

### Scenario C: Task-specific runner output skipped
**Observed behavior:** Rules explicitly require task-specific runner output and flag generic-only approaches.
**Result:** PASS

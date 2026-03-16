# Wise-Scraper Skill Test - 2026-02-06

This file now captures **agent-behavior evaluation criteria** for the WISE skill.

The goal is not to prove that the generic runner can natively do every scrape. The goal is to verify that an AI coding agent:

- explores before exploiting
- reuses shipped templates/plumbing first
- escalates cleanly to extensions or task-local code only when justified
- uses AI-assisted extraction only when the page truly needs it

## Baseline (No Skill Applied) - RED

### Scenario A: Design before exploration evidence
**Pressure:** Time + user asks for config ASAP  
**Prompt:** “Create the config now; we can explore later.”  
**Observed baseline behavior:** Proceeds to design selectors without evidence from the live page.  
**Result:** FAIL

### Scenario B: Skip shipped templates and jump to custom code
**Pressure:** Agent wants full control quickly  
**Prompt:** “Just build a custom scraper from scratch.”  
**Observed baseline behavior:** Ignores available templates/runner and generates bespoke code immediately.  
**Result:** FAIL

### Scenario C: Treat the generic runner as mandatory even when it no longer fits
**Pressure:** Existing runner is available  
**Prompt:** “Keep everything inside the generic runner no matter what.”  
**Observed baseline behavior:** Forces an awkward design instead of escalating to hooks/helper scripts/task-local code.  
**Result:** FAIL

### Scenario D: Reach for AI by default
**Pressure:** AI tooling is available  
**Prompt:** “Use AI extraction for this page.”  
**Observed baseline behavior:** Introduces exploit-time AI even when deterministic selectors would work.  
**Result:** FAIL

## Expected Pass Criteria (GREEN)

- Evidence-first: exploration before profile/project design
- Templates-first: start from shipped YAML templates and reference plumbing where feasible
- Tier selection: choose runner-only vs runner-plus-extensions vs task-local project intentionally
- DOM-eval discipline: use live DOM eval for rendered-page extraction
- AI restraint: only use AI extraction/enrichment when durable selectors/plumbing are insufficient
- Justified escalation: when moving to a higher exploit tier, explain why

## Re-test (Skill Applied) - GREEN

### Scenario A: Design before exploration evidence
**Observed behavior:** Skill requires exploration evidence before profiles or custom code.  
**Result:** PASS

### Scenario B: Skip shipped templates and jump to custom code
**Observed behavior:** Skill instructs the agent to adapt the closest shipped template before inventing new structure.  
**Result:** PASS

### Scenario C: Treat the generic runner as mandatory even when it no longer fits
**Observed behavior:** Skill defines three exploit tiers and allows justified escalation to hooks/helper scripts/task-local code.  
**Result:** PASS

### Scenario D: Reach for AI by default
**Observed behavior:** Skill presents AI as an optional adapter pattern and requires the agent to decide if it is actually needed.  
**Result:** PASS

## Next Eval Additions

- Add harness scenarios that compare Tier 1 vs Tier 2 vs Tier 3 choices on the same family of tasks
- Add paired tests for “AI not needed” and “AI needed”
- Capture zero-shot agent outputs and score whether the chosen path was appropriate

# AI Adapter Pattern

Use this reference when a scrape needs exploit-time AI for semantic extraction, normalization, classification, or enrichment that durable selectors cannot provide directly.

## Purpose

The AI adapter is an **optional extension path**. It should sit around the normal WISE flow, not replace exploration, DOM capture, or deterministic extraction.

Recommended pattern:

1. Use `agent-browser` and normal selectors to capture the relevant source content
2. Store the captured HTML/text/JSONL as ordinary intermediate artifacts
3. Call a local AI CLI only for the transformation that deterministic code cannot do reliably
4. Validate the returned structure before assembly

## When to Use

Use an AI adapter when:

- the page contains long unstructured prose that must be normalized into a schema
- the extraction requires semantic grouping or fuzzy interpretation
- post-processing needs judgment that would be brittle with hand-written rules

Do not use an AI adapter when:

- ordinary selectors can extract the needed fields directly
- simple deterministic cleanup can solve the problem
- the agent is reaching for AI just because it is available

## Interface Contract

The adapter should be vendor-neutral at the interface level.

### Input

- task instructions
- source context captured from the page
- desired output schema
- optional examples or guardrails

### Output

- structured JSON preferred
- markdown only if the downstream step expects markdown
- enough metadata to validate success/failure

## Backend Choices

Possible backends:

- `codex`
- `claude`
- another local AI CLI available in the environment

The agent should prefer the installed backend that is most reliable in the current workspace. Avoid hardcoding the skill to exactly one vendor.

## Evaluation Questions

When reviewing an agent run, check:

- Did it prove deterministic extraction was insufficient before adding AI?
- Did it keep page capture on normal WISE plumbing?
- Did it isolate AI to the semantic step instead of handing the entire scrape to AI?
- Did it define the expected output shape clearly?
- Did it explain why AI was justified?

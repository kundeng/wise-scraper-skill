# Field Guide (Plain English)

## Deployment
- **`resources`**: list of resources (sitemaps) to run.
- **`ai_generate`**: optional high-level goal to draft a deployment.
- **`hooks` / `schedule`**: global lifecycle hooks and scheduling.

## Resource
- **`entry`**: start URL (string or artifact reference) + root selector name.
- **`inputs`**: artifacts consumed by this resource.
- **`outputs`**: artifacts produced by this resource.
- **`globals`**: timeouts/retries/user agent.

## Selector
- **`parents`**: explicit; **children are inferred**.
- **`context`**: observable checks defining this state (URL, element presence).
- **`selector`**: optional scope selector.
- **`multiple`**: iterate all matches and emit repeated contexts/rows.
- **`interaction`**: declarative steps to complete the context (click/select/scroll/wait/reveal).
- **`extract`**: fields to read once the context is complete.
- **`pagination` / `matrix`**: optional type blocks.

## Interaction
- **Click/Select/Scroll/Wait/Reveal**: declarative, compiled to deterministic browser primitives.

## Extraction
- **Text/Attr/HTML/Link/Table/AI**: field extraction types.
- **Table**: prefer header-based column mapping; avoid index-only when headers exist.

## Artifacts
- **Outputs** are named and can be used as **inputs** for other resources.

/**
 * Test scenarios for the WISE scraper skill.
 *
 * Each scenario is a structured prompt + expected outcomes that we send to a
 * coding agent. The agent has the skill installed and must produce the correct
 * artifacts (profile YAML, runner output, etc.).
 *
 * Scenarios are ordered by complexity to match the skill's complexity levels.
 */

export interface Scenario {
  id: string;
  name: string;
  complexity: "single-page" | "multi-page" | "interactive" | "matrix" | "chained" | "ai-extract";
  prompt: string;
  /** Which exploit tier the agent should prefer */
  expectedTier?: 1 | 2 | 3;
  /** Files the agent should produce */
  expectedArtifacts: string[];
  /** Strings that should appear in the profile YAML */
  profileChecks: string[];
  /** Strings that indicate the agent showed exploration evidence */
  evidenceChecks?: string[];
  /** Strings that should appear in the agent's reasoning/output */
  decisionChecks?: string[];
  /** Validation function on the output records (optional) */
  validateOutput?: (records: unknown[]) => { pass: boolean; reason: string };
  /** Max time in seconds to allow the agent */
  timeoutSeconds: number;
}

// ------------------------------------------------------------------
// Scenario library
// ------------------------------------------------------------------

export const scenarios: Scenario[] = [
  // ----------------------------------------------------------------
  // Level 1: Single page extraction
  // ----------------------------------------------------------------
  {
    id: "single-page-article",
    name: "Extract a single article page",
    complexity: "single-page",
    prompt: `You have the wise-scraper skill installed. Use it to extract the title and body content from this single documentation page.

URL: https://help.splunk.com/en/splunk-it-service-intelligence/splunk-it-service-intelligence/administer/4.21/overview/about-administering-it-service-intelligence

Requirements:
1. First explore the page using agent-browser to discover DOM structure. Show evidence of your selectors.
2. Reuse the shipped WISE plumbing if possible; do not jump to a bespoke scraper unless you can justify it.
3. Write a YAML profile (profile.yaml) that declares the extraction.
4. Run the profile using the shipped runner: node references/runner/dist/run.js profile.yaml --output-dir ./output
5. The output JSONL should contain one record with title and body fields.

Use the skill's schema and runner. Explain which exploit tier you chose and why.`,
    expectedTier: 1,
    expectedArtifacts: ["profile.yaml"],
    profileChecks: ["selectors", "extract", "name:", "entry:"],
    evidenceChecks: ["agent-browser", "selector", "DOM"],
    decisionChecks: ["Tier 1", "runner", "template"],
    validateOutput: (records) => {
      if (records.length < 1) return { pass: false, reason: "No records extracted" };
      const rec = records[0] as { data?: { title?: string } };
      if (!rec.data?.title) return { pass: false, reason: "Missing title field" };
      return { pass: true, reason: "OK" };
    },
    timeoutSeconds: 120,
  },

  // ----------------------------------------------------------------
  // Level 2: Multi-page extraction
  // ----------------------------------------------------------------
  {
    id: "multi-page-docs",
    name: "Scrape multiple documentation pages",
    complexity: "multi-page",
    prompt: `You have the wise-scraper skill installed. Scrape ALL pages from the Splunk ITSI 4.21 "Administer" section.

Entry URL: https://help.splunk.com/en/splunk-it-service-intelligence/splunk-it-service-intelligence/administer/4.21/overview/about-administering-it-service-intelligence

Requirements:
1. Explore the page to discover the left-nav TOC that lists all sub-pages. Show DOM evidence.
2. Write a full-schema YAML profile that:
   - Starts at the entry URL
   - Has a root selector that discovers all sub-page links from the TOC
   - Has a pagination or child selector that visits each page
   - Extracts title and body_html from each page
3. Run using the shipped runner and produce JSONL output.
4. Prefer the shipped runner and templates unless exploration proves you need an extension.
5. The output should contain records for multiple pages (expect 50+ pages).

Use the skill's schema — selectors with parents, context, extract fields. State which exploit tier you chose.`,
    expectedTier: 1,
    expectedArtifacts: ["profile.yaml"],
    profileChecks: ["resources:", "selectors:", "parents:", "multiple:", "extract:"],
    evidenceChecks: ["TOC", "selector", "DOM"],
    decisionChecks: ["Tier 1", "runner"],
    validateOutput: (records) => {
      if (records.length < 10) return { pass: false, reason: `Only ${records.length} records, expected 50+` };
      return { pass: true, reason: `${records.length} records extracted` };
    },
    timeoutSeconds: 300,
  },

  // ----------------------------------------------------------------
  // Level 3: Interactive (click + sort + extract)
  // ----------------------------------------------------------------
  {
    id: "interactive-table",
    name: "Extract table data with interaction (sort by column)",
    complexity: "interactive",
    prompt: `You have the wise-scraper skill installed. Extract table tennis rubber data from revspin.net.

Entry URL: https://revspin.net/rubber/

Requirements:
1. Explore the page with agent-browser. Find the main table and its columns. Show DOM evidence.
2. Write a YAML profile that:
   - Navigates to the rubber listing
   - Clicks the "Durability" column header to sort by durability descending
   - Waits for the table to update
   - Extracts all rows from the table with fields: rank, rubber, speed, spin, control, durable, overall, ratings
   - Uses multiple: true on the row selector
3. Run using the shipped runner.
4. Prefer templates and the runner first; only escalate if exploration proves they are not enough.
5. Output should have 100 rows, sorted by durability.

The profile must use interaction[] to click and wait, and extract[] with header-based column mapping. State which exploit tier you chose.`,
    expectedTier: 1,
    expectedArtifacts: ["profile.yaml"],
    profileChecks: ["interaction:", "type: click", "type: wait", "multiple: true", "extract:"],
    evidenceChecks: ["Durability", "table", "DOM"],
    decisionChecks: ["Tier 1", "sort verification"],
    validateOutput: (records) => {
      if (records.length < 50) return { pass: false, reason: `Only ${records.length} records` };
      const first = records[0] as { data?: { rubber?: string } };
      if (!first.data?.rubber) return { pass: false, reason: "Missing rubber field" };
      return { pass: true, reason: `${records.length} records with rubber data` };
    },
    timeoutSeconds: 180,
  },

  // ----------------------------------------------------------------
  // Level 4: Pagination
  // ----------------------------------------------------------------
  {
    id: "paginated-table",
    name: "Extract paginated table across multiple pages",
    complexity: "interactive",
    prompt: `You have the wise-scraper skill installed. Extract rubber data from revspin.net with pagination.

Entry URL: https://revspin.net/top-rubber/overall-desc.html

Requirements:
1. Explore the page to find the pagination controls. Show DOM evidence.
2. Write a YAML profile with:
   - A root selector with interaction to click "Durability" column header
   - A pagination selector (type: pagination) with numeric pagination, page_limit: 3
   - A rows selector (child of pagination) that extracts table rows with multiple: true
   - All columns: rank, rubber, speed, spin, control, tacky, weight, sponge_hardness, gears, throw_angle, consistency, durable, overall, ratings, price
3. Run the profile and produce JSONL output.
4. Prefer the shipped runner unless exploration proves you need extensions.
5. Expect 300 rows (100 per page × 3 pages).

Use the exact WISE schema: parents[], pagination{}, multiple: true. State which exploit tier you chose.`,
    expectedTier: 1,
    expectedArtifacts: ["profile.yaml"],
    profileChecks: ["type: pagination", "pagination_type:", "page_limit:", "parents:", "multiple: true"],
    evidenceChecks: ["pagination", "page-link", "DOM"],
    decisionChecks: ["Tier 1", "pagination"],
    validateOutput: (records) => {
      if (records.length < 200) return { pass: false, reason: `Only ${records.length} records, expected 300` };
      return { pass: true, reason: `${records.length} paginated records` };
    },
    timeoutSeconds: 240,
  },

  // ----------------------------------------------------------------
  // Level 5: Config composition (complex inputs)
  // ----------------------------------------------------------------
  {
    id: "config-composition",
    name: "Run with config overrides for multiple search terms",
    complexity: "matrix",
    prompt: `You have the wise-scraper skill installed. Create a scraper that accepts multiple search terms and combines results.

Target: https://revspin.net/search.php (the revspin search page)

Requirements:
1. Write a YAML profile that:
   - Defines inputs.queries as a list (default: ["butterfly", "tenergy"])
   - Uses matrix with a search input axis bound to inputs.queries
   - For each query: types into the search box, submits, extracts result rows
2. The profile should work with default queries AND with CLI overrides:
   - Default: node dist/run.js profile.yaml
   - Override: node dist/run.js profile.yaml --set inputs.queries=[yasaka,donic,joola]
3. Show how the config composition works in practice.

This tests the config layer: inputs, --set overrides, and matrix expansion from user parameters. Reuse WISE plumbing unless you can justify an extension.`,
    expectedTier: 2,
    expectedArtifacts: ["profile.yaml"],
    profileChecks: ["inputs:", "queries:", "matrix:", "axes:"],
    evidenceChecks: ["search", "input", "DOM"],
    decisionChecks: ["Tier 2", "config", "extension"],
    timeoutSeconds: 180,
  },

  // ----------------------------------------------------------------
  // AI policy: should NOT use AI
  // ----------------------------------------------------------------
  {
    id: "ai-not-needed",
    name: "Resist AI when selectors are sufficient",
    complexity: "single-page",
    prompt: `You have the wise-scraper skill installed. Extract the product title, price, and bullet list from a straightforward e-commerce page.

Requirements:
1. Explore the live DOM first and show evidence.
2. Use shipped templates/plumbing where possible.
3. Do NOT add exploit-time AI unless you can prove selectors are insufficient.
4. Explain your exploit tier choice and why AI is unnecessary here.`,
    expectedTier: 1,
    expectedArtifacts: ["profile.yaml"],
    profileChecks: ["extract:", "type: text"],
    evidenceChecks: ["DOM", "selector"],
    decisionChecks: ["AI is unnecessary", "Tier 1", "selectors are sufficient"],
    timeoutSeconds: 120,
  },

  // ----------------------------------------------------------------
  // AI policy: AI adapter justified
  // ----------------------------------------------------------------
  {
    id: "ai-needed-semantic-extraction",
    name: "Use an AI adapter only when semantic extraction is justified",
    complexity: "chained",
    prompt: `You have the wise-scraper skill installed. The target page contains long unstructured policy prose. The desired output is normalized JSON with fields:
- eligibility_rules
- renewal_triggers
- exceptions

Requirements:
1. Explore first and show evidence that plain selectors can capture the source content but cannot directly produce the normalized schema.
2. Reuse shipped templates/runner for page capture if possible.
3. Introduce an exploit-time AI adapter only for the semantic normalization step.
4. Explain which backend you would use if available (for example Codex CLI or Claude CLI) and what contract you expect from it.
5. Explain why this is Tier 2 or Tier 3 rather than Tier 1.`,
    expectedTier: 2,
    expectedArtifacts: ["profile.yaml"],
    profileChecks: ["extract:", "type: html"],
    evidenceChecks: ["DOM", "selector", "unstructured"],
    decisionChecks: ["AI adapter", "semantic normalization", "Tier 2"],
    timeoutSeconds: 180,
  },
  // ----------------------------------------------------------------
  // AI extract: product review → structured entities
  // ----------------------------------------------------------------
  {
    id: "ai-review-entities",
    name: "Extract structured entities from product reviews using AI",
    complexity: "ai-extract",
    prompt: `You have the wise-scraper skill installed. Extract structured product review data from revspin.net rubber review pages.

Entry URL: https://revspin.net/rubber/butterfly-tenergy-05.html

Requirements:
1. Explore first with agent-browser. The page has free-form user reviews (text blobs) alongside structured rating data.
2. Use the shipped runner + a YAML profile to capture the raw page content (title, ratings table, review text blobs).
3. The ratings table has clear selectors — extract those with normal DOM eval (Tier 1).
4. For the review text blobs, add an AI adapter step that normalizes each review into structured JSON:
   { reviewer, date, rating, pros: string[], cons: string[], summary: string }
5. The AI adapter should call a local CLI (codex or claude) with a clear contract: input=raw review HTML, output=structured JSON.
6. Write the adapter as a hook or helper script in the project. Show the adapter contract.
7. Explain why Tier 2 is needed: the ratings table is Tier 1, but review normalization requires AI.

Expected output: JSONL with both structured ratings and normalized review entities.`,
    expectedTier: 2,
    expectedArtifacts: ["profile.yaml"],
    profileChecks: ["extract:", "selectors:"],
    evidenceChecks: ["review", "DOM", "selector"],
    decisionChecks: ["Tier 2", "AI adapter", "normalization"],
    timeoutSeconds: 300,
  },

  // ----------------------------------------------------------------
  // AI extract: multi-step chained capture → AI normalization
  // ----------------------------------------------------------------
  {
    id: "ai-chained-normalize",
    name: "Chained multi-page capture with AI normalization step",
    complexity: "ai-extract",
    prompt: `You have the wise-scraper skill installed. Build a scraping project that:

1. Captures multiple documentation pages from the Splunk ITSI admin section (use the shipped runner to discover TOC links and extract raw HTML from each page — this is Tier 1).

Entry URL: https://help.splunk.com/en/splunk-it-service-intelligence/splunk-it-service-intelligence/administer/4.21/overview/about-administering-it-service-intelligence

2. After capture, run an AI normalization step over the raw JSONL that:
   - Reads each captured page record
   - Uses a local AI CLI to extract a structured summary per page:
     { page_title, topics: string[], prerequisites: string[], key_steps: string[], related_pages: string[] }
   - Writes a normalized JSONL file

3. The project should have:
   - profile.yaml for the Tier 1 capture step
   - An AI adapter script (TypeScript or shell) that reads the capture JSONL, calls the AI CLI per record, writes normalized output
   - A README or inline comments explaining the two-step pipeline

4. Show evidence that the capture step works with the shipped runner (Tier 1) and the normalization step needs AI (Tier 2).
5. The AI adapter should be vendor-neutral: try codex first, fall back to claude if available.

This tests chained exploitation: deterministic capture → AI enrichment.`,
    expectedTier: 2,
    expectedArtifacts: ["profile.yaml"],
    profileChecks: ["resources:", "selectors:", "extract:"],
    evidenceChecks: ["TOC", "DOM", "selector", "capture"],
    decisionChecks: ["Tier 2", "AI", "chained", "normalization"],
    timeoutSeconds: 360,
  },

  // ----------------------------------------------------------------
  // AI extract: reconcile inconsistent table formats across pages
  // ----------------------------------------------------------------
  {
    id: "ai-table-reconcile",
    name: "Reconcile inconsistent table formats across pages with AI",
    complexity: "ai-extract",
    prompt: `You have the wise-scraper skill installed. The target site has comparison tables across multiple pages, but the table schemas vary (different column names, merged cells, footnotes inline).

Target: Extract rubber comparison data from multiple revspin.net category pages:
- https://revspin.net/rubber/short-pips.html
- https://revspin.net/rubber/long-pips.html
- https://revspin.net/rubber/anti-spin.html

Requirements:
1. Explore each page with agent-browser. Show evidence that the table structures differ across pages (different columns, different header text, some pages have extra columns).
2. Use the shipped runner to capture each page's table as raw HTML or semi-structured extract (Tier 1 capture).
3. Add an AI reconciliation step that:
   - Takes the heterogeneous table extracts
   - Normalizes them into a unified schema: { name, type, speed, spin, control, price, category }
   - Handles missing fields gracefully (null or "N/A")
4. The AI adapter should receive: raw table HTML + target schema, and return: normalized JSON rows.
5. Write this as a post_assemble hook or standalone adapter script.
6. Explain why this is Tier 2: individual tables are capturable with selectors, but cross-page schema reconciliation needs AI.

Expected output: unified JSONL with consistent schema across all rubber types.`,
    expectedTier: 2,
    expectedArtifacts: ["profile.yaml"],
    profileChecks: ["resources:", "extract:"],
    evidenceChecks: ["table", "DOM", "selector", "column"],
    decisionChecks: ["Tier 2", "reconcil", "AI", "schema"],
    timeoutSeconds: 360,
  },
];

// ------------------------------------------------------------------
// Scenario helpers
// ------------------------------------------------------------------

export function getScenario(id: string): Scenario | undefined {
  return scenarios.find((s) => s.id === id);
}

export function getScenariosByComplexity(complexity: string): Scenario[] {
  return scenarios.filter((s) => s.complexity === complexity);
}

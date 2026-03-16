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
  complexity: "single-page" | "multi-page" | "interactive" | "matrix" | "chained";
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

/**
 * TypeScript types for the WISE Scraper profile schema.
 * Mirrors references/schema.cue
 */

// --- Top-level ---

export interface Deployment {
  name: string;
  resources?: Resource[];
  ai_generate?: AiGenerate;
  hooks?: Hooks;
  schedule?: Schedule;
  /** Internal: set by flat-to-schema conversion */
  _output?: OutputConfig;
  _options?: Record<string, unknown>;
}

export interface AiGenerate {
  enabled?: boolean;
  goal: string;
  constraints?: {
    max_resources?: number;
    required_fields?: string[];
    preferred_output?: "csv" | "jsonl" | "json";
  };
}

export interface Resource {
  name: string;
  entry: Entry;
  globals?: Globals;
  selectors: Selector[];
  inputs?: InputBinding[];
  outputs?: OutputBinding[];
}

export interface Entry {
  url: string | ArtifactRef;
  root: string;
}

export interface ArtifactRef {
  artifact: string;
}

export interface Globals {
  timeout_ms?: number;
  retries?: number;
  user_agent?: string;
}

export interface InputBinding {
  name: string;
  artifact: string;
}

export interface OutputBinding {
  artifact: string;
  from: string;
}

export interface Schedule {
  cron?: string;
  interval_seconds?: number;
}

export interface Hooks {
  before?: HookDef[];
  after?: HookDef[];
  [point: string]: HookDef[] | undefined;
}

export interface HookDef {
  name: string;
  config?: Record<string, unknown>;
}

// --- Selectors ---

export type SelectorType =
  | "element"
  | "element-click"
  | "pagination"
  | "matrix"
  | "text"
  | "link"
  | "table"
  | "html"
  | "attribute"
  | "ai";

export interface Selector {
  name: string;
  parents: string[];
  context: Context;
  selector?: string;
  multiple?: boolean;
  element_limit?: number;
  type?: SelectorType;
  interaction?: Interaction[];
  extract?: Extraction[];
  pagination?: Pagination;
  matrix?: Matrix;
  delay_ms?: number;
  hooks?: { post_extract?: HookDef[] };
}

export interface Context {
  url?: string;
  url_pattern?: string;
  selector_exists?: string;
  text_in_page?: string;
  table_headers?: string[];
}

// --- Interactions ---

export type Interaction = Click | Select | Scroll | Wait | Reveal;

export interface Click {
  type: "click";
  target: Locator;
  click_type?: "clickOnce" | "clickAll";
  click_action_type?: "real" | "scripted";
  click_element_uniqueness_type?:
    | "uniqueText"
    | "uniqueCSSSelector"
    | "uniqueDomPath";
  discard_initial_elements?:
    | "discard-when-click-element-exists"
    | "do-not-discard";
  delay_ms?: number;
}

export interface Select {
  type: "select";
  target: Locator;
  value: string;
  delay_ms?: number;
}

export interface Scroll {
  type: "scroll";
  direction: "down" | "up";
  amount_px?: number;
  delay_ms?: number;
}

export interface Wait {
  type: "wait";
  ms?: number;
  network_idle?: boolean;
  selector?: string;
}

export interface Reveal {
  type: "reveal";
  target: Locator;
  mode: "click" | "hover";
  delay_ms?: number;
}

export interface Locator {
  css?: string;
  text?: string;
  role?: string;
  name?: string;
}

// --- Extractions ---

export type Extraction =
  | TextExtraction
  | AttrExtraction
  | HtmlExtraction
  | LinkExtraction
  | TableExtraction
  | AiExtraction;

export interface TextExtraction {
  type: "text";
  name: string;
  selector: string;
}

export interface AttrExtraction {
  type: "attr";
  name: string;
  selector: string;
  attr: string;
}

export interface HtmlExtraction {
  type: "html";
  name: string;
  selector: string;
}

export interface LinkExtraction {
  type: "link";
  name: string;
  selector: string;
  attr?: string;
}

export interface TableExtraction {
  type: "table";
  name: string;
  selector: string;
  header_row?: number;
  columns?: TableColumn[];
}

export interface TableColumn {
  name: string;
  header?: string;
  index?: number;
}

export interface AiExtraction {
  type: "ai";
  name: string;
  prompt: string;
}

// --- Pagination & Matrix ---

export interface Pagination {
  pagination_type: "next" | "numeric" | "infinite";
  selector: string;
  page_limit?: number;
  start_page?: number;
  stop_condition?: string;
}

export interface Matrix {
  auto_discover?: boolean;
  axes: Axis[];
}

export interface Axis {
  action: "type" | "select" | "checkbox";
  selector: string;
  values: string[] | "auto";
}

// --- Runner output ---

export interface OutputConfig {
  format: string;
  file: string;
}

export interface ExtractedRecord {
  selector: string;
  url: string;
  data: Record<string, unknown>;
  extracted_at: string;
}

export interface HookContext {
  records: ExtractedRecord[];
  profile: Deployment;
  outputDir?: string;
  [key: string]: unknown;
}

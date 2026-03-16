/**
 * WISE Scraper Runner — reference implementation.
 *
 * This module exports all components for use by skill consumers:
 *   - Browser: agent-browser CLI wrapper
 *   - Engine: profile schema interpreter
 *   - HookRegistry: extensible hook system
 *   - Processing: HTML→MD, table conversion, ref extraction, assembly
 *   - Types: full TypeScript types for the profile schema
 */

export { Browser, BrowserError, escapeJs } from "./browser.js";
export { Engine } from "./engine.js";
export { HookRegistry } from "./hooks.js";
export type { HookFn, HookPoint } from "./hooks.js";
export { loadConfig } from "./config.js";
export type { RunnerConfig, InputConfig, ResolvedConfig } from "./config.js";
export {
  htmlToMarkdown,
  htmlTableToMarkdown,
  extractRefs,
  cleanHtml,
  assembleMarkdown,
  assembleCsv,
} from "./processing.js";
export type { Reference } from "./processing.js";
export type {
  Deployment,
  Resource,
  Entry,
  Globals,
  Selector,
  Context,
  Interaction,
  Click,
  Select,
  Scroll,
  Wait,
  Reveal,
  Locator,
  Extraction,
  TextExtraction,
  AttrExtraction,
  HtmlExtraction,
  LinkExtraction,
  TableExtraction,
  AiExtraction,
  Pagination,
  Matrix,
  Axis,
  ExtractedRecord,
  HookContext,
} from "./types.js";

/**
 * Post-extraction processing — converts raw extracted data into final output formats.
 *
 * Uses cheerio for HTML parsing and turndown for HTML→Markdown conversion.
 * This module operates on the JSONL intermediate records produced by the engine.
 */

import * as cheerio from "cheerio";
import TurndownService from "turndown";
import type { ExtractedRecord } from "./types.js";

// ------------------------------------------------------------------
// HTML → Markdown
// ------------------------------------------------------------------

let _turndown: TurndownService | null = null;

function getTurndown(): TurndownService {
  if (!_turndown) {
    _turndown = new TurndownService({
      headingStyle: "atx",
      codeBlockStyle: "fenced",
      bulletListMarker: "-",
    });
    // Keep tables as HTML if turndown can't handle them well
    _turndown.addRule("tables", {
      filter: ["table"],
      replacement(_content, node) {
        // Use cheerio to convert table to markdown table
        const html = (node as unknown as { outerHTML: string }).outerHTML ?? "";
        return "\n" + htmlTableToMarkdown(html) + "\n";
      },
    });
  }
  return _turndown;
}

export function htmlToMarkdown(html: string): string {
  if (!html) return "";
  // Pre-clean: remove script/style/noscript
  const $ = cheerio.load(html);
  $("script, style, noscript").remove();
  const cleaned = $.html();
  return getTurndown().turndown(cleaned).trim();
}

// ------------------------------------------------------------------
// HTML table → Markdown table
// ------------------------------------------------------------------

export function htmlTableToMarkdown(tableHtml: string): string {
  const $ = cheerio.load(tableHtml);
  const rows: string[][] = [];

  $("tr").each((_i, tr) => {
    const cells: string[] = [];
    $(tr)
      .find("th, td")
      .each((_j, cell) => {
        cells.push($(cell).text().trim().replace(/\|/g, "\\|"));
      });
    if (cells.length > 0) rows.push(cells);
  });

  if (rows.length === 0) return "";

  // First row is header
  const header = rows[0];
  const separator = header.map(() => "---");
  const dataRows = rows.slice(1);

  const lines = [
    "| " + header.join(" | ") + " |",
    "| " + separator.join(" | ") + " |",
    ...dataRows.map((row) => "| " + row.join(" | ") + " |"),
  ];
  return lines.join("\n");
}

// ------------------------------------------------------------------
// Extract references (links) from HTML
// ------------------------------------------------------------------

export interface Reference {
  text: string;
  href: string;
  type: "internal" | "external";
}

export function extractRefs(html: string, baseUrl?: string): Reference[] {
  if (!html) return [];
  const $ = cheerio.load(html);
  const refs: Reference[] = [];
  const seen = new Set<string>();

  $("a[href]").each((_i, el) => {
    const href = $(el).attr("href") ?? "";
    const text = $(el).text().trim();
    if (!href || !text || seen.has(href)) return;
    seen.add(href);

    let type: "internal" | "external" = "external";
    if (href.startsWith("/") || href.startsWith("?") || href.startsWith("#")) {
      type = "internal";
    } else if (baseUrl) {
      try {
        const hrefUrl = new URL(href, baseUrl);
        const base = new URL(baseUrl);
        if (hrefUrl.hostname === base.hostname) type = "internal";
      } catch {
        // malformed URL, treat as external
      }
    }
    refs.push({ text, href, type });
  });

  return refs;
}

// ------------------------------------------------------------------
// Clean HTML before extraction
// ------------------------------------------------------------------

export function cleanHtml(html: string, removeSelectors: string[] = []): string {
  if (!html) return "";
  const $ = cheerio.load(html);
  for (const sel of removeSelectors) {
    $(sel).remove();
  }
  return $.html() ?? "";
}

// ------------------------------------------------------------------
// Assemble records into a single markdown document
// ------------------------------------------------------------------

export function assembleMarkdown(
  records: ExtractedRecord[],
  options: { title?: string; includeMetadata?: boolean } = {},
): string {
  const parts: string[] = [];

  if (options.title) {
    parts.push(`# ${options.title}\n`);
  }

  for (const rec of records) {
    const data = rec.data;

    // Find markdown content — look for body_md, body, content, or html fields
    let md = "";
    if (typeof data.body_md === "string") {
      md = data.body_md;
    } else if (typeof data.body === "string") {
      md = data.body.startsWith("<") ? htmlToMarkdown(data.body) : data.body;
    } else if (typeof data.content === "string") {
      md = data.content.startsWith("<") ? htmlToMarkdown(data.content) : data.content;
    } else if (typeof data.body_html === "string") {
      md = htmlToMarkdown(data.body_html);
    }

    // Find title
    const title =
      typeof data.title === "string" ? data.title : "";

    if (title) {
      parts.push(`\n## ${title}\n`);
    }
    if (md) {
      parts.push(md);
    }
    if (options.includeMetadata) {
      parts.push(`\n*Source: ${rec.url} — Extracted: ${rec.extracted_at}*\n`);
    }

    parts.push("\n---\n");
  }

  return parts.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}

// ------------------------------------------------------------------
// Assemble records into CSV
// ------------------------------------------------------------------

export function assembleCsv(records: ExtractedRecord[]): string {
  if (!records.length) return "";

  const fields: string[] = [];
  const seen = new Set<string>();
  for (const rec of records) {
    for (const key of Object.keys(rec.data)) {
      if (!seen.has(key)) {
        fields.push(key);
        seen.add(key);
      }
    }
  }

  const escapeCsv = (val: unknown): string => {
    const s = String(val ?? "").replace(/"/g, '""');
    return s.includes(",") || s.includes('"') || s.includes("\n")
      ? `"${s}"`
      : s;
  };

  const lines = [fields.join(",")];
  for (const rec of records) {
    lines.push(fields.map((f) => escapeCsv(rec.data[f])).join(","));
  }
  return lines.join("\n") + "\n";
}

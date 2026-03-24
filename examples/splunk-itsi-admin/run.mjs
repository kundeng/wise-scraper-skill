#!/usr/bin/env node
/**
 * Deterministic doc-site scraper using agent-browser CLI.
 * Reads a YAML profile, discovers pages, extracts content, assembles markdown.
 *
 * Usage: node run.mjs [--profile profile.yaml] [--output output.md] [--limit N]
 */

import { execSync } from "child_process";
import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const IS_WIN = process.platform === "win32";

/** Normalize path for shell — convert backslashes to forward slashes on Windows */
function shellPath(p) {
  return IS_WIN ? p.replace(/\\/g, "/") : p;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ab(cmd, opts = {}) {
  const timeout = opts.timeout || 120000;
  try {
    const result = execSync(`agent-browser ${cmd}`, {
      encoding: "utf-8",
      timeout,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    return result.trim();
  } catch (e) {
    const short = cmd.length > 120 ? cmd.slice(0, 120) + "..." : cmd;
    console.error(`[agent-browser] FAILED: ${short}\n  ${e.message.split("\n")[0]}`);
    return null;
  }
}

function abJson(cmd, opts = {}) {
  const raw = ab(`${cmd} --json`, opts);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    // Sometimes output has prefix text before JSON
    const match = raw.match(/\{[\s\S]*\}$/);
    if (match) return JSON.parse(match[0]);
    return null;
  }
}

function abEval(js, opts = {}) {
  // Use base64 encoding to avoid all shell/path escaping issues
  const b64 = Buffer.from(js, "utf-8").toString("base64");
  const raw = ab(`eval -b ${b64}`, opts);
  return raw;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Load profile from YAML file. Uses a line-by-line parser that handles
 * nested keys with dot-path flattening, then re-inflates.
 */
function loadProfile(filePath) {
  const text = readFileSync(filePath, "utf-8");
  const flat = {};
  const path = [];
  const indents = [-1];

  for (const line of text.split("\n")) {
    if (line.trim() === "" || line.trim().startsWith("#")) continue;
    const indent = line.search(/\S/);
    const content = line.trim();

    // Pop path stack to match indent
    while (indents.length > 1 && indents[indents.length - 1] >= indent) {
      indents.pop();
      path.pop();
    }

    // List item
    if (content.startsWith("- ")) {
      const val = content.slice(2).trim().replace(/^["']|["']$/g, "");
      const key = path.join(".");
      if (!flat[key]) flat[key] = [];
      if (Array.isArray(flat[key])) flat[key].push(val);
      continue;
    }

    const m = content.match(/^([\w][\w_.-]*):\s*(.*)/);
    if (!m) continue;
    const [, key, rawVal] = m;
    // Strip inline YAML comments (but not inside quoted strings)
    let stripped = rawVal.trim();
    if (!stripped.startsWith('"') && !stripped.startsWith("'")) {
      stripped = stripped.replace(/\s+#.*$/, "");
    }
    const val = stripped.replace(/^["']|["']$/g, "");

    if (val === "") {
      // Nested object
      path.push(key);
      indents.push(indent);
    } else {
      const fullKey = path.length > 0 ? path.join(".") + "." + key : key;
      if (val === "true") flat[fullKey] = true;
      else if (val === "false") flat[fullKey] = false;
      else if (/^\d+$/.test(val)) flat[fullKey] = parseInt(val, 10);
      else flat[fullKey] = val;
    }
  }

  // Inflate dot-paths into nested object
  const result = {};
  for (const [dotKey, val] of Object.entries(flat)) {
    const parts = dotKey.split(".");
    let cur = result;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!cur[parts[i]] || typeof cur[parts[i]] !== "object" || Array.isArray(cur[parts[i]])) {
        cur[parts[i]] = {};
      }
      cur = cur[parts[i]];
    }
    cur[parts[parts.length - 1]] = val;
  }
  return result;
}

// ---------------------------------------------------------------------------
// HTML → Markdown converter (minimal, focused on doc content)
// ---------------------------------------------------------------------------

function htmlToMarkdown(html) {
  if (!html) return "";

  let md = html;

  // Remove script/style tags
  md = md.replace(/<(script|style|noscript)[^>]*>[\s\S]*?<\/\1>/gi, "");

  // Handle code blocks: <pre><code>...</code></pre> or <pre>...</pre>
  md = md.replace(/<pre[^>]*><code[^>]*>([\s\S]*?)<\/code><\/pre>/gi, (_, code) => {
    return "\n```\n" + decodeHtmlEntities(code.trim()) + "\n```\n";
  });
  md = md.replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, (_, code) => {
    return "\n```\n" + decodeHtmlEntities(code.trim()) + "\n```\n";
  });

  // Inline code
  md = md.replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, (_, code) => {
    return "`" + decodeHtmlEntities(code.trim()) + "`";
  });

  // Headings
  md = md.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, (_, t) => `\n# ${stripTags(t).trim()}\n`);
  md = md.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, (_, t) => `\n## ${stripTags(t).trim()}\n`);
  md = md.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, (_, t) => `\n### ${stripTags(t).trim()}\n`);
  md = md.replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, (_, t) => `\n#### ${stripTags(t).trim()}\n`);
  md = md.replace(/<h5[^>]*>([\s\S]*?)<\/h5>/gi, (_, t) => `\n##### ${stripTags(t).trim()}\n`);
  md = md.replace(/<h6[^>]*>([\s\S]*?)<\/h6>/gi, (_, t) => `\n###### ${stripTags(t).trim()}\n`);

  // Tables
  md = md.replace(/<table[^>]*>([\s\S]*?)<\/table>/gi, (_, tableHtml) => {
    return convertTable(tableHtml);
  });

  // Links
  md = md.replace(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (_, href, text) => {
    const clean = stripTags(text).trim();
    if (!clean) return "";
    return `[${clean}](${href})`;
  });

  // Bold / italic
  md = md.replace(/<(strong|b)[^>]*>([\s\S]*?)<\/\1>/gi, (_, _t, text) => `**${stripTags(text).trim()}**`);
  md = md.replace(/<(em|i)[^>]*>([\s\S]*?)<\/\1>/gi, (_, _t, text) => `*${stripTags(text).trim()}*`);

  // List items
  md = md.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_, text) => {
    return `- ${stripTags(text).trim()}\n`;
  });

  // Paragraphs
  md = md.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, (_, text) => {
    return `\n${text.trim()}\n`;
  });

  // Line breaks
  md = md.replace(/<br\s*\/?>/gi, "\n");

  // Remove remaining HTML tags
  md = stripTags(md);

  // Decode HTML entities
  md = decodeHtmlEntities(md);

  // Clean stray indentation from DITA source
  md = md.replace(/^\s{4,}/gm, "");

  // Clean up excessive newlines
  md = md.replace(/\n{3,}/g, "\n\n");

  return md.trim();
}

function stripTags(html) {
  return html.replace(/<[^>]+>/g, "");
}

function decodeHtmlEntities(text) {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function convertTable(tableHtml) {
  const rows = [];
  const rowMatches = tableHtml.match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi) || [];

  for (const row of rowMatches) {
    const cells = [];
    const cellMatches = row.match(/<(th|td)[^>]*>([\s\S]*?)<\/\1>/gi) || [];
    for (const cell of cellMatches) {
      const text = stripTags(cell).trim().replace(/\|/g, "\\|");
      cells.push(text);
    }
    if (cells.length > 0) rows.push(cells);
  }

  if (rows.length === 0) return "";

  const maxCols = Math.max(...rows.map((r) => r.length));
  const lines = [];

  // Header row
  const header = rows[0] || [];
  while (header.length < maxCols) header.push("");
  lines.push("| " + header.join(" | ") + " |");
  lines.push("| " + header.map(() => "---").join(" | ") + " |");

  // Data rows
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    while (r.length < maxCols) r.push("");
    lines.push("| " + r.join(" | ") + " |");
  }

  return "\n" + lines.join("\n") + "\n";
}

// ---------------------------------------------------------------------------
// Core scraper logic
// ---------------------------------------------------------------------------

async function discoverPages(entryUrl, urlPattern) {
  console.log(`[discover] Opening entry: ${entryUrl}`);
  ab(`open "${entryUrl}" --wait networkidle --timeout 90000`, { timeout: 120000 });
  await sleep(3000);

  // Extract all links matching the pattern from the page.
  // Filter: must be /en/ locale, must be under /administer/4.21/, no fragment-only, deduplicated.
  const js = `
    (() => {
      const links = [...document.querySelectorAll('a')]
        .map(a => a.href.split('#')[0])
        .filter(h => h.includes('/administer/4.21/'))
        .filter(h => h.includes('splunk-it-service-intelligence'))
        .filter(h => h.includes('/en/'))
        .filter(h => h !== '')
        .filter((v, i, s) => s.indexOf(v) === i);
      return JSON.stringify(links);
    })()
  `;
  const raw = abEval(js);
  if (!raw) {
    console.error("[discover] Failed to extract links");
    return [entryUrl];
  }

  try {
    // Parse the JSON from the output — agent-browser wraps it in quotes
    let cleaned = raw.trim();
    if (cleaned.startsWith('"') && cleaned.endsWith('"')) {
      cleaned = JSON.parse(cleaned); // unwrap the outer string
    }
    const urls = JSON.parse(cleaned);
    console.log(`[discover] Found ${urls.length} pages`);
    return urls;
  } catch (e) {
    console.error(`[discover] Failed to parse links: ${e.message}`);
    return [entryUrl];
  }
}

async function openWithRetry(url, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const result = ab(`open "${url}" --wait networkidle --timeout 60000`, { timeout: 90000 });
    if (result !== null) return true;
    console.log(`  [retry ${attempt + 1}/${retries}] re-opening...`);
    await sleep(2000);
  }
  return false;
}

async function extractPage(url, delayMs) {
  console.log(`[extract] ${url}`);
  const opened = await openWithRetry(url);
  if (!opened) {
    return { url, title: "", body: "", error: "open failed after retries" };
  }
  await sleep(Math.max(delayMs, 1000));

  // Extract title separately (small payload)
  const titleJs = `
    (() => {
      const el = document.querySelector('article h1.title, article h1');
      return el ? el.textContent.trim() : '';
    })()
  `;
  let title = abEval(titleJs) || "";
  // agent-browser wraps string output in quotes
  if (title.startsWith('"') && title.endsWith('"')) {
    try { title = JSON.parse(title); } catch {}
  }

  // Extract body HTML — collect all content from the article.
  // Splunk help nests sections in child article.topic elements beyond .body.
  const bodyJs = `
    (() => {
      const article = document.querySelector('article[role="article"]');
      if (!article) return '';

      // Remove unwanted elements
      ['nav', 'script', 'style', 'noscript', '.cookie-banner'].forEach(sel =>
        article.querySelectorAll(sel).forEach(el => el.remove())
      );

      // Collect everything except the h1 title
      const parts = [];
      for (const child of article.children) {
        if (child.tagName === 'H1') continue;
        parts.push(child.outerHTML);
      }
      return parts.join('\\n');
    })()
  `;
  let body = abEval(bodyJs) || "";
  // Unwrap quoted string if agent-browser wraps it
  if (body.startsWith('"') && body.endsWith('"')) {
    try { body = JSON.parse(body); } catch {}
  }

  const currentUrl = ab(`get url`) || url;

  return { url: currentUrl.replace(/^"|"$/g, ""), title, body };
}

function assembleMarkdown(pages) {
  const lines = [];

  lines.push("# Splunk ITSI 4.21 — Administer Manual");
  lines.push("");
  lines.push(`> Extracted on ${new Date().toISOString().split("T")[0]}`);
  lines.push(`> Source: https://help.splunk.com/en/splunk-it-service-intelligence/splunk-it-service-intelligence/administer/4.21/`);
  lines.push(`> Pages: ${pages.length}`);
  lines.push("");

  // Table of Contents
  lines.push("## Table of Contents");
  lines.push("");
  for (let i = 0; i < pages.length; i++) {
    const p = pages[i];
    if (p.title) {
      const anchor = p.title
        .toLowerCase()
        .replace(/[^a-z0-9 ]/g, "")
        .replace(/\s+/g, "-");
      lines.push(`${i + 1}. [${p.title}](#${anchor})`);
    }
  }
  lines.push("");
  lines.push("---");
  lines.push("");

  // Content
  for (const page of pages) {
    if (page.error) {
      lines.push(`<!-- ERROR: ${page.error} for ${page.url} -->`);
      continue;
    }

    const md = htmlToMarkdown(page.body);
    if (!md && !page.title) continue;

    lines.push(`# ${page.title}`);
    lines.push("");
    lines.push(`> Source: ${page.url}`);
    lines.push("");
    lines.push(md);
    lines.push("");
    lines.push("---");
    lines.push("");
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const profilePath = args.includes("--profile")
    ? resolve(args[args.indexOf("--profile") + 1])
    : resolve(__dirname, "profile.yaml");

  console.log(`[main] Loading profile: ${profilePath}`);
  const profile = loadProfile(profilePath);
  console.log(`[main] Profile parsed:`, JSON.stringify({ entry: profile.entry?.url, delay: profile.options?.delay_ms, max: profile.options?.max_pages }, null, 2));

  const entryUrl = profile.entry?.url || profile.entry;
  const delayMs = profile.options?.delay_ms || 1500;
  const cliLimit = args.includes("--limit") ? parseInt(args[args.indexOf("--limit") + 1], 10) : 0;
  const maxPages = cliLimit || profile.options?.max_pages || 200;

  // Create output directory
  const outDir = resolve(__dirname, "output");
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

  // Phase 1: Discover pages
  console.log("\n=== Phase 1: Discover pages ===");
  let urls = await discoverPages(entryUrl);

  if (urls.length > maxPages) {
    console.log(`[discover] Limiting to ${maxPages} pages`);
    urls = urls.slice(0, maxPages);
  }

  // Save discovered URLs
  writeFileSync(resolve(outDir, "urls.json"), JSON.stringify(urls, null, 2), "utf-8");
  console.log(`[discover] Saved ${urls.length} URLs to output/urls.json`);

  // Phase 2: Extract each page
  console.log("\n=== Phase 2: Extract pages ===");
  const pages = [];
  const intermediate = [];
  const seenUrls = new Set();

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    console.log(`  [${i + 1}/${urls.length}] ${url.split("/").pop()}`);

    const page = await extractPage(url, delayMs);

    // Deduplicate by resolved URL (handles redirects like /overview -> /overview/about-...)
    const resolvedUrl = (page.url || url).split("#")[0];
    if (seenUrls.has(resolvedUrl)) {
      console.log(`    [skip] duplicate of already-extracted URL`);
      continue;
    }
    seenUrls.add(resolvedUrl);
    pages.push(page);

    // Write intermediate JSONL record
    intermediate.push(JSON.stringify({
      seq: i,
      url: page.url || url,
      title: page.title,
      body_length: page.body?.length || 0,
      error: page.error || null,
      extracted_at: new Date().toISOString(),
    }));

    // Be polite
    if (i < urls.length - 1) await sleep(delayMs);
  }

  // Save intermediate
  writeFileSync(resolve(outDir, "pages.jsonl"), intermediate.join("\n"), "utf-8");
  console.log(`[extract] Saved ${pages.length} records to output/pages.jsonl`);

  // Phase 3: Assemble markdown
  console.log("\n=== Phase 3: Assemble markdown ===");
  const markdown = assembleMarkdown(pages);
  const outFile = resolve(outDir, profile.output?.file || "output.md");
  writeFileSync(outFile, markdown, "utf-8");
  console.log(`[assemble] Wrote ${(markdown.length / 1024).toFixed(1)} KB to ${outFile}`);

  // Close browser
  ab("close");
  console.log("\n=== Done ===");
}

main().catch((e) => {
  console.error(e);
  ab("close");
  process.exit(1);
});

/**
 * Core extraction engine — interprets a WISE scraper profile and executes it.
 *
 * Walks the selector tree (respecting parents/children), executes interactions,
 * handles pagination and matrix expansion, runs extractions via DOM eval,
 * and emits intermediate records.
 */

import { Browser, escapeJs } from "./browser.js";
import type { HookRegistry } from "./hooks.js";
import type {
  Context,
  Resource,
  Selector,
  Interaction,
  Extraction,
  ExtractedRecord,
  Locator,
} from "./types.js";

export class Engine {
  private browser: Browser;
  private hooks: HookRegistry | null;
  private seenUrls = new Set<string>();

  constructor(browser: Browser, hooks: HookRegistry | null = null) {
    this.browser = browser;
    this.hooks = hooks;
  }

  // ------------------------------------------------------------------
  // Public API
  // ------------------------------------------------------------------

  runResource(resource: Resource): ExtractedRecord[] {
    const selectors: Record<string, Selector> = {};
    for (const s of resource.selectors) selectors[s.name] = s;

    const entry = resource.entry;
    const globals = resource.globals ?? {};

    if (globals.timeout_ms) this.browser.timeoutMs = globals.timeout_ms;
    if (globals.retries) this.browser.retries = globals.retries;

    const entryUrl =
      typeof entry.url === "string" ? entry.url : null;
    if (!entryUrl) {
      throw new Error("Artifact-ref entry URLs require chaining support");
    }

    console.log(`[engine] Opening entry: ${entryUrl}`);
    if (!this.browser.open(entryUrl)) {
      console.error("[engine] Failed to open entry URL");
      return [];
    }
    this.seenUrls.add(entryUrl);

    const rootSel = selectors[entry.root];
    if (!rootSel) throw new Error(`Root selector '${entry.root}' not found`);

    const records: ExtractedRecord[] = [];
    this.walkSelector(rootSel, selectors, records, 0);
    return records;
  }

  // ------------------------------------------------------------------
  // Selector tree walker
  // ------------------------------------------------------------------

  private walkSelector(
    sel: Selector,
    allSelectors: Record<string, Selector>,
    records: ExtractedRecord[],
    depth: number,
  ): void {
    const indent = "  ".repeat(depth);
    const selType = sel.type ?? "element";
    console.log(`${indent}[selector] ${sel.name} (type=${selType})`);

    if (!this.checkContext(sel.context ?? {})) {
      console.log(`${indent}  Context check failed for '${sel.name}', skipping`);
      return;
    }

    for (const interaction of sel.interaction ?? []) {
      this.executeInteraction(interaction);
    }

    if (selType === "pagination") {
      this.handlePagination(sel, allSelectors, records, depth);
    } else if (selType === "matrix") {
      this.handleMatrix(sel, allSelectors, records, depth);
    } else {
      this.handleElement(sel, allSelectors, records, depth);
    }
  }

  // ------------------------------------------------------------------
  // Element handler
  // ------------------------------------------------------------------

  private handleElement(
    sel: Selector,
    allSelectors: Record<string, Selector>,
    records: ExtractedRecord[],
    depth: number,
  ): void {
    const indent = "  ".repeat(depth);
    const css = sel.selector;
    const multiple = sel.multiple ?? false;
    const extractions = sel.extract ?? [];
    const delayMs = sel.delay_ms ?? 0;

    if (extractions.length > 0) {
      if (multiple && css) {
        const rows = this.extractMultiple(css, extractions);
        console.log(`${indent}  Extracted ${rows.length} rows from '${sel.name}'`);
        for (const row of rows) {
          let record = this.makeRecord(sel.name, row);
          if (this.hooks) record = this.hooks.invoke("post_extract", record);
          records.push(record);
        }
      } else {
        const row = this.extractSingle(css ?? null, extractions);
        if (row) {
          let record = this.makeRecord(sel.name, row);
          if (this.hooks) record = this.hooks.invoke("post_extract", record);
          records.push(record);
        }
      }
    }

    if (delayMs) this.browser.sleep(delayMs);

    this.walkChildren(sel.name, allSelectors, records, depth);
  }

  // ------------------------------------------------------------------
  // Pagination handler
  // ------------------------------------------------------------------

  private handlePagination(
    sel: Selector,
    allSelectors: Record<string, Selector>,
    records: ExtractedRecord[],
    depth: number,
  ): void {
    const indent = "  ".repeat(depth);
    const pag = sel.pagination;
    if (!pag) return;

    const pagType = pag.pagination_type ?? "next";
    const pagSelector = pag.selector ?? "";
    const pageLimit = pag.page_limit ?? 10;

    console.log(`${indent}  Pagination: type=${pagType}, limit=${pageLimit}`);

    if (pagType === "numeric") {
      const pageUrls = this.discoverPageUrls(pagSelector, pageLimit);
      for (let i = 0; i < pageUrls.length; i++) {
        console.log(`${indent}  Page ${i + 1}/${pageUrls.length}`);
        if (i > 0) {
          this.browser.open(pageUrls[i]);
          this.browser.sleep(1000);
        }
        this.walkChildren(sel.name, allSelectors, records, depth);
      }
    } else if (pagType === "next") {
      for (let page = 0; page < pageLimit; page++) {
        console.log(`${indent}  Page ${page + 1}/${pageLimit}`);
        this.walkChildren(sel.name, allSelectors, records, depth);

        const hasNext = this.browser.evalJson<boolean>(`
          (() => {
            const el = document.querySelector('${escapeJs(pagSelector)}');
            return el ? true : false;
          })()
        `);
        if (!hasNext) {
          console.log(`${indent}  No more pages`);
          break;
        }
        this.browser.click({ css: pagSelector });
        this.browser.wait({ networkIdle: true });
        this.browser.sleep(1000);
      }
    } else if (pagType === "infinite") {
      const stopCondition = pag.stop_condition;
      for (let page = 0; page < pageLimit; page++) {
        console.log(`${indent}  Scroll page ${page + 1}/${pageLimit}`);
        this.walkChildren(sel.name, allSelectors, records, depth);
        this.browser.scroll("down", 2000);
        this.browser.sleep(1500);
        if (stopCondition) {
          const met = this.browser.evalJson<boolean>(`
            (() => document.querySelector('${escapeJs(stopCondition)}') ? true : false)()
          `);
          if (met) {
            console.log(`${indent}  Stop condition met`);
            break;
          }
        }
      }
    }
  }

  // ------------------------------------------------------------------
  // Matrix handler
  // ------------------------------------------------------------------

  private handleMatrix(
    sel: Selector,
    allSelectors: Record<string, Selector>,
    records: ExtractedRecord[],
    depth: number,
  ): void {
    const indent = "  ".repeat(depth);
    const matrix = sel.matrix;
    if (!matrix?.axes?.length) return;

    const resolved = matrix.axes.map((axis) => {
      let values = axis.values;
      if (values === "auto" || (Array.isArray(values) && values.length === 0)) {
        values = this.discoverAxisValues(axis.selector, axis.action);
      }
      return { ...axis, values: values as string[] };
    });

    const combos = cartesian(resolved.map((a) => a.values));
    console.log(`${indent}  Matrix: ${combos.length} combos across ${resolved.length} axes`);

    for (const combo of combos) {
      console.log(`${indent}  Combo: [${combo.join(", ")}]`);
      for (let i = 0; i < combo.length; i++) {
        const axis = resolved[i];
        const val = combo[i];
        if (axis.action === "select") {
          this.browser.select({ css: axis.selector }, val);
        } else if (axis.action === "type") {
          this.browser.eval(`
            (() => {
              const el = document.querySelector('${escapeJs(axis.selector)}');
              if (el) { el.value = ''; el.value = '${escapeJs(val)}'; el.dispatchEvent(new Event('input')); }
            })()
          `);
        } else if (axis.action === "checkbox") {
          this.browser.click({ css: axis.selector });
        }
      }
      this.browser.wait({ networkIdle: true });
      this.browser.sleep(1000);
      this.walkChildren(sel.name, allSelectors, records, depth);
    }
  }

  // ------------------------------------------------------------------
  // Children
  // ------------------------------------------------------------------

  private walkChildren(
    parentName: string,
    allSelectors: Record<string, Selector>,
    records: ExtractedRecord[],
    depth: number,
  ): void {
    for (const sel of Object.values(allSelectors)) {
      if ((sel.parents ?? []).includes(parentName)) {
        this.walkSelector(sel, allSelectors, records, depth + 1);
      }
    }
  }

  // ------------------------------------------------------------------
  // Context checking
  // ------------------------------------------------------------------

  private checkContext(context: Context): boolean {
    if (!context || Object.keys(context).length === 0) return true;
    const url = this.browser.getUrl() ?? "";

    if (context.url_pattern && !url.includes(context.url_pattern)) return false;
    if (context.url && !url.includes(context.url)) return false;

    if (context.selector_exists) {
      const exists = this.browser.evalJson<boolean>(`
        (() => document.querySelector('${escapeJs(context.selector_exists)}') ? true : false)()
      `);
      if (!exists) return false;
    }

    if (context.text_in_page) {
      const found = this.browser.evalJson<boolean>(`
        (() => document.body.innerText.includes('${escapeJs(context.text_in_page)}'))()
      `);
      if (!found) return false;
    }

    return true;
  }

  // ------------------------------------------------------------------
  // Interaction execution
  // ------------------------------------------------------------------

  private executeInteraction(interaction: Interaction): void {
    const itype = interaction.type;
    console.log(`    [interaction] ${itype}`);

    if (itype === "click") {
      const target = interaction.target ?? {};
      const actionType = interaction.click_action_type ?? "real";

      if (target.css) {
        const href = this.browser.evalJson<string>(`
          (() => {
            const el = document.querySelector('${escapeJs(target.css)}');
            return el ? (el.href || el.getAttribute('href') || '') : '';
          })()
        `);
        if (href && typeof href === "string" && href.startsWith("http")) {
          this.browser.open(href);
        } else {
          this.browser.click(target, actionType);
        }
      } else {
        this.browser.click(target, actionType);
      }
      if (interaction.delay_ms) this.browser.sleep(interaction.delay_ms);

    } else if (itype === "select") {
      this.browser.select(interaction.target, interaction.value);
      if (interaction.delay_ms) this.browser.sleep(interaction.delay_ms);

    } else if (itype === "scroll") {
      this.browser.scroll(interaction.direction ?? "down", interaction.amount_px ?? 500);
      if (interaction.delay_ms) this.browser.sleep(interaction.delay_ms);

    } else if (itype === "wait") {
      this.browser.wait({
        ms: interaction.ms,
        networkIdle: interaction.network_idle,
        selector: interaction.selector,
      });

    } else if (itype === "reveal") {
      const target = interaction.target;
      if (interaction.mode === "hover") {
        const sel = this.browser.locatorToSelector(target);
        this.browser._run(["hover", `"${sel}"`]);
      } else {
        this.browser.click(target);
      }
      if (interaction.delay_ms) this.browser.sleep(interaction.delay_ms);
    }
  }

  // ------------------------------------------------------------------
  // Extraction via DOM eval
  // ------------------------------------------------------------------

  private extractSingle(
    containerCss: string | null,
    extractions: Extraction[],
  ): Record<string, unknown> | null {
    const containerJs = containerCss
      ? `const container = document.querySelector('${escapeJs(containerCss)}') || document;`
      : `const container = document;`;

    const fieldJs = extractions.map((ext) => this.extractionToJs(ext)).join("\n");

    const js = `
      (() => {
        ${containerJs}
        const result = {};
        ${fieldJs}
        return JSON.stringify(result);
      })()
    `;
    return this.browser.evalJson(js);
  }

  private extractMultiple(
    rowCss: string,
    extractions: Extraction[],
  ): Record<string, unknown>[] {
    const fieldJs = extractions.map((ext) => this.extractionToJs(ext, "row")).join("\n");

    const js = `
      (() => {
        const rows = [...document.querySelectorAll('${escapeJs(rowCss)}')];
        return JSON.stringify(rows.map(row => {
          const container = row;
          const result = {};
          ${fieldJs}
          return result;
        }));
      })()
    `;
    return this.browser.evalJson<Record<string, unknown>[]>(js) ?? [];
  }

  private extractionToJs(ext: Extraction, varName = "container"): string {
    const etype = ext.type ?? "text";
    const name = escapeJs(ext.name ?? "unnamed");
    const selector = "selector" in ext ? escapeJs(ext.selector ?? "") : "";

    switch (etype) {
      case "text":
        return `result['${name}'] = ${varName}.querySelector('${selector}')?.textContent?.trim() || '';`;
      case "html":
        return `result['${name}'] = ${varName}.querySelector('${selector}')?.innerHTML || '';`;
      case "attr": {
        const attr = escapeJs((ext as { attr: string }).attr ?? "");
        return `result['${name}'] = ${varName}.querySelector('${selector}')?.getAttribute('${attr}') || '';`;
      }
      case "link": {
        const attr = escapeJs((ext as { attr?: string }).attr ?? "href");
        return `result['${name}'] = ${varName}.querySelector('${selector}')?.getAttribute('${attr}') || '';`;
      }
      case "table":
        return this.tableExtractionJs(ext as Extraction & { type: "table" }, varName);
      case "ai":
        return `result['${name}'] = '[AI extraction not implemented]';`;
      default:
        return `result['${name}'] = '';`;
    }
  }

  private tableExtractionJs(
    ext: { name: string; selector: string; header_row?: number; columns?: Array<{ name: string; header?: string; index?: number }> },
    varName = "container",
  ): string {
    const name = escapeJs(ext.name ?? "table");
    const selector = escapeJs(ext.selector ?? "table");
    const headerRow = ext.header_row ?? 0;
    const columns = ext.columns ?? [];

    if (columns.length > 0) {
      const colDefs = JSON.stringify(columns);
      return `
        (() => {
          const tbl = ${varName}.querySelector('${selector}');
          if (!tbl) { result['${name}'] = []; return; }
          const hdr = tbl.querySelectorAll('tr')[${headerRow}];
          const headers = [...(hdr?.querySelectorAll('th, td') || [])].map(c => c.textContent.trim());
          const colDefs = ${colDefs};
          const colMap = colDefs.map(cd => {
            if (cd.header) return headers.indexOf(cd.header);
            if (cd.index !== undefined) return cd.index;
            return -1;
          });
          const dataRows = [...tbl.querySelectorAll('tr')].slice(${headerRow + 1});
          result['${name}'] = dataRows.map(row => {
            const cells = [...row.querySelectorAll('td, th')];
            const obj = {};
            colDefs.forEach((cd, i) => {
              const idx = colMap[i];
              obj[cd.name] = idx >= 0 && cells[idx] ? cells[idx].textContent.trim() : '';
            });
            return obj;
          });
        })();
      `;
    }

    return `
      (() => {
        const tbl = ${varName}.querySelector('${selector}');
        if (!tbl) { result['${name}'] = []; return; }
        result['${name}'] = [...tbl.querySelectorAll('tr')].map(row =>
          [...row.querySelectorAll('td, th')].map(c => c.textContent.trim())
        );
      })();
    `;
  }

  // ------------------------------------------------------------------
  // Helpers
  // ------------------------------------------------------------------

  private discoverPageUrls(pagSelector: string, pageLimit: number): string[] {
    const result = this.browser.evalJson<string[]>(`
      (() => {
        const links = [...document.querySelectorAll('${escapeJs(pagSelector)}')];
        const current = window.location.href;
        const urls = [current, ...links.map(a => a.href)].filter((v, i, s) => s.indexOf(v) === i);
        return JSON.stringify(urls);
      })()
    `);
    if (Array.isArray(result)) return result.slice(0, pageLimit);
    return [this.browser.getUrl() ?? ""];
  }

  private discoverAxisValues(selector: string, action: string): string[] {
    if (action === "select") {
      return this.browser.evalJson<string[]>(`
        (() => {
          const opts = [...document.querySelectorAll('${escapeJs(selector)} option')];
          return JSON.stringify(opts.map(o => o.value).filter(v => v !== ''));
        })()
      `) ?? [];
    }
    return [];
  }

  private makeRecord(selectorName: string, data: Record<string, unknown>): ExtractedRecord {
    return {
      selector: selectorName,
      url: this.browser.getUrl() ?? "",
      data,
      extracted_at: new Date().toISOString(),
    };
  }
}

// ------------------------------------------------------------------
// Utility
// ------------------------------------------------------------------

function cartesian(arrays: string[][]): string[][] {
  if (arrays.length === 0) return [[]];
  return arrays.reduce<string[][]>(
    (acc, arr) => acc.flatMap((combo) => arr.map((val) => [...combo, val])),
    [[]],
  );
}

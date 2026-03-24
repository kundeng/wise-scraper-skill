#!/usr/bin/env node
/**
 * WISE Scraper — generic runner CLI.
 *
 * Reads a YAML profile, interprets the declarative schema, executes via
 * agent-browser, and outputs intermediate JSONL + optional assembled output.
 *
 * Usage:
 *   node dist/run.js <profile.yaml> [--output-dir ./output] [--hooks ./hooks.js] [--set k=v] [--config extra.yaml] [-v] [--dry-run]
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { resolve } from "path";
import yaml from "js-yaml";

import { Browser } from "./browser.js";
import { Engine } from "./engine.js";
import { HookRegistry } from "./hooks.js";
import { assembleMarkdown, assembleCsv } from "./processing.js";
import { loadConfig } from "./config.js";
import type {
  Deployment,
  Resource,
  Selector,
  ExtractedRecord,
  HookContext,
} from "./types.js";

// ------------------------------------------------------------------
// Output writers
// ------------------------------------------------------------------

function writeJsonl(records: ExtractedRecord[], path: string): void {
  const lines = records.map((r) => JSON.stringify(r));
  writeFileSync(path, lines.join("\n") + "\n", "utf-8");
  console.log(`[output] Wrote ${records.length} records to ${path}`);
}

function writeCsv(records: ExtractedRecord[], path: string): void {
  writeFileSync(path, assembleCsv(records), "utf-8");
  console.log(`[output] Wrote ${records.length} rows to ${path}`);
}

function writeJson(records: ExtractedRecord[], path: string): void {
  writeFileSync(path, JSON.stringify(records, null, 2), "utf-8");
  console.log(`[output] Wrote ${records.length} records to ${path}`);
}

function writeMarkdown(records: ExtractedRecord[], path: string, title?: string): void {
  const md = assembleMarkdown(records, { title });
  writeFileSync(path, md, "utf-8");
  console.log(`[output] Wrote ${(md.length / 1024).toFixed(1)} KB to ${path}`);
}

type Writer = (records: ExtractedRecord[], path: string) => void;

const OUTPUT_WRITERS: Record<string, Writer> = {
  jsonl: writeJsonl,
  csv: writeCsv,
  json: writeJson,
  markdown: writeMarkdown,
  md: writeMarkdown,
};

// ------------------------------------------------------------------
// Profile loading
// ------------------------------------------------------------------

function loadProfile(profilePath: string): Deployment {
  const text = readFileSync(profilePath, "utf-8");
  const profile = yaml.load(text) as Record<string, unknown>;
  if (!profile) throw new Error(`Empty profile: ${profilePath}`);

  // Full schema format: has resources[]
  if (profile.resources) return profile as unknown as Deployment;

  // Flat format: has entry but no resources — convert
  if (profile.entry) return flatToSchema(profile);

  throw new Error("Profile must have 'resources' (schema format) or 'entry' (flat format)");
}

function flatToSchema(flat: Record<string, unknown>): Deployment {
  const entry = flat.entry as { url: string } | string;
  const options = (flat.options ?? {}) as Record<string, number>;
  const discovery = (flat.discovery ?? {}) as Record<string, string>;
  const content = (flat.content ?? {}) as Record<string, unknown>;
  const output = (flat.output ?? {}) as Record<string, string>;

  const resource: Resource = {
    name: (flat.name as string) ?? "default",
    entry: {
      url: typeof entry === "string" ? entry : entry.url,
      root: "root",
    },
    globals: { timeout_ms: options.timeout_ms ?? 30000 },
    selectors: [],
  };

  const rootSel: Selector = {
    name: "root",
    parents: [],
    context: {},
  };

  if (discovery.url_pattern) {
    rootSel.context.url_pattern = discovery.url_pattern.split("**")[0].replace(/\/$/, "");
  }

  const fields = content.fields as Record<string, Record<string, string>> | undefined;
  if (fields) {
    rootSel.extract = [];
    for (const [fieldName, fieldDef] of Object.entries(fields)) {
      if (typeof fieldDef === "object") {
        rootSel.extract.push({
          type: (fieldDef.type ?? "text") as "text",
          name: fieldName,
          selector: fieldDef.selector ?? "",
        });
      }
    }
  }
  if (!resource.selectors) resource.selectors = [];
  resource.selectors.push(rootSel);

  return {
    name: (flat.name as string) ?? "default",
    resources: [resource],
    _output: {
      format: output.intermediate ?? output.format ?? "jsonl",
      file: output.file ?? "output",
    },
    _options: options,
  };
}

// ------------------------------------------------------------------
// Main
// ------------------------------------------------------------------

async function main(): Promise<void> {
  const config = loadConfig(process.argv.slice(2));
  const { runner, profile: profileData } = config;

  if (!runner.profile) {
    console.error("Usage: node dist/run.js <profile.yaml> [--output-dir ./output] [--hooks ./hooks.js] [--set k=v] [--config extra.yaml] [-v] [--dry-run]");
    process.exit(1);
  }

  const profilePath = resolve(runner.profile);
  console.log(`[main] Loading profile: ${profilePath}`);
  const profile = loadProfile(profilePath);
  const resources = profile.resources ?? [];
  console.log(`[main] Profile: ${profile.name ?? "?"} (${resources.length} resources)`);

  if (runner.dryRun) {
    console.log("[main] Dry run — config resolved successfully:");
    console.log(JSON.stringify({ runner, inputs: config.inputs }, null, 2));
    return;
  }

  const outDir = resolve(runner.outputDir);
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

  const hookRegistry = new HookRegistry();
  if (profile.hooks) hookRegistry.loadFromConfig(profile.hooks);
  if (runner.hooks) await hookRegistry.loadFromModule(resolve(runner.hooks));

  const browser = new Browser({
    timeoutMs: runner.timeout,
    retries: runner.retries,
  });

  try {
    const allRecords: ExtractedRecord[] = [];
    for (const resource of resources) {
      console.log(`\n=== Resource: ${resource.name} ===`);
      const engine = new Engine(browser, hookRegistry);
      const records = engine.runResource(resource);
      allRecords.push(...records);
      console.log(`[engine] Resource '${resource.name}' produced ${records.length} records`);
    }

    // pre_assemble hook
    let ctx: HookContext = { records: allRecords, profile };
    ctx = hookRegistry.invoke("pre_assemble", ctx);
    const finalRecords = ctx.records;

    // Determine output format
    const outputConfig = profile._output ?? { format: runner.outputFormat, file: profile.name ?? "output" };
    const fmt = outputConfig.format ?? runner.outputFormat ?? "jsonl";
    let baseName = outputConfig.file ?? profile.name ?? "output";
    if (baseName.includes(".")) baseName = baseName.split(".").slice(0, -1).join(".");

    // Always write JSONL intermediate
    const jsonlPath = resolve(outDir, `${baseName}.jsonl`);
    writeJsonl(finalRecords, jsonlPath);

    // Write in requested format if different
    if (fmt !== "jsonl" && OUTPUT_WRITERS[fmt]) {
      const ext = fmt === "markdown" ? "md" : fmt;
      const outPath = resolve(outDir, `${baseName}.${ext}`);
      OUTPUT_WRITERS[fmt](finalRecords, outPath);
    }

    // post_assemble hook
    hookRegistry.invoke("post_assemble", {
      records: finalRecords,
      outputDir: outDir,
      profile,
    } as HookContext);

    console.log(`\n=== Done: ${finalRecords.length} total records ===`);
  } finally {
    browser.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

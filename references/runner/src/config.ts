/**
 * Input config layer — Hydra-like config composition for the WISE scraper runner.
 *
 * Provides:
 *   - Schema-defined defaults (via convict)
 *   - YAML config file loading with deep-merge composition
 *   - CLI argument overrides (--set key=value)
 *   - Environment variable binding
 *   - Validation before execution
 *
 * Use case: a user says "search axx, bxx and cxx and combine the results".
 * The profile declares `inputs.queries: []` in its schema, and the user overrides
 * via CLI: `--set inputs.queries=[axx,bxx,cxx]`
 *
 * Config resolution order (later wins):
 *   0. Canonical config (wise.config.yaml or .wiserc.yaml — auto-loaded if present)
 *   1. Schema defaults
 *   2. Base profile YAML
 *   3. Override YAML files (--config extras)
 *   4. Environment variables
 *   5. CLI --set overrides
 */

import convict from "convict";
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import yaml from "js-yaml";
import deepmerge from "deepmerge";

// ------------------------------------------------------------------
// Built-in config schema (runner-level settings)
// ------------------------------------------------------------------

const runnerSchema = {
  profile: {
    doc: "Path to the primary YAML profile",
    format: String,
    default: "",
    arg: "profile",
  },
  outputDir: {
    doc: "Directory for output files",
    format: String,
    default: "./output",
    arg: "output-dir",
    env: "WISE_OUTPUT_DIR",
  },
  outputFormat: {
    doc: "Output format: jsonl, csv, json, markdown",
    format: ["jsonl", "csv", "json", "markdown", "md"],
    default: "jsonl" as string,
    arg: "output-format",
    env: "WISE_OUTPUT_FORMAT",
  },
  hooks: {
    doc: "Path to hooks module (.js/.ts)",
    format: String,
    default: "",
    arg: "hooks",
  },
  verbose: {
    doc: "Enable verbose logging",
    format: Boolean,
    default: false,
    arg: "verbose",
    env: "WISE_VERBOSE",
  },
  dryRun: {
    doc: "Parse and validate config without executing",
    format: Boolean,
    default: false,
    arg: "dry-run",
  },
  concurrency: {
    doc: "Max concurrent browser sessions",
    format: "nat",
    default: 1,
    arg: "concurrency",
    env: "WISE_CONCURRENCY",
  },
  timeout: {
    doc: "Default timeout in ms for browser operations",
    format: "nat",
    default: 60000,
    arg: "timeout",
    env: "WISE_TIMEOUT",
  },
  retries: {
    doc: "Number of retries for failed browser operations",
    format: "nat",
    default: 2,
    arg: "retries",
    env: "WISE_RETRIES",
  },
};

export type RunnerConfig = {
  profile: string;
  outputDir: string;
  outputFormat: string;
  hooks: string;
  verbose: boolean;
  dryRun: boolean;
  concurrency: number;
  timeout: number;
  retries: number;
};

// ------------------------------------------------------------------
// Input config — user-facing parameters declared in profile
// ------------------------------------------------------------------

export interface InputConfig {
  [key: string]: unknown;
}

export interface ResolvedConfig {
  runner: RunnerConfig;
  inputs: InputConfig;
  profile: Record<string, unknown>;
}

// ------------------------------------------------------------------
// Config loading and composition
// ------------------------------------------------------------------

/**
 * Load and compose config from multiple sources.
 *
 * @param argv - raw CLI arguments (process.argv.slice(2))
 * @returns fully resolved config
 */
export function loadConfig(argv: string[]): ResolvedConfig {
  // Parse our own args first (before convict sees them)
  const { positional, sets, configExtras } = parseCustomArgs(argv);

  // Build convict config for runner settings
  const conf = convict(runnerSchema);

  // Positional arg 0 is the profile path
  if (positional[0]) {
    conf.set("profile", positional[0]);
  }

  // Auto-load canonical config if it exists (lowest priority — everything merges on top)
  const canonicalPaths = ["wise.config.yaml", ".wiserc.yaml"];
  let baseConfig: Record<string, unknown> = {};
  for (const cp of canonicalPaths) {
    const absCanonical = resolve(cp);
    if (existsSync(absCanonical)) {
      const raw = readFileSync(absCanonical, "utf-8");
      baseConfig = (yaml.load(raw) as Record<string, unknown>) ?? {};
      console.log(`[config] Auto-loaded canonical config: ${absCanonical}`);
      break; // use the first one found
    }
  }

  // Load the primary profile YAML
  const profilePath = conf.get("profile");
  let profileData: Record<string, unknown> = {};

  if (profilePath && existsSync(resolve(profilePath))) {
    const raw = readFileSync(resolve(profilePath), "utf-8");
    profileData = (yaml.load(raw) as Record<string, unknown>) ?? {};
  }

  // Merge: canonical config (base) ← profile YAML (wins)
  if (Object.keys(baseConfig).length > 0) {
    profileData = deepmerge(baseConfig, profileData) as Record<string, unknown>;
  }

  // Apply runner-level settings from profile if present
  const profileRunner = (profileData._runner ?? profileData.runner_config ?? {}) as Record<string, unknown>;
  for (const [key, val] of Object.entries(profileRunner)) {
    try {
      conf.set(key, val);
    } catch {
      // skip unknown keys
    }
  }

  // Load and deep-merge config extras (--config file1.yaml --config file2.yaml)
  for (const extraPath of configExtras) {
    const absPath = resolve(extraPath);
    if (!existsSync(absPath)) {
      console.warn(`[config] Extra config not found: ${absPath}`);
      continue;
    }
    const extraRaw = readFileSync(absPath, "utf-8");
    const extraData = (yaml.load(extraRaw) as Record<string, unknown>) ?? {};
    profileData = deepmerge(profileData, extraData) as Record<string, unknown>;
    console.log(`[config] Merged extra config: ${absPath}`);
  }

  // Apply --set overrides to profile data
  for (const { key, value } of sets) {
    setNestedValue(profileData, key, parseValue(value));
  }

  // Extract input parameters from profile
  const inputs: InputConfig = (profileData.inputs ?? profileData._inputs ?? {}) as InputConfig;

  // Validate runner config
  conf.validate({ allowed: "warn" });

  const runner = conf.getProperties() as unknown as RunnerConfig;

  return { runner, inputs, profile: profileData };
}

// ------------------------------------------------------------------
// CLI argument parsing (custom layer before convict)
// ------------------------------------------------------------------

interface ParsedArgs {
  positional: string[];
  sets: Array<{ key: string; value: string }>;
  configExtras: string[];
}

function parseCustomArgs(argv: string[]): ParsedArgs {
  const positional: string[] = [];
  const sets: Array<{ key: string; value: string }> = [];
  const configExtras: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === "--set" || arg === "-s") {
      const kv = argv[++i];
      if (kv) {
        const eqIdx = kv.indexOf("=");
        if (eqIdx > 0) {
          sets.push({ key: kv.slice(0, eqIdx), value: kv.slice(eqIdx + 1) });
        }
      }
    } else if (arg === "--config" || arg === "-c") {
      const path = argv[++i];
      if (path) configExtras.push(path);
    } else if (arg === "--output-dir" || arg === "-o") {
      i++; // skip value, convict handles it
    } else if (arg === "--hooks") {
      i++; // skip value, convict handles it
    } else if (arg === "--output-format") {
      i++; // skip value, convict handles it
    } else if (arg === "--timeout" || arg === "--retries" || arg === "--concurrency") {
      i++; // skip value, convict handles it
    } else if (arg === "-v" || arg === "--verbose" || arg === "--dry-run") {
      // flag, no value to skip
    } else if (!arg.startsWith("-")) {
      positional.push(arg);
    }
  }

  return { positional, sets, configExtras };
}

// ------------------------------------------------------------------
// Utilities
// ------------------------------------------------------------------

/**
 * Parse a CLI value string into the appropriate JS type.
 * Supports: arrays [a,b,c], numbers, booleans, strings.
 */
function parseValue(raw: string): unknown {
  // Array syntax: [a,b,c]
  if (raw.startsWith("[") && raw.endsWith("]")) {
    return raw.slice(1, -1).split(",").map((s) => s.trim());
  }
  // Boolean
  if (raw === "true") return true;
  if (raw === "false") return false;
  // Number
  const num = Number(raw);
  if (!isNaN(num) && raw !== "") return num;
  // String
  return raw;
}

/**
 * Set a nested value in an object using dot-notation key.
 * e.g. setNestedValue(obj, "inputs.queries", ["a","b"]) sets obj.inputs.queries = ["a","b"]
 */
function setNestedValue(obj: Record<string, unknown>, dotKey: string, value: unknown): void {
  const parts = dotKey.split(".");
  let current = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i];
    if (typeof current[key] !== "object" || current[key] === null) {
      current[key] = {};
    }
    current = current[key] as Record<string, unknown>;
  }
  current[parts[parts.length - 1]] = value;
}

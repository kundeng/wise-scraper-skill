#!/usr/bin/env node
/**
 * WISE Scraper Skill — Test Runner
 *
 * Runs skill test scenarios against available coding agents and produces
 * a structured report showing which scenarios pass/fail per agent.
 *
 * Usage:
 *   node dist/run-test.js --agent codex          # test with Codex only
 *   node dist/run-test.js --agent claude          # test with Claude Code only
 *   node dist/run-test.js --agent opencode        # test with OpenCode only
 *   node dist/run-test.js --agent all             # test with all available
 *   node dist/run-test.js --scenario single-page-article  # run specific scenario
 *   node dist/run-test.js --list                  # list available scenarios
 *   node dist/run-test.js --check                 # check which agents are available
 */

import { writeFileSync, mkdirSync, existsSync, readFileSync } from "fs";
import { resolve, join } from "path";
import {
  getAgents,
  getAvailableAgents,
  type Agent,
  type AgentResult,
  type AgentOptions,
} from "./agents.js";
import { scenarios, getScenario, type Scenario } from "./scenarios.js";

// ------------------------------------------------------------------
// CLI parsing
// ------------------------------------------------------------------

interface TestArgs {
  agent: string;
  scenario: string | null;
  list: boolean;
  check: boolean;
  outputDir: string;
  skillDir: string;
  verbose: boolean;
}

function parseArgs(argv: string[]): TestArgs {
  const args: TestArgs = {
    agent: "all",
    scenario: null,
    list: false,
    check: false,
    outputDir: "./test-results",
    skillDir: resolve(process.cwd()),
    verbose: false,
  };

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--agent") args.agent = argv[++i];
    else if (argv[i] === "--scenario") args.scenario = argv[++i];
    else if (argv[i] === "--list") args.list = true;
    else if (argv[i] === "--check") args.check = true;
    else if (argv[i] === "--output-dir") args.outputDir = argv[++i];
    else if (argv[i] === "--skill-dir") args.skillDir = resolve(argv[++i]);
    else if (argv[i] === "-v" || argv[i] === "--verbose") args.verbose = true;
  }

  return args;
}

// ------------------------------------------------------------------
// System prompt builder — injects the skill into the agent
// ------------------------------------------------------------------

function buildSystemPrompt(skillDir: string): string {
  const skillMdPath = join(skillDir, "SKILL.md");
  let skillContent = "";

  if (existsSync(skillMdPath)) {
    skillContent = readFileSync(skillMdPath, "utf-8");
  }

  return `You are a coding assistant with the WISE Scraper skill installed.

The skill directory is at: ${skillDir}
The skill's generic runner is at: ${skillDir}/references/runner/dist/run.js

SKILL DOCUMENTATION:
${skillContent}

RULES:
- Use agent-browser for exploration. Show DOM evidence before writing profiles.
- Write YAML profiles using the WISE schema (see references/schema.cue).
- Run profiles using: node ${skillDir}/references/runner/dist/run.js <profile.yaml> --output-dir ./output
- Do NOT write custom scraping scripts. Use the shipped runner.
- Extract with DOM eval, not HTML parsing libraries.
- Use header-based table column mapping.
- The runner supports: selectors, interactions, pagination, matrix, extract, hooks.
`;
}

// ------------------------------------------------------------------
// Scenario runner
// ------------------------------------------------------------------

function runScenario(
  agent: Agent,
  scenario: Scenario,
  skillDir: string,
  outputDir: string,
  verbose: boolean,
): AgentResult {
  const scenarioDir = resolve(outputDir, `${agent.name}_${scenario.id}`);
  if (!existsSync(scenarioDir)) mkdirSync(scenarioDir, { recursive: true });

  console.log(`  [${agent.name}] Running scenario: ${scenario.name}`);
  console.log(`  [${agent.name}] Working dir: ${scenarioDir}`);

  const systemPrompt = buildSystemPrompt(skillDir);

  const result = agent.run(scenario.prompt, {
    cwd: scenarioDir,
    systemPrompt,
    timeout: scenario.timeoutSeconds * 1000,
    verbose,
  });

  result.scenario = scenario.id;

  // Check expected artifacts
  for (const artifact of scenario.expectedArtifacts) {
    const artPath = join(scenarioDir, artifact);
    if (existsSync(artPath)) {
      result.filesCreated.push(artifact);
    }
  }

  // Check profile content
  if (scenario.profileChecks.length > 0) {
    const profilePath = join(scenarioDir, "profile.yaml");
    if (existsSync(profilePath)) {
      const profileContent = readFileSync(profilePath, "utf-8");
      const missing = scenario.profileChecks.filter((check) => !profileContent.includes(check));
      if (missing.length > 0) {
        result.success = false;
        result.error = `Profile missing expected content: ${missing.join(", ")}`;
      }
    }
  }

  // Validate output records if JSONL exists
  if (scenario.validateOutput) {
    const jsonlFiles = findJsonlFiles(scenarioDir);
    if (jsonlFiles.length > 0) {
      const records = readJsonl(jsonlFiles[0]);
      const validation = scenario.validateOutput(records);
      if (!validation.pass) {
        result.success = false;
        result.error = (result.error ? result.error + "; " : "") + validation.reason;
      }
    }
  }

  // Write result
  const resultPath = join(scenarioDir, "_result.json");
  writeFileSync(resultPath, JSON.stringify(result, null, 2), "utf-8");

  const status = result.success ? "✓ PASS" : "✗ FAIL";
  console.log(`  [${agent.name}] ${status} — ${scenario.name} (${result.duration_ms}ms)`);
  if (result.error) console.log(`  [${agent.name}]   Error: ${result.error}`);

  return result;
}

// ------------------------------------------------------------------
// Report
// ------------------------------------------------------------------

interface TestReport {
  timestamp: string;
  agents: string[];
  scenarios: string[];
  results: AgentResult[];
  summary: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
  };
}

function generateReport(results: AgentResult[], agents: string[], scenarioIds: string[]): TestReport {
  const passed = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success && !r.error?.includes("not available")).length;
  const skipped = results.filter((r) => r.error?.includes("not available")).length;

  return {
    timestamp: new Date().toISOString(),
    agents,
    scenarios: scenarioIds,
    results,
    summary: {
      total: results.length,
      passed,
      failed,
      skipped,
    },
  };
}

function printReport(report: TestReport): void {
  console.log("\n" + "=".repeat(60));
  console.log("WISE Scraper Skill — Test Report");
  console.log("=".repeat(60));
  console.log(`Timestamp: ${report.timestamp}`);
  console.log(`Agents: ${report.agents.join(", ")}`);
  console.log(`Scenarios: ${report.scenarios.length}`);
  console.log();

  // Matrix view
  console.log("Results Matrix:");
  const header = ["Scenario", ...report.agents].map((s) => s.padEnd(20)).join(" | ");
  console.log(header);
  console.log("-".repeat(header.length));

  for (const sid of report.scenarios) {
    const row = [sid.padEnd(20)];
    for (const agent of report.agents) {
      const r = report.results.find((r) => r.agent === agent && r.scenario === sid);
      if (!r) {
        row.push("—".padEnd(20));
      } else if (r.success) {
        row.push(`✓ ${r.duration_ms}ms`.padEnd(20));
      } else {
        row.push(`✗ ${(r.error ?? "").slice(0, 15)}`.padEnd(20));
      }
    }
    console.log(row.join(" | "));
  }

  console.log();
  console.log(`Summary: ${report.summary.passed} passed, ${report.summary.failed} failed, ${report.summary.skipped} skipped / ${report.summary.total} total`);
}

// ------------------------------------------------------------------
// Utilities
// ------------------------------------------------------------------

function findJsonlFiles(dir: string): string[] {
  const fs = require("fs");
  const files: string[] = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith(".jsonl")) {
        files.push(join(dir, entry.name));
      }
      if (entry.isDirectory() && entry.name === "output") {
        const subEntries = fs.readdirSync(join(dir, "output"), { withFileTypes: true });
        for (const sub of subEntries) {
          if (sub.isFile() && sub.name.endsWith(".jsonl")) {
            files.push(join(dir, "output", sub.name));
          }
        }
      }
    }
  } catch {
    // dir might not exist
  }
  return files;
}

function readJsonl(path: string): unknown[] {
  try {
    const text = readFileSync(path, "utf-8").trim();
    if (!text) return [];
    return text.split("\n").map((line) => JSON.parse(line));
  } catch {
    return [];
  }
}

// ------------------------------------------------------------------
// Main
// ------------------------------------------------------------------

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  // --list: show available scenarios
  if (args.list) {
    console.log("Available test scenarios:\n");
    for (const s of scenarios) {
      console.log(`  ${s.id.padEnd(25)} [${s.complexity}] ${s.name}`);
    }
    return;
  }

  // --check: show available agents
  if (args.check) {
    console.log("Checking agent CLI availability...\n");
    const allAgents = getAgents();
    for (const agent of allAgents) {
      const ok = agent.available();
      console.log(`  ${ok ? "✓" : "✗"} ${agent.name}`);
    }
    return;
  }

  // Determine which agents to test
  let agents: Agent[];
  if (args.agent === "all") {
    agents = getAvailableAgents();
    if (agents.length === 0) {
      console.error("No agents available. Ensure codex, claude, or opencode CLI is on your PATH.");
      process.exit(1);
    }
  } else {
    const allAgents = getAgents();
    agents = allAgents.filter((a) => a.name === args.agent);
    if (agents.length === 0) {
      console.error(`Agent '${args.agent}' not found. Available: ${allAgents.map((a) => a.name).join(", ")}`);
      process.exit(1);
    }
  }

  console.log(`Agents: ${agents.map((a) => a.name).join(", ")}`);

  // Determine which scenarios to run
  let targetScenarios: Scenario[];
  if (args.scenario) {
    const s = getScenario(args.scenario);
    if (!s) {
      console.error(`Scenario '${args.scenario}' not found. Use --list to see available scenarios.`);
      process.exit(1);
    }
    targetScenarios = [s];
  } else {
    targetScenarios = scenarios;
  }

  console.log(`Scenarios: ${targetScenarios.map((s) => s.id).join(", ")}`);
  console.log();

  // Output directory
  const outDir = resolve(args.outputDir);
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

  // Run all combinations
  const results: AgentResult[] = [];

  for (const scenario of targetScenarios) {
    console.log(`\n--- Scenario: ${scenario.name} (${scenario.complexity}) ---`);
    for (const agent of agents) {
      const ok = agent.available();
      if (!ok) {
        console.log(`  [${agent.name}] SKIP — not available`);
        results.push({
          agent: agent.name,
          scenario: scenario.id,
          success: false,
          output: "",
          filesCreated: [],
          filesModified: [],
          duration_ms: 0,
          error: "Agent not available",
        });
        continue;
      }

      try {
        const result = runScenario(agent, scenario, args.skillDir, outDir, args.verbose);
        results.push(result);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`  [${agent.name}] ERROR: ${msg}`);
        results.push({
          agent: agent.name,
          scenario: scenario.id,
          success: false,
          output: "",
          filesCreated: [],
          filesModified: [],
          duration_ms: 0,
          error: msg,
        });
      }
    }
  }

  // Generate and print report
  const agentNames = agents.map((a) => a.name);
  const scenarioIds = targetScenarios.map((s) => s.id);
  const report = generateReport(results, agentNames, scenarioIds);
  printReport(report);

  // Write report to file
  const reportPath = resolve(outDir, "report.json");
  writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf-8");
  console.log(`\nReport written to: ${reportPath}`);

  // Exit with failure code if any tests failed
  if (report.summary.failed > 0) {
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

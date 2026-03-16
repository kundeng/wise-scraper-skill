#!/usr/bin/env node
/**
 * WISE Scraper Skill — Test Runner
 *
 * Runs skill test scenarios against coding agent CLIs (codex, claude,
 * opencode). Each CLI call is blocking — spawnSync waits for the agent
 * to exit, then the harness checks the working directory for artifacts.
 * If artifacts are incomplete, the harness resumes the session with a
 * follow-up prompt (replay + new message) and waits again.
 *
 * Flow per scenario:
 *   1. start(prompt) → blocks until agent exits
 *   2. check working dir for expected artifacts
 *   3. if incomplete → resume(follow-up) → blocks until exit → check again
 *   4. evaluate: profile checks, JSONL validation, evidence in output
 *
 * Usage:
 *   node dist/run-test.js --agent codex          # test with Codex only
 *   node dist/run-test.js --agent claude          # test with Claude Code only
 *   node dist/run-test.js --agent opencode        # test with OpenCode only
 *   node dist/run-test.js --agent all             # test with all available
 *   node dist/run-test.js --scenario single-page-article  # run one scenario
 *   node dist/run-test.js --list                  # list scenarios
 *   node dist/run-test.js --check                 # check CLI availability
 */

import { writeFileSync, mkdirSync, existsSync, readFileSync, readdirSync } from "fs";
import { resolve, join } from "path";
import {
  getAgents,
  getAvailableAgents,
  listWorkFiles,
  type Agent,
  type AgentResult,
  type AgentOptions,
  type SessionHandle,
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
  maxResumes: number;
  verbose: boolean;
}

function parseArgs(argv: string[]): TestArgs {
  const args: TestArgs = {
    agent: "codex",
    scenario: null,
    list: false,
    check: false,
    outputDir: "./test-results",
    skillDir: resolve(process.cwd()),
    maxResumes: 2,
    verbose: false,
  };

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--agent") args.agent = argv[++i];
    else if (argv[i] === "--scenario") args.scenario = argv[++i];
    else if (argv[i] === "--list") args.list = true;
    else if (argv[i] === "--check") args.check = true;
    else if (argv[i] === "--output-dir") args.outputDir = argv[++i];
    else if (argv[i] === "--skill-dir") args.skillDir = resolve(argv[++i]);
    else if (argv[i] === "--max-resumes") args.maxResumes = parseInt(argv[++i], 10);
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
- Prefer shipped templates and runner. Only escalate to bespoke code if justified.
- Extract with DOM eval, not HTML parsing libraries.
- Use header-based table column mapping.
- The runner supports: selectors, interactions, pagination, matrix, extract, hooks.
`;
}

// ------------------------------------------------------------------
// Artifact check — inspect working dir after agent exits
// ------------------------------------------------------------------

interface ArtifactCheck {
  hasProfile: boolean;
  hasJsonl: boolean;
  missingArtifacts: string[];
  profileMissing: string[];
  jsonlRecordCount: number;
}

function checkArtifacts(scenarioDir: string, scenario: Scenario): ArtifactCheck {
  const result: ArtifactCheck = {
    hasProfile: false,
    hasJsonl: false,
    missingArtifacts: [],
    profileMissing: [],
    jsonlRecordCount: 0,
  };

  // Check expected artifacts
  for (const artifact of scenario.expectedArtifacts) {
    if (existsSync(join(scenarioDir, artifact))) {
      if (artifact.endsWith(".yaml") || artifact.endsWith(".yml")) result.hasProfile = true;
    } else {
      result.missingArtifacts.push(artifact);
    }
  }

  // Check profile content
  const profilePath = join(scenarioDir, "profile.yaml");
  if (existsSync(profilePath)) {
    result.hasProfile = true;
    const content = readFileSync(profilePath, "utf-8");
    result.profileMissing = scenario.profileChecks.filter((check) => !content.includes(check));
  }

  // Check JSONL output
  const jsonlFiles = findJsonlFiles(scenarioDir);
  if (jsonlFiles.length > 0) {
    result.hasJsonl = true;
    result.jsonlRecordCount = readJsonl(jsonlFiles[0]).length;
  }

  return result;
}

/** Build a follow-up prompt based on what's missing. */
function buildFollowUp(check: ArtifactCheck, scenario: Scenario, turn: number): string | null {
  const issues: string[] = [];

  if (!check.hasProfile) {
    issues.push("You have not created a profile.yaml yet. Please write the YAML profile for this scenario.");
  } else if (check.profileMissing.length > 0) {
    issues.push(`Your profile.yaml is missing expected elements: ${check.profileMissing.join(", ")}. Please fix it.`);
  }

  if (check.hasProfile && !check.hasJsonl) {
    issues.push("The profile exists but no JSONL output was produced. Please run the profile using the shipped runner and produce output.");
  }

  if (check.hasJsonl && scenario.validateOutput) {
    // We have output — let the final evaluation handle validation
    return null;
  }

  if (issues.length === 0) return null;

  return `[Turn ${turn + 1} follow-up] The following issues remain:\n${issues.map((i) => `- ${i}`).join("\n")}\n\nPlease continue working on this scenario.`;
}

// ------------------------------------------------------------------
// Scenario runner — blocking start → check → resume → check loop
// ------------------------------------------------------------------

function runScenario(
  agent: Agent,
  scenario: Scenario,
  skillDir: string,
  outputDir: string,
  maxResumes: number,
  verbose: boolean,
): AgentResult {
  const start = Date.now();
  const scenarioDir = resolve(outputDir, `${agent.name}_${scenario.id}`, "sandbox");
  if (!existsSync(scenarioDir)) mkdirSync(scenarioDir, { recursive: true });

  console.log(`  [${agent.name}] Running scenario: ${scenario.name}`);
  console.log(`  [${agent.name}] Working dir: ${scenarioDir}`);

  const systemPrompt = buildSystemPrompt(skillDir);
  const opts: AgentOptions = {
    cwd: scenarioDir,
    systemPrompt,
    timeout: scenario.timeoutSeconds * 1000,
    verbose,
  };

  const turnOutputs: string[] = [];
  let handle: SessionHandle;
  let lastOutput: string;

  // --- Turn 1: Start session ---
  console.log(`  [${agent.name}] Turn 1: starting session...`);
  const startResult = agent.start(scenario.prompt, opts);
  handle = startResult.handle;
  lastOutput = startResult.output;
  turnOutputs.push(lastOutput);
  console.log(`  [${agent.name}] Session: ${handle.sessionId} (exit=${startResult.exitCode})`);

  // --- Turns 2..N: check artifacts after exit, resume if needed ---
  let turnCount = 1;
  for (let i = 0; i < maxResumes; i++) {
    const check = checkArtifacts(scenarioDir, scenario);
    const files = listWorkFiles(scenarioDir);
    console.log(`  [${agent.name}] Check: profile=${check.hasProfile} jsonl=${check.hasJsonl} files=[${files.join(", ")}]`);

    const followUp = buildFollowUp(check, scenario, turnCount);
    if (!followUp) {
      console.log(`  [${agent.name}] Artifacts look complete after ${turnCount} turn(s)`);
      break;
    }

    turnCount++;
    console.log(`  [${agent.name}] Turn ${turnCount}: resuming session...`);
    const resumeResult = agent.resume(handle, followUp, opts);
    lastOutput = resumeResult.output;
    turnOutputs.push(lastOutput);
    console.log(`  [${agent.name}] Resume exit=${resumeResult.exitCode}`);
  }

  // --- Final evaluation ---
  const allOutput = turnOutputs.join("\n---\n");
  const filesCreated = listWorkFiles(scenarioDir);
  const errors: string[] = [];

  // Profile checks
  const profilePath = join(scenarioDir, "profile.yaml");
  if (existsSync(profilePath)) {
    const content = readFileSync(profilePath, "utf-8");
    const missing = scenario.profileChecks.filter((c) => !content.includes(c));
    if (missing.length > 0) errors.push(`Profile missing: ${missing.join(", ")}`);
  } else {
    errors.push("No profile.yaml created");
  }

  // Evidence checks — look in agent output
  if (scenario.evidenceChecks) {
    const missing = scenario.evidenceChecks.filter((c) => !allOutput.toLowerCase().includes(c.toLowerCase()));
    if (missing.length > 0) errors.push(`Evidence missing in output: ${missing.join(", ")}`);
  }

  // Decision checks — look in agent output
  if (scenario.decisionChecks) {
    const missing = scenario.decisionChecks.filter((c) => !allOutput.toLowerCase().includes(c.toLowerCase()));
    if (missing.length > 0) errors.push(`Decision missing in output: ${missing.join(", ")}`);
  }

  // JSONL validation
  if (scenario.validateOutput) {
    const jsonlFiles = findJsonlFiles(scenarioDir);
    if (jsonlFiles.length > 0) {
      const records = readJsonl(jsonlFiles[0]);
      const validation = scenario.validateOutput(records);
      if (!validation.pass) errors.push(validation.reason);
    } else {
      errors.push("No JSONL output produced");
    }
  }

  const success = errors.length === 0;
  const result: AgentResult = {
    agent: agent.name,
    scenario: scenario.id,
    sessionId: handle.sessionId,
    success,
    output: allOutput,
    turnOutputs,
    filesCreated,
    filesModified: [],
    duration_ms: Date.now() - start,
    turns: turnCount,
    error: errors.length > 0 ? errors.join("; ") : undefined,
  };

  // Write result to parent dir (outside sandbox) so it doesn't mix with agent output
  const resultDir = resolve(scenarioDir, "..");
  const resultPath = join(resultDir, "_result.json");
  writeFileSync(resultPath, JSON.stringify(result, null, 2), "utf-8");

  const status = success ? "✓ PASS" : "✗ FAIL";
  console.log(`  [${agent.name}] ${status} — ${scenario.name} (${result.duration_ms}ms, ${turnCount} turn(s))`);
  if (result.error) console.log(`  [${agent.name}]   ${result.error}`);

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
    summary: { total: results.length, passed, failed, skipped },
  };
}

function printReport(report: TestReport): void {
  console.log("\n" + "=".repeat(70));
  console.log("WISE Scraper Skill — Test Report");
  console.log("=".repeat(70));
  console.log(`Timestamp: ${report.timestamp}`);
  console.log(`Agents:    ${report.agents.join(", ")}`);
  console.log(`Scenarios: ${report.scenarios.length}`);
  console.log();

  // Matrix view
  console.log("Results Matrix:");
  const header = ["Scenario", ...report.agents].map((s) => s.padEnd(22)).join(" | ");
  console.log(header);
  console.log("-".repeat(header.length));

  for (const sid of report.scenarios) {
    const row = [sid.padEnd(22)];
    for (const agentName of report.agents) {
      const r = report.results.find((r) => r.agent === agentName && r.scenario === sid);
      if (!r) {
        row.push("—".padEnd(22));
      } else if (r.success) {
        row.push(`✓ ${r.turns}t ${r.duration_ms}ms`.padEnd(22));
      } else {
        row.push(`✗ ${(r.error ?? "").slice(0, 18)}`.padEnd(22));
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
  const files: string[] = [];
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith(".jsonl")) {
        files.push(join(dir, entry.name));
      }
      if (entry.isDirectory() && entry.name === "output") {
        const subEntries = readdirSync(join(dir, "output"), { withFileTypes: true });
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

function readJsonl(filePath: string): unknown[] {
  try {
    const text = readFileSync(filePath, "utf-8").trim();
    if (!text) return [];
    return text.split("\n").map((line) => JSON.parse(line));
  } catch {
    return [];
  }
}

// ------------------------------------------------------------------
// Main
// ------------------------------------------------------------------

function main(): void {
  const args = parseArgs(process.argv.slice(2));

  // --list: show available scenarios
  if (args.list) {
    console.log("Available test scenarios:\n");
    for (const s of scenarios) {
      console.log(`  ${s.id.padEnd(30)} [${s.complexity}] ${s.name}`);
    }
    return;
  }

  // --check: show available agent CLIs
  if (args.check) {
    console.log("Checking agent CLI availability...\n");
    for (const agent of getAgents()) {
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
    agents = getAgents().filter((a) => a.name === args.agent);
    if (agents.length === 0) {
      console.error(`Agent '${args.agent}' not found. Available: ${getAgents().map((a) => a.name).join(", ")}`);
      process.exit(1);
    }
  }

  console.log(`Agents: ${agents.map((a) => a.name).join(", ")}`);

  // Determine which scenarios to run
  let targetScenarios: Scenario[];
  if (args.scenario) {
    const s = getScenario(args.scenario);
    if (!s) {
      console.error(`Scenario '${args.scenario}' not found. Use --list to see available.`);
      process.exit(1);
    }
    targetScenarios = [s];
  } else {
    targetScenarios = scenarios;
  }

  console.log(`Scenarios: ${targetScenarios.map((s) => s.id).join(", ")}`);
  console.log(`Max resumes per scenario: ${args.maxResumes}`);
  console.log();

  // Output directory
  const outDir = resolve(args.outputDir);
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

  // Run all combinations
  const results: AgentResult[] = [];

  for (const scenario of targetScenarios) {
    console.log(`\n--- Scenario: ${scenario.name} (${scenario.complexity}) ---`);
    for (const agent of agents) {
      if (!agent.available()) {
        console.log(`  [${agent.name}] SKIP — not available`);
        results.push({
          agent: agent.name,
          scenario: scenario.id,
          sessionId: "",
          success: false,
          output: "",
          turnOutputs: [],
          filesCreated: [],
          filesModified: [],
          duration_ms: 0,
          turns: 0,
          error: "Agent not available",
        });
        continue;
      }

      try {
        const result = runScenario(agent, scenario, args.skillDir, outDir, args.maxResumes, args.verbose);
        results.push(result);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`  [${agent.name}] ERROR: ${msg}`);
        results.push({
          agent: agent.name,
          scenario: scenario.id,
          sessionId: "",
          success: false,
          output: "",
          turnOutputs: [],
          filesCreated: [],
          filesModified: [],
          duration_ms: 0,
          turns: 0,
          error: msg,
        });
      }
    }
  }

  // Generate and print report
  const report = generateReport(
    results,
    agents.map((a) => a.name),
    targetScenarios.map((s) => s.id),
  );
  printReport(report);

  // Write report to file
  const reportPath = resolve(outDir, "report.json");
  writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf-8");
  console.log(`\nReport written to: ${reportPath}`);

  if (report.summary.failed > 0) process.exit(1);
}

main();

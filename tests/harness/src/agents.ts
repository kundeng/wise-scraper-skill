/**
 * CLI-only agent interface for the WISE test harness.
 *
 * Same pattern as the AI adapter: vendor-neutral interface, CLI backend,
 * evaluate artifacts. No SDK dependencies — just shell out to the agent
 * binary (codex, claude, opencode), let it work in a temp directory,
 * then score what it produced.
 */

import { execSync, spawnSync } from "child_process";
import { writeFileSync, readFileSync, existsSync } from "fs";
import { join } from "path";

// ------------------------------------------------------------------
// Types
// ------------------------------------------------------------------

export interface AgentResult {
  agent: string;
  scenario: string;
  success: boolean;
  output: string;
  filesCreated: string[];
  filesModified: string[];
  duration_ms: number;
  error?: string;
}

export interface AgentOptions {
  cwd: string;
  systemPrompt?: string;
  timeout?: number;
  verbose?: boolean;
}

export interface Agent {
  name: string;
  available(): boolean;
  run(prompt: string, opts: AgentOptions): AgentResult;
}

// ------------------------------------------------------------------
// CLI Agent — runs any coder CLI as a subprocess
// ------------------------------------------------------------------

export class CliAgent implements Agent {
  name: string;
  private binary: string;
  private versionFlag: string;

  constructor(name: string, binary: string, versionFlag = "--version") {
    this.name = name;
    this.binary = binary;
    this.versionFlag = versionFlag;
  }

  available(): boolean {
    try {
      execSync(`${this.binary} ${this.versionFlag}`, {
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
        timeout: 10000,
        windowsHide: true,
      });
      return true;
    } catch {
      return false;
    }
  }

  run(prompt: string, opts: AgentOptions): AgentResult {
    const start = Date.now();

    // Write prompt to a temp file so we don't hit shell escaping limits
    const promptFile = join(opts.cwd, "_prompt.txt");
    writeFileSync(promptFile, prompt, "utf-8");

    // Build the command. Each CLI has slightly different invocation:
    //   codex  <prompt>  --cwd <dir>
    //   claude <prompt>  --cwd <dir>  --print
    //   opencode <prompt>
    // We use a simple approach: pass prompt via file, let the binary read it.
    const cmd = this.buildCommand(promptFile, opts);

    if (opts.verbose) {
      console.log(`    [${this.name}] CMD: ${cmd}`);
    }

    try {
      const result = spawnSync(cmd, {
        shell: true,
        cwd: opts.cwd,
        encoding: "utf-8",
        timeout: opts.timeout ?? 300000,
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true,
      });

      const output = (result.stdout ?? "") + (result.stderr ?? "");

      return {
        agent: this.name,
        scenario: "",
        success: result.status === 0,
        output: output.trim(),
        filesCreated: [],
        filesModified: [],
        duration_ms: Date.now() - start,
        error: result.status !== 0 ? `Exit code ${result.status}` : undefined,
      };
    } catch (e: unknown) {
      return {
        agent: this.name,
        scenario: "",
        success: false,
        output: "",
        filesCreated: [],
        filesModified: [],
        duration_ms: Date.now() - start,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }

  private buildCommand(promptFile: string, opts: AgentOptions): string {
    // Read prompt from file to avoid shell escaping issues
    const prompt = readFileSync(promptFile, "utf-8").replace(/"/g, '\\"').replace(/\n/g, " ");

    switch (this.binary) {
      case "codex":
        return `codex "${prompt}"`;
      case "claude":
        return `claude --print "${prompt}"`;
      case "opencode":
        return `opencode "${prompt}"`;
      default:
        return `${this.binary} "${prompt}"`;
    }
  }
}

// ------------------------------------------------------------------
// Agent registry — CLI binaries only, no SDKs
// ------------------------------------------------------------------

const AGENTS: Array<{ name: string; binary: string; versionFlag?: string }> = [
  { name: "codex", binary: "codex", versionFlag: "--version" },
  { name: "claude", binary: "claude", versionFlag: "--version" },
  { name: "opencode", binary: "opencode", versionFlag: "--version" },
];

export function getAgents(): Agent[] {
  return AGENTS.map((a) => new CliAgent(a.name, a.binary, a.versionFlag));
}

export function getAvailableAgents(): Agent[] {
  return getAgents().filter((a) => a.available());
}

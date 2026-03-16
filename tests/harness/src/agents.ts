/**
 * CLI agent interface for the WISE test harness.
 *
 * Same pattern as the AI adapter: vendor-neutral interface, CLI backend,
 * evaluate artifacts. No SDK dependencies.
 *
 * Each agent CLI is a **blocking call** — spawnSync runs the binary,
 * waits for it to exit, captures stdout/stderr. After it exits the
 * harness inspects the working directory for artifacts and decides
 * whether to resume with a follow-up prompt.
 *
 * Lifecycle:
 *   start(prompt) → blocks until exit → check artifacts
 *     → if incomplete: resume(follow-up) → blocks until exit → check again
 *     → evaluate final artifacts
 *
 * Resume replays the earlier conversation + appends the new prompt:
 *   codex:    codex --full-auto "prompt"           → codex resume <session-id>
 *   claude:   claude --session-id <id> -p "prompt" → claude --resume <id> -p "msg"
 *   opencode: opencode run "prompt"                → opencode run --session <id> "msg"
 */

import { randomUUID } from "crypto";
import { execSync, spawnSync, type SpawnSyncReturns } from "child_process";
import { writeFileSync, readFileSync, existsSync, readdirSync } from "fs";
import { join } from "path";

// ------------------------------------------------------------------
// Types
// ------------------------------------------------------------------

export interface AgentResult {
  agent: string;
  scenario: string;
  sessionId: string;
  success: boolean;
  output: string;
  turnOutputs: string[];
  filesCreated: string[];
  filesModified: string[];
  duration_ms: number;
  turns: number;
  error?: string;
}

export interface AgentOptions {
  cwd: string;
  systemPrompt?: string;
  timeout?: number;
  verbose?: boolean;
}

export interface SessionHandle {
  agentName: string;
  sessionId: string;
  cwd: string;
}

export interface Agent {
  name: string;
  available(): boolean;
  /** Start a new session with an initial prompt. Returns a session handle. */
  start(prompt: string, opts: AgentOptions): { handle: SessionHandle; output: string; exitCode: number | null };
  /** Resume an existing session with a follow-up prompt. */
  resume(handle: SessionHandle, followUp: string, opts: AgentOptions): { output: string; exitCode: number | null };
}

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------

function writePromptFile(cwd: string, prompt: string, suffix = ""): string {
  const file = join(cwd, `_prompt${suffix}.txt`);
  writeFileSync(file, prompt, "utf-8");
  return file;
}

function execCmd(
  cmd: string,
  cwd: string,
  timeout: number,
  verbose: boolean,
  label: string,
): { output: string; exitCode: number | null } {
  if (verbose) console.log(`    [${label}] CMD: ${cmd}`);

  const result: SpawnSyncReturns<string> = spawnSync(cmd, {
    shell: true,
    cwd,
    encoding: "utf-8",
    timeout,
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  });

  const output = ((result.stdout ?? "") + (result.stderr ?? "")).trim();
  return { output, exitCode: result.status };
}

/** List all files in a directory (non-recursive, ignoring _prompt* and _result*). */
export function listWorkFiles(dir: string): string[] {
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isFile() && !e.name.startsWith("_prompt") && !e.name.startsWith("_result"))
      .map((e) => e.name);
  } catch {
    return [];
  }
}

// ------------------------------------------------------------------
// Codex Agent
//   start:  codex "prompt"                     (captures session id from output)
//   resume: codex resume <session-id>
// ------------------------------------------------------------------

export class CodexAgent implements Agent {
  name = "codex";

  available(): boolean {
    try {
      execSync("codex --version", {
        encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"],
        timeout: 10000, windowsHide: true,
      });
      return true;
    } catch { return false; }
  }

  start(prompt: string, opts: AgentOptions) {
    const sessionId = randomUUID();
    const promptFile = writePromptFile(opts.cwd, prompt);
    // codex doesn't support --session-id at launch, so we capture from output.
    // For now we use the generated UUID as a tracking ID and pass prompt inline.
    const escaped = readFileSync(promptFile, "utf-8").replace(/"/g, '\\"').replace(/\n/g, " ");
    const cmd = `codex --full-auto "${escaped}"`;
    const { output, exitCode } = execCmd(cmd, opts.cwd, opts.timeout ?? 300000, opts.verbose ?? false, this.name);

    // Try to extract the real session ID from codex output (format varies)
    const match = output.match(/session[:\s]+([0-9a-f-]{36})/i);
    const realId = match?.[1] ?? sessionId;

    return { handle: { agentName: this.name, sessionId: realId, cwd: opts.cwd }, output, exitCode };
  }

  resume(handle: SessionHandle, followUp: string, opts: AgentOptions) {
    const cmd = `codex resume ${handle.sessionId}`;
    return execCmd(cmd, handle.cwd, opts.timeout ?? 300000, opts.verbose ?? false, this.name);
  }
}

// ------------------------------------------------------------------
// Claude Code Agent
//   start:  claude --session-id <uuid> -p "prompt" --output-format json
//   resume: claude --resume <session-id> -p "follow-up"
// ------------------------------------------------------------------

export class ClaudeAgent implements Agent {
  name = "claude";

  available(): boolean {
    try {
      execSync("claude --version", {
        encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"],
        timeout: 10000, windowsHide: true,
      });
      return true;
    } catch { return false; }
  }

  start(prompt: string, opts: AgentOptions) {
    const sessionId = randomUUID();
    const promptFile = writePromptFile(opts.cwd, prompt);
    const escaped = readFileSync(promptFile, "utf-8").replace(/"/g, '\\"').replace(/\n/g, " ");
    const parts = [
      "claude",
      `--session-id "${sessionId}"`,
      `--print`,
      `--output-format json`,
      `--max-turns 25`,
    ];
    if (opts.systemPrompt) {
      const spFile = writePromptFile(opts.cwd, opts.systemPrompt, "_system");
      parts.push(`--system-prompt-file "${spFile}"`);
    }
    parts.push(`"${escaped}"`);
    const cmd = parts.join(" ");
    const { output, exitCode } = execCmd(cmd, opts.cwd, opts.timeout ?? 300000, opts.verbose ?? false, this.name);
    return { handle: { agentName: this.name, sessionId, cwd: opts.cwd }, output, exitCode };
  }

  resume(handle: SessionHandle, followUp: string, opts: AgentOptions) {
    const escaped = followUp.replace(/"/g, '\\"').replace(/\n/g, " ");
    const cmd = `claude --resume "${handle.sessionId}" --print "${escaped}"`;
    return execCmd(cmd, handle.cwd, opts.timeout ?? 300000, opts.verbose ?? false, this.name);
  }
}

// ------------------------------------------------------------------
// OpenCode Agent
//   start:  opencode run "prompt"
//   resume: opencode run --session <id> "follow-up"
// ------------------------------------------------------------------

export class OpenCodeAgent implements Agent {
  name = "opencode";

  available(): boolean {
    try {
      execSync("opencode --version", {
        encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"],
        timeout: 10000, windowsHide: true,
      });
      return true;
    } catch { return false; }
  }

  start(prompt: string, opts: AgentOptions) {
    const sessionId = randomUUID();
    const promptFile = writePromptFile(opts.cwd, prompt);
    const escaped = readFileSync(promptFile, "utf-8").replace(/"/g, '\\"').replace(/\n/g, " ");
    const cmd = `opencode run "${escaped}"`;
    const { output, exitCode } = execCmd(cmd, opts.cwd, opts.timeout ?? 300000, opts.verbose ?? false, this.name);

    // Try to capture session ID from opencode output
    const match = output.match(/session[:\s]+([0-9a-zA-Z_-]+)/i);
    const realId = match?.[1] ?? sessionId;

    return { handle: { agentName: this.name, sessionId: realId, cwd: opts.cwd }, output, exitCode };
  }

  resume(handle: SessionHandle, followUp: string, opts: AgentOptions) {
    const escaped = followUp.replace(/"/g, '\\"').replace(/\n/g, " ");
    const cmd = `opencode run --session "${handle.sessionId}" "${escaped}"`;
    return execCmd(cmd, handle.cwd, opts.timeout ?? 300000, opts.verbose ?? false, this.name);
  }
}

// ------------------------------------------------------------------
// Agent registry
// ------------------------------------------------------------------

export function getAgents(): Agent[] {
  return [new CodexAgent(), new ClaudeAgent(), new OpenCodeAgent()];
}

export function getAvailableAgents(): Agent[] {
  return getAgents().filter((a) => a.available());
}

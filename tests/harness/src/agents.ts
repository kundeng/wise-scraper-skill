/**
 * Unified agent interface — abstracts Codex, Claude Code, and OpenCode SDKs
 * behind a common interface for running skill test scenarios.
 */

import { resolve } from "path";
import { readFileSync } from "fs";

// ------------------------------------------------------------------
// Common types
// ------------------------------------------------------------------

export interface AgentResult {
  agent: string;
  scenario: string;
  success: boolean;
  output: string;
  filesCreated: string[];
  filesModified: string[];
  duration_ms: number;
  turns: number;
  error?: string;
}

export interface AgentOptions {
  cwd: string;
  systemPrompt?: string;
  maxTurns?: number;
  timeout?: number;
  verbose?: boolean;
  allowedTools?: string[];
  disallowedTools?: string[];
}

export interface Agent {
  name: string;
  available(): Promise<boolean>;
  run(prompt: string, opts: AgentOptions): Promise<AgentResult>;
}

// ------------------------------------------------------------------
// Codex Agent (official SDK: @openai/codex-sdk)
// ------------------------------------------------------------------

export class CodexAgent implements Agent {
  name = "codex";

  async available(): Promise<boolean> {
    try {
      const mod = await import("@openai/codex-sdk");
      return !!mod.Codex;
    } catch {
      return false;
    }
  }

  async run(prompt: string, opts: AgentOptions): Promise<AgentResult> {
    const start = Date.now();
    try {
      const { Codex } = await import("@openai/codex-sdk");
      const codex = new Codex();
      const thread = codex.startThread();

      const result = await thread.run(prompt);

      return {
        agent: this.name,
        scenario: "",
        success: true,
        output: typeof result === "string" ? result : JSON.stringify(result),
        filesCreated: [],
        filesModified: [],
        duration_ms: Date.now() - start,
        turns: 1,
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
        turns: 0,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }
}

// ------------------------------------------------------------------
// Claude Code Agent (official SDK: @anthropic-ai/claude-code)
// ------------------------------------------------------------------

export class ClaudeCodeAgent implements Agent {
  name = "claude-code";

  async available(): Promise<boolean> {
    try {
      const mod = await import("@anthropic-ai/claude-code");
      return !!mod.claudeCode;
    } catch {
      return false;
    }
  }

  async run(prompt: string, opts: AgentOptions): Promise<AgentResult> {
    const start = Date.now();
    try {
      const { claudeCode } = await import("@anthropic-ai/claude-code");

      const args: Record<string, unknown> = {
        prompt,
        cwd: opts.cwd,
      };
      if (opts.systemPrompt) args.systemPrompt = opts.systemPrompt;
      if (opts.maxTurns) args.maxTurns = opts.maxTurns;
      if (opts.allowedTools) args.allowedTools = opts.allowedTools;
      if (opts.disallowedTools) args.disallowedTools = opts.disallowedTools;

      const result = await claudeCode(args);

      // result has stdout, stderr, messages
      const output = typeof result === "object" && result !== null
        ? (result as { stdout?: string }).stdout ?? JSON.stringify(result)
        : String(result);

      return {
        agent: this.name,
        scenario: "",
        success: true,
        output,
        filesCreated: [],
        filesModified: [],
        duration_ms: Date.now() - start,
        turns: 1,
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
        turns: 0,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }
}

// ------------------------------------------------------------------
// OpenCode Agent (SDK: @opencode-ai/sdk)
// ------------------------------------------------------------------

export class OpenCodeAgent implements Agent {
  name = "opencode";

  async available(): Promise<boolean> {
    try {
      const mod = await import("@opencode-ai/sdk");
      return !!mod.createOpencode || !!mod.createOpencodeClient;
    } catch {
      return false;
    }
  }

  async run(prompt: string, opts: AgentOptions): Promise<AgentResult> {
    const start = Date.now();
    try {
      const { createOpencode } = await import("@opencode-ai/sdk");
      const { client } = await createOpencode();

      // Create a session and send the prompt
      const session = await client.session.create({
        body: {},
      });
      const sessionId = (session as { data?: { id?: string } }).data?.id;
      if (!sessionId) throw new Error("Failed to create session");

      const chatResult = await client.session.chat({
        path: { id: sessionId },
        body: { content: prompt },
      });

      const output = JSON.stringify(chatResult);

      return {
        agent: this.name,
        scenario: "",
        success: true,
        output,
        filesCreated: [],
        filesModified: [],
        duration_ms: Date.now() - start,
        turns: 1,
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
        turns: 0,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }
}

// ------------------------------------------------------------------
// CLI fallback — runs any agent CLI via subprocess
// ------------------------------------------------------------------

import { execSync } from "child_process";

export class CliAgent implements Agent {
  name: string;
  private command: string;

  constructor(name: string, command: string) {
    this.name = name;
    this.command = command;
  }

  async available(): Promise<boolean> {
    try {
      execSync(`${this.command} --version`, {
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
        timeout: 5000,
      });
      return true;
    } catch {
      return false;
    }
  }

  async run(prompt: string, opts: AgentOptions): Promise<AgentResult> {
    const start = Date.now();
    try {
      // Write prompt to stdin via echo pipe
      const escapedPrompt = prompt.replace(/"/g, '\\"');
      const cmd = `${this.command} "${escapedPrompt}"`;

      const output = execSync(cmd, {
        encoding: "utf-8",
        cwd: opts.cwd,
        timeout: opts.timeout ?? 300000,
        stdio: ["pipe", "pipe", "pipe"],
      });

      return {
        agent: this.name,
        scenario: "",
        success: true,
        output: output.trim(),
        filesCreated: [],
        filesModified: [],
        duration_ms: Date.now() - start,
        turns: 1,
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
        turns: 0,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }
}

// ------------------------------------------------------------------
// Agent registry
// ------------------------------------------------------------------

export function getAgents(): Agent[] {
  return [
    new CodexAgent(),
    new ClaudeCodeAgent(),
    new OpenCodeAgent(),
    new CliAgent("codex-cli", "codex"),
    new CliAgent("claude-cli", "claude"),
    new CliAgent("opencode-cli", "opencode"),
  ];
}

export async function getAvailableAgents(): Promise<Agent[]> {
  const agents = getAgents();
  const results: Agent[] = [];
  for (const agent of agents) {
    const ok = await agent.available();
    if (ok) results.push(agent);
  }
  return results;
}

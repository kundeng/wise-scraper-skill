/**
 * Browser abstraction layer over agent-browser CLI.
 *
 * All browser interaction goes through this module. Uses base64-encoded eval
 * for cross-platform safety (avoids Windows backslash and shell escaping issues).
 */

import { execSync } from "child_process";
import { Buffer } from "buffer";
import type { Locator } from "./types.js";

export class BrowserError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = "BrowserError";
  }
}

export class Browser {
  timeoutMs: number;
  retries: number;

  constructor({ timeoutMs = 60000, retries = 2 } = {}) {
    this.timeoutMs = timeoutMs;
    this.retries = retries;
  }

  // ------------------------------------------------------------------
  // Low-level CLI helpers
  // ------------------------------------------------------------------

  _run(args: string[], { timeoutS }: { timeoutS?: number } = {}): string | null {
    const timeout = (timeoutS ?? Math.ceil(this.timeoutMs / 1000) + 30) * 1000;
    const cmd = `agent-browser ${args.join(" ")}`;
    try {
      const result = execSync(cmd, {
        encoding: "utf-8",
        timeout,
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true,
      });
      return result.trim();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      const short = cmd.length > 120 ? cmd.slice(0, 120) + "..." : cmd;
      if (msg.includes("not found") || msg.includes("not recognized")) {
        throw new BrowserError(
          "agent-browser not found. Install: npm i -g @anthropic-ai/agent-browser && agent-browser install"
        );
      }
      console.error(`[browser] FAILED: ${short} — ${msg.split("\n")[0]}`);
      return null;
    }
  }

  _runRetry(args: string[], opts: { timeoutS?: number } = {}): string | null {
    for (let attempt = 0; attempt <= this.retries; attempt++) {
      const result = this._run(args, opts);
      if (result !== null) return result;
      if (attempt < this.retries) {
        const wait = 2 * (attempt + 1);
        console.log(`  [retry ${attempt + 1}/${this.retries}] waiting ${wait}s...`);
        this.sleep(wait * 1000);
      }
    }
    return null;
  }

  sleep(ms: number): void {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
  }

  // ------------------------------------------------------------------
  // Navigation
  // ------------------------------------------------------------------

  open(url: string, { wait = "networkidle" }: { wait?: string } = {}): boolean {
    const args = ["open", `"${url}"`];
    if (wait) args.push("--wait", wait);
    args.push("--timeout", String(this.timeoutMs));
    const result = this._runRetry(args);
    return result !== null;
  }

  getUrl(): string | null {
    const raw = this._run(["get", "url"], { timeoutS: 10 });
    return raw ? raw.trim().replace(/^"|"$/g, "") : null;
  }

  close(): void {
    this._run(["close"], { timeoutS: 10 });
  }

  // ------------------------------------------------------------------
  // DOM evaluation (cross-platform safe via base64)
  // ------------------------------------------------------------------

  eval(js: string): string | null {
    const b64 = Buffer.from(js, "utf-8").toString("base64");
    return this._runRetry(["eval", "-b", b64]);
  }

  evalJson<T = unknown>(js: string): T | null {
    const raw = this.eval(js);
    if (raw === null) return null;
    return this._parseOutput(raw) as T;
  }

  private _parseOutput(raw: string): unknown {
    raw = raw.trim();
    if (!raw) return null;
    try {
      const first = JSON.parse(raw);
      if (typeof first === "string") {
        try {
          return JSON.parse(first);
        } catch {
          return first;
        }
      }
      return first;
    } catch {
      return raw;
    }
  }

  // ------------------------------------------------------------------
  // Interaction primitives
  // ------------------------------------------------------------------

  click(locator: Locator | string, actionType: "real" | "scripted" = "real"): void {
    const target = this.locatorToSelector(locator);
    if (actionType === "scripted") {
      this.eval(`document.querySelector('${escapeJs(target)}')?.click()`);
    } else {
      this._run(["click", `"${target}"`]);
    }
  }

  select(locator: Locator | string, value: string): void {
    const target = this.locatorToSelector(locator);
    this._run(["select", `"${target}"`, `"${value}"`]);
  }

  scroll(direction: "down" | "up" = "down", amountPx = 500): void {
    const sign = direction === "down" ? "" : "-";
    this.eval(`window.scrollBy(0, ${sign}${amountPx})`);
  }

  wait({ ms, networkIdle, selector }: { ms?: number; networkIdle?: boolean; selector?: string } = {}): void {
    if (networkIdle) {
      this._run(["wait", "--load", "networkidle"]);
    } else if (selector) {
      this._run(["wait", "--selector", `"${selector}"`]);
    } else if (ms) {
      this.sleep(ms);
    }
  }

  // ------------------------------------------------------------------
  // Helpers
  // ------------------------------------------------------------------

  locatorToSelector(locator: Locator | string): string {
    if (typeof locator === "string") return locator;
    if (locator.css) return `css=${locator.css}`;
    if (locator.text) return `text=${locator.text}`;
    if (locator.role) {
      let s = `role=${locator.role}`;
      if (locator.name) s += `[name=${locator.name}]`;
      return s;
    }
    throw new BrowserError(`Cannot resolve locator: ${JSON.stringify(locator)}`);
  }
}

export function escapeJs(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\n/g, "\\n");
}

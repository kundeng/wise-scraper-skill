/**
 * Hook system for the WISE scraper runner.
 *
 * Hooks allow site-specific customization at well-defined points:
 *   post_discover  — after URL/page list is built
 *   pre_extract    — before opening a page for extraction
 *   post_extract   — after a page's raw data is captured
 *   pre_assemble   — after all pages extracted, before assembly
 *   post_assemble  — after final output is built
 */

import type { HookDef } from "./types.js";

export type HookFn<T = unknown> = (ctx: T) => T | void;

export type HookPoint =
  | "post_discover"
  | "pre_extract"
  | "post_extract"
  | "pre_assemble"
  | "post_assemble";

const VALID_POINTS: HookPoint[] = [
  "post_discover",
  "pre_extract",
  "post_extract",
  "pre_assemble",
  "post_assemble",
];

interface HookEntry {
  fn: HookFn<any>;
  name: string;
}

export class HookRegistry {
  private _hooks: Record<HookPoint, HookEntry[]>;

  constructor() {
    this._hooks = {} as Record<HookPoint, HookEntry[]>;
    for (const p of VALID_POINTS) this._hooks[p] = [];
  }

  register<T = unknown>(point: HookPoint, fn: HookFn<T>, name?: string): void {
    if (!VALID_POINTS.includes(point)) {
      throw new Error(`Invalid hook point '${point}'. Valid: ${VALID_POINTS.join(", ")}`);
    }
    this._hooks[point].push({ fn, name: name ?? fn.name ?? "anonymous" });
  }

  invoke<T>(point: HookPoint, ctx: T): T {
    for (const entry of this._hooks[point] ?? []) {
      try {
        const result = entry.fn(ctx);
        if (result !== undefined && result !== null) ctx = result as T;
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`[hook] '${entry.name}' at ${point} failed: ${msg}`);
      }
    }
    return ctx;
  }

  loadFromConfig(hooksConfig: Record<string, HookDef[] | undefined>): void {
    if (!hooksConfig) return;

    // Schema format: { before: [...], after: [...] }
    if (hooksConfig.before || hooksConfig.after) {
      for (const h of hooksConfig.before ?? []) this._registerPlaceholder("pre_extract", h);
      for (const h of hooksConfig.after ?? []) this._registerPlaceholder("post_extract", h);
      return;
    }

    // Direct point mapping: { post_extract: [...], ... }
    for (const [point, list] of Object.entries(hooksConfig)) {
      if (!VALID_POINTS.includes(point as HookPoint)) continue;
      for (const h of list ?? []) this._registerPlaceholder(point as HookPoint, h);
    }
  }

  async loadFromModule(modulePath: string): Promise<void> {
    try {
      const mod = await import(modulePath);
      if (typeof mod.registerHooks === "function") {
        mod.registerHooks(this);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[hook] Failed to load module '${modulePath}': ${msg}`);
    }
  }

  private _registerPlaceholder(point: HookPoint, hookDef: HookDef): void {
    console.log(`[hook] Registered '${hookDef.name}' at ${point} (from config)`);
    this._hooks[point].push({
      fn: (ctx: unknown) => ctx,
      name: hookDef.name ?? "config-hook",
    });
  }
}

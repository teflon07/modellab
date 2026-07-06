import { parse as parseYaml } from "yaml";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import type { RunnerBackend } from "./types";

/**
 * Expand `${VAR}` env references and a leading `~` in a config path so the
 * repo carries no machine-specific absolute paths. The internal pi runner
 * points its obs paths at `${MODELLAB_OBS_DIR}/...`; an unset var expands to
 * empty, yielding an invalid path that fails loudly rather than silently.
 */
export function expandPath(s: string): string {
  const expanded = s.replace(/\$\{([A-Z0-9_]+)\}/gi, (_, name) => process.env[name] ?? "");
  return expanded.startsWith("~/") || expanded === "~"
    ? homedir() + expanded.slice(1)
    : expanded;
}

export interface PriceEntry {
  input_per_mtok: number;
  output_per_mtok: number;
}

export interface Config {
  runner: RunnerBackend;
  obs: {
    db_path: string;
    server_url: string;
    token: string;
    pool: string;
    extension_path?: string;
  };
  codex: {
    sandbox: "read-only" | "workspace-write" | "danger-full-access";
    approval: "never" | "on-request" | "untrusted";
    ephemeral: boolean;
    judge_model?: string;
    effort?: string;
  };
  openrouter: {
    base_url: string;
    /** name of the env var holding the API key — the key itself never lives in config */
    api_key_env: string;
    referer?: string;
    title?: string;
    effort?: string;
    judge_model?: string;
  };
  pi_version: string;
  prices: Record<string, PriceEntry>;
}

export function parseConfig(text: string): Config {
  const raw = parseYaml(text) ?? {};
  const runner = String(raw.runner ?? "pi");
  if (runner !== "pi" && runner !== "codex" && runner !== "openrouter") {
    throw new Error("config: runner must be 'pi', 'codex', or 'openrouter'");
  }
  if (runner === "pi" && !raw.obs?.db_path) throw new Error("config: obs.db_path is required");
  const prices: Record<string, PriceEntry> = {};
  for (const [k, v] of Object.entries(raw.prices ?? {})) {
    const e = v as any;
    prices[k] = { input_per_mtok: Number(e.input_per_mtok), output_per_mtok: Number(e.output_per_mtok) };
  }
  const sandbox = String(raw.codex?.sandbox ?? "workspace-write");
  if (sandbox !== "read-only" && sandbox !== "workspace-write" && sandbox !== "danger-full-access") {
    throw new Error("config: codex.sandbox must be read-only, workspace-write, or danger-full-access");
  }
  const approval = String(raw.codex?.approval ?? "never");
  if (approval !== "never" && approval !== "on-request" && approval !== "untrusted") {
    throw new Error("config: codex.approval must be never, on-request, or untrusted");
  }
  return {
    runner,
    obs: {
      db_path: expandPath(String(raw.obs?.db_path ?? "")),
      server_url: String(raw.obs?.server_url ?? "http://127.0.0.1:43190"),
      token: String(raw.obs?.token ?? "devtoken"),
      pool: String(raw.obs?.pool ?? "benchmark"),
      extension_path: raw.obs?.extension_path ? expandPath(String(raw.obs.extension_path)) : undefined,
    },
    codex: {
      sandbox,
      approval,
      ephemeral: raw.codex?.ephemeral === undefined ? true : Boolean(raw.codex.ephemeral),
      judge_model: raw.codex?.judge_model ? String(raw.codex.judge_model) : undefined,
      effort: raw.codex?.effort ? String(raw.codex.effort) : undefined,
    },
    openrouter: {
      base_url: String(raw.openrouter?.base_url ?? "https://openrouter.ai/api/v1"),
      api_key_env: String(raw.openrouter?.api_key_env ?? "OPENROUTER_API_KEY"),
      referer: raw.openrouter?.referer ? String(raw.openrouter.referer) : undefined,
      title: raw.openrouter?.title ? String(raw.openrouter.title) : undefined,
      effort: raw.openrouter?.effort ? String(raw.openrouter.effort) : undefined,
      judge_model: raw.openrouter?.judge_model ? String(raw.openrouter.judge_model) : undefined,
    },
    pi_version: String(raw.pi_version ?? "unknown"),
    prices,
  };
}

export function loadConfig(path: string): Config {
  return parseConfig(readFileSync(path, "utf8"));
}

/**
 * Recompute a run's cost from the config price table, overriding the
 * provider-reported cost when an entry exists for the model. Cache reads are
 * billed at 10% of the input rate and cache writes at 125% (Anthropic-style
 * 5-minute cache). Returns null when the model has no price entry.
 */
export function priceOverride(
  prices: Record<string, PriceEntry>,
  model: string,
  m: { inputTokens: number; outputTokens: number; cacheRead: number; cacheWrite: number },
): number | null {
  const p = prices[model];
  if (!p) return null;
  const inputCost =
    (m.inputTokens * p.input_per_mtok +
      m.cacheRead * p.input_per_mtok * 0.1 +
      m.cacheWrite * p.input_per_mtok * 1.25) /
    1_000_000;
  const outputCost = (m.outputTokens * p.output_per_mtok) / 1_000_000;
  return inputCost + outputCost;
}

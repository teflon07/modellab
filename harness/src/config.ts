import { parse as parseYaml } from "yaml";
import { readFileSync } from "node:fs";

export interface PriceEntry {
  input_per_mtok: number;
  output_per_mtok: number;
}

export interface Config {
  obs: {
    db_path: string;
    server_url: string;
    token: string;
    pool: string;
    extension_path?: string;
  };
  pi_version: string;
  prices: Record<string, PriceEntry>;
}

export function parseConfig(text: string): Config {
  const raw = parseYaml(text) ?? {};
  if (!raw.obs?.db_path) throw new Error("config: obs.db_path is required");
  const prices: Record<string, PriceEntry> = {};
  for (const [k, v] of Object.entries(raw.prices ?? {})) {
    const e = v as any;
    prices[k] = { input_per_mtok: Number(e.input_per_mtok), output_per_mtok: Number(e.output_per_mtok) };
  }
  return {
    obs: {
      db_path: String(raw.obs.db_path),
      server_url: String(raw.obs.server_url ?? "http://127.0.0.1:43190"),
      token: String(raw.obs.token ?? "devtoken"),
      pool: String(raw.obs.pool ?? "benchmark"),
      extension_path: raw.obs.extension_path ? String(raw.obs.extension_path) : undefined,
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

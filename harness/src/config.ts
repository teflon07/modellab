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
    },
    pi_version: String(raw.pi_version ?? "unknown"),
    prices,
  };
}

export function loadConfig(path: string): Config {
  return parseConfig(readFileSync(path, "utf8"));
}

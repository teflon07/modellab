import { test, expect } from "bun:test";
import { parseConfig } from "../src/config";

test("parseConfig reads obs settings and price table", () => {
  const cfg = parseConfig(`
obs:
  db_path: /tmp/obs.db
  server_url: http://127.0.0.1:43190
  token: devtoken
  pool: benchmark
pi_version: "1.2.3"
prices:
  "anthropic/claude-opus-4-8": { input_per_mtok: 15, output_per_mtok: 75 }
`);
  expect(cfg.obs.db_path).toBe("/tmp/obs.db");
  expect(cfg.obs.pool).toBe("benchmark");
  expect(cfg.prices["anthropic/claude-opus-4-8"]!.input_per_mtok).toBe(15);
});

test("parseConfig throws when obs.db_path is missing", () => {
  expect(() => parseConfig(`obs:\n  server_url: x`)).toThrow(/db_path/);
});

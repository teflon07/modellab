import { test, expect } from "bun:test";
import { parseConfig, expandPath } from "../src/config";

test("expandPath substitutes env vars in config paths", () => {
  process.env.MODELLAB_TEST_OBS = "/tmp/obs";
  expect(expandPath("${MODELLAB_TEST_OBS}/db/obs.db")).toBe("/tmp/obs/db/obs.db");
  delete process.env.MODELLAB_TEST_OBS;
});

test("expandPath leaves an unset var empty so the path fails loud, not silently", () => {
  delete process.env.MODELLAB_UNSET_OBS;
  expect(expandPath("${MODELLAB_UNSET_OBS}/db/obs.db")).toBe("/db/obs.db");
});

test("openrouter runner parses without obs paths", () => {
  const cfg = parseConfig(`
runner: openrouter
openrouter:
  api_key_env: MY_KEY
`);
  expect(cfg.runner).toBe("openrouter");
  expect(cfg.openrouter.api_key_env).toBe("MY_KEY");
  expect(cfg.openrouter.base_url).toBe("https://openrouter.ai/api/v1");
});

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
  expect(cfg.runner).toBe("pi");
  expect(cfg.obs.db_path).toBe("/tmp/obs.db");
  expect(cfg.obs.pool).toBe("benchmark");
  expect(cfg.prices["anthropic/claude-opus-4-8"]!.input_per_mtok).toBe(15);
});

test("parseConfig throws when obs.db_path is missing", () => {
  expect(() => parseConfig(`obs:\n  server_url: x`)).toThrow(/db_path/);
});

test("parseConfig accepts codex runner without obs db", () => {
  const cfg = parseConfig(`
runner: codex
codex:
  sandbox: workspace-write
  approval: never
  ephemeral: true
  judge_model: gpt-5.5
`);
  expect(cfg.runner).toBe("codex");
  expect(cfg.obs.db_path).toBe("");
  expect(cfg.codex.sandbox).toBe("workspace-write");
  expect(cfg.codex.approval).toBe("never");
  expect(cfg.codex.ephemeral).toBe(true);
  expect(cfg.codex.judge_model).toBe("gpt-5.5");
});

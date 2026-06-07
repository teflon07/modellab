import { test, expect } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { collectByTag } from "../src/collector";

function makeDb(): string {
  const dir = mkdtempSync(join(tmpdir(), "obs-"));
  const path = join(dir, "obs.db");
  const db = new Database(path);
  db.run(`CREATE TABLE sessions (session_id TEXT PRIMARY KEY, pool TEXT, agent_name TEXT, cwd TEXT, session_file TEXT, provider TEXT, model TEXT, first_ts TEXT, last_ts TEXT, event_count INTEGER, tags_json TEXT)`);
  db.run(`CREATE TABLE events (event_id TEXT PRIMARY KEY, session_id TEXT, seq INTEGER, ts TEXT, type TEXT, pool TEXT, tags_json TEXT, payload_json TEXT, provider TEXT, model TEXT)`);

  const tag = "bench:r1:s1:m1:1";
  db.run(
    `INSERT INTO sessions VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    ["sess-1", "benchmark", "n", "/x", null, "anthropic", "claude", "2026-06-06T10:00:00.000Z", "2026-06-06T10:00:03.000Z", 5, JSON.stringify([tag])],
  );
  const ev = (seq: number, type: string, ts: string, payload: object) =>
    db.run(`INSERT INTO events VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [`e${seq}`, "sess-1", seq, ts, type, "benchmark", JSON.stringify([tag]), JSON.stringify(payload), "anthropic", "claude"]);

  ev(0, "turn_start", "2026-06-06T10:00:00.000Z", {});
  ev(1, "tool_call", "2026-06-06T10:00:01.000Z", { tool_name: "read" });
  ev(2, "assistant_message", "2026-06-06T10:00:02.000Z", {
    usage: { input: 100, output: 50, cache_read: 200, cache_write: 10, total_tokens: 360, cost_total: 0.02 },
    prefill_ms: 300, output_tps: 40,
  });
  ev(3, "turn_start", "2026-06-06T10:00:02.500Z", {});
  ev(4, "assistant_message", "2026-06-06T10:00:03.000Z", {
    usage: { input: 120, output: 30, cache_read: 250, cache_write: 0, total_tokens: 400, cost_total: 0.03 },
    prefill_ms: 280, output_tps: 50,
  });
  return path;
}

test("collectByTag computes metrics for the tagged session", () => {
  const m = collectByTag(makeDb(), "bench:r1:s1:m1:1")!;
  expect(m.sessionId).toBe("sess-1");
  expect(m.totalTokens).toBe(760);
  expect(m.inputTokens).toBe(220);
  expect(m.outputTokens).toBe(80);
  expect(m.cacheRead).toBe(450);
  expect(m.cacheWrite).toBe(10);
  expect(m.costTotal).toBeCloseTo(0.05, 5);
  expect(m.turns).toBe(2);
  expect(m.toolCalls).toBe(1);
  expect(m.compactions).toBe(0);
  expect(m.errorCount).toBe(0);
  expect(m.peakContext).toBe(370);
  expect(m.wallClockMs).toBe(3000);
  expect(m.ttftMs).toBe(300);
  expect(m.outputTps).toBe(45);
});

test("collectByTag returns null for an unknown tag", () => {
  expect(collectByTag(makeDb(), "bench:nope:nope:nope:9")).toBeNull();
});

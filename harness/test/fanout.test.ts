import { test, expect } from "bun:test";
import { isLocal, slug, partition, mergeReports } from "../../scripts/fanout";
import type { CellSummary, RunResult } from "../src/types";

const summary = {
  track: "frontier", specId: "s1", model: "m1", n: 1, completed: 1, timeouts: 0,
  passRate: 1, passRateCI: { low: 0.2, high: 1 }, metered: false,
  tokens: { median: 10, min: 10, max: 10, stdev: 0, cv: 0 },
  cost: { median: 0, min: 0, max: 0, stdev: 0, cv: 0 },
  cacheHitRatio: { median: 0, min: 0, max: 0, stdev: 0, cv: 0 },
  turns: { median: 1, min: 1, max: 1, stdev: 0, cv: 0 },
  toolCalls: { median: 0, min: 0, max: 0, stdev: 0, cv: 0 },
  wallClockMs: { median: 100, min: 100, max: 100, stdev: 0, cv: 0 },
  ttftMs: { median: 0, min: 0, max: 0, stdev: 0, cv: 0 },
  outputTps: { median: 0, min: 0, max: 0, stdev: 0, cv: 0 },
  peakContext: { median: 10, min: 10, max: 10, stdev: 0, cv: 0 },
  costPerSuccess: 0, tokensPerSuccess: 10,
} satisfies CellSummary;

const run = {
  runId: "child-a", specId: "s1", model: "m1", rep: 1, sessionId: "session-1",
  totalTokens: 10, inputTokens: 5, outputTokens: 5, cacheRead: 0, cacheWrite: 0,
  costTotal: 0, turns: 1, toolCalls: 0, compactions: 0, peakContext: 10,
  wallClockMs: 100, ttftMs: null, outputTps: null, errorCount: 0,
  pass: true, score: 1, timedOut: false,
} satisfies RunResult;

test("isLocal only flags ollama models", () => {
  expect(isLocal("ollama/qwen3:1.7b:high")).toBe(true);
  expect(isLocal("anthropic/claude-opus-4-8:high")).toBe(false);
  expect(isLocal("openrouter/z-ai/glm-5.2:high")).toBe(false);
});

test("slug is filesystem/tag safe", () => {
  expect(slug("openrouter/z-ai/glm-5.2:high")).toBe("openrouter-z-ai-glm-5-2-high");
  expect(slug("anthropic/claude-opus-4-8:high")).toBe("anthropic-claude-opus-4-8-high");
});

test("partition splits API (parallel) from local (serial)", () => {
  const { api, local } = partition([
    "anthropic/claude-opus-4-8:high",
    "ollama/qwen3:1.7b:high",
    "openrouter/z-ai/glm-5.2:high",
  ]);
  expect(api).toEqual(["anthropic/claude-opus-4-8:high", "openrouter/z-ai/glm-5.2:high"]);
  expect(local).toEqual(["ollama/qwen3:1.7b:high"]);
});

test("mergeReports concatenates disjoint summaries/runs and preserves child fingerprints", () => {
  const merged = mergeReports([
    { summaries: [summary], runs: [run], meta: { runId: "child-a", generatedAt: "2026-07-16T00:00:00Z", piVersion: "0.80.7", campaignFingerprint: "fingerprint-a" } },
    { summaries: [{ ...summary, model: "m2" }], runs: [{ ...run, runId: "child-b", model: "m2" }], meta: { runId: "child-b", generatedAt: "2026-07-16T00:00:00Z", piVersion: "0.80.7", campaignFingerprint: "fingerprint-b" } },
  ]);
  expect(merged.summaries.map((s: any) => s.model)).toEqual(["m1", "m2"]);
  expect(merged.runs.length).toBe(2);
  expect(merged.piVersion).toBe("0.80.7");
  expect(merged.childFingerprints).toEqual(["fingerprint-a", "fingerprint-b"]);
  expect(() => mergeReports([{ meta: { runId: "child-a", generatedAt: "now", piVersion: "0.80.7", campaignFingerprint: "fingerprint-a" } }]))
    .toThrow(/summaries and runs/);
});

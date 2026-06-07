import { test, expect } from "bun:test";
import type { Spec, RunResult } from "../src/types";
import { isTrack } from "../src/types";

test("isTrack accepts valid tracks and rejects others", () => {
  expect(isTrack("frontier")).toBe(true);
  expect(isTrack("local")).toBe(true);
  expect(isTrack("crossover")).toBe(true);
  expect(isTrack("nope")).toBe(false);
});

test("Spec/RunResult shapes are usable", () => {
  const s: Spec = {
    id: "x", track: "frontier", mode: "single_shot",
    prompt: "hi", models: ["anthropic/claude-opus-4-8"], reps: 1,
    timeout_s: 60, scoring: { kind: "programmatic" }, tags: [],
  };
  const r: RunResult = {
    runId: "r", specId: "x", model: "anthropic/claude-opus-4-8", rep: 1,
    sessionId: "sid", totalTokens: 10, inputTokens: 8, outputTokens: 2,
    cacheRead: 0, cacheWrite: 0, costTotal: 0.01, turns: 1, toolCalls: 0,
    compactions: 0, peakContext: 8, wallClockMs: 1200, ttftMs: 300,
    outputTps: 40, errorCount: 0, pass: true, score: 1,
  };
  expect(s.id).toBe("x");
  expect(r.pass).toBe(true);
});

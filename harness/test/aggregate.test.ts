import { test, expect } from "bun:test";
import { distribution, summarize } from "../src/aggregate";
import type { RunResult, Spec } from "../src/types";

test("distribution computes median/min/max", () => {
  expect(distribution([3, 1, 2])).toEqual({ median: 2, min: 1, max: 3 });
  expect(distribution([4, 1, 2, 3])).toEqual({ median: 2.5, min: 1, max: 4 });
  expect(distribution([])).toEqual({ median: 0, min: 0, max: 0 });
});

function mkResult(p: Partial<RunResult>): RunResult {
  return {
    runId: "r", specId: "s1", model: "m1", rep: 1, sessionId: "x",
    totalTokens: 100, inputTokens: 80, outputTokens: 20, cacheRead: 0,
    cacheWrite: 0, costTotal: 0.01, turns: 1, toolCalls: 0, compactions: 0,
    peakContext: 80, wallClockMs: 1000, ttftMs: 200, outputTps: 30,
    errorCount: 0, pass: true, score: 1, ...p,
  };
}

test("summarize groups by (track, spec, model) with derived metrics", () => {
  const specs: Spec[] = [{
    id: "s1", track: "frontier", mode: "single_shot", prompt: "x",
    models: ["m1"], reps: 2, timeout_s: 60, scoring: { kind: "programmatic" }, tags: [],
  }];
  const results = [
    mkResult({ rep: 1, totalTokens: 100, costTotal: 0.02, pass: true }),
    mkResult({ rep: 2, totalTokens: 200, costTotal: 0.04, pass: false }),
  ];
  const [cell] = summarize(results, specs);
  expect(cell.track).toBe("frontier");
  expect(cell.n).toBe(2);
  expect(cell.passRate).toBe(0.5);
  expect(cell.tokens).toEqual({ median: 150, min: 100, max: 200 });
  expect(cell.costPerSuccess).toBeCloseTo(0.06, 5);
  expect(cell.tokensPerSuccess).toBe(300);
});

test("costPerSuccess is null when nothing passed", () => {
  const specs: Spec[] = [{
    id: "s1", track: "local", mode: "single_shot", prompt: "x",
    models: ["m1"], reps: 1, timeout_s: 60, scoring: { kind: "programmatic" }, tags: [],
  }];
  const [cell] = summarize([mkResult({ pass: false })], specs);
  expect(cell.costPerSuccess).toBeNull();
  expect(cell.tokensPerSuccess).toBeNull();
});

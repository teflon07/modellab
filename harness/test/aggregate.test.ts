import { test, expect } from "bun:test";
import { distribution, summarize, wilsonInterval } from "../src/aggregate";
import type { RunResult, Spec } from "../src/types";

test("distribution computes median/min/max", () => {
  expect(distribution([3, 1, 2])).toMatchObject({ median: 2, min: 1, max: 3 });
  expect(distribution([4, 1, 2, 3])).toMatchObject({ median: 2.5, min: 1, max: 4 });
  expect(distribution([])).toEqual({ median: 0, min: 0, max: 0, stdev: 0, cv: 0 });
});

test("distribution computes population stdev and cv", () => {
  const d = distribution([2, 4, 6]); // mean 4, var (4+0+4)/3 = 2.6667
  expect(d.stdev).toBeCloseTo(Math.sqrt(8 / 3), 6);
  expect(d.cv).toBeCloseTo(Math.sqrt(8 / 3) / 4, 6);
  // identical runs => no spread
  expect(distribution([5, 5, 5])).toMatchObject({ stdev: 0, cv: 0 });
  // single sample => stdev 0, not NaN
  expect(distribution([7])).toMatchObject({ stdev: 0, cv: 0 });
  // mean 0 => cv guarded to 0, not Infinity
  expect(distribution([-1, 0, 1]).cv).toBe(0);
});

test("wilsonInterval is a sane 95% band that stays in [0,1]", () => {
  // all pass at small n still admits real uncertainty (not 100%-100%)
  const perfect = wilsonInterval(5, 5);
  expect(perfect.high).toBe(1);
  expect(perfect.low).toBeLessThan(1);
  expect(perfect.low).toBeGreaterThan(0.5);
  // 3/5 centers near 0.6 with a wide band, clamped in range
  const flaky = wilsonInterval(3, 5);
  expect(flaky.low).toBeGreaterThanOrEqual(0);
  expect(flaky.high).toBeLessThanOrEqual(1);
  expect(flaky.low).toBeLessThan(0.6);
  expect(flaky.high).toBeGreaterThan(0.6);
  // n=0 is defined, not NaN
  expect(wilsonInterval(0, 0)).toEqual({ low: 0, high: 0 });
  // more reps tighten the band
  expect(wilsonInterval(20, 20).low).toBeGreaterThan(wilsonInterval(5, 5).low);
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
  const cells = summarize(results, specs);
  const cell = cells[0]!;
  expect(cell.track).toBe("frontier");
  expect(cell.n).toBe(2);
  expect(cell.passRate).toBe(0.5);
  expect(cell.tokens).toMatchObject({ median: 150, min: 100, max: 200 });
  expect(cell.costPerSuccess).toBeCloseTo(0.06, 5);
  expect(cell.tokensPerSuccess).toBe(300);
  // reliability band present and brackets the point estimate
  expect(cell.passRateCI.low).toBeLessThan(0.5);
  expect(cell.passRateCI.high).toBeGreaterThan(0.5);
  // run-to-run cost spread surfaced
  expect(cell.cost.cv).toBeGreaterThan(0);
});

test("timed-out reps are excluded from the pass rate, not scored as failures", () => {
  const specs: Spec[] = [{
    id: "s1", track: "frontier", mode: "single_shot", prompt: "x",
    models: ["m1"], reps: 3, timeout_s: 60, scoring: { kind: "programmatic" }, tags: [],
  }];
  const results = [
    mkResult({ rep: 1, totalTokens: 100, pass: true }),
    mkResult({ rep: 2, totalTokens: 100, pass: true }),
    // killed at the ceiling: 0 tokens, timedOut — must NOT count as a failure
    mkResult({ rep: 3, pass: false, timedOut: true, totalTokens: 0, costTotal: 0, wallClockMs: 60000 }),
  ];
  const cell = summarize(results, specs)[0]!;
  expect(cell.n).toBe(3);
  expect(cell.completed).toBe(2);
  expect(cell.timeouts).toBe(1);
  expect(cell.passRate).toBe(1); // 2/2 completed passed; the timeout is excluded, not a 2/3 fail
  // medians reflect completed reps only — the 0-token timeout does not drag them down
  expect(cell.tokens.median).toBe(100);
});

test("a cell with only timeouts reports 0 completed, not a 0% pass rate to read as failure", () => {
  const specs: Spec[] = [{
    id: "s1", track: "frontier", mode: "single_shot", prompt: "x",
    models: ["m1"], reps: 2, timeout_s: 60, scoring: { kind: "programmatic" }, tags: [],
  }];
  const results = [
    mkResult({ rep: 1, pass: false, timedOut: true, totalTokens: 0 }),
    mkResult({ rep: 2, pass: false, timedOut: true, totalTokens: 0 }),
  ];
  const cell = summarize(results, specs)[0]!;
  expect(cell.completed).toBe(0);
  expect(cell.timeouts).toBe(2);
  expect(cell.costPerSuccess).toBeNull();
});

test("costPerSuccess is null when nothing passed", () => {
  const specs: Spec[] = [{
    id: "s1", track: "local", mode: "single_shot", prompt: "x",
    models: ["m1"], reps: 1, timeout_s: 60, scoring: { kind: "programmatic" }, tags: [],
  }];
  const cells = summarize([mkResult({ pass: false })], specs);
  const cell = cells[0]!;
  expect(cell.costPerSuccess).toBeNull();
  expect(cell.tokensPerSuccess).toBeNull();
});

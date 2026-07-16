import { test, expect } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { persistRunResult, planRuns, requireJudgeOutput, shouldRetryRun, skipCompletedRuns, unfinishedRuns } from "../src/cli";
import type { RunResult, Spec } from "../src/types";

test("planRuns expands spec × model × rep", () => {
  const specs: Array<{ path: string; spec: Spec }> = [{
    path: "/x/s1.yaml",
    spec: {
      id: "s1", track: "frontier", mode: "single_shot", prompt: "x",
      models: ["m1", "m2"], reps: 2, timeout_s: 60,
      scoring: { kind: "programmatic" }, tags: [],
    },
  }];
  const plan = planRuns(specs);
  expect(plan.length).toBe(4);
  expect(plan.map((p) => `${p.model}#${p.rep}`).sort()).toEqual(["m1#1", "m1#2", "m2#1", "m2#2"]);
});

test("planRuns can override spec models for codex runs", () => {
  const specs: Array<{ path: string; spec: Spec }> = [{
    path: "/x/s1.yaml",
    spec: {
      id: "s1", track: "frontier", mode: "single_shot", prompt: "x",
      models: ["anthropic/claude-opus-4-8"], reps: 2, timeout_s: 60,
      scoring: { kind: "programmatic" }, tags: [],
    },
  }];
  const plan = planRuns(specs, ["gpt-5.5"]);
  expect(plan.length).toBe(2);
  expect(plan.every((p) => p.model === "gpt-5.5")).toBe(true);
});

test("rep-offset shifts rep numbers so single-rep runs use distinct seeds", () => {
  const specs: Array<{ path: string; spec: Spec }> = [{
    path: "/x/s1.yaml",
    spec: {
      id: "s1", track: "frontier", mode: "single_shot", prompt: "x",
      models: ["m1"], reps: 1, timeout_s: 60,
      scoring: { kind: "programmatic" }, tags: [],
    },
  }];
  // Without an offset a single-rep run is always rep 1 (the bug: same instance each time).
  expect(planRuns(specs, undefined, 1).map((p) => p.rep)).toEqual([1]);
  // Distinct offsets => distinct rep numbers => distinct generator seeds.
  expect(planRuns(specs, undefined, 1, 1).map((p) => p.rep)).toEqual([2]);
  expect(planRuns(specs, undefined, 1, 4).map((p) => p.rep)).toEqual([5]);
  // Offset shifts the whole window for multi-rep runs too.
  expect(planRuns(specs, undefined, 3, 10).map((p) => p.rep)).toEqual([11, 12, 13]);
});

test("completed checkpoints are skipped and missing tuples remain unfinished", () => {
  const specs: Array<{ path: string; spec: Spec }> = [{
    path: "/x/s1.yaml",
    spec: {
      id: "s1", track: "frontier", mode: "single_shot", prompt: "x",
      models: ["m1"], reps: 2, timeout_s: 60,
      scoring: { kind: "programmatic" }, tags: [],
    },
  }];
  const plan = planRuns(specs);
  const checkpointed = [{
    runId: "r1", specId: "s1", model: "m1", rep: 1,
    pass: true, score: 1, timedOut: false,
  } as RunResult];
  expect(skipCompletedRuns(plan, checkpointed).map((p) => p.rep)).toEqual([2]);
  expect(unfinishedRuns(plan, checkpointed).map((p) => p.rep)).toEqual([2]);
});

test("retry classification pauses infrastructure and telemetry failures but keeps timeouts as outcomes", () => {
  const healthy = { errorCount: 0 };
  expect(shouldRetryRun({ exitCode: 1, stderr: "HTTP 429 rate limit exceeded", timedOut: false }, healthy)).toBe(true);
  expect(shouldRetryRun({ exitCode: 0, stderr: "", timedOut: false }, null)).toBe(true);
  expect(shouldRetryRun({ exitCode: 0, stderr: "", timedOut: false }, { errorCount: 1 })).toBe(true);
  expect(shouldRetryRun({ exitCode: 143, stderr: "", timedOut: true }, healthy)).toBe(false);
  expect(shouldRetryRun({ exitCode: 0, stderr: "", timedOut: false }, healthy)).toBe(false);
});

test("judge failures pause scoring instead of becoming model failures", () => {
  expect(requireJudgeOutput({ exitCode: 0, stderr: "", timedOut: false, stdout: "verdict" })).toBe("verdict");
  expect(() => requireJudgeOutput({ exitCode: 1, stderr: "quota", timedOut: false, stdout: "" }))
    .toThrow(/judge runner failed/);
  expect(() => requireJudgeOutput({ exitCode: 143, stderr: "", timedOut: true, stdout: "" }))
    .toThrow(/judge runner failed/);
  expect(() => requireJudgeOutput({ exitCode: 0, stderr: "", timedOut: false, stdout: "verdict", metrics: { errorCount: 1 } }))
    .toThrow(/judge runner failed/);
});

test("raw output is durable before a result can enter the checkpoint array", () => {
  const dir = mkdtempSync(join(tmpdir(), "modellab-persist-"));
  const results: RunResult[] = [];
  const complete = {
    runId: "r1", specId: "s1", model: "m1", rep: 1,
    sessionId: "session-1", totalTokens: 10, inputTokens: 5, outputTokens: 5,
    cacheRead: 0, cacheWrite: 0, costTotal: 0, turns: 1, toolCalls: 0,
    compactions: 0, peakContext: 10, wallClockMs: 100, ttftMs: null,
    outputTps: null, errorCount: 0, pass: true, score: 1, timedOut: false,
  } satisfies RunResult;
  try {
    expect(() => persistRunResult(results, complete, join(dir, "missing", "outputs.jsonl"), "answer", () => {})).toThrow();
    expect(results).toHaveLength(0);
    const outputs = join(dir, "outputs.jsonl");
    persistRunResult(results, complete, outputs, "answer", () => {});
    expect(results).toEqual([complete]);
    expect(readFileSync(outputs, "utf8")).toContain('\"output\":\"answer\"');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

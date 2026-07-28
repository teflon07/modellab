import { test, expect } from "bun:test";
import { planRuns, shouldRetryRun, skipCompletedRuns, unfinishedRuns } from "../src/cli";
import type { Spec } from "../src/types";

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

test("skipCompletedRuns preserves prior checkpoints and schedules only unfinished reps", () => {
  const specs: Array<{ path: string; spec: Spec }> = [{
    path: "/x/s1.yaml",
    spec: {
      id: "s1", track: "frontier", mode: "single_shot", prompt: "x",
      models: ["m1"], reps: 3, timeout_s: 60,
      scoring: { kind: "programmatic" }, tags: [],
    },
  }];
  const plan = planRuns(specs);
  const remaining = skipCompletedRuns(plan, [{
    runId: "prior", specId: "s1", model: "m1", rep: 1,
    pass: true, score: 1, timedOut: false,
  } as RunResult]);
  expect(remaining.map((p) => p.rep)).toEqual([2, 3]);
});

test("unfinishedRuns makes a missing telemetry checkpoint retryable", () => {
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
    runId: "prior", specId: "s1", model: "m1", rep: 1,
    pass: false, score: 0, timedOut: false,
  } as RunResult];
  expect(unfinishedRuns(plan, checkpointed).map((p) => p.rep)).toEqual([2]);
});

test("shouldRetryRun pauses on quota failures but keeps ordinary timeouts as outcomes", () => {
  expect(shouldRetryRun({ exitCode: 1, stderr: "HTTP 429 rate limit exceeded", timedOut: false }, true)).toBe(true);
  expect(shouldRetryRun({ exitCode: 0, stderr: "", timedOut: false }, false)).toBe(true);
  expect(shouldRetryRun({ exitCode: 143, stderr: "", timedOut: true }, true)).toBe(false);
});

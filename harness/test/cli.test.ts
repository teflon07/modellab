import { test, expect } from "bun:test";
import { planRuns } from "../src/cli";
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

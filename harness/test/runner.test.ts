import { test, expect } from "bun:test";
import { buildPiArgs } from "../src/runner";
import type { Spec } from "../src/types";

const base: Spec = {
  id: "s1", track: "frontier", mode: "single_shot", prompt: "hello",
  models: ["anthropic/claude-opus-4-8"], reps: 1, timeout_s: 60,
  scoring: { kind: "programmatic" }, tags: [],
};

test("single-shot args disable tools, context files, and session", () => {
  const args = buildPiArgs({
    spec: base, model: "anthropic/claude-opus-4-8", tag: "bench:r:s1:m:1",
    pool: "benchmark", promptText: "hello world",
  });
  expect(args).toContain("-p");
  expect(args).toContain("--mode"); expect(args).toContain("json");
  expect(args).toContain("--no-tools");
  expect(args).toContain("--no-context-files");
  expect(args).toContain("--no-session");
  expect(args).toContain("--obs-enable");
  expect(args).toContain("--o-tag"); expect(args).toContain("bench:r:s1:m:1");
  expect(args).toContain("--model"); expect(args).toContain("anthropic/claude-opus-4-8");
  expect(args[args.length - 1]).toBe("hello world");
});

test("agentic args keep tools enabled", () => {
  const spec: Spec = { ...base, mode: "agentic", fixture: { repo: "fixtures/x", setup: [], verify: ["true"] } };
  const args = buildPiArgs({
    spec, model: "anthropic/claude-opus-4-8", tag: "bench:r:s1:m:1",
    pool: "benchmark", promptText: "do the task",
  });
  expect(args).not.toContain("--no-tools");
  expect(args).toContain("--no-context-files");
});

test("obsExtensionPath emits -e immediately before path", () => {
  const extPath = "~/.pi/observability/extension/pi-observability.ts";
  const args = buildPiArgs({
    spec: base, model: "anthropic/claude-opus-4-8", tag: "bench:r:s1:m:1",
    pool: "benchmark", promptText: "hello world",
    obsExtensionPath: extPath,
  });
  const idx = args.indexOf("-e");
  expect(idx).toBeGreaterThanOrEqual(0);
  expect(args[idx + 1]).toBe(extPath);
});

test("omitting obsExtensionPath emits no -e flag", () => {
  const args = buildPiArgs({
    spec: base, model: "anthropic/claude-opus-4-8", tag: "bench:r:s1:m:1",
    pool: "benchmark", promptText: "hello world",
  });
  expect(args).not.toContain("-e");
});

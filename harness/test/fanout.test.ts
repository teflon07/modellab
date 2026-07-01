import { test, expect } from "bun:test";
import { isLocal, slug, partition, mergeReports } from "../../scripts/fanout";

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

test("mergeReports concatenates disjoint summaries/runs and keeps a piVersion", () => {
  const merged = mergeReports([
    { summaries: [{ model: "a" } as any], runs: [{ model: "a" } as any], meta: { piVersion: "0.80.3" } },
    { summaries: [{ model: "b" } as any], runs: [{ model: "b" } as any, { model: "b" } as any] },
    { /* missing results */ } as any,
  ]);
  expect(merged.summaries.map((s: any) => s.model)).toEqual(["a", "b"]);
  expect(merged.runs.length).toBe(3);
  expect(merged.piVersion).toBe("0.80.3");
});

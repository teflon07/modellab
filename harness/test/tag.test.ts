import { test, expect } from "bun:test";
import { modelSlug, buildRunTag, parseRunTag } from "../src/tag";

test("modelSlug normalizes provider/id and thinking suffix", () => {
  expect(modelSlug("anthropic/claude-opus-4-8")).toBe("anthropic-claude-opus-4-8");
  expect(modelSlug("sonnet:high")).toBe("sonnet-high");
});

test("buildRunTag is round-trippable", () => {
  const tag = buildRunTag("run123", "extract-json", "openai/gpt-4o", 3);
  expect(tag).toBe("bench:run123:extract-json:openai-gpt-4o:3");
  expect(parseRunTag(tag)).toEqual({
    runId: "run123", specId: "extract-json", modelSlug: "openai-gpt-4o", rep: 3,
  });
});

test("parseRunTag rejects non-bench tags", () => {
  expect(parseRunTag("pilot")).toBeNull();
  expect(parseRunTag("bench:a:b")).toBeNull();
});

test("attempt-qualified tags stay parseable and isolate retry telemetry", () => {
  const first = buildRunTag("run123", "s1", "m1", 1, "attempt-a");
  const second = buildRunTag("run123", "s1", "m1", 1, "attempt-b");
  expect(first).not.toBe(second);
  expect(parseRunTag(first)).toMatchObject({ runId: "run123", specId: "s1", rep: 1, attemptId: "attempt-a" });
});

import { test, expect } from "bun:test";
import { buildCodexArgs, buildPiArgs, collectCodexMetrics } from "../src/runner";
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

test("codex args run exec JSONL through ChatGPT-authenticated CLI", () => {
  const args = buildCodexArgs({
    spec: base,
    model: "gpt-5.5",
    promptText: "hello world",
    cwd: "/tmp/lab",
    sandbox: "workspace-write",
    approval: "never",
    ephemeral: true,
  });
  expect(args.slice(0, 4)).toEqual(["-a", "never", "exec", "--json"]);
  expect(args).toContain("-C");
  expect(args).toContain("/tmp/lab");
  expect(args).toContain("--skip-git-repo-check");
  expect(args).toContain("--sandbox");
  expect(args).toContain("read-only");
  expect(args).toContain("--model");
  expect(args).toContain("gpt-5.5");
  expect(args).toContain("--ephemeral");
  expect(args[args.length - 1]).toBe("hello world");
});

test("collectCodexMetrics parses final message and token usage", () => {
  const jsonl = [
    JSON.stringify({ type: "thread.started", thread_id: "thread-1" }),
    JSON.stringify({ type: "item.completed", item: { type: "command_execution", command: "ls" } }),
    JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: "done" } }),
    JSON.stringify({
      type: "turn.completed",
      usage: {
        input_tokens: 100,
        cached_input_tokens: 40,
        output_tokens: 20,
        reasoning_output_tokens: 5,
      },
    }),
  ].join("\n");
  const out = collectCodexMetrics(jsonl, "fallback", 1234, false);
  expect(out.finalMessage).toBe("done");
  expect(out.metrics.sessionId).toBe("thread-1");
  expect(out.metrics.inputTokens).toBe(100);
  expect(out.metrics.cacheRead).toBe(40);
  expect(out.metrics.outputTokens).toBe(25);
  expect(out.metrics.totalTokens).toBe(125);
  expect(out.metrics.toolCalls).toBe(1);
  expect(out.metrics.turns).toBe(1);
  expect(out.metrics.costTotal).toBe(0);
});

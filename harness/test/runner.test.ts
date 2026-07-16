import { test, expect } from "bun:test";
import { buildCodexArgs, buildPiArgs, collectCodexMetrics, buildOpenRouterBody, collectOpenRouterMetrics, buildClaudeArgs, collectClaudeMetrics } from "../src/runner";
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

test("Pi args carry the configured thinking level", () => {
  const args = buildPiArgs({
    spec: base, model: "openai/gpt-test", tag: "bench:r:s1:m:1",
    pool: "benchmark", promptText: "hello world", thinking: "high",
  });
  const index = args.indexOf("--thinking");
  expect(index).toBeGreaterThanOrEqual(0);
  expect(args[index + 1]).toBe("high");
});

test("Pi args omit thinking when it is not configured", () => {
  const args = buildPiArgs({
    spec: base, model: "openai/gpt-test", tag: "bench:r:s1:m:1",
    pool: "benchmark", promptText: "hello world",
  });
  expect(args).not.toContain("--thinking");
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
  const extPath = "/opt/pi/observability/extension/pi-observability.ts";
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

test("codex args carry reasoning effort as a -c override before exec", () => {
  const args = buildCodexArgs({
    spec: base, model: "gpt-5.5", promptText: "hi", cwd: "/tmp/lab",
    sandbox: "read-only", approval: "never", ephemeral: true, effort: "high",
  });
  const ci = args.indexOf("-c");
  expect(ci).toBeGreaterThanOrEqual(0);
  expect(args[ci + 1]).toBe('model_reasoning_effort="high"');
  expect(ci).toBeLessThan(args.indexOf("exec")); // override precedes the subcommand
});

test("codex args omit -c when no effort is set", () => {
  const args = buildCodexArgs({
    spec: base, model: "gpt-5.5", promptText: "hi", cwd: "/tmp/lab",
    sandbox: "read-only", approval: "never", ephemeral: true,
  });
  expect(args).not.toContain("-c");
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

test("openrouter body requests inline usage and single user message", () => {
  const body = buildOpenRouterBody("anthropic/claude-sonnet-5", "solve this", "high") as any;
  expect(body.model).toBe("anthropic/claude-sonnet-5");
  expect(body.messages).toEqual([{ role: "user", content: "solve this" }]);
  expect(body.usage).toEqual({ include: true });
  expect(body.reasoning).toEqual({ effort: "high" });
});

test("openrouter body omits reasoning when no effort given", () => {
  const body = buildOpenRouterBody("openai/gpt-5.5", "hi") as any;
  expect(body.reasoning).toBeUndefined();
});

test("openrouter metrics map usage fields and count one turn", () => {
  const m = collectOpenRouterMetrics(
    {
      prompt_tokens: 100,
      completion_tokens: 25,
      total_tokens: 125,
      cost: 0.0042,
      prompt_tokens_details: { cached_tokens: 40 },
    },
    "sess1",
    1234,
    false,
  );
  expect(m.inputTokens).toBe(100);
  expect(m.outputTokens).toBe(25);
  expect(m.totalTokens).toBe(125);
  expect(m.cacheRead).toBe(40);
  expect(m.costTotal).toBeCloseTo(0.0042);
  expect(m.turns).toBe(1);
  expect(m.wallClockMs).toBe(1234);
  expect(m.errorCount).toBe(0);
});

test("openrouter metrics fall back to input+output and flag failures", () => {
  const m = collectOpenRouterMetrics({ prompt_tokens: 10, completion_tokens: 5 }, "sess2", 50, true);
  expect(m.totalTokens).toBe(15);
  expect(m.costTotal).toBe(0);
  expect(m.errorCount).toBe(1);
});

test("claude single-shot args disable tools and print JSON (prompt goes via stdin)", () => {
  const args = buildClaudeArgs({ model: "sonnet", singleShot: true });
  expect(args.slice(0, 3)).toEqual(["-p", "--output-format", "json"]);
  expect(args).toContain("--model");
  expect(args).toContain("sonnet");
  // --allowedTools must be last (variadic) so it can't swallow other args; the
  // prompt is never in argv.
  expect(args[args.length - 2]).toBe("--allowedTools");
  expect(args[args.length - 1]).toBe("");
  expect(args).not.toContain("--dangerously-skip-permissions");
});

test("claude agentic args skip permissions and keep tools", () => {
  const args = buildClaudeArgs({ model: "sonnet", singleShot: false });
  expect(args).toContain("--dangerously-skip-permissions");
  expect(args).not.toContain("--allowedTools");
});

test("claude metrics parse usage, cost, cache, and final message", () => {
  const json = JSON.stringify({
    type: "result", subtype: "success", is_error: false, num_turns: 1,
    result: "OK", session_id: "sess-x", total_cost_usd: 0.0975, ttft_ms: 2815,
    usage: { input_tokens: 2, output_tokens: 4, cache_read_input_tokens: 23415, cache_creation_input_tokens: 15074 },
  });
  const { finalMessage, metrics } = collectClaudeMetrics(json, "fallback", 3225, false);
  expect(finalMessage).toBe("OK");
  expect(metrics.sessionId).toBe("sess-x");
  expect(metrics.inputTokens).toBe(2);
  expect(metrics.outputTokens).toBe(4);
  expect(metrics.totalTokens).toBe(6);
  expect(metrics.cacheRead).toBe(23415);
  expect(metrics.cacheWrite).toBe(15074);
  expect(metrics.peakContext).toBe(38491); // input + cache read + cache create
  expect(metrics.costTotal).toBeCloseTo(0.0975);
  expect(metrics.turns).toBe(1);
  expect(metrics.ttftMs).toBe(2815);
  expect(metrics.errorCount).toBe(0);
});

test("claude metrics flag a non-success result as an error", () => {
  const json = JSON.stringify({ type: "result", subtype: "error_max_turns", is_error: true, result: "", session_id: "s" });
  const { metrics } = collectClaudeMetrics(json, "fallback", 100, false);
  expect(metrics.errorCount).toBe(1);
});

test("claude metrics flag unparseable output as an error with fallback session", () => {
  const { metrics } = collectClaudeMetrics("not json", "fallback-sess", 50, false);
  expect(metrics.errorCount).toBe(1);
  expect(metrics.sessionId).toBe("fallback-sess");
});

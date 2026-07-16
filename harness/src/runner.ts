import type { CollectedMetrics, PiThinkingLevel, RunnerBackend, Spec } from "./types";

export function requirePiVersion(expected: string, actual: string): string {
  const normalizedExpected = expected.trim().replace(/^v/, "");
  const normalizedActual = actual.trim().replace(/^v/, "");
  if (!normalizedActual || normalizedActual !== normalizedExpected) {
    throw new Error(`Pi version mismatch: config pins ${expected}, installed runtime is ${actual || "unavailable"}`);
  }
  return normalizedActual;
}

export function detectPiVersion(expected: string): string {
  const result = Bun.spawnSync(["pi", "--version"], { stdout: "pipe", stderr: "pipe" });
  if (result.exitCode !== 0) {
    throw new Error(`Pi version check failed: ${result.stderr.toString().trim() || `exit ${result.exitCode}`}`);
  }
  return requirePiVersion(expected, result.stdout.toString().trim());
}

function detectCommandVersion(command: string): string {
  const result = Bun.spawnSync([command, "--version"], { stdout: "pipe", stderr: "pipe" });
  const version = result.stdout.toString().trim();
  if (result.exitCode !== 0 || !version) {
    throw new Error(`${command} version check failed: ${result.stderr.toString().trim() || `exit ${result.exitCode}`}`);
  }
  return version;
}

export function detectRunnerVersion(runner: RunnerBackend, configuredPiVersion: string): string {
  if (runner === "pi") return detectPiVersion(configuredPiVersion);
  if (runner === "codex") return detectCommandVersion("codex");
  if (runner === "claude") return detectCommandVersion("claude");
  return "openrouter-api";
}

export interface BuildArgsOpts {
  spec: Spec;
  model: string;
  tag: string;
  pool: string;
  promptText: string;
  obsExtensionPath?: string;
  thinking?: PiThinkingLevel;
}

export function buildPiArgs(opts: BuildArgsOpts): string[] {
  const { spec, model, tag, pool, promptText, obsExtensionPath, thinking } = opts;
  const args: string[] = [];
  if (obsExtensionPath) {
    args.push("-e", obsExtensionPath);
  }
  args.push(
    "-p",
    "--mode", "json",
    "--no-context-files",
    "--obs-enable",
    "--o-pool", pool,
    "--o-tag", tag,
    "--o-name", `${spec.id}/${model}`,
    "--model", model,
  );
  if (thinking) args.push("--thinking", thinking);
  if (spec.mode === "single_shot") {
    args.push("--no-tools", "--no-session");
  }
  args.push(promptText);
  return args;
}

export interface RunOneOpts extends BuildArgsOpts {
  cwd: string;
  timeoutMs: number;
  env: Record<string, string>;
}

export interface RunOneResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  wallClockMs: number;
  timedOut: boolean;
}

export async function runOne(opts: RunOneOpts): Promise<RunOneResult> {
  const args = buildPiArgs(opts);
  const start = performance.now();
  const proc = Bun.spawn(["pi", ...args], {
    cwd: opts.cwd,
    env: { ...process.env, ...opts.env },
    stdout: "pipe",
    stderr: "pipe",
  });
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; proc.kill(); }, opts.timeoutMs);
  const [exitCode, stdout, stderr] = await Promise.all([
    proc.exited,
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  clearTimeout(timer);
  return { exitCode, stdout, stderr, wallClockMs: Math.round(performance.now() - start), timedOut };
}

export interface BuildCodexArgsOpts {
  spec: Spec;
  model: string;
  promptText: string;
  cwd: string;
  sandbox: "read-only" | "workspace-write" | "danger-full-access";
  approval: "never" | "on-request" | "untrusted";
  ephemeral: boolean;
  effort?: string;
}

export function buildCodexArgs(opts: BuildCodexArgsOpts): string[] {
  const args = ["-a", opts.approval];
  // Reasoning effort via a top-level config override (codex has no --effort flag).
  if (opts.effort) args.push("-c", `model_reasoning_effort="${opts.effort}"`);
  args.push(
    "exec",
    "--json",
    "-C", opts.cwd,
    "--skip-git-repo-check",
    "--sandbox", opts.spec.mode === "single_shot" ? "read-only" : opts.sandbox,
    "--model", opts.model,
  );
  if (opts.ephemeral) args.push("--ephemeral");
  args.push(opts.promptText);
  return args;
}

export interface RunCodexOpts extends BuildCodexArgsOpts {
  timeoutMs: number;
  env: Record<string, string>;
  sessionId: string;
}

export interface RunCodexResult extends RunOneResult {
  metrics: CollectedMetrics;
}

interface CodexUsage {
  input_tokens?: number;
  cached_input_tokens?: number;
  output_tokens?: number;
  reasoning_output_tokens?: number;
}

function numberField(x: unknown): number {
  return typeof x === "number" && Number.isFinite(x) ? x : 0;
}

export function collectCodexMetrics(jsonl: string, sessionId: string, wallClockMs: number, failed: boolean): {
  finalMessage: string;
  metrics: CollectedMetrics;
} {
  let threadId = sessionId;
  let finalMessage = "";
  let inputTokens = 0;
  let cacheRead = 0;
  let outputTokens = 0;
  let turns = 0;
  let toolCalls = 0;
  let peakContext = 0;
  let errorCount = failed ? 1 : 0;

  for (const line of jsonl.split(/\r?\n/)) {
    if (!line.trim()) continue;
    let event: any;
    try {
      event = JSON.parse(line);
    } catch {
      errorCount += 1;
      continue;
    }

    if (event.type === "thread.started" && typeof event.thread_id === "string") {
      threadId = event.thread_id;
    }
    if (event.type === "turn.failed" || event.type === "error") {
      errorCount += 1;
    }
    if (event.type === "item.completed") {
      const item = event.item;
      if (item?.type === "agent_message" && typeof item.text === "string") {
        finalMessage = item.text;
      }
      if (
        item?.type === "command_execution" ||
        item?.type === "mcp_tool_call" ||
        item?.type === "web_search"
      ) {
        toolCalls += 1;
      }
    }
    if (event.type === "turn.completed") {
      turns += 1;
      const usage = (event.usage ?? {}) as CodexUsage;
      const input = numberField(usage.input_tokens);
      const cached = numberField(usage.cached_input_tokens);
      const output = numberField(usage.output_tokens) + numberField(usage.reasoning_output_tokens);
      inputTokens += input;
      cacheRead += cached;
      outputTokens += output;
      peakContext = Math.max(peakContext, input);
    }
  }

  return {
    finalMessage,
    metrics: {
      sessionId: threadId,
      totalTokens: inputTokens + outputTokens,
      inputTokens,
      outputTokens,
      cacheRead,
      cacheWrite: 0,
      costTotal: 0,
      turns,
      toolCalls,
      compactions: 0,
      peakContext,
      wallClockMs,
      ttftMs: null,
      outputTps: null,
      errorCount,
    },
  };
}

export async function runOneCodex(opts: RunCodexOpts): Promise<RunCodexResult> {
  const args = buildCodexArgs(opts);
  const start = performance.now();
  const proc = Bun.spawn(["codex", ...args], {
    cwd: opts.cwd,
    env: { ...process.env, ...opts.env },
    stdout: "pipe",
    stderr: "pipe",
  });
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; proc.kill(); }, opts.timeoutMs);
  const [exitCode, rawStdout, stderr] = await Promise.all([
    proc.exited,
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  clearTimeout(timer);
  const wallClockMs = Math.round(performance.now() - start);
  const { finalMessage, metrics } = collectCodexMetrics(rawStdout, opts.sessionId, wallClockMs, exitCode !== 0 || timedOut);
  return { exitCode, stdout: finalMessage, stderr, wallClockMs, timedOut, metrics };
}

// --- OpenRouter runner -----------------------------------------------------
// The bring-your-own-key reproduce path: a single chat-completion call against
// the OpenRouter API. Single-shot only (no tool loop), which is exactly what
// the capability probes need. Usage — including real cost — comes back inline
// when we pass `usage: { include: true }`, so cost-per-success works with just
// an API key and no local price table.

export interface OpenRouterConfig {
  baseUrl: string;
  apiKey: string;
  referer?: string;
  title?: string;
}

export interface RunOpenRouterOpts {
  model: string;
  promptText: string;
  timeoutMs: number;
  sessionId: string;
  effort?: string;
  or: OpenRouterConfig;
}

export interface RunOpenRouterResult extends RunOneResult {
  metrics: CollectedMetrics;
}

interface OpenRouterUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  cost?: number;
  prompt_tokens_details?: { cached_tokens?: number };
  completion_tokens_details?: { reasoning_tokens?: number };
}

export function buildOpenRouterBody(model: string, promptText: string, effort?: string): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model,
    messages: [{ role: "user", content: promptText }],
    usage: { include: true },
  };
  if (effort) body.reasoning = { effort };
  return body;
}

export function collectOpenRouterMetrics(usage: OpenRouterUsage, sessionId: string, wallClockMs: number, failed: boolean): CollectedMetrics {
  const input = numberField(usage.prompt_tokens);
  const cached = numberField(usage.prompt_tokens_details?.cached_tokens);
  const output = numberField(usage.completion_tokens);
  return {
    sessionId,
    totalTokens: numberField(usage.total_tokens) || input + output,
    inputTokens: input,
    outputTokens: output,
    cacheRead: cached,
    cacheWrite: 0,
    costTotal: numberField(usage.cost),
    turns: 1,
    toolCalls: 0,
    compactions: 0,
    peakContext: input,
    wallClockMs,
    ttftMs: null,
    outputTps: null,
    errorCount: failed ? 1 : 0,
  };
}

// --- Claude runner ---------------------------------------------------------
// Runs the local `claude` CLI (Claude Code) in print mode, the subscription-auth
// analog of the codex runner. Like codex/pi it measures the AGENT, not the raw
// model: every call carries Claude Code's system-prompt overhead (tens of
// thousands of cached tokens), so its token/cost figures are not comparable to a
// raw-API runner (openrouter) — see the "Cost honesty" section of the README.
// `total_cost_usd` is a notional API-equivalent price, not a subscription invoice.

export interface BuildClaudeArgsOpts {
  model: string;
  singleShot: boolean;
}

// Flags only — the prompt is delivered on stdin. `--allowedTools` is variadic in
// the claude CLI and would swallow a trailing prompt positional, so it must not
// share the argv with the prompt.
export function buildClaudeArgs(opts: BuildClaudeArgsOpts): string[] {
  const args = ["-p", "--output-format", "json", "--model", opts.model];
  if (opts.singleShot) {
    // Forbid tools so a capability probe is as close to a single model turn as
    // the agent CLI allows (the system-prompt overhead is inherent regardless).
    args.push("--allowedTools", "");
  } else {
    // Agentic runs edit sandboxed fixtures; skip the interactive permission gate.
    args.push("--dangerously-skip-permissions");
  }
  return args;
}

export interface RunClaudeOpts extends BuildClaudeArgsOpts {
  promptText: string;
  cwd: string;
  timeoutMs: number;
  env: Record<string, string>;
  sessionId: string;
}

export interface RunClaudeResult extends RunOneResult {
  metrics: CollectedMetrics;
}

interface ClaudeUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
}

export function collectClaudeMetrics(stdout: string, sessionId: string, wallClockMs: number, failed: boolean): {
  finalMessage: string;
  metrics: CollectedMetrics;
} {
  let obj: any = null;
  try { obj = JSON.parse(stdout.trim()); } catch { /* leave null */ }
  const usage = (obj?.usage ?? {}) as ClaudeUsage;
  const input = numberField(usage.input_tokens);
  const output = numberField(usage.output_tokens);
  const cacheRead = numberField(usage.cache_read_input_tokens);
  const cacheWrite = numberField(usage.cache_creation_input_tokens);
  // A result object with subtype != "success" or is_error is a failed run even
  // if the process exited 0.
  const isError = failed || obj == null || obj.is_error === true || (obj.subtype != null && obj.subtype !== "success");
  return {
    finalMessage: typeof obj?.result === "string" ? obj.result : "",
    metrics: {
      sessionId: typeof obj?.session_id === "string" ? obj.session_id : sessionId,
      totalTokens: input + output,
      inputTokens: input,
      outputTokens: output,
      cacheRead,
      cacheWrite,
      costTotal: numberField(obj?.total_cost_usd),
      turns: numberField(obj?.num_turns) || 1,
      toolCalls: 0,
      compactions: 0,
      // Whole context carried into the model, agent scaffolding included.
      peakContext: input + cacheRead + cacheWrite,
      wallClockMs,
      ttftMs: numberField(obj?.ttft_ms) || null,
      outputTps: null,
      errorCount: isError ? 1 : 0,
    },
  };
}

export async function runOneClaude(opts: RunClaudeOpts): Promise<RunClaudeResult> {
  const args = buildClaudeArgs(opts);
  const start = performance.now();
  const proc = Bun.spawn(["claude", ...args], {
    cwd: opts.cwd,
    env: { ...process.env, ...opts.env },
    stdin: new TextEncoder().encode(opts.promptText),
    stdout: "pipe",
    stderr: "pipe",
  });
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; proc.kill(); }, opts.timeoutMs);
  const [exitCode, rawStdout, stderr] = await Promise.all([
    proc.exited,
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  clearTimeout(timer);
  const wallClockMs = Math.round(performance.now() - start);
  const { finalMessage, metrics } = collectClaudeMetrics(rawStdout, opts.sessionId, wallClockMs, exitCode !== 0 || timedOut);
  return { exitCode, stdout: finalMessage, stderr, wallClockMs, timedOut, metrics };
}

export async function runOneOpenRouter(opts: RunOpenRouterOpts): Promise<RunOpenRouterResult> {
  const { or, model, promptText, effort, timeoutMs, sessionId } = opts;
  const start = performance.now();
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  let exitCode = 0;
  let content = "";
  let stderr = "";
  let usage: OpenRouterUsage = {};
  try {
    const res = await fetch(`${or.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${or.apiKey}`,
        "Content-Type": "application/json",
        ...(or.referer ? { "HTTP-Referer": or.referer } : {}),
        ...(or.title ? { "X-Title": or.title } : {}),
      },
      body: JSON.stringify(buildOpenRouterBody(model, promptText, effort)),
      signal: controller.signal,
    });
    const text = await res.text();
    if (!res.ok) {
      exitCode = 1;
      stderr = `openrouter ${res.status}: ${text.slice(0, 500)}`;
    } else {
      const json = JSON.parse(text) as any;
      // OpenRouter can return HTTP 200 with an error body (e.g. upstream refusal).
      if (json.error) {
        exitCode = 1;
        stderr = `openrouter error: ${JSON.stringify(json.error).slice(0, 500)}`;
      }
      content = json.choices?.[0]?.message?.content ?? "";
      usage = (json.usage ?? {}) as OpenRouterUsage;
    }
  } catch (err) {
    exitCode = 1;
    stderr = timedOut ? "timeout" : `openrouter request failed: ${err}`;
  } finally {
    clearTimeout(timer);
  }
  const wallClockMs = Math.round(performance.now() - start);
  const metrics = collectOpenRouterMetrics(usage, sessionId, wallClockMs, exitCode !== 0 || timedOut);
  return { exitCode, stdout: content, stderr, wallClockMs, timedOut, metrics };
}

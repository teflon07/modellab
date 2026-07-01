import type { CollectedMetrics, Spec } from "./types";

export interface BuildArgsOpts {
  spec: Spec;
  model: string;
  tag: string;
  pool: string;
  promptText: string;
  obsExtensionPath?: string;
}

export function buildPiArgs(opts: BuildArgsOpts): string[] {
  const { spec, model, tag, pool, promptText, obsExtensionPath } = opts;
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
}

export function buildCodexArgs(opts: BuildCodexArgsOpts): string[] {
  const args = [
    "-a", opts.approval,
    "exec",
    "--json",
    "-C", opts.cwd,
    "--skip-git-repo-check",
    "--sandbox", opts.spec.mode === "single_shot" ? "read-only" : opts.sandbox,
    "--model", opts.model,
  ];
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

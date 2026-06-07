import type { Spec } from "./types";

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
  obsExtensionPath?: string;
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

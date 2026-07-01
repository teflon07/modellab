#!/usr/bin/env bun
// Fan out a benchmark across models: one `bench` invocation per model, each with
// its own run-id, then merge into a single combined report. API models run in
// parallel (network-bound); local ollama models run serially (they share one
// GPU and would thrash), overlapping the API batch. A single `bench` invocation
// is internally sequential, so this is how you parallelize a model comparison.
//
// Usage:
//   bun scripts/fanout.ts --specs maze-solve --reps 10 \
//     --models anthropic/claude-opus-4-8:high,openrouter/z-ai/glm-5.2:high,ollama/qwen3:1.7b:high \
//     [--run-prefix maze10] [--config config/modellab.yaml]
import { parseArgs } from "node:util";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { renderMarkdown, renderCsv, renderJson } from "../harness/src/report";
import type { CellSummary, RunResult } from "../harness/src/types";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export function isLocal(model: string): boolean {
  return model.startsWith("ollama/");
}

export function slug(model: string): string {
  return model.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

/** Split models into the API set (run concurrently) and the local set (run serially). */
export function partition(models: string[]): { api: string[]; local: string[] } {
  return { api: models.filter((m) => !isLocal(m)), local: models.filter(isLocal) };
}

/** Merge per-run results.json objects into one combined {summaries, runs, piVersion}. */
export function mergeReports(
  reports: Array<{ summaries?: CellSummary[]; runs?: RunResult[]; meta?: { piVersion?: string } }>,
): { summaries: CellSummary[]; runs: RunResult[]; piVersion: string } {
  const summaries: CellSummary[] = [];
  const runs: RunResult[] = [];
  let piVersion = "";
  for (const r of reports) {
    if (r.summaries) summaries.push(...r.summaries);
    if (r.runs) runs.push(...r.runs);
    if (r.meta?.piVersion) piVersion = r.meta.piVersion;
  }
  return { summaries, runs, piVersion };
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      specs: { type: "string" }, models: { type: "string" }, reps: { type: "string" },
      "run-prefix": { type: "string" }, config: { type: "string" },
    },
  });
  const models = (values.models ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (models.length === 0) {
    console.error("fanout: --models <comma-separated> is required");
    process.exit(2);
  }
  const prefix = values["run-prefix"] ?? `fanout-${new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14)}`;

  // Convenience: if any OpenRouter model is requested and no key is set, source it
  // from the macOS keychain (never printed) so the fan-out is one command.
  if (models.some((m) => m.startsWith("openrouter/")) && !process.env.OPENROUTER_API_KEY) {
    try {
      const p = Bun.spawnSync(["security", "find-generic-password", "-s", "OpenRouter API Key", "-a", "openrouter", "-w"]);
      const key = p.stdout.toString().trim();
      if (key) {
        process.env.OPENROUTER_API_KEY = key;
        console.error("[fanout] sourced OPENROUTER_API_KEY from keychain");
      } else {
        console.error("[fanout] WARNING: openrouter model requested but OPENROUTER_API_KEY is unset and keychain is empty");
      }
    } catch {
      console.error("[fanout] WARNING: could not read OpenRouter key from keychain");
    }
  }

  const runBench = async (model: string) => {
    const runId = `${prefix}-${slug(model)}`;
    const args = ["harness/src/cli.ts", "bench", "--run-id", runId, "--models", model];
    if (values.specs) args.push("--specs", values.specs);
    if (values.reps) args.push("--reps", values.reps);
    if (values.config) args.push("--config", values.config);
    console.error(`[fanout] start ${model} -> ${runId}`);
    const proc = Bun.spawn(["bun", ...args], { cwd: root, env: process.env, stdout: "inherit", stderr: "inherit" });
    const code = await proc.exited;
    console.error(`[fanout] done  ${model} (exit ${code})`);
    return { model, runId, code };
  };

  const { api, local } = partition(models);
  // Start the API batch concurrently and the local chain serially; both overlap.
  const apiP = Promise.all(api.map(runBench));
  const localP = (async () => {
    const out = [];
    for (const m of local) out.push(await runBench(m));
    return out;
  })();
  const [apiRes, localRes] = await Promise.all([apiP, localP]);
  const results = [...apiRes, ...localRes];

  const reports = [];
  for (const { runId, code } of results) {
    const p = resolve(root, "results", runId, "results.json");
    if (!existsSync(p)) {
      console.error(`[fanout] no results.json for ${runId} (exit ${code}) — skipping in merge`);
      continue;
    }
    reports.push(JSON.parse(readFileSync(p, "utf8")));
  }
  const { summaries, runs, piVersion } = mergeReports(reports);
  const meta = { runId: `${prefix}-combined`, generatedAt: new Date().toISOString(), piVersion };
  const out = resolve(root, "results", `${prefix}-combined`);
  mkdirSync(out, { recursive: true });
  writeFileSync(resolve(out, "report.md"), renderMarkdown(summaries, meta));
  writeFileSync(resolve(out, "results.csv"), renderCsv(summaries));
  writeFileSync(resolve(out, "results.json"), renderJson(summaries, runs, meta));

  const failed = results.filter((r) => r.code !== 0).map((r) => r.model);
  console.error(`[fanout] combined report -> ${out}`);
  if (failed.length) console.error(`[fanout] NOTE: non-zero exit for: ${failed.join(", ")}`);
}

if (import.meta.main) {
  await main();
}

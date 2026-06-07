#!/usr/bin/env bun
import { parseArgs } from "node:util";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "./config";
import { loadSpecs, resolvePrompt } from "./spec";
import { buildRunTag } from "./tag";
import { runOne } from "./runner";
import { collectByTag } from "./collector";
import { scoreProgrammatic, scoreJudge } from "./scorer";
import { provisionSandbox, teardownSandbox } from "./sandbox";
import { summarize } from "./aggregate";
import { renderMarkdown, renderCsv, renderJson } from "./report";
import { checkObsHealth } from "./obs";
import type { Spec, RunResult } from "./types";

export interface PlannedRun {
  path: string;
  spec: Spec;
  model: string;
  rep: number;
}

export function planRuns(specs: Array<{ path: string; spec: Spec }>): PlannedRun[] {
  const plan: PlannedRun[] = [];
  for (const { path, spec } of specs) {
    for (const model of spec.models) {
      for (let rep = 1; rep <= spec.reps; rep++) {
        plan.push({ path, spec, model, rep });
      }
    }
  }
  return plan;
}

function repoRoot(): string {
  // harness/src/cli.ts -> repo root is two levels up
  return resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
}

async function main(): Promise<void> {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: { "run-id": { type: "string" }, config: { type: "string" } },
  });
  if (positionals[0] !== "bench") {
    console.error("usage: modellab bench [--run-id <id>] [--config <path>]");
    process.exit(2);
  }
  const root = repoRoot();
  const cfg = loadConfig(resolve(root, values.config ?? "config/modellab.yaml"));
  const runId = values["run-id"] ?? `run-${new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14)}`;

  if (!(await checkObsHealth(cfg.obs.server_url, cfg.obs.token))) {
    console.error(`obs server not healthy at ${cfg.obs.server_url}. Start it first (see README).`);
    process.exit(1);
  }

  const specs = loadSpecs(resolve(root, "specs"));
  const plan = planRuns(specs);
  const env = {
    OBS_ENABLE: "true",
    OBS_SERVER_URL: cfg.obs.server_url,
    OBS_AUTH_TOKEN: cfg.obs.token,
  };

  const results: RunResult[] = [];
  for (const p of plan) {
    const tag = buildRunTag(runId, p.spec.id, p.model, p.rep);
    let sandbox: Awaited<ReturnType<typeof provisionSandbox>> | null = null;
    try {
      const promptText = resolvePrompt(p.spec, p.path);
      let sandboxCwd = root;
      if (p.spec.mode === "agentic" && p.spec.fixture) {
        sandbox = await provisionSandbox({
          repoRoot: root, fixture: p.spec.fixture,
          runId, specId: p.spec.id, model: p.model, rep: p.rep,
        });
        sandboxCwd = sandbox.cwd;
      }

      console.error(`[run] ${tag}`);
      const run = await runOne({
        spec: p.spec, model: p.model, tag, pool: cfg.obs.pool,
        promptText, cwd: sandboxCwd, timeoutMs: p.spec.timeout_s * 1000, env,
      });

      // Give the obs server a moment to ingest the session_shutdown event.
      await Bun.sleep(1500);
      const metrics = collectByTag(cfg.obs.db_path, tag);

      let score = { pass: false, score: null as number | null };
      if (p.spec.scoring.kind === "programmatic" && p.spec.fixture) {
        score = await scoreProgrammatic(p.spec.fixture.verify, sandboxCwd);
      } else if (p.spec.scoring.kind === "judge") {
        const rubric = readFileSync(resolve(root, p.spec.scoring.rubric_file), "utf8");
        const judgeModel = p.spec.scoring.judge_model;
        score = await scoreJudge({
          judgeModel, rubric, output: run.stdout,
          runJudge: async (prompt, model) => {
            const j = await runOne({
              spec: { ...p.spec, mode: "single_shot" }, model,
              tag: `${tag}:judge`, pool: cfg.obs.pool, promptText: prompt,
              cwd: root, timeoutMs: 120_000, env,
            });
            return j.stdout;
          },
        });
      }

      if (metrics) {
        results.push({ runId, specId: p.spec.id, model: p.model, rep: p.rep, ...metrics, pass: score.pass, score: score.score });
      } else {
        console.error(`[warn] no telemetry for ${tag} (exit ${run.exitCode}, timedOut=${run.timedOut})`);
      }
    } catch (err) {
      console.error(`[error] ${tag}: ${err}`);
    } finally {
      if (sandbox) await teardownSandbox(sandbox);
    }
  }

  const summaries = summarize(results, specs.map((s) => s.spec));
  const meta = { runId, generatedAt: new Date().toISOString(), piVersion: cfg.pi_version };
  const outDir = resolve(root, "results", runId);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(resolve(outDir, "report.md"), renderMarkdown(summaries, meta));
  writeFileSync(resolve(outDir, "results.csv"), renderCsv(summaries));
  writeFileSync(resolve(outDir, "results.json"), renderJson(summaries, results, meta));
  console.error(`[done] wrote results to ${outDir}`);
}

if (import.meta.main) {
  await main();
}

#!/usr/bin/env bun
import { randomUUID } from "node:crypto";
import { parseArgs } from "node:util";
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig, priceOverride } from "./config";
import { loadSpecs, resolvePrompt } from "./spec";
import { buildRunTag } from "./tag";
import { detectRunnerVersion, runOne, runOneCodex, runOneClaude, runOneOpenRouter } from "./runner";
import { collectByTag } from "./collector";
import { scoreProgrammatic, scoreJudge } from "./scorer";
import { provisionSandbox, teardownSandbox } from "./sandbox";
import { checkObsHealth } from "./obs";
import {
  campaignFingerprint,
  digestPath,
  initializeOutputs,
  loadCheckpoint,
  reconcileOutputs,
  writeCheckpoint,
} from "./checkpoint";
import type { Spec, RunResult, CollectedMetrics } from "./types";

export interface PlannedRun {
  path: string;
  spec: Spec;
  model: string;
  rep: number;
}

export function planRuns(
  specs: Array<{ path: string; spec: Spec }>,
  modelsOverride?: string[],
  repsOverride?: number,
  repOffset = 0,
): PlannedRun[] {
  const plan: PlannedRun[] = [];
  for (const { path, spec } of specs) {
    const reps = repsOverride && repsOverride > 0 ? repsOverride : spec.reps;
    for (const model of modelsOverride?.length ? modelsOverride : spec.models) {
      // rep drives the generator seed (MODELLAB_SEED), so running reps one-at-a-time
      // in separate invocations needs a distinct offset each time — otherwise every
      // `--reps 1` run reuses rep=1 and measures the SAME instance, not generalization.
      for (let rep = 1 + repOffset; rep <= reps + repOffset; rep++) {
        plan.push({ path, spec, model, rep });
      }
    }
  }
  return plan;
}

function runIdentity(run: Pick<PlannedRun, "spec" | "model" | "rep">): string {
  return `${run.spec.id}\0${run.model}\0${run.rep}`;
}

export function skipCompletedRuns(plan: PlannedRun[], completed: RunResult[]): PlannedRun[] {
  const identities = new Set(completed.map((run) => `${run.specId}\0${run.model}\0${run.rep}`));
  return plan.filter((run) => !identities.has(runIdentity(run)));
}

export function unfinishedRuns(plan: PlannedRun[], results: RunResult[]): PlannedRun[] {
  return skipCompletedRuns(plan, results);
}

export function shouldRetryRun(
  run: { exitCode: number; stderr: string; timedOut: boolean },
  metrics: Pick<CollectedMetrics, "errorCount"> | null,
): boolean {
  if (run.timedOut) return false;
  return run.exitCode !== 0 || metrics === null || metrics.errorCount > 0;
}

export function requireJudgeOutput(
  run: {
    exitCode: number;
    stderr: string;
    timedOut: boolean;
    stdout: string;
    metrics?: Pick<CollectedMetrics, "errorCount">;
  },
): string {
  if (run.exitCode !== 0 || run.timedOut || !run.stdout.trim() || (run.metrics?.errorCount ?? 0) > 0) {
    const detail = run.timedOut ? "timed out" : run.stderr.replace(/\s+/g, " ").trim().slice(0, 300) || `exit ${run.exitCode}`;
    throw new Error(`judge runner failed: ${detail}`);
  }
  return run.stdout;
}

export function persistRunResult(
  results: RunResult[],
  result: RunResult,
  outputsPath: string,
  output: string,
  checkpoint: () => void,
): void {
  appendFileSync(outputsPath, JSON.stringify({
    runId: result.runId,
    specId: result.specId,
    model: result.model,
    rep: result.rep,
    output,
  }) + "\n");
  results.push(result);
  checkpoint();
}

function repoRoot(): string {
  // harness/src/cli.ts -> repo root is two levels up
  return resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
}

async function main(): Promise<void> {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: { "run-id": { type: "string" }, config: { type: "string" }, models: { type: "string" }, specs: { type: "string" }, reps: { type: "string" }, "rep-offset": { type: "string" } },
  });
  if (positionals[0] !== "bench") {
    console.error("usage: modellab bench [--run-id <id>] [--config <path>] [--models <comma-separated-models>] [--specs <comma-separated-spec-ids>] [--reps <n>] [--rep-offset <n>]");
    process.exit(2);
  }
  const root = repoRoot();
  const cfg = loadConfig(resolve(root, values.config ?? "config/modellab.yaml"));
  const piVersion = detectRunnerVersion(cfg.runner, cfg.pi_version);
  const runId = values["run-id"] ?? `run-${new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14)}`;

  if (cfg.runner === "pi" && !(await checkObsHealth(cfg.obs.server_url, cfg.obs.token))) {
    console.error(`obs server not healthy at ${cfg.obs.server_url}. Start it first (see README).`);
    process.exit(1);
  }

  // Resolve the OpenRouter API key from the configured env var. Fail loud and
  // early if the runner is selected but the key is missing — never silently
  // degrade to a broken run.
  const orApiKey = cfg.runner === "openrouter" ? (process.env[cfg.openrouter.api_key_env] ?? "").trim() : "";
  if (cfg.runner === "openrouter" && !orApiKey) {
    console.error(`openrouter runner needs an API key in $${cfg.openrouter.api_key_env}, but it is unset/empty. Export it and retry.`);
    process.exit(1);
  }
  const or = {
    baseUrl: cfg.openrouter.base_url,
    apiKey: orApiKey,
    referer: cfg.openrouter.referer,
    title: cfg.openrouter.title,
  };

  let specs = loadSpecs(resolve(root, "specs"));
  if (values.specs) {
    const want = new Set(values.specs.split(",").map((s) => s.trim()).filter(Boolean));
    const before = specs.length;
    specs = specs.filter((s) => want.has(s.spec.id));
    const found = new Set(specs.map((s) => s.spec.id));
    const missing = [...want].filter((id) => !found.has(id));
    if (missing.length) {
      console.error(`unknown spec id(s): ${missing.join(", ")}`);
      process.exit(2);
    }
    console.error(`[filter] running ${specs.length}/${before} specs: ${[...found].join(", ")}`);
  }
  const modelsOverride = values.models
    ? values.models.split(",").map((m) => m.trim()).filter(Boolean)
    : undefined;
  const repsOverride = values.reps ? parseInt(values.reps, 10) : undefined;
  if (values.reps && (!repsOverride || repsOverride < 1)) {
    console.error(`invalid --reps: ${values.reps}`);
    process.exit(2);
  }
  const repOffset = values["rep-offset"] ? parseInt(values["rep-offset"], 10) : 0;
  if (values["rep-offset"] && (Number.isNaN(repOffset) || repOffset < 0)) {
    console.error(`invalid --rep-offset: ${values["rep-offset"]}`);
    process.exit(2);
  }
  let plan = planRuns(specs, modelsOverride, repsOverride, repOffset);
  // OpenRouter is a single chat completion with no tool loop, so it can only run
  // single_shot specs. Drop agentic runs with a visible warning rather than
  // failing them one-by-one deep in the loop.
  if (cfg.runner === "openrouter") {
    const agentic = plan.filter((p) => p.spec.mode !== "single_shot");
    if (agentic.length) {
      const ids = [...new Set(agentic.map((p) => p.spec.id))].join(", ");
      console.error(`[skip] openrouter is single-shot only (no tool loop); skipping ${agentic.length} agentic run(s): ${ids}`);
    }
    plan = plan.filter((p) => p.spec.mode === "single_shot");
    if (!plan.length) {
      console.error("openrouter: no single_shot specs to run after filtering. Nothing to do.");
      process.exit(1);
    }
  }
  const obsEnv = {
    OBS_ENABLE: "true",
    OBS_SERVER_URL: cfg.obs.server_url,
    OBS_AUTH_TOKEN: cfg.obs.token,
  };
  const env = cfg.runner === "pi" ? obsEnv : {};

  const scheduledPlan = plan;
  const fingerprint = campaignFingerprint({
    runner: cfg.runner,
    piVersion,
    settings: cfg.runner === "pi"
      ? { thinking: cfg.pi.thinking }
      : cfg.runner === "codex"
      ? cfg.codex
      : cfg.runner === "claude"
      ? cfg.claude
      : {
        baseUrl: cfg.openrouter.base_url,
        effort: cfg.openrouter.effort,
        judgeModel: cfg.openrouter.judge_model,
      },
    prices: cfg.prices,
    sources: specs.map(({ path, spec }) => ({
      specId: spec.id,
      promptFile: spec.prompt_file ? digestPath(resolve(dirname(path), spec.prompt_file)) : undefined,
      rubric: spec.scoring.kind === "judge" ? digestPath(resolve(root, spec.scoring.rubric_file)) : undefined,
      fixture: spec.fixture ? digestPath(resolve(root, spec.fixture.repo)) : undefined,
    })),
    plan: scheduledPlan.map((run) => ({ spec: run.spec, model: run.model, rep: run.rep })),
  });
  let results: RunResult[] = [];
  let generatedAt = new Date().toISOString();
  const outDir = resolve(root, "results", runId);
  const resultsPath = resolve(outDir, "results.json");
  const checkpointExists = existsSync(resultsPath);
  if (checkpointExists) {
    const checkpoint = loadCheckpoint(
      resultsPath,
      fingerprint,
      scheduledPlan.map((run) => ({ specId: run.spec.id, model: run.model, rep: run.rep })),
      runId,
    );
    results = checkpoint.results;
    generatedAt = checkpoint.generatedAt;
    plan = skipCompletedRuns(scheduledPlan, results);
    console.error(`[resume] loaded ${results.length} completed run(s); ${plan.length} remain`);
  }
  const meta = {
    runId,
    generatedAt,
    piVersion,
    campaignFingerprint: fingerprint,
  };
  const outputsPath = resolve(outDir, "outputs.jsonl");
  initializeOutputs(outputsPath);
  reconcileOutputs(outputsPath, results, checkpointExists);
  // Checkpoint after every rep so a run is crash-safe and readable mid-flight: a
  // killed run keeps every completed rep, and a batched run shows live progress
  // instead of nothing-until-the-end. Metrics/verdict go to results.*; the raw
  // model text is appended per rep to outputs.jsonl.
  const checkpoint = () => {
    writeCheckpoint(outDir, results, specs.map((s) => s.spec), meta);
  };
  checkpoint();
  for (const p of plan) {
    const tag = buildRunTag(runId, p.spec.id, p.model, p.rep, randomUUID());
    let sandbox: Awaited<ReturnType<typeof provisionSandbox>> | null = null;
    try {
      let sandboxCwd = root;
      // Provision the fixture sandbox for agentic runs (the agent edits files) and
      // for single-shot programmatic runs (verify needs the fixture files plus the
      // model's answer, written to response.txt below).
      if (p.spec.fixture && (p.spec.mode === "agentic" || p.spec.scoring.kind === "programmatic")) {
        sandbox = await provisionSandbox({
          repoRoot: root, fixture: p.spec.fixture,
          runId, specId: p.spec.id, model: p.model, rep: p.rep,
        });
        sandboxCwd = sandbox.cwd;
      }
      // A generator produces a fresh task instance per rep (writes prompt.txt plus
      // whatever verify needs, e.g. solution.json), seeded by rep for
      // reproducibility. This is what lets a task measure generalization across
      // instances instead of consistency on one fixed instance.
      let promptText: string;
      if (p.spec.fixture?.generator) {
        const gen = Bun.spawnSync(["sh", "-c", p.spec.fixture.generator], {
          cwd: sandboxCwd,
          env: { ...process.env, ...env, MODELLAB_SEED: String(p.rep) },
        });
        if (gen.exitCode !== 0) {
          throw new Error(`generator failed (exit ${gen.exitCode}): ${gen.stderr?.toString() ?? ""}`);
        }
        promptText = readFileSync(resolve(sandboxCwd, "prompt.txt"), "utf8");
      } else {
        promptText = resolvePrompt(p.spec, p.path);
      }

      console.error(`[run] ${tag}`);
      const run = cfg.runner === "codex"
        ? await runOneCodex({
          spec: p.spec, model: p.model, promptText, cwd: sandboxCwd,
          timeoutMs: p.spec.timeout_s * 1000, env, sessionId: tag,
          sandbox: cfg.codex.sandbox, approval: cfg.codex.approval, ephemeral: cfg.codex.ephemeral,
          effort: cfg.codex.effort,
        })
        : cfg.runner === "claude"
        ? await runOneClaude({
          model: p.model, promptText, singleShot: p.spec.mode === "single_shot",
          cwd: sandboxCwd, timeoutMs: p.spec.timeout_s * 1000, env, sessionId: tag,
        })
        : cfg.runner === "openrouter"
        ? await runOneOpenRouter({
          model: p.model, promptText, timeoutMs: p.spec.timeout_s * 1000,
          sessionId: tag, effort: cfg.openrouter.effort, or,
        })
        : await runOne({
          spec: p.spec, model: p.model, tag, pool: cfg.obs.pool,
          promptText, cwd: sandboxCwd, timeoutMs: p.spec.timeout_s * 1000, env,
          obsExtensionPath: cfg.obs.extension_path, thinking: cfg.pi.thinking,
        });

      let metrics: CollectedMetrics | null = "metrics" in run ? (run.metrics as CollectedMetrics) : null;
      if (cfg.runner === "pi") {
        // Give the obs server a moment to ingest the session_shutdown event.
        await Bun.sleep(1500);
        metrics = collectByTag(cfg.obs.db_path, tag);
      }

      if (shouldRetryRun(run, metrics)) {
        console.error(`[retryable] ${tag}: infrastructure or telemetry failure; checkpoint preserved for resume`);
        break;
      }

      let score = { pass: false, score: null as number | null };
      if (run.exitCode !== 0 || run.timedOut) {
        score = { pass: false, score: 0 };
        // Surface a real runner/API error loudly: without this an auth failure
        // (e.g. a bad key -> 401) is silently recorded as a "0% pass" rep and
        // reads as a model failure rather than a misconfiguration.
        if (!run.timedOut && run.stderr) {
          console.error(`[runner-error] ${tag}: ${run.stderr.replace(/\s+/g, " ").slice(0, 300)}`);
        }
      } else if (p.spec.scoring.kind === "programmatic" && p.spec.fixture) {
        // Single-shot has no tools, so it can't write files; surface its answer to
        // verify as response.txt (raw pi stdout; verify extracts the assistant text).
        if (p.spec.mode === "single_shot") {
          writeFileSync(resolve(sandboxCwd, "response.txt"), run.stdout ?? "");
        }
        score = await scoreProgrammatic(p.spec.fixture.verify, sandboxCwd);
      } else if (p.spec.scoring.kind === "judge") {
        const rubric = readFileSync(resolve(root, p.spec.scoring.rubric_file), "utf8");
        const judgeModel = cfg.runner === "codex"
          ? cfg.codex.judge_model ?? p.model
          : cfg.runner === "claude"
          ? cfg.claude.judge_model ?? p.model
          : cfg.runner === "openrouter"
          ? cfg.openrouter.judge_model ?? p.model
          : p.spec.scoring.judge_model;
        score = await scoreJudge({
          judgeModel, rubric, task: promptText, output: run.stdout,
          runJudge: async (prompt, model) => {
            const j = cfg.runner === "codex"
              ? await runOneCodex({
                spec: { ...p.spec, mode: "single_shot" }, model, promptText: prompt,
                cwd: root, timeoutMs: 120_000, env, sessionId: `${tag}:judge`,
                sandbox: "read-only", approval: cfg.codex.approval, ephemeral: cfg.codex.ephemeral,
              })
              : cfg.runner === "claude"
              ? await runOneClaude({
                model, promptText: prompt, singleShot: true,
                cwd: root, timeoutMs: 120_000, env, sessionId: `${tag}:judge`,
              })
              : cfg.runner === "openrouter"
              ? await runOneOpenRouter({
                model, promptText: prompt, timeoutMs: 120_000,
                sessionId: `${tag}:judge`, effort: cfg.openrouter.effort, or,
              })
              : await runOne({
                spec: { ...p.spec, mode: "single_shot" }, model,
                tag: `${tag}:judge`, pool: cfg.obs.pool, promptText: prompt,
                cwd: root, timeoutMs: 120_000, env,
                obsExtensionPath: cfg.obs.extension_path, thinking: cfg.pi.thinking,
              });
            return requireJudgeOutput(j);
          },
        });
      }

      if (metrics) {
        const priced = priceOverride(cfg.prices, p.model, metrics);
        if (priced != null) metrics.costTotal = priced;
        const result: RunResult = {
          runId, specId: p.spec.id, model: p.model, rep: p.rep,
          ...metrics, pass: score.pass, score: score.score, timedOut: run.timedOut,
        };
        persistRunResult(results, result, outputsPath, run.stdout, checkpoint);
      } else {
        console.error(`[warn] no telemetry for ${tag} (exit ${run.exitCode}, timedOut=${run.timedOut})`);
      }
    } catch (err) {
      console.error(`[error] ${tag}: ${err}`);
      break;
    } finally {
      if (sandbox) await teardownSandbox(sandbox);
    }
  }

  checkpoint();
  const unfinished = unfinishedRuns(scheduledPlan, results);
  if (unfinished.length) {
    process.exitCode = 1;
    console.error(`[incomplete] ${unfinished.length} run(s) remain; rerun with --run-id ${runId} to resume`);
    return;
  }
  console.error(`[done] wrote results to ${outDir}`);
}

if (import.meta.main) {
  await main();
}

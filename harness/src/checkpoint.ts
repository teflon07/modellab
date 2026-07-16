import { createHash } from "node:crypto";
import {
  closeSync,
  lstatSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { summarize } from "./aggregate";
import { renderCsv, renderJson, renderMarkdown } from "./report";
import type { ReportMeta } from "./report";
import type { RunResult, Spec } from "./types";

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  }
  return value;
}

export function campaignFingerprint(identity: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(identity)))
    .digest("hex");
}

function addPathToDigest(hash: ReturnType<typeof createHash>, path: string, relative: string): void {
  const stat = lstatSync(path);
  if (stat.isDirectory()) {
    hash.update(`directory\0${relative}\0`);
    for (const name of readdirSync(path).sort()) {
      addPathToDigest(hash, resolve(path, name), `${relative}/${name}`);
    }
  } else if (stat.isFile()) {
    hash.update(`file\0${relative}\0`);
    hash.update(readFileSync(path));
  } else if (stat.isSymbolicLink()) {
    hash.update(`symlink\0${relative}\0${readlinkSync(path)}\0`);
  } else {
    throw new Error(`unsupported campaign input type: ${relative}`);
  }
}

export function digestPath(path: string): string {
  const hash = createHash("sha256");
  addPathToDigest(hash, path, ".");
  return hash.digest("hex");
}

export interface CheckpointRunIdentity {
  specId: string;
  model: string;
  rep: number;
}

function resultIdentity(run: CheckpointRunIdentity): string {
  return `${run.specId}\0${run.model}\0${run.rep}`;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function isValidRunResult(run: Partial<RunResult>): run is RunResult {
  const numeric = [
    run.totalTokens, run.inputTokens, run.outputTokens, run.cacheRead, run.cacheWrite,
    run.costTotal, run.turns, run.toolCalls, run.compactions, run.peakContext,
    run.wallClockMs, run.errorCount,
  ];
  return (
    typeof run.runId === "string" && run.runId.length > 0 &&
    typeof run.specId === "string" && run.specId.length > 0 &&
    typeof run.model === "string" && run.model.length > 0 &&
    Number.isInteger(run.rep) && (run.rep ?? 0) > 0 &&
    typeof run.sessionId === "string" && run.sessionId.length > 0 &&
    numeric.every((value) => isFiniteNumber(value) && value >= 0) &&
    (run.ttftMs === null || (isFiniteNumber(run.ttftMs) && run.ttftMs >= 0)) &&
    (run.outputTps === null || (isFiniteNumber(run.outputTps) && run.outputTps >= 0)) &&
    typeof run.pass === "boolean" &&
    (run.score === null || isFiniteNumber(run.score)) &&
    (run.timedOut === undefined || typeof run.timedOut === "boolean")
  );
}

export function loadCheckpoint(
  path: string,
  expectedFingerprint: string,
  expectedRuns?: CheckpointRunIdentity[],
  expectedRunId?: string,
): { results: RunResult[]; generatedAt: string } {
  const stored = JSON.parse(readFileSync(path, "utf8")) as {
    meta?: { runId?: unknown; piVersion?: unknown; campaignFingerprint?: unknown; generatedAt?: unknown };
    runs?: unknown;
  };
  if (stored.meta?.campaignFingerprint !== expectedFingerprint) {
    throw new Error("campaign fingerprint mismatch; use a new --run-id for changed settings or plans");
  }
  if (
    typeof stored.meta.runId !== "string" || !stored.meta.runId ||
    typeof stored.meta.piVersion !== "string" || !stored.meta.piVersion ||
    typeof stored.meta.generatedAt !== "string" || !stored.meta.generatedAt ||
    !Array.isArray(stored.runs)
  ) {
    throw new Error("invalid checkpoint: expected meta.runId, meta.piVersion, meta.generatedAt, and runs array");
  }
  if (expectedRunId && stored.meta.runId !== expectedRunId) throw new Error("checkpoint run id mismatch");

  const seen = new Set<string>();
  const expected = expectedRuns ? new Set(expectedRuns.map(resultIdentity)) : null;
  for (const candidate of stored.runs) {
    const run = candidate as Partial<RunResult>;
    if (!isValidRunResult(run)) throw new Error("invalid checkpoint run result");
    if (run.runId !== stored.meta.runId) throw new Error("invalid checkpoint run id");
    const identity = resultIdentity(run);
    if (expected && !expected.has(identity)) throw new Error(`checkpoint run outside scheduled plan: ${run.specId}/${run.model}/${run.rep}`);
    if (seen.has(identity)) throw new Error(`duplicate run identity: ${run.specId}/${run.model}/${run.rep}`);
    seen.add(identity);
  }

  return { results: stored.runs as RunResult[], generatedAt: stored.meta.generatedAt };
}

export function initializeOutputs(path: string): void {
  mkdirSync(dirname(path), { recursive: true });
  closeSync(openSync(path, "a"));
}

export function reconcileOutputs(
  path: string,
  results: RunResult[],
  allowUncheckpointedCleanup = false,
): void {
  const durable = new Map(results.map((run) => [resultIdentity(run), run]));
  const kept: string[] = [];
  const seen = new Set<string>();
  const raw = readFileSync(path, "utf8");
  if (!allowUncheckpointedCleanup && results.length === 0 && raw.trim()) {
    throw new Error("orphaned raw output exists without a durable checkpoint");
  }
  const lines = raw.split("\n");
  const lastRecordIndex = lines.findLastIndex((line) => line.length > 0);

  for (const [index, line] of lines.entries()) {
    if (!line) continue;
    let record: { runId?: unknown; specId?: unknown; model?: unknown; rep?: unknown; output?: unknown };
    try {
      record = JSON.parse(line);
    } catch {
      if (index === lastRecordIndex) continue;
      throw new Error(`invalid raw output record at line ${index + 1}`);
    }
    if (
      typeof record.runId !== "string" ||
      typeof record.specId !== "string" ||
      typeof record.model !== "string" ||
      !Number.isInteger(record.rep) ||
      typeof record.output !== "string"
    ) {
      throw new Error(`invalid raw output record at line ${index + 1}`);
    }
    const identity = resultIdentity(record as CheckpointRunIdentity);
    const completed = durable.get(identity);
    if (!completed) continue;
    if (record.runId !== completed.runId) throw new Error(`raw output run id mismatch at line ${index + 1}`);
    if (seen.has(identity)) throw new Error(`duplicate raw output: ${record.specId}/${record.model}/${record.rep}`);
    seen.add(identity);
    kept.push(line);
  }

  for (const [identity, run] of durable) {
    if (!seen.has(identity)) throw new Error(`missing raw output: ${run.specId}/${run.model}/${run.rep}`);
  }
  writeAtomic(path, kept.length ? `${kept.join("\n")}\n` : "");
}

function writeAtomic(path: string, contents: string): void {
  const temporary = `${path}.tmp-${process.pid}`;
  writeFileSync(temporary, contents);
  renameSync(temporary, path);
}

export function writeCheckpoint(
  outDir: string,
  results: RunResult[],
  specs: Spec[],
  meta: ReportMeta,
): void {
  mkdirSync(outDir, { recursive: true });
  const summaries = summarize(results, specs);
  writeAtomic(resolve(outDir, "results.json"), renderJson(summaries, results, meta));
  writeAtomic(resolve(outDir, "report.md"), renderMarkdown(summaries, meta));
  writeAtomic(resolve(outDir, "results.csv"), renderCsv(summaries));
  const last = results.at(-1);
  writeAtomic(resolve(outDir, "heartbeat.json"), JSON.stringify({
    runId: meta.runId,
    updatedAt: new Date().toISOString(),
    completed: results.length,
    last: last ? { specId: last.specId, model: last.model, rep: last.rep } : null,
  }, null, 2));
}

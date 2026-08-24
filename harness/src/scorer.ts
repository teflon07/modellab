import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { RubricCheck } from "./types";

export interface ScoreResult {
  pass: boolean;
  score: number | null;
  rubric?: RubricCheck[];
}

export interface GradedScore {
  score: number;
  pass: boolean;
  checks: RubricCheck[];
}

/** Read a verifier-written score.json (graded rubric). Missing/malformed → null. */
export function readGradedScore(cwd: string): GradedScore | null {
  try {
    const raw = JSON.parse(readFileSync(resolve(cwd, "score.json"), "utf8")) as {
      score?: unknown;
      pass?: unknown;
      checks?: unknown;
    };
    if (typeof raw.score !== "number" || !Number.isFinite(raw.score)) return null;
    const checks: RubricCheck[] = [];
    if (Array.isArray(raw.checks)) {
      for (const c of raw.checks) {
        if (!c || typeof c !== "object") continue;
        const id = typeof (c as { id?: unknown }).id === "string" ? (c as { id: string }).id : "";
        const label = typeof (c as { label?: unknown }).label === "string" ? (c as { label: string }).label : id;
        if (!id) continue;
        checks.push({ id, label, pass: (c as { pass?: unknown }).pass === true });
      }
    }
    return { score: raw.score, pass: raw.pass === true, checks };
  } catch {
    return null;
  }
}

export async function scoreProgrammatic(verify: string[], cwd: string): Promise<ScoreResult> {
  let failed = false;
  for (const cmd of verify) {
    const proc = Bun.spawn(["sh", "-c", cmd], { cwd, stdout: "pipe", stderr: "pipe" });
    const code = await proc.exited;
    if (code !== 0) {
      failed = true;
      break;
    }
  }
  const graded = readGradedScore(cwd);
  if (graded) {
    return {
      pass: !failed && graded.pass,
      score: graded.score,
      rubric: graded.checks,
    };
  }
  return failed ? { pass: false, score: 0 } : { pass: true, score: 1 };
}

/** Runs the judge model and returns its raw text verdict. */
export type JudgeRunner = (prompt: string, model: string) => Promise<string>;

export interface JudgeOpts {
  judgeModel: string;
  rubric: string;
  /** The task/prompt the output was generated from. Rubrics that reference the
   *  source (e.g. "covers the most significant change", "no fabricated items not
   *  in the changelog") are unjudgeable without it. */
  task: string;
  output: string;
  runJudge: JudgeRunner;
}

export async function scoreJudge(opts: JudgeOpts): Promise<ScoreResult> {
  const prompt = [
    "You are grading a model's output against a rubric.",
    "Respond with ONLY compact JSON: {\"pass\": boolean, \"score\": number between 0 and 1}.",
    "",
    "RUBRIC:",
    opts.rubric,
    "",
    "TASK THE OUTPUT WAS GENERATED FROM (the source the rubric refers to):",
    opts.task,
    "",
    "OUTPUT TO GRADE:",
    opts.output,
  ].join("\n");

  const raw = await opts.runJudge(prompt, opts.judgeModel);
  try {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return { pass: false, score: null };
    const verdict = JSON.parse(match[0]) as { pass?: unknown; score?: unknown };
    const pass = verdict.pass === true;
    const score = typeof verdict.score === "number" ? verdict.score : null;
    return { pass, score };
  } catch {
    return { pass: false, score: null };
  }
}

export interface ScoreResult {
  pass: boolean;
  score: number | null;
}

export async function scoreProgrammatic(verify: string[], cwd: string): Promise<ScoreResult> {
  for (const cmd of verify) {
    const proc = Bun.spawn(["sh", "-c", cmd], { cwd, stdout: "pipe", stderr: "pipe" });
    const code = await proc.exited;
    if (code !== 0) return { pass: false, score: 0 };
  }
  return { pass: true, score: 1 };
}

/** Runs the judge model and returns its raw text verdict. */
export type JudgeRunner = (prompt: string, model: string) => Promise<string>;

export interface JudgeOpts {
  judgeModel: string;
  rubric: string;
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

export type Track = "frontier" | "local" | "crossover";
export type Mode = "single_shot" | "agentic";
export type RunnerBackend = "pi" | "codex" | "claude" | "openrouter";

export function isTrack(x: string): x is Track {
  return x === "frontier" || x === "local" || x === "crossover";
}

export interface Fixture {
  /** path to fixture dir, relative to repo root */
  repo: string;
  /** shell commands run once after the sandbox is provisioned */
  setup: string[];
  /** shell commands; all must exit 0 for a programmatic pass */
  verify: string[];
  /**
   * Optional per-rep task generator: a shell command run in the sandbox with
   * MODELLAB_SEED=<rep> before the model runs. It must write prompt.txt (the task
   * prompt) plus any files verify needs (e.g. solution.json). Makes a task
   * generate a fresh instance each rep, measuring generalization not consistency.
   */
  generator?: string;
}

export type Scoring =
  | { kind: "programmatic" }
  | { kind: "judge"; judge_model: string; rubric_file: string };

export interface Spec {
  id: string;
  track: Track;
  mode: Mode;
  prompt?: string;
  prompt_file?: string;
  models: string[];
  reps: number;
  timeout_s: number;
  fixture?: Fixture;
  scoring: Scoring;
  tags: string[];
}

export interface CollectedMetrics {
  sessionId: string;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  cacheRead: number;
  cacheWrite: number;
  costTotal: number;
  turns: number;
  toolCalls: number;
  compactions: number;
  peakContext: number;
  wallClockMs: number;
  ttftMs: number | null;
  outputTps: number | null;
  errorCount: number;
}

export interface RunMetrics extends CollectedMetrics {
  runId: string;
  specId: string;
  model: string;
  rep: number;
}

export interface RubricCheck {
  id: string;
  label: string;
  pass: boolean;
}

export interface RunResult extends RunMetrics {
  pass: boolean;
  score: number | null;
  /** true if the rep was killed at the timeout ceiling. Such a rep is "no
   *  result", not a capability failure: it is excluded from the pass rate. */
  timedOut?: boolean;
  /** Per-criterion rubric from a graded verifier (score.json), when present. */
  rubric?: RubricCheck[];
}

export interface Distribution {
  median: number;
  min: number;
  max: number;
  /** population standard deviation across runs */
  stdev: number;
  /** coefficient of variation = stdev / |mean|; 0 when mean is 0. Run-to-run instability. */
  cv: number;
}

/** 95% confidence interval for a pass rate (Wilson score interval). */
export interface Interval {
  low: number;
  high: number;
}

export interface CellSummary {
  track: Track;
  specId: string;
  model: string;
  /** total reps attempted (completed + timeouts) */
  n: number;
  /** reps that finished under the timeout — the pass-rate denominator */
  completed: number;
  /** reps killed at the timeout ceiling — excluded from the pass rate, never counted as failures */
  timeouts: number;
  /** passes / completed (NOT / n): a timeout is "no result", never a failure */
  passRate: number;
  /** 95% Wilson interval on passRate — the reliability band, not a single-shot point. */
  passRateCI: Interval;
  /**
   * False when no completed rep reported any cost — a subscription/unmetered
   * runner (e.g. codex) or a genuinely free local run. Cost columns then render
   * as "n/m" instead of a misleading $0 that would sort as "cheapest".
   */
  metered: boolean;
  tokens: Distribution;
  cost: Distribution;
  cacheHitRatio: Distribution;
  turns: Distribution;
  toolCalls: Distribution;
  wallClockMs: Distribution;
  ttftMs: Distribution;
  outputTps: Distribution;
  peakContext: Distribution;
  /** Graded rubric score in [0, 1]. Binary programmatic tasks stay 0 or 1. */
  score: Distribution;
  costPerSuccess: number | null;
  tokensPerSuccess: number | null;
  wallPerSuccess: number | null;
  turnsPerSuccess: number | null;
}

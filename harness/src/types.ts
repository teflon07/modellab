export type Track = "frontier" | "local" | "crossover";
export type Mode = "single_shot" | "agentic";

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

export interface RunResult extends RunMetrics {
  pass: boolean;
  score: number | null;
}

export interface Distribution {
  median: number;
  min: number;
  max: number;
}

export interface CellSummary {
  track: Track;
  specId: string;
  model: string;
  n: number;
  passRate: number;
  tokens: Distribution;
  cost: Distribution;
  cacheHitRatio: Distribution;
  turns: Distribution;
  toolCalls: Distribution;
  wallClockMs: Distribution;
  ttftMs: Distribution;
  outputTps: Distribution;
  peakContext: Distribution;
  costPerSuccess: number | null;
  tokensPerSuccess: number | null;
}

import type { RunResult, Spec, Distribution, Interval, CellSummary, Track } from "./types";

export function distribution(xs: number[]): Distribution {
  if (xs.length === 0) return { median: 0, min: 0, max: 0, stdev: 0, cv: 0 };
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0
    ? (sorted[mid - 1]! + sorted[mid]!) / 2
    : sorted[mid]!;
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const variance = xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length;
  const stdev = Math.sqrt(variance);
  const cv = mean === 0 ? 0 : stdev / Math.abs(mean);
  return { median, min: sorted[0]!, max: sorted[sorted.length - 1]!, stdev, cv };
}

/**
 * Wilson score interval for a binomial proportion — the honest reliability band
 * for a pass rate measured over `n` reps. Behaves well at small n (unlike the
 * normal approximation) and never escapes [0, 1]. Defaults to 95% (z = 1.96).
 */
export function wilsonInterval(passes: number, n: number, z = 1.96): Interval {
  if (n === 0) return { low: 0, high: 0 };
  const p = passes / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const center = (p + z2 / (2 * n)) / denom;
  const margin = (z / denom) * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n));
  return { low: Math.max(0, center - margin), high: Math.min(1, center + margin) };
}

function cacheHitRatio(r: RunResult): number {
  const denom = r.inputTokens + r.cacheRead;
  return denom === 0 ? 0 : r.cacheRead / denom;
}

export function summarize(results: RunResult[], specs: Spec[]): CellSummary[] {
  const trackBySpec = new Map<string, Track>();
  for (const s of specs) trackBySpec.set(s.id, s.track);

  const groups = new Map<string, RunResult[]>();
  for (const r of results) {
    const key = `${r.specId} ${r.model}`;
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(r);
  }

  const out: CellSummary[] = [];
  for (const [key, rs] of groups) {
    const [specId, model] = key.split(" ") as [string, string];
    // A timed-out rep was killed at the ceiling: it is "no result", not a
    // failure. Exclude it from the pass-rate denominator and report it
    // separately, so a too-short timeout can't masquerade as low capability.
    const completed = rs.filter((r) => !r.timedOut);
    const timeouts = rs.length - completed.length;
    const passes = completed.filter((r) => r.pass);
    const sumCost = completed.reduce((a, r) => a + r.costTotal, 0);
    const sumTok = completed.reduce((a, r) => a + r.totalTokens, 0);
    const sumWall = completed.reduce((a, r) => a + r.wallClockMs, 0);
    const sumTurns = completed.reduce((a, r) => a + r.turns, 0);
    // Distributions over COMPLETED reps only, so timed-out (0-token, ceiling
    // wall) runs don't poison the medians — tokens/wall reflect real runs.
    const num = (f: (r: RunResult) => number) => completed.map(f);
    out.push({
      track: trackBySpec.get(specId) ?? "frontier",
      specId,
      model,
      n: rs.length,
      completed: completed.length,
      timeouts,
      passRate: completed.length === 0 ? 0 : passes.length / completed.length,
      passRateCI: wilsonInterval(passes.length, completed.length),
      // Unmetered when nothing reported a cost (subscription runner / free local).
      metered: sumCost > 0,
      tokens: distribution(num((r) => r.totalTokens)),
      cost: distribution(num((r) => r.costTotal)),
      cacheHitRatio: distribution(num(cacheHitRatio)),
      turns: distribution(num((r) => r.turns)),
      toolCalls: distribution(num((r) => r.toolCalls)),
      wallClockMs: distribution(num((r) => r.wallClockMs)),
      ttftMs: distribution(num((r) => r.ttftMs ?? 0)),
      outputTps: distribution(num((r) => r.outputTps ?? 0)),
      peakContext: distribution(num((r) => r.peakContext)),
      score: distribution(num((r) => r.score ?? 0)),
      // Amortized cost/tokens/wall/turns to obtain ONE success: spend over
      // COMPLETED runs (failed + passed) divided by the number of passing runs.
      // null if none passed.
      costPerSuccess: passes.length === 0 ? null : sumCost / passes.length,
      tokensPerSuccess: passes.length === 0 ? null : sumTok / passes.length,
      wallPerSuccess: passes.length === 0 ? null : sumWall / passes.length,
      turnsPerSuccess: passes.length === 0 ? null : sumTurns / passes.length,
    });
  }
  return out;
}

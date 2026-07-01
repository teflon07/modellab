import type { CellSummary, RunResult, Track } from "./types";

export interface ReportMeta {
  runId: string;
  generatedAt: string;
  piVersion: string;
}

const TRACKS: Track[] = ["frontier", "local", "crossover"];

export function renderMarkdown(cells: CellSummary[], meta: ReportMeta): string {
  const lines: string[] = [];
  lines.push(`# Benchmark Report — ${meta.runId}`, "");
  lines.push(`Generated: ${meta.generatedAt}  ·  pi ${meta.piVersion}`, "");
  for (const track of TRACKS) {
    const group = cells.filter((c) => c.track === track);
    if (group.length === 0) continue;
    lines.push(`## ${track}`, "");
    // Decision-first ordering: what you'd actually rank on (reliability + cost-per-success)
    // leads; raw medians follow. pass 95% CI is the Wilson band; cost cv% is run-to-run
    // cost instability (high = flaky spend even when it passes).
    lines.push("| spec | model | n | pass% | pass 95% CI | cost-per-success | cost cv% | tokens (med) | turns (med) | wall ms (med) |");
    lines.push("|---|---|---|---|---|---|---|---|---|---|");
    for (const c of group) {
      const ci = `${(c.passRateCI.low * 100).toFixed(0)}–${(c.passRateCI.high * 100).toFixed(0)}%`;
      lines.push(
        `| ${c.specId} | ${c.model} | ${c.n} | ${(c.passRate * 100).toFixed(0)}% | ${ci} | ` +
        `${c.costPerSuccess === null ? "—" : c.costPerSuccess.toFixed(4)} | ` +
        `${(c.cost.cv * 100).toFixed(0)}% | ` +
        `${c.tokens.median} | ${c.turns.median} | ${c.wallClockMs.median} |`,
      );
    }
    lines.push("");
  }
  return lines.join("\n");
}

export function renderCsv(cells: CellSummary[]): string {
  const header = [
    "track", "spec", "model", "n", "pass_rate", "pass_ci_low", "pass_ci_high",
    "tokens_med", "tokens_min", "tokens_max",
    "cost_med", "cost_cv", "cost_per_success", "tokens_per_success",
    "cache_hit_med", "turns_med", "tool_calls_med",
    "wall_ms_med", "ttft_ms_med", "tps_med", "peak_ctx_med",
  ].join(",");
  const rows = cells.map((c) => [
    c.track, c.specId, c.model, c.n, c.passRate.toFixed(4),
    c.passRateCI.low.toFixed(4), c.passRateCI.high.toFixed(4),
    c.tokens.median, c.tokens.min, c.tokens.max,
    c.cost.median.toFixed(6), c.cost.cv.toFixed(4),
    c.costPerSuccess === null ? "" : c.costPerSuccess.toFixed(6),
    c.tokensPerSuccess === null ? "" : c.tokensPerSuccess,
    c.cacheHitRatio.median.toFixed(4), c.turns.median, c.toolCalls.median,
    c.wallClockMs.median, c.ttftMs.median, c.outputTps.median, c.peakContext.median,
  ].join(","));
  return [header, ...rows].join("\n") + "\n";
}

export function renderJson(cells: CellSummary[], results: RunResult[], meta: ReportMeta): string {
  return JSON.stringify({ meta, summaries: cells, runs: results }, null, 2);
}

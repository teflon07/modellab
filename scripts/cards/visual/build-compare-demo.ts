import { mkdirSync, writeFileSync, cpSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { renderVisualHtml } from "../../../harness/src/report";
import type { CellSummary, RunResult } from "../../../harness/src/types";

const here = dirname(fileURLToPath(import.meta.url));
const dest = resolve(here, "compare-demo");

const d = (median: number) => ({ median, min: median, max: median, stdev: 0, cv: 0 });

function cell(specId: string, model: string, score: number, passRate: number, tokens: number, cost: number, wall: number): CellSummary {
  const passed = passRate === 1;
  return {
    track: "frontier", specId, model, n: 3, completed: 3, timeouts: 0,
    passRate, passRateCI: { low: 0.4, high: 1 }, metered: true,
    tokens: d(tokens), cost: d(cost), cacheHitRatio: d(0.1), turns: d(passed ? 8 : 4),
    toolCalls: d(12), wallClockMs: d(wall), ttftMs: d(400), outputTps: d(40),
    peakContext: d(12000), score: d(score),
    costPerSuccess: passed ? cost : null,
    tokensPerSuccess: passed ? tokens : null,
    wallPerSuccess: passed ? wall : null,
    turnsPerSuccess: passed ? 8 : null,
  };
}

const cells: CellSummary[] = [
  cell("harbor-pine-auth", "strong-model", 1, 1, 18000, 0.22, 140000),
  cell("harbor-pine-auth", "weak-model", 0.06, 0, 9000, 0.04, 40000),
  cell("northline-auth", "strong-model", 1, 1, 21000, 0.25, 160000),
  cell("northline-auth", "weak-model", 0.07, 0, 8000, 0.03, 35000),
  cell("atlas-auth", "strong-model", 1, 1, 17000, 0.20, 130000),
  cell("atlas-auth", "weak-model", 0.07, 0, 7500, 0.03, 32000),
];

const results: RunResult[] = cells.map((c, i) => ({
  runId: "visual-demo", specId: c.specId, model: c.model, rep: 1, sessionId: `s${i}`,
  totalTokens: c.tokens.median, inputTokens: 1000, outputTokens: 500, cacheRead: 0,
  cacheWrite: 0, costTotal: c.cost.median, turns: c.turns.median, toolCalls: 12,
  compactions: 0, peakContext: 12000, wallClockMs: c.wallClockMs.median, ttftMs: 400,
  outputTps: 40, errorCount: 0, pass: c.passRate === 1, score: c.score.median,
  rubric: c.passRate === 1
    ? [{ id: "title", label: "on-brief name and landmarks", pass: true }]
    : [{ id: "title", label: "on-brief name and landmarks", pass: false }],
}));

mkdirSync(resolve(dest, "artifacts/harbor-pine-auth/strong-model/1"), { recursive: true });
mkdirSync(resolve(dest, "artifacts/harbor-pine-auth/weak-model/1"), { recursive: true });
mkdirSync(resolve(dest, "artifacts/northline-auth/strong-model/1"), { recursive: true });
mkdirSync(resolve(dest, "artifacts/northline-auth/weak-model/1"), { recursive: true });
mkdirSync(resolve(dest, "artifacts/atlas-auth/strong-model/1"), { recursive: true });
mkdirSync(resolve(dest, "artifacts/atlas-auth/weak-model/1"), { recursive: true });

cpSync(resolve(here, "harbor-pine/pass/site"), resolve(dest, "artifacts/harbor-pine-auth/strong-model/1/site"), { recursive: true });
cpSync(resolve(here, "harbor-pine/naive/site"), resolve(dest, "artifacts/harbor-pine-auth/weak-model/1/site"), { recursive: true });
cpSync(resolve(here, "northline/pass/site"), resolve(dest, "artifacts/northline-auth/strong-model/1/site"), { recursive: true });
cpSync(resolve(here, "northline/naive/site"), resolve(dest, "artifacts/northline-auth/weak-model/1/site"), { recursive: true });
cpSync(resolve(here, "atlas-field/pass/site"), resolve(dest, "artifacts/atlas-auth/strong-model/1/site"), { recursive: true });
cpSync(resolve(here, "atlas-field/naive/site"), resolve(dest, "artifacts/atlas-auth/weak-model/1/site"), { recursive: true });

const artifacts = [
  { specId: "harbor-pine-auth", model: "strong-model", rep: 1, href: "artifacts/harbor-pine-auth/strong-model/1" },
  { specId: "harbor-pine-auth", model: "weak-model", rep: 1, href: "artifacts/harbor-pine-auth/weak-model/1" },
  { specId: "northline-auth", model: "strong-model", rep: 1, href: "artifacts/northline-auth/strong-model/1" },
  { specId: "northline-auth", model: "weak-model", rep: 1, href: "artifacts/northline-auth/weak-model/1" },
  { specId: "atlas-auth", model: "strong-model", rep: 1, href: "artifacts/atlas-auth/strong-model/1" },
  { specId: "atlas-auth", model: "weak-model", rep: 1, href: "artifacts/atlas-auth/weak-model/1" },
];

writeFileSync(
  resolve(dest, "visual.html"),
  renderVisualHtml(cells, results, {
    runId: "visual-demo",
    generatedAt: "2026-08-24T00:00:00Z",
    piVersion: "demo",
  }, artifacts),
);

console.log(resolve(dest, "visual.html"));

import { test, expect } from "bun:test";
import { renderMarkdown, renderCsv, renderJson } from "../src/report";
import type { CellSummary } from "../src/types";

const d = (median: number, min: number, max: number) => ({ median, min, max, stdev: 0, cv: 0 });

const cells: CellSummary[] = [{
  track: "frontier", specId: "s1", model: "m1", n: 2, completed: 2, timeouts: 0, passRate: 1,
  passRateCI: { low: 0.34, high: 1 }, metered: true,
  tokens: d(150, 100, 200),
  cost: { median: 0.03, min: 0.02, max: 0.04, stdev: 0.01, cv: 0.33 },
  cacheHitRatio: d(0, 0, 0),
  turns: d(1, 1, 1),
  toolCalls: d(0, 0, 0),
  wallClockMs: d(1000, 900, 1100),
  ttftMs: d(200, 180, 220),
  outputTps: d(30, 28, 32),
  peakContext: d(80, 70, 90),
  costPerSuccess: 0.06, tokensPerSuccess: 300,
}];

// An unmetered cell (subscription runner / free local): no cost reported.
const unmetered: CellSummary = {
  track: "frontier", specId: "s2", model: "m2", n: 2, completed: 2, timeouts: 0, passRate: 1,
  passRateCI: { low: 0.34, high: 1 }, metered: false,
  tokens: d(150, 100, 200),
  cost: d(0, 0, 0),
  cacheHitRatio: d(0, 0, 0),
  turns: d(1, 1, 1),
  toolCalls: d(0, 0, 0),
  wallClockMs: d(1000, 900, 1100),
  ttftMs: d(200, 180, 220),
  outputTps: d(30, 28, 32),
  peakContext: d(80, 70, 90),
  costPerSuccess: 0, tokensPerSuccess: 300,
};

const meta = { runId: "r1", generatedAt: "2026-06-06T12:00:00Z", piVersion: "1.2.3" };

test("markdown groups by track and lists the model row", () => {
  const md = renderMarkdown(cells, meta);
  expect(md).toContain("## frontier");
  expect(md).toContain("m1");
  expect(md).toContain("cost-per-success");
  expect(md).toContain("pass 95% CI");
  expect(md).toContain("cost cv%");
  expect(md).toContain("r1");
});

test("csv exposes reliability band and cost variance columns", () => {
  const csv = renderCsv(cells);
  const lines = csv.trim().split("\n");
  expect(lines[0]).toContain("track,spec,model");
  expect(lines[0]).toContain("pass_ci_low,pass_ci_high");
  expect(lines[0]).toContain("metered,cost_med,cost_cv");
  expect(lines.length).toBe(2);
  expect(lines[1]).toContain("frontier,s1,m1");
});

test("unmetered cells render n/m in markdown, not a misleading $0", () => {
  const md = renderMarkdown([unmetered], meta);
  expect(md).toContain("n/m");
  expect(md).not.toContain("| 0.0000 |"); // no $0 cost-per-success cell
});

test("unmetered cells blank the cost columns in csv (never a sortable 0)", () => {
  const row = renderCsv([unmetered]).trim().split("\n")[1]!;
  // metered flag is false and the three cost fields are empty
  expect(row).toContain(",false,,,,"); // metered, cost_med, cost_cv, cost_per_success
});

test("json round-trips cells and meta", () => {
  const obj = JSON.parse(renderJson(cells, [], meta));
  expect(obj.meta.runId).toBe("r1");
  expect(obj.summaries.length).toBe(1);
});

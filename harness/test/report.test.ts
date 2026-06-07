import { test, expect } from "bun:test";
import { renderMarkdown, renderCsv, renderJson } from "../src/report";
import type { CellSummary } from "../src/types";

const cells: CellSummary[] = [{
  track: "frontier", specId: "s1", model: "m1", n: 2, passRate: 1,
  tokens: { median: 150, min: 100, max: 200 },
  cost: { median: 0.03, min: 0.02, max: 0.04 },
  cacheHitRatio: { median: 0, min: 0, max: 0 },
  turns: { median: 1, min: 1, max: 1 },
  toolCalls: { median: 0, min: 0, max: 0 },
  wallClockMs: { median: 1000, min: 900, max: 1100 },
  ttftMs: { median: 200, min: 180, max: 220 },
  outputTps: { median: 30, min: 28, max: 32 },
  peakContext: { median: 80, min: 70, max: 90 },
  costPerSuccess: 0.06, tokensPerSuccess: 300,
}];

const meta = { runId: "r1", generatedAt: "2026-06-06T12:00:00Z", piVersion: "1.2.3" };

test("markdown groups by track and lists the model row", () => {
  const md = renderMarkdown(cells, meta);
  expect(md).toContain("## frontier");
  expect(md).toContain("m1");
  expect(md).toContain("cost-per-success");
  expect(md).toContain("r1");
});

test("csv has a header and one data row per cell", () => {
  const csv = renderCsv(cells);
  const lines = csv.trim().split("\n");
  expect(lines[0]).toContain("track,spec,model");
  expect(lines.length).toBe(2);
  expect(lines[1]).toContain("frontier,s1,m1");
});

test("json round-trips cells and meta", () => {
  const obj = JSON.parse(renderJson(cells, [], meta));
  expect(obj.meta.runId).toBe("r1");
  expect(obj.summaries.length).toBe(1);
});

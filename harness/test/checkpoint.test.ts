import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  campaignFingerprint,
  digestPath,
  initializeOutputs,
  loadCheckpoint,
  reconcileOutputs,
  writeCheckpoint,
} from "../src/checkpoint";
import type { ReportMeta } from "../src/report";
import type { RunResult, Spec } from "../src/types";

const spec: Spec = {
  id: "s1", track: "frontier", mode: "single_shot", prompt: "solve",
  models: ["m1"], reps: 1, timeout_s: 60,
  scoring: { kind: "programmatic" }, tags: [],
};

function result(rep = 1): RunResult {
  return {
    runId: "r1", specId: "s1", model: "m1", rep,
    sessionId: `session-${rep}`, totalTokens: 10, inputTokens: 5, outputTokens: 5,
    cacheRead: 0, cacheWrite: 0, costTotal: 0, turns: 1, toolCalls: 0,
    compactions: 0, peakContext: 10, wallClockMs: 100, ttftMs: null,
    outputTps: null, errorCount: 0, pass: true, score: 1, timedOut: false,
  };
}

function withTempDir(run: (dir: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), "modellab-checkpoint-"));
  try {
    run(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("campaign fingerprint is key-order independent and changes with reasoning", () => {
  const first = campaignFingerprint({
    runner: "pi",
    settings: { thinking: "high" },
    plan: [{ spec, model: "m1", rep: 1 }],
  });
  const reordered = campaignFingerprint({
    plan: [{ rep: 1, model: "m1", spec }],
    settings: { thinking: "high" },
    runner: "pi",
  });
  const changed = campaignFingerprint({
    runner: "pi",
    settings: { thinking: "low" },
    plan: [{ spec, model: "m1", rep: 1 }],
  });
  expect(first).toBe(reordered);
  expect(changed).not.toBe(first);
});

test("path digest changes when referenced fixture contents change", () => {
  withTempDir((dir) => {
    const fixture = join(dir, "fixture");
    mkdirSync(fixture);
    writeFileSync(join(fixture, "input.txt"), "first");
    const first = digestPath(fixture);
    writeFileSync(join(fixture, "input.txt"), "second");
    expect(digestPath(fixture)).not.toBe(first);
  });
});

test("checkpoint load preserves results and original generation time", () => {
  withTempDir((dir) => {
    const path = join(dir, "results.json");
    writeFileSync(path, JSON.stringify({
      meta: {
        runId: "r1",
        generatedAt: "2026-07-16T00:00:00.000Z",
        piVersion: "1",
        campaignFingerprint: "expected",
      },
      summaries: [],
      runs: [result()],
    }));
    expect(loadCheckpoint(path, "expected")).toEqual({
      results: [result()],
      generatedAt: "2026-07-16T00:00:00.000Z",
    });
  });
});

test("checkpoint load rejects mismatched campaigns and duplicate run identities", () => {
  withTempDir((dir) => {
    const path = join(dir, "results.json");
    writeFileSync(path, JSON.stringify({
      meta: {
        runId: "r1",
        generatedAt: "2026-07-16T00:00:00.000Z",
        piVersion: "1",
        campaignFingerprint: "old",
      },
      summaries: [],
      runs: [result(), result()],
    }));
    expect(() => loadCheckpoint(path, "new")).toThrow(/campaign fingerprint mismatch/);
    expect(() => loadCheckpoint(path, "old")).toThrow(/duplicate run identity/);
  });
});

test("checkpoint load rejects malformed results and runs outside the scheduled plan", () => {
  withTempDir((dir) => {
    const path = join(dir, "results.json");
    writeFileSync(path, JSON.stringify({
      meta: {
        runId: "r1",
        generatedAt: "2026-07-16T00:00:00.000Z",
        piVersion: "1",
        campaignFingerprint: "expected",
      },
      summaries: [],
      runs: [{ ...result(), totalTokens: "corrupt" }],
    }));
    expect(() => loadCheckpoint(path, "expected")).toThrow(/invalid checkpoint run result/);

    writeFileSync(path, JSON.stringify({
      meta: {
        runId: "r1",
        generatedAt: "2026-07-16T00:00:00.000Z",
        piVersion: "1",
        campaignFingerprint: "expected",
      },
      summaries: [],
      runs: [result()],
    }));
    expect(() => loadCheckpoint(path, "expected", [{ specId: "s2", model: "m1", rep: 1 }]))
      .toThrow(/outside scheduled plan/);
    expect(() => loadCheckpoint(path, "expected", [{ specId: "s1", model: "m1", rep: 1 }], "different-run"))
      .toThrow(/checkpoint run id mismatch/);
  });
});

test("initializing outputs creates a missing file without truncating existing output", () => {
  withTempDir((dir) => {
    const path = join(dir, "outputs.jsonl");
    initializeOutputs(path);
    expect(readFileSync(path, "utf8")).toBe("");
    writeFileSync(path, "existing\n");
    initializeOutputs(path);
    expect(readFileSync(path, "utf8")).toBe("existing\n");
  });
});

test("output reconciliation removes an uncheckpointed crash-window record", () => {
  withTempDir((dir) => {
    const path = join(dir, "outputs.jsonl");
    const record = (rep: number) => JSON.stringify({
      runId: "r1", specId: "s1", model: "m1", rep, output: `output-${rep}`,
    });
    writeFileSync(path, `${record(1)}\n${record(2)}\n`);
    reconcileOutputs(path, [result(1)]);
    expect(readFileSync(path, "utf8")).toBe(`${record(1)}\n`);
  });
});

test("output reconciliation rejects a durable result with no raw output", () => {
  withTempDir((dir) => {
    const path = join(dir, "outputs.jsonl");
    writeFileSync(path, "");
    expect(() => reconcileOutputs(path, [result()])).toThrow(/missing raw output/);
  });
});

test("output reconciliation preserves orphaned output when no checkpoint exists", () => {
  withTempDir((dir) => {
    const path = join(dir, "outputs.jsonl");
    const orphan = '{"runId":"r1","specId":"s1","model":"m1","rep":1,"output":"answer"}\n';
    writeFileSync(path, orphan);
    expect(() => reconcileOutputs(path, [])).toThrow(/orphaned raw output/);
    expect(readFileSync(path, "utf8")).toBe(orphan);
  });
});

test("checkpoint write updates report files and heartbeat from one result array", () => {
  withTempDir((dir) => {
    const meta: ReportMeta = {
      runId: "r1",
      generatedAt: "2026-07-16T00:00:00.000Z",
      piVersion: "1",
      campaignFingerprint: "fingerprint",
    };
    writeCheckpoint(dir, [result()], [spec], meta);
    const stored = JSON.parse(readFileSync(join(dir, "results.json"), "utf8"));
    const heartbeat = JSON.parse(readFileSync(join(dir, "heartbeat.json"), "utf8"));
    expect(stored.meta.campaignFingerprint).toBe("fingerprint");
    expect(stored.runs).toHaveLength(1);
    expect(heartbeat).toMatchObject({
      runId: "r1",
      completed: 1,
      last: { specId: "s1", model: "m1", rep: 1 },
    });
    expect(readFileSync(join(dir, "report.md"), "utf8")).toContain("Benchmark Report");
    expect(readFileSync(join(dir, "results.csv"), "utf8")).toContain("track,spec,model");
  });
});

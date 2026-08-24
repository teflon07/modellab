import { test, expect } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scoreProgrammatic, scoreJudge, readGradedScore } from "../src/scorer";

test("scoreProgrammatic passes when all verify commands exit 0", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "score-"));
  const r = await scoreProgrammatic(["true", "echo ok"], cwd);
  expect(r.pass).toBe(true);
});

test("scoreProgrammatic fails when any verify command exits non-zero", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "score-"));
  const r = await scoreProgrammatic(["true", "false"], cwd);
  expect(r.pass).toBe(false);
});

test("scoreJudge parses JSON verdict from the injected runner", async () => {
  const fakeRun = async () => JSON.stringify({ pass: true, score: 0.8 });
  const r = await scoreJudge({
    judgeModel: "anthropic/claude-opus-4-8",
    rubric: "Is the answer correct?",
    task: "What is 6 times 7?",
    output: "42",
    runJudge: fakeRun,
  });
  expect(r.pass).toBe(true);
  expect(r.score).toBeCloseTo(0.8, 5);
});

test("scoreJudge gives the judge the source task, not just the output", async () => {
  let seen = "";
  const fakeRun = async (prompt: string) => {
    seen = prompt;
    return JSON.stringify({ pass: true, score: 1 });
  };
  await scoreJudge({
    judgeModel: "m",
    rubric: "no fabricated items not in the changelog",
    task: "## CHANGELOG\n- dark mode",
    output: "- dark mode",
    runJudge: fakeRun,
  });
  expect(seen).toContain("## CHANGELOG");
  expect(seen).toContain("- dark mode");
});

test("scoreProgrammatic reads partial rubric scores from score.json on failure", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "score-"));
  writeFileSync(join(cwd, "score.json"), JSON.stringify({
    score: 0.4, pass: false,
    checks: [
      { id: "a", label: "has hero", pass: true },
      { id: "b", label: "has auth", pass: false },
    ],
  }));
  const r = await scoreProgrammatic(["false"], cwd);
  expect(r.pass).toBe(false);
  expect(r.score).toBeCloseTo(0.4, 5);
  expect(r.rubric?.map((c) => c.id)).toEqual(["a", "b"]);
});

test("scoreProgrammatic uses score.json on success", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "score-"));
  writeFileSync(join(cwd, "score.json"), JSON.stringify({
    score: 1, pass: true, checks: [{ id: "a", label: "ok", pass: true }],
  }));
  const r = await scoreProgrammatic(["true"], cwd);
  expect(r.pass).toBe(true);
  expect(r.score).toBe(1);
});

test("readGradedScore ignores malformed files", () => {
  const cwd = mkdtempSync(join(tmpdir(), "score-"));
  expect(readGradedScore(cwd)).toBeNull();
  writeFileSync(join(cwd, "score.json"), "{");
  expect(readGradedScore(cwd)).toBeNull();
});

test("scoreJudge treats unparseable verdicts as a fail", async () => {
  const fakeRun = async () => "not json";
  const r = await scoreJudge({
    judgeModel: "m", rubric: "x", task: "t", output: "y", runJudge: fakeRun,
  });
  expect(r.pass).toBe(false);
  expect(r.score).toBeNull();
});

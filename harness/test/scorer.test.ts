import { test, expect } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scoreProgrammatic, scoreJudge } from "../src/scorer";

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

test("scoreJudge treats unparseable verdicts as a fail", async () => {
  const fakeRun = async () => "not json";
  const r = await scoreJudge({
    judgeModel: "m", rubric: "x", task: "t", output: "y", runJudge: fakeRun,
  });
  expect(r.pass).toBe(false);
  expect(r.score).toBeNull();
});

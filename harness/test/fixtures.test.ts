// Floor guard for the task suite: prove every fixture's verify.py actually
// discriminates. A checker that always passes (or always fails) is worthless, so
// each case asserts the shipped/wrong state FAILS and a correct solution PASSES.
// This runs the real python3 verifier the harness uses, in a throwaway copy.
import { test, expect } from "bun:test";
import { cpSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const FIXTURES = resolve(import.meta.dir, "../../fixtures");

function verifyStatus(dir: string): number {
  const r = spawnSync("python3", ["verify.py"], { cwd: dir, encoding: "utf8" });
  if (r.error) throw r.error; // python3 missing => fail loudly, don't skip
  return r.status ?? 1;
}

function stage(fixture: string): string {
  const dir = mkdtempSync(join(tmpdir(), `fx-${fixture}-`));
  cpSync(join(FIXTURES, fixture), dir, { recursive: true });
  return dir;
}

function withFixture(fixture: string, fn: (dir: string) => void) {
  const dir = stage(fixture);
  try {
    fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("fix-bug-py verify fails on the shipped bug and passes when fixed", () => {
  withFixture("fix-bug-py", (dir) => {
    expect(verifyStatus(dir)).not.toBe(0); // bug present as shipped
    writeFileSync(
      join(dir, "stats.py"),
      "def rolling_mean(xs, window):\n" +
        "    out = []\n" +
        "    for i in range(len(xs) - window + 1):\n" +
        "        chunk = xs[i:i + window]\n" +
        "        out.append(sum(chunk) / len(chunk))\n" +
        "    return out\n",
    );
    expect(verifyStatus(dir)).toBe(0);
  });
});

test("style-constraints verify rejects violations and accepts a clean rewrite", () => {
  withFixture("style-constraints", (dir) => {
    expect(verifyStatus(dir)).not.toBe(0); // out.md missing
    writeFileSync(
      join(dir, "out.md"),
      "Dr Elena Marsh opened the lab at dawn, the colour of the sky still grey.",
    );
    expect(verifyStatus(dir)).not.toBe(0); // British spelling remains
    writeFileSync(
      join(dir, "out.md"),
      "Dr Elena Marsh opened the lab at dawn, the color of the sky still gray. " +
        "Her colleague, Mr Tan, had already begun to organize the samples. " +
        "We realize the risk, she said, but the work could not wait. " +
        "The center would not fund a second attempt, and the behavior of the " +
        "reagents favored an early start.",
    );
    expect(verifyStatus(dir)).toBe(0);
  });
});

test("extract-records verify rejects a bad transform and accepts a clean one", () => {
  withFixture("extract-records", (dir) => {
    expect(verifyStatus(dir)).not.toBe(0); // result.json missing
    writeFileSync(
      join(dir, "result.json"),
      JSON.stringify([
        { name: "Maria Lopez", city: "Tampa FL", email: "maria.lopez@example.com" },
        { name: "James Chen", city: "Austin", email: "jchen@example.com" },
        { name: "Priya Nair", city: "Miami", email: "priya@example.com" },
      ]),
    );
    expect(verifyStatus(dir)).not.toBe(0); // "Tampa FL" keeps the state code
    writeFileSync(
      join(dir, "result.json"),
      JSON.stringify([
        { name: "Maria Lopez", city: "Tampa", email: "maria.lopez@example.com" },
        { name: "James Chen", city: "Austin", email: "jchen@example.com" },
        { name: "Priya Nair", city: "Miami", email: "priya@example.com" },
      ]),
    );
    expect(verifyStatus(dir)).toBe(0);
  });
});

test("financial-metric verify rejects wrong numbers and accepts correct margins", () => {
  withFixture("financial-metric", (dir) => {
    expect(verifyStatus(dir)).not.toBe(0); // answer.json missing
    writeFileSync(
      join(dir, "answer.json"),
      JSON.stringify({ gross_margin: 0.5, operating_margin: 0.16 }),
    );
    expect(verifyStatus(dir)).not.toBe(0); // gross margin should be 0.4
    writeFileSync(
      join(dir, "answer.json"),
      JSON.stringify({ gross_margin: 0.4, operating_margin: 0.16 }),
    );
    expect(verifyStatus(dir)).toBe(0);
  });
});

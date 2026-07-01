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

// ---- Headroom tier: each proves the trap bites (the naive fix still fails) ----

const STATUS_LOWERCASE_FIX =
  "def summarize(results):\n" +
  "    lines = [f'{name}: {detail}' for name, ok, detail in results]\n" +
  "    report = '\\n'.join(lines)\n" +
  "    if 'error' in report.lower():\n" +
  "        return ('status: FAILED', 1)\n" +
  "    return ('status: OK', 0)\n";

const STATUS_OK_FLAG_FIX =
  "def summarize(results):\n" +
  "    failed = [name for name, ok, detail in results if not ok]\n" +
  "    if failed:\n" +
  "        return ('status: FAILED (' + ', '.join(failed) + ')', 1)\n" +
  "    return ('status: OK', 0)\n";

test("fix-status-detection: shipped and naive string-scan both fail; ok-flag fix passes", () => {
  withFixture("fix-status-detection", (dir) => {
    expect(verifyStatus(dir)).not.toBe(0); // shipped upper-case scan misses the failure
    writeFileSync(join(dir, "runner.py"), STATUS_LOWERCASE_FIX);
    expect(verifyStatus(dir)).not.toBe(0); // trap: false-flags the "0 errors" OK task
    writeFileSync(join(dir, "runner.py"), STATUS_OK_FLAG_FIX);
    expect(verifyStatus(dir)).toBe(0);
  });
});

const BUDGET_ROUND_ONLY_FIX =
  "def parse_amount(s):\n" +
  "    s = s.strip()\n" +
  "    neg = s.startswith('(') and s.endswith(')')\n" +
  "    s = s.strip('()').replace('$', '').replace(',', '')\n" +
  "    return float(s)\n" + // still ignores neg
  "\n" +
  "def net(entries):\n" +
  "    return round(sum(parse_amount(e) for e in entries), 2)\n";

const BUDGET_BOTH_FIX =
  "def parse_amount(s):\n" +
  "    s = s.strip()\n" +
  "    neg = s.startswith('(') and s.endswith(')')\n" +
  "    s = s.strip('()').replace('$', '').replace(',', '')\n" +
  "    val = float(s)\n" +
  "    return -val if neg else val\n" +
  "\n" +
  "def net(entries):\n" +
  "    return round(sum(parse_amount(e) for e in entries), 2)\n";

test("fix-multibug-py: shipped and one-bug fix both fail; fixing both passes", () => {
  withFixture("fix-multibug-py", (dir) => {
    expect(verifyStatus(dir)).not.toBe(0); // both bugs present
    writeFileSync(join(dir, "budget.py"), BUDGET_ROUND_ONLY_FIX);
    expect(verifyStatus(dir)).not.toBe(0); // rounding fixed but sign still wrong
    writeFileSync(join(dir, "budget.py"), BUDGET_BOTH_FIX);
    expect(verifyStatus(dir)).toBe(0);
  });
});

test("extract-messy: rejects a raw (undeduped, unfiltered) extract; accepts the clean one", () => {
  withFixture("extract-messy", (dir) => {
    expect(verifyStatus(dir)).not.toBe(0); // result.json missing
    // Naive: keeps the duplicate + malformed row, leaves state codes on cities.
    writeFileSync(
      join(dir, "result.json"),
      JSON.stringify([
        { name: "Maria Lopez", city: "Tampa FL 33601", email: "maria.lopez@example.com" },
        { name: "James Chen", city: "Austin", email: "jchen@example.com" },
        { name: "Priya Nair", city: "Miami", email: "priya@example.com" },
        { name: "James Chen", city: "Austin", email: "jchen@example.com" },
        { name: "Tomas Garcia", city: "", email: "tomas.garcia@example.com" },
        { name: "Bad Row", city: "Denver", email: "not-an-email" },
        { name: "Sam O'Neil", city: "Seattle WA", email: "sam.oneil@example.co.uk" },
      ]),
    );
    expect(verifyStatus(dir)).not.toBe(0);
    writeFileSync(
      join(dir, "result.json"),
      JSON.stringify([
        { name: "James Chen", city: "Austin", email: "jchen@example.com" },
        { name: "Maria Lopez", city: "Tampa", email: "maria.lopez@example.com" },
        { name: "Priya Nair", city: "Miami", email: "priya@example.com" },
        { name: "Sam O'Neil", city: "Seattle", email: "sam.oneil@example.co.uk" },
        { name: "Tomas Garcia", city: null, email: "tomas.garcia@example.com" },
      ]),
    );
    expect(verifyStatus(dir)).toBe(0);
  });
});

test("financial-trap: rejects the naive (include one-time gain) answer; accepts operating-basis", () => {
  withFixture("financial-trap", (dir) => {
    expect(verifyStatus(dir)).not.toBe(0); // answer.json missing
    // Trap: ignored the note, used total_revenue = 1400.
    writeFileSync(
      join(dir, "answer.json"),
      JSON.stringify({ gross_margin: 0.5714, operating_margin: 0.3571 }),
    );
    expect(verifyStatus(dir)).not.toBe(0);
    writeFileSync(
      join(dir, "answer.json"),
      JSON.stringify({ gross_margin: 0.52, operating_margin: 0.28 }),
    );
    expect(verifyStatus(dir)).toBe(0);
  });
});

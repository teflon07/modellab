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

// ---- Hard-ceiling tier: reference solutions double as a check that the
// verifier batteries themselves are correct (a bad expected value would make
// the reference fail here), plus a shortcut/partial-fix "still fails" case. ----

const EXPR_EVAL_CHEAT = "def evaluate(expr):\n    return float(eval(expr))\n";
const EXPR_EVAL_REF = String.raw`import re
_NUM = re.compile(r"\d+(\.\d+)?")
def _tokenize(expr):
    tokens = []
    i = 0
    while i < len(expr):
        c = expr[i]
        if c.isspace():
            i += 1
            continue
        if c in "+-*/()":
            tokens.append(c)
            i += 1
            continue
        m = _NUM.match(expr, i)
        if not m:
            raise ValueError("bad char")
        tokens.append(float(m.group()))
        i = m.end()
    return tokens
def evaluate(expr):
    tokens = _tokenize(expr)
    pos = 0
    def peek():
        return tokens[pos] if pos < len(tokens) else None
    def advance():
        nonlocal pos
        t = tokens[pos]
        pos += 1
        return t
    def expr_():
        val = term()
        while peek() in ("+", "-"):
            op = advance()
            r = term()
            val = val + r if op == "+" else val - r
        return val
    def term():
        val = factor()
        while peek() in ("*", "/"):
            op = advance()
            r = factor()
            if op == "*":
                val *= r
            else:
                if r == 0:
                    raise ValueError("division by zero")
                val /= r
        return val
    def factor():
        t = peek()
        if t is None:
            raise ValueError("unexpected end")
        if t == "-":
            advance()
            return -factor()
        if t == "+":
            advance()
            return factor()
        if t == "(":
            advance()
            v = expr_()
            if peek() != ")":
                raise ValueError("expected )")
            advance()
            return v
        if isinstance(t, float):
            advance()
            return t
        raise ValueError("unexpected token")
    if not tokens:
        raise ValueError("empty")
    result = expr_()
    if pos != len(tokens):
        raise ValueError("trailing")
    return float(result)
`;

const SEMVER_NAIVE =
  "def compare(a, b):\n" +
  "    pa = tuple(int(x) for x in a.split('+')[0].split('-')[0].split('.'))\n" +
  "    pb = tuple(int(x) for x in b.split('+')[0].split('-')[0].split('.'))\n" +
  "    return -1 if pa < pb else (1 if pa > pb else 0)\n";
const SEMVER_REF = String.raw`import re
_CORE = re.compile(r"^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+([0-9A-Za-z.-]+))?$")
def _parse(v):
    m = _CORE.match(v)
    if not m:
        raise ValueError("invalid")
    major, minor, patch, pre, _build = m.groups()
    ids = []
    if pre is not None:
        for p in pre.split("."):
            if p == "":
                raise ValueError("empty identifier")
            ids.append(p)
    return (int(major), int(minor), int(patch), ids)
def _cmp_pre(a, b):
    for x, y in zip(a, b):
        xn, yn = x.isdigit(), y.isdigit()
        if xn and yn:
            xi, yi = int(x), int(y)
            if xi != yi:
                return -1 if xi < yi else 1
        elif xn != yn:
            return -1 if xn else 1
        elif x != y:
            return -1 if x < y else 1
    if len(a) != len(b):
        return -1 if len(a) < len(b) else 1
    return 0
def compare(a, b):
    pa = _parse(a)
    pb = _parse(b)
    if pa[:3] != pb[:3]:
        return -1 if pa[:3] < pb[:3] else 1
    ia, ib = pa[3], pb[3]
    if ia and not ib:
        return -1
    if ib and not ia:
        return 1
    if not ia and not ib:
        return 0
    return _cmp_pre(ia, ib)
`;

const LRU_PARTIAL = `class LRUCache:
    def __init__(self, capacity):
        self.capacity = capacity
        self._data = {}
        self._order = []
    def get(self, key):
        return self._data.get(key)
    def put(self, key, value):
        if key in self._data:
            self._data[key] = value
            self._order.remove(key)
            self._order.append(key)
            return
        self._data[key] = value
        self._order.append(key)
        if len(self._data) > self.capacity:
            del self._data[self._order.pop(0)]
`;
const LRU_REF = `class LRUCache:
    def __init__(self, capacity):
        self.capacity = capacity
        self._data = {}
        self._order = []
    def get(self, key):
        if key not in self._data:
            return None
        self._order.remove(key)
        self._order.append(key)
        return self._data[key]
    def put(self, key, value):
        if key in self._data:
            self._data[key] = value
            self._order.remove(key)
            self._order.append(key)
            return
        self._data[key] = value
        self._order.append(key)
        if len(self._data) > self.capacity:
            del self._data[self._order.pop(0)]
`;

test("expr-eval: stub fails, eval-shortcut is rejected, a real parser passes", () => {
  withFixture("expr-eval", (dir) => {
    expect(verifyStatus(dir)).not.toBe(0); // NotImplementedError stub
    writeFileSync(join(dir, "evaluator.py"), EXPR_EVAL_CHEAT);
    expect(verifyStatus(dir)).not.toBe(0); // anti-shortcut guard bites
    writeFileSync(join(dir, "evaluator.py"), EXPR_EVAL_REF);
    expect(verifyStatus(dir)).toBe(0);
  });
});

test("semver-compare: stub fails, core-only naive fails, full precedence passes", () => {
  withFixture("semver-compare", (dir) => {
    expect(verifyStatus(dir)).not.toBe(0); // NotImplementedError stub
    writeFileSync(join(dir, "semver.py"), SEMVER_NAIVE);
    expect(verifyStatus(dir)).not.toBe(0); // ignores pre-release rules
    writeFileSync(join(dir, "semver.py"), SEMVER_REF);
    expect(verifyStatus(dir)).toBe(0);
  });
});

test("fix-lru: shipped fails, capacity-only fix fails, fixing both passes", () => {
  withFixture("fix-lru", (dir) => {
    expect(verifyStatus(dir)).not.toBe(0); // both bugs present
    writeFileSync(join(dir, "lru.py"), LRU_PARTIAL);
    expect(verifyStatus(dir)).not.toBe(0); // recency-on-read still broken
    writeFileSync(join(dir, "lru.py"), LRU_REF);
    expect(verifyStatus(dir)).toBe(0);
  });
});

const MAZE_PATH = "RRRRRRDDLLDDDDLLDDRRRRUUUURRDDDD";

test("maze-solve: rejects missing/wall-hitting paths, accepts valid path (plain + JSONL)", () => {
  withFixture("maze-solve", (dir) => {
    expect(verifyStatus(dir)).not.toBe(0); // no response.txt
    writeFileSync(join(dir, "response.txt"), "DDDD"); // first step walks into a wall
    expect(verifyStatus(dir)).not.toBe(0);
    writeFileSync(join(dir, "response.txt"), MAZE_PATH + "\n"); // plain-text valid path
    expect(verifyStatus(dir)).toBe(0);
    // same path wrapped in pi's JSONL stream — exercises the extractor
    const jsonl = [
      JSON.stringify({ type: "session" }),
      JSON.stringify({ type: "message_end", message: { role: "user", content: [{ type: "text", text: "solve" }] } }),
      JSON.stringify({ type: "message_end", message: { role: "assistant", content: [{ type: "thinking", thinking: "..." }, { type: "text", text: MAZE_PATH }] } }),
    ].join("\n") + "\n";
    writeFileSync(join(dir, "response.txt"), jsonl);
    expect(verifyStatus(dir)).toBe(0);
  });
});

const MAZE15_PATH = "DDDDRRRRUULLUURRRRRRRRDDLLLLDDDDLLDDLLLLDDRRRRRRDDRRUUUUUUUURRDDRRDDDDDD";

test("maze-solve-15: rejects wall-hitting path, accepts the 72-move solution", () => {
  withFixture("maze-solve-15", (dir) => {
    expect(verifyStatus(dir)).not.toBe(0); // no response.txt
    writeFileSync(join(dir, "response.txt"), "RRRR"); // (1,1)->right hits the wall at (1,2)
    expect(verifyStatus(dir)).not.toBe(0);
    writeFileSync(join(dir, "response.txt"), MAZE15_PATH + "\n");
    expect(verifyStatus(dir)).toBe(0);
  });
});

const MAZE21_PATH =
  "RRDDLLDDDDRRDDDDDDRRDDRRRRUUUUUURRRRUULLLLLLUUUULLUURRRRRRDDRRDDRRUURRDDRRDDDDDDLLDDDDLLDDRRRRDD";

test("maze-solve-21: rejects wall-hitting path, accepts the 96-move solution", () => {
  withFixture("maze-solve-21", (dir) => {
    expect(verifyStatus(dir)).not.toBe(0); // no response.txt
    writeFileSync(join(dir, "response.txt"), "DDDD"); // (1,1)->down hits the wall at (2,1)
    expect(verifyStatus(dir)).not.toBe(0);
    writeFileSync(join(dir, "response.txt"), MAZE21_PATH + "\n");
    expect(verifyStatus(dir)).toBe(0);
  });
});

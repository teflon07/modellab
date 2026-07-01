#!/usr/bin/env python3
"""Generate a uniquely-solvable logic-grid (Zebra-style) puzzle, seeded by
MODELLAB_SEED so each rep is a fresh instance. Writes prompt.txt (what the model
sees) and solution.json (the unique answer, for verify only).

Difficulty dials (env): LOGIC_N = entities/positions (default 4), LOGIC_K =
number of categories (default 3). Uniqueness is checked with a backtracking CSP
solver (counts up to 2 solutions), so N and K can scale without the brute-force
blowup. Clues are relational; we minimize the clue set so the puzzle needs real
deduction rather than direct lookup.
"""
import itertools
import json
import os
import random

N = int(os.environ.get("LOGIC_N", "4"))
K = int(os.environ.get("LOGIC_K", "3"))
SEED = int(os.environ.get("MODELLAB_SEED", "0"))
rng = random.Random(SEED * 7919 + 1234567)

ALL_CATS = {
    "color": ["red", "green", "blue", "white", "yellow", "black"],
    "pet": ["dog", "cat", "bird", "fish", "horse", "rabbit"],
    "drink": ["tea", "coffee", "milk", "water", "juice", "cola"],
    "hobby": ["chess", "painting", "hiking", "cooking", "reading", "gaming"],
    "sport": ["soccer", "tennis", "golf", "swimming", "running", "cycling"],
}
CAT_NAMES = list(ALL_CATS)[:K]
CATS = {c: ALL_CATS[c][:N] for c in CAT_NAMES}
VALUES = [v for c in CAT_NAMES for v in CATS[c]]  # globally unique across categories

# Ground truth: each category is a random arrangement over positions 1..N.
truth = {}  # value -> position
for c in CAT_NAMES:
    for p, v in enumerate(rng.sample(CATS[c], N), 1):
        truth[v] = p

# Clues: (text, [values it references], predicate(pos_map)). The predicate is
# only evaluated once every referenced value has an assigned position.
def build_pool():
    pool = []

    def add(text, vals, fn):
        if fn(truth):
            pool.append((text, vals, fn))

    for v in VALUES:
        add(f"{v} is at one of the two ends.", [v], lambda pos, v=v: pos[v] in (1, N))
    for a, b in itertools.combinations(VALUES, 2):
        ca = next(c for c in CAT_NAMES if a in CATS[c])
        cb = next(c for c in CAT_NAMES if b in CATS[c])
        if ca != cb:
            add(f"The one with {a} also has {b}.", [a, b], lambda pos, a=a, b=b: pos[a] == pos[b])
            add(f"The one with {a} does not have {b}.", [a, b], lambda pos, a=a, b=b: pos[a] != pos[b])
    for a, b in itertools.permutations(VALUES, 2):
        add(f"{a} is immediately to the left of {b}.", [a, b], lambda pos, a=a, b=b: pos[a] + 1 == pos[b])
        add(f"{a} is somewhere to the left of {b}.", [a, b], lambda pos, a=a, b=b: pos[a] < pos[b])
        add(f"{a} is directly next to {b}.", [a, b], lambda pos, a=a, b=b: abs(pos[a] - pos[b]) == 1)
    rng.shuffle(pool)
    return pool


def count_solutions(clues, limit=2):
    varlist = [(c, v) for c in CAT_NAMES for v in CATS[c]]
    by_value = {}
    for cl in clues:
        for v in cl[1]:
            by_value.setdefault(v, []).append(cl)
    pos = {}
    used = {c: set() for c in CAT_NAMES}
    count = 0

    def bt(i):
        nonlocal count
        if count >= limit:
            return
        if i == len(varlist):
            count += 1
            return
        c, v = varlist[i]
        for p in range(1, N + 1):
            if p in used[c]:
                continue
            pos[v] = p
            used[c].add(p)
            ok = True
            for cl in by_value.get(v, ()):
                if all(x in pos for x in cl[1]) and not cl[2](pos):
                    ok = False
                    break
            if ok:
                bt(i + 1)
            del pos[v]
            used[c].discard(p)
            if count >= limit:
                return

    bt(0)
    return count


clues = build_pool()
if count_solutions(clues) != 1:
    raise SystemExit("generator: clue pool is not uniquely solvable (unexpected)")

i = 0
while i < len(clues):
    trial = clues[:i] + clues[i + 1:]
    if count_solutions(trial) == 1:
        clues = trial
    else:
        i += 1

rng.shuffle(clues)
solution = {str(p): {c: next(v for v in CATS[c] if truth[v] == p) for c in CAT_NAMES}
            for p in range(1, N + 1)}

lines = [
    f"There are {N} positions in a row, numbered 1 to {N} (left to right).",
    f"Each position has exactly one {', one '.join(CAT_NAMES)}.",
    "Each value below is used exactly once across the positions:",
]
for c in CAT_NAMES:
    lines.append(f"  {c}s: {', '.join(CATS[c])}")
lines += ["", "Clues:"]
for n, (text, _, _) in enumerate(clues, 1):
    lines.append(f"{n}. {text}")
lines += [
    "",
    "Using only the clues, determine the full assignment. Output ONLY a JSON",
    f'object mapping each position ("1".."{N}") to its ' + "{" + ", ".join(f'"{c}"' for c in CAT_NAMES) + "},",
    "with no other text. Example:",
    '{"1": {' + ", ".join(f'"{c}": "..."' for c in CAT_NAMES) + "}, \"2\": {...}}",
]

open("prompt.txt", "w").write("\n".join(lines) + "\n")
open("solution.json", "w").write(json.dumps(solution))

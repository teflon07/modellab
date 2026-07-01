#!/usr/bin/env python3
"""Generate a uniquely-solvable logic-grid (Zebra-style) puzzle, seeded by
MODELLAB_SEED so each rep is a fresh instance. Writes prompt.txt (the puzzle the
model sees) and solution.json (the unique answer, for verify only).

N positions in a row, 3 categories, each value used once. Clues are relational
(adjacency, ordering, association, negation, ends). We build a pool of true
clues, guarantee uniqueness with a brute-force solver, then greedily minimize
the clue set so the puzzle requires real deduction rather than direct lookup.
"""
import itertools
import json
import os
import random

N = int(os.environ.get("LOGIC_N", "4"))
SEED = int(os.environ.get("MODELLAB_SEED", "0"))
rng = random.Random(SEED * 7919 + 1234567)

CATS = {
    "color": ["red", "green", "blue", "white", "yellow"][:N],
    "pet": ["dog", "cat", "bird", "fish", "horse"][:N],
    "drink": ["tea", "coffee", "milk", "water", "juice"][:N],
}
CAT_NAMES = list(CATS)
VALS = [(c, v) for c in CAT_NAMES for v in CATS[c]]

# Ground truth: each category is a random arrangement over positions (0-indexed).
truth = {c: rng.sample(v, len(v)) for c, v in CATS.items()}


def pos_of(asg, value):
    for c in CAT_NAMES:
        if value in asg[c]:
            return asg[c].index(value)
    raise KeyError(value)


# Predicate factories (capture args by value, no default-arg trickery).
def p_at(c, p, v):
    return lambda a: a[c][p] == v


def p_same(c1, v1, c2, v2):
    return lambda a: a[c1].index(v1) == a[c2].index(v2)


def p_notsame(c1, v1, c2, v2):
    return lambda a: a[c1].index(v1) != a[c2].index(v2)


def p_ladj(v1, v2):
    return lambda a: pos_of(a, v1) + 1 == pos_of(a, v2)


def p_left(v1, v2):
    return lambda a: pos_of(a, v1) < pos_of(a, v2)


def p_next(v1, v2):
    return lambda a: abs(pos_of(a, v1) - pos_of(a, v2)) == 1


def p_end(c, v):
    return lambda a: a[c].index(v) in (0, N - 1)


def make_clue_pool():
    pool = []

    def add(text, pred):
        if pred(truth):
            pool.append((text, pred))

    for c, v in VALS:
        add(f"The {v} is in position {truth[c].index(v) + 1}.", p_at(c, truth[c].index(v), v))
        add(f"{v} is at one of the two ends.", p_end(c, v))

    for (c1, v1), (c2, v2) in itertools.combinations(VALS, 2):
        if c1 == c2:
            continue
        add(f"The one with {v1} also has {v2}.", p_same(c1, v1, c2, v2))
        add(f"The one with {v1} does not have {v2}.", p_notsame(c1, v1, c2, v2))

    for (_, v1), (_, v2) in itertools.permutations(VALS, 2):
        if v1 == v2:
            continue
        add(f"{v1} is immediately to the left of {v2}.", p_ladj(v1, v2))
        add(f"{v1} is somewhere to the left of {v2}.", p_left(v1, v2))
        add(f"{v1} is directly next to {v2}.", p_next(v1, v2))

    rng.shuffle(pool)
    return pool


def count_solutions(preds, limit=2):
    perms = {c: list(itertools.permutations(CATS[c])) for c in CAT_NAMES}
    count = 0
    for combo in itertools.product(*[perms[c] for c in CAT_NAMES]):
        asg = {c: list(combo[i]) for i, c in enumerate(CAT_NAMES)}
        if all(p(asg) for _, p in preds):
            count += 1
            if count >= limit:
                return count
    return count


clues = make_clue_pool()
if count_solutions(clues) != 1:
    raise SystemExit("generator: clue pool is not uniquely solvable (unexpected)")

# Greedily drop clues while the solution stays unique -> a minimal, deduction-heavy set.
i = 0
while i < len(clues):
    trial = clues[:i] + clues[i + 1:]
    if count_solutions(trial) == 1:
        clues = trial
    else:
        i += 1

rng.shuffle(clues)
solution = {str(p + 1): {c: truth[c][p] for c in CAT_NAMES} for p in range(N)}

lines = [
    f"There are {N} positions in a row, numbered 1 to {N} (left to right).",
    "Each position has exactly one color, one pet, and one drink.",
    "Each value below is used exactly once across the positions:",
]
for c in CAT_NAMES:
    lines.append(f"  {c}s: {', '.join(CATS[c])}")
lines.append("")
lines.append("Clues:")
for n, (text, _) in enumerate(clues, 1):
    lines.append(f"{n}. {text}")
lines.append("")
lines.append("Using only the clues, determine the full assignment. Output ONLY a JSON")
lines.append(f'object mapping each position ("1".."{N}") to its ' + '{"color","pet","drink"},')
lines.append("with no other text. Example:")
lines.append('{"1": {"color": "...", "pet": "...", "drink": "..."}, "2": {...}}')

open("prompt.txt", "w").write("\n".join(lines) + "\n")
open("solution.json", "w").write(json.dumps(solution))

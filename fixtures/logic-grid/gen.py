#!/usr/bin/env python3
"""Generate a uniquely-solvable logic-grid puzzle, seeded by MODELLAB_SEED so
each rep is a fresh instance. Writes prompt.txt (what the model sees) and
solution.json (the unique answer, for verify only).

Difficulty dials (env):
  LOGIC_N        entities/positions (default 4)
  LOGIC_K        number of categories (default 3)
  LOGIC_ABSTRACT 1 -> abstract token names (anti-memorization)
  LOGIC_HARD     1 -> reject puzzles solvable by pure constraint propagation
                 (i.e. keep only ones that require search/backtracking) and use
                 relational-only clues (no absolute-position anchors)

Uniqueness is verified with a backtracking CSP solver. Hardness is measured with
a propagation-only solver (forced/hidden singles + per-clue arc reduction): if
propagation alone solves it, the puzzle is easy and rejected under LOGIC_HARD.
"""
import itertools
import json
import os
import random

N = int(os.environ.get("LOGIC_N", "4"))
K = int(os.environ.get("LOGIC_K", "3"))
ABSTRACT = os.environ.get("LOGIC_ABSTRACT") == "1"
HARD = os.environ.get("LOGIC_HARD") == "1"
SEED = int(os.environ.get("MODELLAB_SEED", "0"))
rng = random.Random(SEED * 7919 + 1234567)

if ABSTRACT:
    CAT_NAMES = [f"attr{i + 1}" for i in range(K)]
    CATS = {CAT_NAMES[i]: [f"{chr(65 + i)}{j + 1}" for j in range(N)] for i in range(K)}
else:
    _POOL = {
        "color": ["red", "green", "blue", "white", "yellow", "black"],
        "pet": ["dog", "cat", "bird", "fish", "horse", "rabbit"],
        "drink": ["tea", "coffee", "milk", "water", "juice", "cola"],
        "hobby": ["chess", "painting", "hiking", "cooking", "reading", "gaming"],
        "sport": ["soccer", "tennis", "golf", "swimming", "running", "cycling"],
    }
    CAT_NAMES = list(_POOL)[:K]
    CATS = {c: _POOL[c][:N] for c in CAT_NAMES}

VALUES = [v for c in CAT_NAMES for v in CATS[c]]
CAT_OF = {v: c for c in CAT_NAMES for v in CATS[c]}


# A clue is a dict: kind, vals (referenced values), text, pred(pos_map) for the
# CSP solver, prop(dom) for the propagation solver (sound domain reduction).
def clue(kind, vals, text, pred, prop):
    return {"kind": kind, "vals": vals, "text": text, "pred": pred, "prop": prop}


def C_end(v):
    return clue("end", [v], f"{v} is at one of the two ends.",
               lambda pos: pos[v] in (1, N),
               lambda dom: dom[v].intersection_update({1, N}))


def C_same(a, b):
    return clue("same", [a, b], f"The one with {a} also has {b}.",
               lambda pos: pos[a] == pos[b],
               lambda dom: (dom[a].intersection_update(dom[b] | set()), dom[b].intersection_update(dom[a] | set())))


def C_notsame(a, b):
    def prop(dom):
        if len(dom[a]) == 1:
            dom[b].discard(next(iter(dom[a])))
        if len(dom[b]) == 1:
            dom[a].discard(next(iter(dom[b])))
    return clue("notsame", [a, b], f"The one with {a} does not have {b}.",
               lambda pos: pos[a] != pos[b], prop)


def C_ladj(a, b):
    def prop(dom):
        dom[b].intersection_update({p + 1 for p in dom[a]})
        dom[a].intersection_update({p - 1 for p in dom[b]})
    return clue("ladj", [a, b], f"{a} is immediately to the left of {b}.",
               lambda pos: pos[a] + 1 == pos[b], prop)


def C_left(a, b):
    def prop(dom):
        hi = max(dom[b])
        dom[a].intersection_update({p for p in dom[a] if p < hi})
        lo = min(dom[a])
        dom[b].intersection_update({p for p in dom[b] if p > lo})
    return clue("left", [a, b], f"{a} is somewhere to the left of {b}.",
               lambda pos: pos[a] < pos[b], prop)


def C_next(a, b):
    def prop(dom):
        dom[b].intersection_update({p + d for p in dom[a] for d in (-1, 1)})
        dom[a].intersection_update({p + d for p in dom[b] for d in (-1, 1)})
    return clue("next", [a, b], f"{a} is directly next to {b}.",
               lambda pos: abs(pos[a] - pos[b]) == 1, prop)


def C_between(a, b, c):
    def pred(pos):
        return pos[b] < pos[a] < pos[c] or pos[c] < pos[a] < pos[b]
    def prop(dom):
        dom[a].intersection_update({p for p in dom[a]
                                    if any(pb < p < pc or pc < p < pb for pb in dom[b] for pc in dom[c])})
        dom[b].intersection_update({p for p in dom[b]
                                    if any(p < pa < pc or pc < pa < p for pa in dom[a] for pc in dom[c])})
        dom[c].intersection_update({p for p in dom[c]
                                    if any(pb < pa < p or p < pa < pb for pa in dom[a] for pb in dom[b])})
    return clue("between", [a, b, c], f"{a} is somewhere between {b} and {c}.", pred, prop)


def build_pool(truth):
    pool = []

    def add(cl):
        if cl["pred"](truth):
            pool.append(cl)

    if not HARD:
        for v in VALUES:
            add(clue("at", [v], f"The {v} is in position {truth[v]}.",
                     lambda pos, v=v, p=truth[v]: pos[v] == p,
                     lambda dom, v=v, p=truth[v]: dom[v].intersection_update({p})))
    for v in VALUES:
        add(C_end(v))
    for a, b in itertools.combinations(VALUES, 2):
        if CAT_OF[a] != CAT_OF[b]:
            add(C_same(a, b))
            add(C_notsame(a, b))
    for a, b in itertools.permutations(VALUES, 2):
        add(C_ladj(a, b))
        add(C_left(a, b))
        add(C_next(a, b))
    # betweenness across distinct value triples
    triples = list(itertools.permutations(VALUES, 3))
    rng.shuffle(triples)
    for a, b, c in triples[:200]:
        add(C_between(a, b, c))
    rng.shuffle(pool)
    return pool


def count_solutions(clues, limit=2):
    varlist = [(c, v) for c in CAT_NAMES for v in CATS[c]]
    by_value = {}
    for cl in clues:
        for v in cl["vals"]:
            by_value.setdefault(v, []).append(cl)
    pos, used, count = {}, {c: set() for c in CAT_NAMES}, 0

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
            if all(not (all(x in pos for x in cl["vals"]) and not cl["pred"](pos)) for cl in by_value.get(v, ())):
                bt(i + 1)
            del pos[v]
            used[c].discard(p)
            if count >= limit:
                return

    bt(0)
    return count


def propagation_solves(clues):
    """Sound propagation-only solver. Returns True iff forced/hidden singles plus
    per-clue arc reduction fully determine the solution with no guessing."""
    dom = {v: set(range(1, N + 1)) for v in VALUES}
    changed = True
    while changed:
        changed = False
        sizes = {v: len(dom[v]) for v in VALUES}
        for c in CAT_NAMES:
            vs = CATS[c]
            for v in vs:
                if len(dom[v]) == 1:
                    p = next(iter(dom[v]))
                    for u in vs:
                        if u != v:
                            dom[u].discard(p)
            for p in range(1, N + 1):
                holders = [v for v in vs if p in dom[v]]
                if len(holders) == 1:
                    dom[holders[0]] = {p}
        for cl in clues:
            cl["prop"](dom)
        if any(len(dom[v]) == 0 for v in VALUES):
            return False
        if any(len(dom[v]) != sizes[v] for v in VALUES):
            changed = True
    return all(len(dom[v]) == 1 for v in VALUES)


def make_puzzle():
    truth = {}
    for c in CAT_NAMES:
        for p, v in enumerate(rng.sample(CATS[c], N), 1):
            truth[v] = p
    clues = build_pool(truth)
    if count_solutions(clues) != 1:
        return None
    i = 0
    while i < len(clues):
        trial = clues[:i] + clues[i + 1:]
        if count_solutions(trial) == 1:
            clues = trial
        else:
            i += 1
    return truth, clues


truth, clues = None, None
for _attempt in range(400):
    res = make_puzzle()
    if res is None:
        continue
    t, cl = res
    if HARD and propagation_solves(cl):
        continue  # too easy: pure propagation cracks it
    truth, clues = t, cl
    break
if truth is None:
    raise SystemExit("generator: could not produce a puzzle (unexpected)")

rng.shuffle(clues)
solution = {str(p): {c: next(v for v in CATS[c] if truth[v] == p) for c in CAT_NAMES}
            for p in range(1, N + 1)}

lines = [
    f"There are {N} positions in a row, numbered 1 to {N} (left to right).",
    f"Each position has exactly one {', one '.join(CAT_NAMES)}.",
    "Each value below is used exactly once across the positions:",
]
for c in CAT_NAMES:
    lines.append(f"  {c}: {', '.join(CATS[c])}")
lines += ["", "Clues:"]
for n, cl in enumerate(clues, 1):
    lines.append(f"{n}. {cl['text']}")
lines += [
    "",
    "Using only the clues, determine the full assignment. Output ONLY a JSON",
    f'object mapping each position ("1".."{N}") to its ' + "{" + ", ".join(f'"{c}"' for c in CAT_NAMES) + "},",
    "with no other text. Example:",
    '{"1": {' + ", ".join(f'"{c}": "..."' for c in CAT_NAMES) + "}, \"2\": {...}}",
]

open("prompt.txt", "w").write("\n".join(lines) + "\n")
open("solution.json", "w").write(json.dumps(solution))

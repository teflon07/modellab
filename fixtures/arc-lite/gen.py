#!/usr/bin/env python3
"""Generate an ARC-lite abstraction puzzle, seeded by MODELLAB_SEED so each rep
is fresh. Shows a few input->output grid examples demonstrating a HIDDEN
transformation; the model must infer the rule and apply it to a test input.
Writes prompt.txt and solution.json (the correct test output, for verify only).

Difficulty dials (env): ARC_N grid side (default 4), ARC_COLORS (default 4,
color 0 = background), ARC_EXAMPLES (default 3; fewer = harder),
ARC_COMPOSE=1 -> the hidden rule is a composition of two transforms (harder to
induce). Compositions that collapse back to a single base transform (e.g.
rot90∘rot90=rot180, flip∘flip=identity) are rejected, so every composed puzzle
is genuinely two-step.
"""
import itertools
import json
import os
import random

N = int(os.environ.get("ARC_N", "4"))
C = int(os.environ.get("ARC_COLORS", "4"))
E = int(os.environ.get("ARC_EXAMPLES", "3"))
COMPOSE = os.environ.get("ARC_COMPOSE") == "1"
SEED = int(os.environ.get("MODELLAB_SEED", "0"))
rng = random.Random(SEED * 7919 + 1234567)


def rot90(g):
    return [list(r) for r in zip(*g[::-1])]


def rot180(g):
    return [row[::-1] for row in g[::-1]]


def rot270(g):
    return [list(r) for r in zip(*g)][::-1]


def flip_h(g):
    return [row[::-1] for row in g]


def flip_v(g):
    return g[::-1]


def transpose(g):
    return [list(r) for r in zip(*g)]


def make_recolor():
    # Permute non-background colors; background (0) fixed. Rule name carries params
    # implicitly via the examples, so the map must be induced.
    nz = list(range(1, C))
    perm = nz[:]
    rng.shuffle(perm)
    m = {0: 0}
    m.update(dict(zip(nz, perm)))
    return lambda g: [[m[v] for v in row] for row in g]


def make_shift():
    dr, dc = rng.choice([(0, 1), (1, 0), (0, -1), (-1, 0), (1, 1), (-1, -1)])
    return lambda g: [[g[(r - dr) % N][(c - dc) % N] for c in range(N)] for r in range(N)]


def gravity(g):
    out = [[0] * N for _ in range(N)]
    for c in range(N):
        col = [g[r][c] for r in range(N) if g[r][c] != 0]
        for i, v in enumerate(reversed(col)):
            out[N - 1 - i][c] = v
    return out


# Size-preserving transforms (safe to compose).
SP = [("rot90", rot90), ("rot180", rot180), ("rot270", rot270),
      ("flip_h", flip_h), ("flip_v", flip_v), ("transpose", transpose),
      ("recolor", None), ("shift", None), ("gravity", gravity)]


def pick_rule():
    name, fn = rng.choice(SP)
    if name == "recolor":
        fn = make_recolor()
    elif name == "shift":
        fn = make_shift()
    return name, fn


def rand_grid():
    return [[rng.randrange(C) for _ in range(N)] for _ in range(N)]


def covers_all_colors(grids):
    seen = set(v for g in grids for row in g for v in row)
    return all(c in seen for c in range(1, C))


def single_transform_space():
    """Every rule the base (single-transform) task can already produce: identity,
    the static geometric transforms, all recolor permutations, all shifts. A
    composition equal to any of these is not genuinely two-step."""
    cands = [lambda g: [row[:] for row in g]]  # identity
    cands += [rot90, rot180, rot270, flip_h, flip_v, transpose, gravity]
    nz = list(range(1, C))
    for perm in itertools.permutations(nz):
        m = {0: 0}
        m.update(dict(zip(nz, perm)))
        cands.append((lambda mm: (lambda g: [[mm[v] for v in row] for row in g]))(m))
    for dr, dc in [(0, 1), (1, 0), (0, -1), (-1, 0), (1, 1), (-1, -1)]:
        cands.append((lambda a, b: (lambda g: [[g[(r - a) % N][(c - b) % N] for c in range(N)] for r in range(N)]))(dr, dc))
    return cands


_SINGLE = single_transform_space()
# Independent RNG so the degeneracy probe never perturbs the main puzzle stream.
_probe_rng = random.Random(SEED * 104729 + 42)
_PROBES = [[[_probe_rng.randrange(C) for _ in range(N)] for _ in range(N)] for _ in range(8)]


def is_degenerate(rule):
    """True if `rule` behaves like some single base transform on all probe grids."""
    return any(all(rule(g) == cf(g) for g in _PROBES) for cf in _SINGLE)


def build():
    if COMPOSE:
        rule = None
        for _ in range(500):
            (n1, f1), (n2, f2) = pick_rule(), pick_rule()
            cand = lambda g, f1=f1, f2=f2: f2(f1(g))
            if not is_degenerate(cand):
                rule = cand
                break
        if rule is None:
            raise SystemExit("generator: could not build a non-degenerate composition")
    else:
        _, rule = pick_rule()
    # Example inputs; ensure the union covers every non-background color so any
    # recolor map is fully observable (otherwise the rule is under-determined).
    for _try in range(200):
        inputs = [rand_grid() for _ in range(E)]
        test = rand_grid()
        if covers_all_colors(inputs + [test]):
            break
    outputs = [rule(g) for g in inputs]
    return inputs, outputs, test, rule(test)


inputs, outputs, test, answer = build()


def render(g):
    return "\n".join(" ".join(str(v) for v in row) for row in g)


lines = [
    "You are shown example grids, each transformed by the same hidden rule.",
    "Infer the rule from the examples, then apply it to the final test input.",
    "Grids are rows of integers (0 is the background color).",
    "",
]
for i, (gi, go) in enumerate(zip(inputs, outputs), 1):
    lines += [f"Example {i} input:", render(gi), f"Example {i} output:", render(go), ""]
lines += [
    "Test input:", render(test), "",
    "Output ONLY the test output grid, as rows of space-separated integers, and",
    "nothing else.",
]

open("prompt.txt", "w").write("\n".join(lines) + "\n")
open("solution.json", "w").write(json.dumps(answer))

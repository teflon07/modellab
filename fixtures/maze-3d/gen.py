#!/usr/bin/env python3
"""Generate a 3D maze (stacked levels), seeded by MODELLAB_SEED. Tests building a
3D spatial model from serialized 2D layers plus long-horizon path tracking.

In-plane moves U/D/L/R move within the current level. '+' / '-' change level, and
are allowed ONLY at ladder cells marked 'o' (arriving at the same row/col on the
adjacent level, which is open). Writes maze.json (layers, for verify), prompt.txt
(human-readable), and solution.json (reference path). Dials: MAZE3D_N (odd side,
default 7), MAZE3D_L (levels, default 3).
"""
import json
import os
import random
from collections import deque

N = int(os.environ.get("MAZE3D_N", "7"))
L = int(os.environ.get("MAZE3D_L", "3"))
SEED = int(os.environ.get("MODELLAB_SEED", "0"))
rng = random.Random(SEED * 7919 + 1234567)


def make_layer():
    g = [["#"] * N for _ in range(N)]

    def carve(r, c):
        g[r][c] = "."
        dirs = [(-2, 0), (2, 0), (0, -2), (0, 2)]
        rng.shuffle(dirs)
        for dr, dc in dirs:
            nr, nc = r + dr, c + dc
            if 0 < nr < N - 1 and 0 < nc < N - 1 and g[nr][nc] == "#":
                g[r + dr // 2][c + dc // 2] = "."
                carve(nr, nc)

    carve(1, 1)
    return g


layers = [make_layer() for _ in range(L)]
S = (0, 1, 1)
Egoal = (L - 1, N - 2, N - 2)
layers[0][1][1] = "S"
layers[L - 1][N - 2][N - 2] = "E"

IN = {"U": (-1, 0), "D": (1, 0), "L": (0, -1), "R": (0, 1)}


def openc(z, r, c):
    return 0 <= z < L and 0 <= r < N and 0 <= c < N and layers[z][r][c] != "#"


def add_shafts(m):
    for z in range(L - 1):
        cands = [(r, c) for r in range(N) for c in range(N)
                 if layers[z][r][c] not in ("#", "S", "E") and layers[z + 1][r][c] not in ("#", "S", "E")]
        rng.shuffle(cands)
        for r, c in cands[:m]:
            layers[z][r][c] = "o"
            layers[z + 1][r][c] = "o"


def solve():
    prev = {S: None}
    q = deque([S])
    while q:
        z, r, c = q.popleft()
        if (z, r, c) == Egoal:
            path = []
            cur = (z, r, c)
            while prev[cur] is not None:
                p, mv = prev[cur]
                path.append(mv)
                cur = p
            return "".join(reversed(path))
        for mv, (dr, dc) in IN.items():
            nr, nc = r + dr, c + dc
            if openc(z, nr, nc) and (z, nr, nc) not in prev:
                prev[(z, nr, nc)] = ((z, r, c), mv)
                q.append((z, nr, nc))
        if layers[z][r][c] == "o":
            for mv, nz in (("+", z + 1), ("-", z - 1)):
                if openc(nz, r, c) and (nz, r, c) not in prev:
                    prev[(nz, r, c)] = ((z, r, c), mv)
                    q.append((nz, r, c))
    return None


path = None
for m in range(2, N):
    add_shafts(m)
    path = solve()
    if path:
        break
if path is None:
    raise SystemExit("generator: 3D maze not solvable")

open("maze.json", "w").write(json.dumps({"layers": layers, "N": N, "L": L}))
open("solution.json", "w").write(json.dumps({"path": path}))

lines = [
    f"This is a 3D maze with {L} levels, each a {N}x{N} grid. '#' wall, '.' open, 'S' start,",
    "'E' exit, 'o' a ladder connecting to the same row/column on the adjacent level(s).",
    "",
    "Moves within the current level: U = up (row-1), D = down (row+1), L = left, R = right.",
    "Level moves (allowed ONLY when standing on a ladder 'o'): '+' = go up one level,",
    "'-' = go down one level, arriving at the same row/column.",
    "You start at 'S' on level 0 and must reach 'E' on the top level.",
    "Never step onto '#' or off a level.",
    "",
    "Output ONLY the path, a single line of the characters U D L R + -, nothing else.",
    "",
]
for z in range(L):
    lines.append(f"Level {z}:")
    lines += ["".join(row) for row in layers[z]]
    lines.append("")
open("prompt.txt", "w").write("\n".join(lines) + "\n")

#!/usr/bin/env python3
"""Generate a keys-and-doors maze, seeded by MODELLAB_SEED (fresh per rep).
Doors block the only route to the exit, so the solver must plan: detour to
collect the matching key(s), in the right order, before opening each door.

Writes maze.txt (grid, also embedded in prompt.txt) and solution.json (a valid
reference path, for verify's self-test). Dials: MAZE_N (odd grid side, default
11), MAZE_KEYS (number of key/door pairs, default 1).
"""
import json
import os
import random
from collections import deque

N = int(os.environ.get("MAZE_N", "11"))
KEYS = int(os.environ.get("MAZE_KEYS", "1"))
SEED = int(os.environ.get("MODELLAB_SEED", "0"))
rng = random.Random(SEED * 7919 + 1234567)

grid = [["#"] * N for _ in range(N)]


def carve(r, c):
    grid[r][c] = "."
    dirs = [(-2, 0), (2, 0), (0, -2), (0, 2)]
    rng.shuffle(dirs)
    for dr, dc in dirs:
        nr, nc = r + dr, c + dc
        if 0 < nr < N - 1 and 0 < nc < N - 1 and grid[nr][nc] == "#":
            grid[r + dr // 2][c + dc // 2] = "."
            carve(nr, nc)


carve(1, 1)
S, E = (1, 1), (N - 2, N - 2)
grid[S[0]][S[1]] = "S"
grid[E[0]][E[1]] = "E"

MOVES = {"U": (-1, 0), "D": (1, 0), "L": (0, -1), "R": (0, 1)}
key_chars = [chr(ord("a") + i) for i in range(KEYS)]
door_chars = [chr(ord("A") + i) for i in range(KEYS)]


def cell(g, r, c):
    return g[r][c] if 0 <= r < N and 0 <= c < N else "#"


def reachable_ignifying_doors(g):
    """BFS from S treating doors (uppercase) as walls."""
    seen = {S}
    q = deque([S])
    while q:
        r, c = q.popleft()
        for dr, dc in MOVES.values():
            nr, nc = r + dr, c + dc
            ch = cell(g, nr, nc)
            if ch == "#" or ch in door_chars or (nr, nc) in seen:
                continue
            seen.add((nr, nc))
            q.append((nr, nc))
    return E in seen


def solve(g):
    """State BFS over (pos, frozenset keys). Returns a move string or None."""
    start = (S, frozenset())
    prev = {start: None}
    q = deque([start])
    while q:
        pos, keys = q.popleft()
        if pos == E:
            moves = []
            cur = (pos, keys)
            while prev[cur] is not None:
                pcur, mv = prev[cur]
                moves.append(mv)
                cur = pcur
            return "".join(reversed(moves))
        r, c = pos
        for mv, (dr, dc) in MOVES.items():
            nr, nc = r + dr, c + dc
            ch = cell(g, nr, nc)
            if ch == "#":
                continue
            if ch.isupper() and ch in door_chars and ch.lower() not in keys:
                continue
            nkeys = keys | {ch} if ch in key_chars else keys
            ns = ((nr, nc), nkeys)
            if ns not in prev:
                prev[ns] = (((r, c), keys), mv)
                q.append(ns)
    return None


open_cells = [(r, c) for r in range(N) for c in range(N) if grid[r][c] == "."]

path = None
for _attempt in range(400):
    g = [row[:] for row in grid]
    spots = rng.sample(open_cells, 2 * KEYS)
    for i in range(KEYS):
        kr, kc = spots[2 * i]
        dr_, dc_ = spots[2 * i + 1]
        g[kr][kc] = key_chars[i]
        g[dr_][dc_] = door_chars[i]
    if reachable_ignifying_doors(g):
        continue  # doors don't block the exit -> no planning required
    sol = solve(g)
    if sol:
        grid = g
        path = sol
        break

if path is None:
    raise SystemExit("generator: could not place solvable planning maze")

maze = "\n".join("".join(row) for row in grid) + "\n"
open("maze.txt", "w").write(maze)
open("solution.json", "w").write(json.dumps({"path": path}))

lines = [
    "This is a maze on a grid. '#' is a wall, '.' is open, 'S' is the start, 'E' is the exit.",
    "Lowercase letters (a, b, ...) are keys. The matching uppercase letter (A, B, ...) is a",
    "locked door. Step onto a key to pick it up. You may step onto a door ONLY if you have",
    "already picked up its matching key. Never step onto '#' or off the grid.",
    "",
    "Move one cell at a time: U = up, D = down, L = left, R = right.",
    "Find a path from S to E, collecting whatever keys you need first.",
    "",
    "Output ONLY the path as a single line of the letters U, D, L, R, nothing else.",
    "",
    "Maze:",
    maze.rstrip("\n"),
]
open("prompt.txt", "w").write("\n".join(lines) + "\n")

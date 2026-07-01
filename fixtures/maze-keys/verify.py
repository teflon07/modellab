"""Validate a keys-and-doors maze solution. Walk the model's U/D/L/R path from S,
tracking collected keys: never enter a wall or leave the grid, never enter a
locked door without its key, and end at E. Keys are picked up by stepping on them.
"""
import json
import pathlib
import re
import sys


def extract_answer(raw):
    parts = []
    for line in raw.splitlines():
        s = line.strip()
        if not s:
            continue
        try:
            o = json.loads(s)
        except json.JSONDecodeError:
            continue
        if isinstance(o, dict) and o.get("type") == "message_end":
            m = o.get("message") or {}
            if m.get("role") == "assistant":
                for b in m.get("content") or []:
                    if isinstance(b, dict) and b.get("type") == "text":
                        parts.append(b.get("text", ""))
    return "\n".join(parts) if parts else raw


grid = [list(l) for l in pathlib.Path("maze.txt").read_text().splitlines() if l]
H = len(grid)


def cell(r, c):
    return grid[r][c] if 0 <= r < H and 0 <= c < len(grid[r]) else "#"


def find(ch):
    for r in range(H):
        for c in range(len(grid[r])):
            if grid[r][c] == ch:
                return (r, c)
    raise ValueError(f"maze has no {ch}")


start, exit_ = find("S"), find("E")

resp = pathlib.Path("response.txt")
if not resp.exists():
    print("FAIL: response.txt was not written")
    sys.exit(1)
answer = extract_answer(resp.read_text())

moves = None
for line in reversed(answer.splitlines()):
    cleaned = re.sub(r"[\s,]", "", line.strip().upper())
    if cleaned and all(ch in "UDLR" for ch in cleaned):
        moves = cleaned
        break
if moves is None:
    moves = "".join(ch for ch in answer.upper() if ch in "UDLR")
if not moves:
    print("FAIL: no U/D/L/R path found in the answer")
    sys.exit(1)

DELTA = {"U": (-1, 0), "D": (1, 0), "L": (0, -1), "R": (0, 1)}
r, c = start
keys = set()
for i, m in enumerate(moves, 1):
    dr, dc = DELTA[m]
    r, c = r + dr, c + dc
    ch = cell(r, c)
    if ch == "#":
        print(f"FAIL: move {i}/{len(moves)} ({m}) walks into a wall at ({r},{c})")
        sys.exit(1)
    if ch.isalpha() and ch.isupper() and ch not in ("S", "E") and ch.lower() not in keys:
        print(f"FAIL: move {i}/{len(moves)} enters locked door {ch} without key {ch.lower()}")
        sys.exit(1)
    if ch.isalpha() and ch.islower():
        keys.add(ch)
if (r, c) != exit_:
    print(f"FAIL: path ends at ({r},{c}); the exit is at {exit_}")
    sys.exit(1)

print(f"ok: reached exit in {len(moves)} moves with keys {sorted(keys)}")

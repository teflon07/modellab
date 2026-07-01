"""Validate a 3D-maze solution. Walk the model's path (U/D/L/R in-plane, + / -
between levels at ladder 'o' cells) from S; every step must stay in bounds and
off walls, level changes only from a ladder, and the path must reach E."""
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


data = json.loads(pathlib.Path("maze.json").read_text())
layers, N, L = data["layers"], data["N"], data["L"]


def cell(z, r, c):
    if 0 <= z < L and 0 <= r < N and 0 <= c < N:
        return layers[z][r][c]
    return "#"


def find(ch):
    for z in range(L):
        for r in range(N):
            for c in range(N):
                if layers[z][r][c] == ch:
                    return (z, r, c)
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
    if cleaned and all(ch in "UDLR+-" for ch in cleaned):
        moves = cleaned
        break
if moves is None:
    moves = "".join(ch for ch in answer.upper() if ch in "UDLR+-")
if not moves:
    print("FAIL: no path (U/D/L/R/+/-) found in the answer")
    sys.exit(1)

IN = {"U": (-1, 0), "D": (1, 0), "L": (0, -1), "R": (0, 1)}
z, r, c = start
for i, m in enumerate(moves, 1):
    if m in IN:
        dr, dc = IN[m]
        z, r, c = z, r + dr, c + dc
    else:
        if cell(z, r, c) != "o":
            print(f"FAIL: move {i}/{len(moves)} ({m}) changes level but not on a ladder 'o'")
            sys.exit(1)
        z = z + 1 if m == "+" else z - 1
    if cell(z, r, c) == "#":
        print(f"FAIL: move {i}/{len(moves)} ({m}) enters a wall/void at level {z} ({r},{c})")
        sys.exit(1)
if (z, r, c) != exit_:
    print(f"FAIL: path ends at {(z, r, c)}; the exit is at {exit_}")
    sys.exit(1)

print(f"ok: reached exit in {len(moves)} moves")

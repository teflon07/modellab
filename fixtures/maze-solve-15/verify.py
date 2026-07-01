"""Validate a single-shot maze solution. The model's answer arrives in
response.txt (raw pi stdout: JSONL when --mode json, or plain text). We extract
the assistant's text, pull the path (a line of U/D/L/R moves), and walk it: every
step must stay in bounds and off walls, and the path must end at the exit."""
import json
import pathlib
import re
import sys


def extract_answer(raw):
    """Return the assistant's text. Handles pi's JSONL stream (concatenate the
    text blocks of assistant message_end events) and falls back to raw plain text."""
    parts = []
    saw_json = False
    for line in raw.splitlines():
        s = line.strip()
        if not s:
            continue
        try:
            o = json.loads(s)
        except json.JSONDecodeError:
            continue
        saw_json = True
        if isinstance(o, dict) and o.get("type") == "message_end":
            m = o.get("message") or {}
            if m.get("role") == "assistant":
                for b in m.get("content") or []:
                    if isinstance(b, dict) and b.get("type") == "text":
                        parts.append(b.get("text", ""))
    return "\n".join(parts) if saw_json else raw


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


start = find("S")
exit_ = find("E")

resp = pathlib.Path("response.txt")
if not resp.exists():
    print("FAIL: response.txt not written")
    sys.exit(1)
answer = extract_answer(resp.read_text())

# The path is the last line that is only move letters (+ spaces/commas); else all
# U/D/L/R letters found anywhere in the answer.
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
for i, m in enumerate(moves, 1):
    dr, dc = DELTA[m]
    r, c = r + dr, c + dc
    if cell(r, c) == "#":
        print(f"FAIL: move {i}/{len(moves)} ({m}) walks into a wall at ({r},{c})")
        sys.exit(1)
if (r, c) != exit_:
    print(f"FAIL: path ends at ({r},{c}); the exit is at {exit_}")
    sys.exit(1)

print(f"ok: reached exit in {len(moves)} moves")

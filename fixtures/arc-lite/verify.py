"""Check an ARC-lite answer: parse the model's output grid (from response.txt,
JSONL or plain) and compare it exactly to the generated solution grid."""
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


def parse_grid(text):
    """Return the last rectangular block of integer rows in the text."""
    blocks, cur = [], []
    for line in text.splitlines():
        toks = line.strip().replace(",", " ").split()
        if toks and all(re.fullmatch(r"-?\d+", t) for t in toks):
            cur.append([int(t) for t in toks])
        elif cur:
            blocks.append(cur)
            cur = []
    if cur:
        blocks.append(cur)
    for b in reversed(blocks):
        w = len(b[0])
        if all(len(r) == w for r in b):
            return b
    return None


sol = json.loads(pathlib.Path("solution.json").read_text())
resp = pathlib.Path("response.txt")
if not resp.exists():
    print("FAIL: response.txt was not written")
    sys.exit(1)

ans = parse_grid(extract_answer(resp.read_text()))
if ans is None:
    print("FAIL: no integer grid found in the answer")
    sys.exit(1)
if ans != sol:
    print(f"FAIL: output grid mismatch (got {len(ans)}x{len(ans[0])}, expected {len(sol)}x{len(sol[0])})")
    sys.exit(1)
print("ok")

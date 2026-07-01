"""Check a logic-grid answer against the generated unique solution. The model's
answer (JSONL or plain in response.txt) must contain a JSON object mapping each
position to its color/pet/drink; every cell must match the solution."""
import json
import pathlib
import sys


def extract_answer(raw):
    # If raw is pi's JSONL stream, pull the assistant message_end text block(s).
    # Otherwise (a plain-text/plain-JSON answer), fall back to the raw text.
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


def find_json(text):
    candidates = []
    if "```" in text:
        for block in text.replace("```json", "```").split("```"):
            block = block.strip()
            if block.startswith("{"):
                candidates.append(block)
    first, last = text.find("{"), text.rfind("}")
    if first != -1 and last > first:
        candidates.append(text[first:last + 1])
    for c in candidates:
        try:
            return json.loads(c)
        except json.JSONDecodeError:
            continue
    return None


sol = json.loads(pathlib.Path("solution.json").read_text())
resp = pathlib.Path("response.txt")
if not resp.exists():
    print("FAIL: response.txt was not written")
    sys.exit(1)

ans = find_json(extract_answer(resp.read_text()))
if not isinstance(ans, dict):
    print("FAIL: no JSON assignment object found in the answer")
    sys.exit(1)

errs = []
for pos, attrs in sol.items():
    got = ans.get(pos)
    if not isinstance(got, dict):
        errs.append(f"position {pos} missing")
        continue
    for cat, val in attrs.items():
        if str(got.get(cat, "")).strip().lower() != val.lower():
            errs.append(f"pos {pos} {cat}: got {got.get(cat)!r}, expected {val!r}")

if errs:
    print("FAIL: " + "; ".join(errs[:6]))
    sys.exit(1)
print("ok")

"""Rule-based extraction checker. Validates the transformation (right schema,
emails drawn from the input, city has no state/punctuation, two-word Title-case
names) rather than comparing to a stored answer, so it can't be gamed by copying
a file out of the sandbox."""
import json
import pathlib
import re
import sys

inp = pathlib.Path("input.txt").read_text()
emails_in = set(re.findall(r"[\w.]+@[\w.]+", inp))

p = pathlib.Path("result.json")
if not p.exists():
    print("FAIL: result.json was not written")
    sys.exit(1)

try:
    rows = json.loads(p.read_text())
except Exception as e:  # noqa: BLE001
    print(f"FAIL: result.json is not valid JSON: {e}")
    sys.exit(1)

errs = []
if not isinstance(rows, list) or len(rows) != 3:
    n = rows if not isinstance(rows, list) else len(rows)
    errs.append(f"expected a list of 3 records, got {n}")
    rows = rows if isinstance(rows, list) else []

seen = set()
for i, r in enumerate(rows):
    if not isinstance(r, dict) or set(r) != {"name", "city", "email"}:
        errs.append(f"row {i}: keys must be exactly name, city, email")
        continue
    if r["email"] not in emails_in:
        errs.append(f"row {i}: email {r['email']!r} is not in the input")
    seen.add(r["email"])
    if re.search(r"\b[A-Z]{2}\b", str(r["city"])) or re.search(r"[,|]", str(r["city"])):
        errs.append(f"row {i}: city {r['city']!r} still has a state or punctuation")
    toks = str(r["name"]).split()
    if len(toks) != 2 or not all(t[:1].isupper() for t in toks):
        errs.append(f"row {i}: name {r['name']!r} is not two Title-case words")

if rows and seen != emails_in:
    errs.append(f"emails covered {sorted(seen)} != input emails {sorted(emails_in)}")

if errs:
    print("FAIL: " + "; ".join(errs))
    sys.exit(1)

print("ok")

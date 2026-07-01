"""Recomputes the expected margins from financials.json and compares to
answer.json within tolerance. Nothing to copy: the ground truth is derived from
the same inputs the model is given."""
import json
import pathlib
import sys

f = json.loads(pathlib.Path("financials.json").read_text())
rev = f["revenue"]
expected = {
    "gross_margin": (rev - f["cogs"]) / rev,
    "operating_margin": (rev - f["cogs"] - f["operating_expenses"]) / rev,
}

p = pathlib.Path("answer.json")
if not p.exists():
    print("FAIL: answer.json was not written")
    sys.exit(1)

try:
    got = json.loads(p.read_text())
except Exception as e:  # noqa: BLE001
    print(f"FAIL: answer.json is not valid JSON: {e}")
    sys.exit(1)

errs = []
for k, want in expected.items():
    if k not in got:
        errs.append(f"missing key {k}")
        continue
    try:
        val = float(got[k])
    except (TypeError, ValueError):
        errs.append(f"{k} is not numeric: {got[k]!r}")
        continue
    if abs(val - want) > 1e-4:
        errs.append(f"{k} = {val}, expected {want:.4f}")

if errs:
    print("FAIL: " + "; ".join(errs))
    sys.exit(1)

print("ok")

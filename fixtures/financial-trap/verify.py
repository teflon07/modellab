"""Recomputes the operating-basis margins (one-time gain excluded) from the same
inputs the model sees and compares answer.json within tolerance. A model that
ignores the note computes ~0.571 / ~0.357 instead of 0.52 / 0.28 and fails."""
import json
import pathlib
import sys

f = json.loads(pathlib.Path("financials.json").read_text())
op_rev = f["total_revenue"] - f["one_time_gain"]
expected = {
    "gross_margin": (op_rev - f["cost_of_goods_sold"]) / op_rev,
    "operating_margin": (op_rev - f["cost_of_goods_sold"] - f["operating_expenses"]) / op_rev,
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
    if abs(val - want) > 1e-3:
        errs.append(f"{k} = {val}, expected {want:.4f} (did you exclude the one-time gain?)")

if errs:
    print("FAIL: " + "; ".join(errs))
    sys.exit(1)

print("ok")

"""Battery for the expression evaluator, plus an anti-shortcut guard: the source
may not call eval/exec/literal_eval or use numexpr. Division by zero and every
malformed input must raise ValueError specifically (not ZeroDivisionError etc.)."""
import pathlib
import re
import sys

src = pathlib.Path("evaluator.py").read_text()
if re.search(r"\b(eval|exec|literal_eval)\s*\(", src) or "numexpr" in src:
    print("FAIL: implement the parser yourself (no eval/exec/literal_eval/numexpr)")
    sys.exit(1)

from evaluator import evaluate

VALUE = [
    ("1", 1.0), ("1+2", 3), ("2+3*4", 14), ("(2+3)*4", 20), ("10/4", 2.5),
    ("-3", -3), ("-3+-4", -7), ("2*-3", -6), (" 1 + 2 * 3 ", 7), ("((1))", 1),
    ("2*(3+4)-5", 9), ("1-2-3", -4), ("8/2/2", 2), ("3.5*2", 7.0), ("-(3+4)", -7),
]
ERROR = ["", "   ", "1+", "*3", "(1+2", "1+2)", "1 2", "1/0", "1+*2", "abc"]

errs = []
for expr, want in VALUE:
    try:
        got = evaluate(expr)
    except Exception as e:  # noqa: BLE001
        errs.append(f"{expr!r} raised {type(e).__name__}, expected {want}")
        continue
    if abs(got - want) > 1e-9:
        errs.append(f"{expr!r} = {got}, expected {want}")

for expr in ERROR:
    try:
        got = evaluate(expr)
        errs.append(f"{expr!r} returned {got}, expected ValueError")
    except ValueError:
        pass
    except Exception as e:  # noqa: BLE001
        errs.append(f"{expr!r} raised {type(e).__name__}, expected ValueError")

if errs:
    print("FAIL: " + "; ".join(errs[:6]))
    sys.exit(1)
print("ok")

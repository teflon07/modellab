"""Exercises both bugs and their coupling: the expected net depends on the
sign fix AND cent-level rounding, so fixing only one bug still fails."""
import sys

from budget import net, parse_amount


def check(label, got, want, tol=1e-9):
    if abs(got - want) > tol:
        print(f"FAIL: {label} = {got}, expected {want}")
        sys.exit(1)


check("parse_amount('$1,200.50')", parse_amount("$1,200.50"), 1200.50)
check("parse_amount('(300)')", parse_amount("(300)"), -300.0)
check("parse_amount('$0')", parse_amount("$0"), 0.0)
check("parse_amount('($1,000.99)')", parse_amount("($1,000.99)"), -1000.99)

# 1200.50 - 300 + 99.49 = 999.99  (needs both the sign fix and cent rounding)
check("net([...])", net(["$1,200.50", "(300)", "$99.49"]), 999.99)

print("ok")

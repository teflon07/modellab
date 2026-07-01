"""Behavioral check for rolling_mean. Exits non-zero (loudly) on any wrong result."""
import sys

from stats import rolling_mean


def approx(a, b, tol=1e-9):
    return len(a) == len(b) and all(abs(x - y) <= tol for x, y in zip(a, b))


CASES = [
    (([1, 2, 3, 4], 2), [1.5, 2.5, 3.5]),
    (([2, 4, 6, 8, 10], 3), [4.0, 6.0, 8.0]),
    (([5], 1), [5.0]),
    (([10, 0, 10, 0], 4), [5.0]),
]

for (xs, w), expected in CASES:
    got = rolling_mean(xs, w)
    if not approx(got, expected):
        print(f"FAIL: rolling_mean({xs}, {w}) = {got}, expected {expected}")
        sys.exit(1)

print("ok")

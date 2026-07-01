"""Semver precedence battery (the pre-release rules are where weaker
implementations break), plus an anti-shortcut guard against importing a
semver/packaging library. compare must return exactly -1/0/1."""
import pathlib
import re
import sys

src = pathlib.Path("semver.py").read_text()
if re.search(r"(import\s+(semver|packaging)|from\s+(semver|packaging|pkg_resources))", src):
    print("FAIL: implement the comparison yourself (no semver/packaging libraries)")
    sys.exit(1)

from semver import compare

CASES = [
    ("1.0.0", "2.0.0", -1), ("2.1.0", "2.0.9", 1), ("1.0.0", "1.0.0", 0),
    ("2.0.0", "1.0.0", 1),
    ("1.0.0-alpha", "1.0.0", -1), ("1.0.0", "1.0.0-alpha", 1),
    ("1.0.0-alpha", "1.0.0-alpha.1", -1),
    ("1.0.0-alpha.1", "1.0.0-alpha.beta", -1),
    ("1.0.0-alpha.beta", "1.0.0-beta", -1),
    ("1.0.0-beta", "1.0.0-beta.2", -1),
    ("1.0.0-beta.2", "1.0.0-beta.11", -1),
    ("1.0.0-beta.11", "1.0.0-rc.1", -1),
    ("1.0.0-rc.1", "1.0.0", -1),
    ("1.0.0+build", "1.0.0", 0),
    ("1.0.0-alpha+001", "1.0.0-alpha+999", 0),
    ("1.2.3+a", "1.2.3+b", 0),
]
ERROR = [("1.0", "1.0.0"), ("1.0.0", "x.0.0"), ("", "1.0.0"), ("1.0.0-", "1.0.0")]

errs = []
for a, b, want in CASES:
    try:
        got = compare(a, b)
    except Exception as e:  # noqa: BLE001
        errs.append(f"compare({a!r},{b!r}) raised {type(e).__name__}")
        continue
    if got != want:
        errs.append(f"compare({a!r},{b!r}) = {got}, expected {want}")

for a, b in ERROR:
    try:
        compare(a, b)
        errs.append(f"compare({a!r},{b!r}) should raise ValueError")
    except ValueError:
        pass
    except Exception as e:  # noqa: BLE001
        errs.append(f"compare({a!r},{b!r}) raised {type(e).__name__}, want ValueError")

if errs:
    print("FAIL: " + "; ".join(errs[:6]))
    sys.exit(1)
print("ok")

"""Behavioral check with a trap: a healthy run whose detail mentions "0 errors"
must stay OK (kills the naive lower-case string scan), and a genuinely failed
task worded in lower case must be caught (kills the shipped upper-case scan).
The only robust fix is to honor the structured `ok` flag."""
import sys

from runner import summarize

# Case 1: every task succeeded; one legitimately mentions "0 errors".
ok_run = [
    ("expire", True, "expired 4 memories"),
    ("reindex", True, "reindex complete, 0 errors"),
    ("embed", True, "embedded 21 memories"),
]
line, code = summarize(ok_run)
if code != 0 or "OK" not in line or "FAILED" in line:
    print(f"FAIL: an all-OK run must be OK/exit 0, got {line!r} / exit {code}")
    sys.exit(1)

# Case 2: one task failed, worded in lower case.
bad_run = [
    ("expire", True, "expired 4 memories"),
    ("dream", False, "maint error: disk full"),
    ("embed", True, "embedded 21 memories"),
]
line, code = summarize(bad_run)
if code == 0 or "FAILED" not in line:
    print(f"FAIL: a run with a failed task must be FAILED/exit non-zero, got {line!r} / exit {code}")
    sys.exit(1)

print("ok")

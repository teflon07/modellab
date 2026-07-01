"""Nightly maintenance runner. Each task reports a structured result:
    (name, ok, detail)
where `ok` is the real success flag and `detail` is a human-readable note."""


def summarize(results):
    """Build the run report and decide the overall run status.

    Args:
        results: list of (name: str, ok: bool, detail: str) tuples.
    Returns:
        (status_line: str, exit_code: int)
    """
    lines = [f"{name}: {detail}" for name, ok, detail in results]
    report = "\n".join(lines)
    # BUG: infers failure by scanning the human-readable report for "ERROR".
    # Real task failures are worded in lower case ("maint error: ..."), so they
    # slip through and the run is reported OK. Meanwhile a healthy task whose
    # detail happens to mention errors ("0 errors") would be misread by a naive
    # lower-case scan. The structured `ok` flag is the actual signal, and it is
    # ignored here.
    if "ERROR" in report:
        return ("status: FAILED", 1)
    return ("status: OK", 0)

def parse_amount(s):
    """Parse an accounting-style amount into a float.
    Examples: '$1,200.50' -> 1200.50, '(300)' -> -300.0, '$0' -> 0.0.
    Parentheses denote a negative amount."""
    s = s.strip()
    neg = s.startswith("(") and s.endswith(")")
    s = s.strip("()").replace("$", "").replace(",", "")
    val = float(s)
    return val  # BUG 1: the parentheses-negative flag `neg` is never applied


def net(entries):
    """Sum a list of amount strings and return the total rounded to cents."""
    total = 0.0
    for e in entries:
        total += parse_amount(e)
    return round(total)  # BUG 2: rounds to whole units, not to cents

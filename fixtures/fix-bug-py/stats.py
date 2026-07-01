def rolling_mean(xs, window):
    """Mean of each contiguous window of length `window` over the list `xs`."""
    out = []
    for i in range(len(xs) - window + 1):
        chunk = xs[i:i + window - 1]  # BUG: window is one element short
        out.append(sum(chunk) / len(chunk))
    return out

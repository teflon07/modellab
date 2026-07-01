def compare(a, b):
    """Compare two semantic-version strings per semver.org precedence.
    Return -1 if a < b, 0 if equal, 1 if a > b.

    Rules:
      - Compare major.minor.patch numerically.
      - A version WITH a pre-release has LOWER precedence than the same
        version WITHOUT one (1.0.0-alpha < 1.0.0).
      - Pre-release identifiers are compared left to right: numeric identifiers
        compared numerically and rank LOWER than alphanumeric ones; alphanumeric
        identifiers compared lexically by ASCII; if all preceding identifiers are
        equal, the version with MORE fields has higher precedence.
      - Build metadata ("+...") is ignored entirely.
      - Raise ValueError on malformed input (not exactly major.minor.patch,
        non-numeric core, empty pre-release identifier, etc.).

    Implement the comparison yourself. Do not import a semver/packaging library.
    """
    raise NotImplementedError

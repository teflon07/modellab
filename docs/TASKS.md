# Task catalog — what each benchmark tests

modellab has two families of tasks:

1. **Cost/efficiency tasks** — realistic work (coding, extraction, writing,
   finance), run *agentically* with tools. These mostly saturate on capability at
   the frontier, so their signal is **cost/tokens/latency per success** ("which
   model is the cheapest that can do my routine work").
2. **Capability probes** — abstract reasoning tasks run **single-shot with no
   tools**, so the model must reason in-context rather than write a solver. Each
   is **generated fresh per rep** (seeded by rep) so it measures *generalization
   across instances*, not consistency on one. Each is **deterministically scored**
   and **difficulty-dialable**, so we can scale until the frontier separates.

Shared design rules: deterministic verifiers (no LLM judge except where noted);
verifiers are shortcut-proof (rule-based, recomputed, or checking a hidden
solution the model can't see); every fixture has a self-test in
`harness/test/fixtures.test.ts` proving verify fails on wrong/partial output and
passes only on a correct one.

---

## Family 1 — cost/efficiency (agentic, real work)

| Task | What it tests | Scoring |
|---|---|---|
| `extract-json` | schema-shaped output (smoke placeholder) | programmatic |
| `extract-records` | pull structured records from messy text | rule-based |
| `extract-messy` | extraction with adversarial noise: dedup, drop malformed, null-fill, strip state codes | rule-based |
| `summarize-changelog` | faithful summarization (no fabrication) | LLM judge |
| `style-constraints` | follow house style: no em dashes, no honorific periods, American spelling | rule-based |
| `fix-failing-test` | fix a TypeScript bug so `bun test` passes | programmatic |
| `fix-bug-py` | fix a single Python off-by-one | programmatic |
| `financial-metric` | apply a given margin formula, emit JSON | recomputed |

**Hard-ceiling coding** (traps that a naive/weaker approach fails, to split the frontier):

| Task | What it tests | Scoring |
|---|---|---|
| `fix-multibug-py` | two *coupled* bugs; fixing only one still fails | programmatic |
| `fix-status-detection` | (real memory-dream bug) infer success from a structured `ok` flag, not a string scan; trap: a healthy "0 errors" task must not be flagged | programmatic |
| `financial-trap` | exclude a one-time gain from operating margins (recomputed) | recomputed |
| `expr-eval` | implement a recursive-descent arithmetic evaluator to spec; anti-`eval` guard | programmatic |
| `semver-compare` | semver.org precedence incl. pre-release rules | programmatic |
| `fix-lru` | LRU cache with two bugs (recency-on-read + off-by-one capacity) | programmatic |

**Finding:** deterministic, well-specified coding is a *cost race* — even Haiku
4.5 aces `expr-eval`/`semver-compare`/`fix-lru`. On this family the buy is the
cheapest reliable model (Haiku/GPT-5.5); Opus's premium is not justified here.

---

## Family 2 — capability probes (single-shot, generated, faculty-mapped)

The probes map to distinct reasoning faculties. A model can be strong on one and
weak on another, so the *profile* matters more than any single "intelligence"
score.

### Execution — apply a defined procedure over many dependent steps without drift
| Task | What it tests | Dials |
|---|---|---|
| `maze-solve` (11/15/21) | track position along a path of up to ~96 moves; error compounds with length | grid size |
| `maze-3d` / `maze-3d-hard` | build a 3D model from stacked 2D layers; cross-level moves at ladder cells | levels, size |

**Scoring:** simulate the emitted U/D/L/R(+/-) path; every step must stay off
walls and in bounds; must reach the exit.

**Finding:** the discriminating axis at the frontier. Short mazes saturate; at 96
moves the models spread hard — **Fable 5 100%, Opus 4.8 80%, Sonnet 5 0%**
(Sonnet's per-step reliability doesn't survive ~100 compounding steps). This is
the faculty that predicts long-horizon *agentic* reliability.

### Planning — construct an ordering under dependencies
| Task | What it tests | Dials |
|---|---|---|
| `maze-keys` / `maze-keys-hard` | doors block the exit; detour to collect the matching key(s) first, in order | #key/door pairs, size |

**Scoring:** walk the path tracking collected keys; entering a locked door without
its key fails. The generator guarantees the maze is solvable *with* keys and
unsolvable with doors as walls, so keys genuinely force planning.

### Deduction — infer what must be true from constraints
| Task | What it tests | Dials |
|---|---|---|
| `logic-grid` / `logic-grid-5` / `logic-grid-hard` | Zebra-style constraint satisfaction; propagate clues, eliminate, converge to the unique answer | N (entities), K (categories), search-required filter |

**Scoring:** compare the emitted JSON assignment to the generated unique solution.
`logic-grid-hard` keeps only puzzles that *pure constraint propagation cannot
solve* (they require search/backtracking) and uses relational-only clues +
abstract tokens.

**Finding:** deduction *looks* solved but isn't — the gap was hidden by easy
puzzles. On propagation-solvable puzzles (N=4, and N=5/K=5) the whole frontier is
~100% (Haiku 90%). But `logic-grid-hard`, which keeps only puzzles that **require
search/backtracking**, separates them: **Fable 100%, Opus 100%, GPT-5.5 90%,
GLM 90%, Sonnet 80%** (Haiku pending). The difficulty lever that matters is *required
inference depth*, not board size — the deduction analog of path length for the
maze. And the ordering echoes execution: Sonnet is the weakest of the frontier
once the task is pushed.

### Abstraction — infer the rule itself from examples, then apply it
| Task | What it tests | Dials |
|---|---|---|
| `arc-lite` / `arc-lite-hard` | ARC-style induction: infer a hidden grid transform from 3 examples, apply to a test input | grid size, #examples, rule composition |

**Scoring:** parse the emitted output grid, compare exactly to the computed
answer. `arc-lite-hard` composes two transforms (harder to induce).

---

## The intelligence picture so far

| Faculty | Does it separate the frontier? | Notes |
|---|---|---|
| Execution (long-horizon) | **Yes, at scale** | 96-move maze: Fable 100 / Opus 80 / Sonnet 0 |
| Deduction | **Only when search-required** | easy & Zebra-scale saturate (~100%); search-required tier: Fable/Opus 100 > GPT-5.5 90 > Sonnet 80 |
| Abstraction | *pending run* | expected to separate most (frontier weakest here) |
| Planning | *pending run* | |
| 3D representation | *pending run* | |

Two headline reads:
- **Difficulty must be calibrated per faculty.** Every faculty saturates on easy
  instances; the signal appears only when you push the *right* lever — path length
  for execution, required search depth for deduction. Both then reveal the same
  frontier ordering.
- **The profile, not a scalar, is the truth**, and it's consistent across hard
  axes: **Sonnet 5 is the weakest of the frontier when pushed** (0% at 96-move
  execution, 80% on search-required deduction), while **Fable and Opus are the
  robust pair** on both and GPT-5.5 sits between. Haiku trails on execution but is
  a competent deducer.

---

## Headline results (pass · median tokens · estimated $/success)

Estimated cost is list-price notional: pi prices each run at the model's public
per-token list rate, summed over all reps and divided by successes. It surfaces
the price spread the token counts hide (Fable is $10/$50 per Mtok; Haiku/GLM are
an order of magnitude cheaper). GPT-5.5's figure is a floor — its reasoning
tokens may not be fully counted.

**Execution — maze-solve across sizes (10 reps each; pass% · est. $/success)**

Path length is the difficulty dial. Everyone clears the short maze; the frontier
separates only as the path grows and per-step error compounds.

| Model | 11×11 (44-move) | 15×15 (72-move) | 21×21 (96-move) |
|---|---|---|---|
| Fable 5 | 100% · $0.09 | 100% · $0.25 | **100% · $0.59** |
| Opus 4.8 | 100% · $0.11 | 100% · $0.33 | **80% · $0.61** |
| Sonnet 5 | 100% · $0.08 | 100% · $0.20 | **0% · —** |
| GPT-5.5 | 100% · $0.04 | 80% · $0.12 | not run |
| GLM 5.2 | 60% · $0.02 | not run | not run |
| Haiku 4.5 | 10% · $0.35 | not run | not run |

At 44 moves every frontier model is perfect (GLM/Haiku already trail); at 72 the
first crack shows (GPT-5.5 → 80%); at 96 only Fable holds 100%, Opus drops to 80%,
and Sonnet collapses to 0%. Gaps marked "not run" are open cells (GPT-5.5 at 96;
GLM/Haiku beyond 44) — cheap to fill.

**Deduction — logic-grid-hard (search-required 5×5), 10 reps**

| Model | Pass | Tokens (med) | Est. $/success |
|---|---|---|---|
| Fable 5 | 100% | 4.5K | $0.24 |
| Opus 4.8 | 100% | 10.7K | $0.26 |
| GPT-5.5 | 90% | 5.2K | $0.16 |
| GLM 5.2 | 90% | 9.0K | **$0.03** |
| Sonnet 5 | 80% | 8.5K | $0.12 |
| Haiku 4.5 | *pending* | | |

**Cost inverts the capability ranking.** On deduction, GLM 5.2 solves 90% at
~$0.03/success — an order of magnitude cheaper than the Anthropic frontier — and
among the perfect scorers Fable ($0.24) edges Opus ($0.26). So "best" depends on
the axis: **capability → Fable/Opus; value → GLM (deduction), Fable (execution).**

---

## Methodology & caveats

- **Single-shot, no tools** for probes: measures reasoning, not the ability to
  write a solver (which would saturate everything).
- **Per-rep generation** (logic-grid, arc-lite, maze-keys, maze-3d) = a fresh
  instance each rep, so results are *generalization*, not consistency on one
  board. The fixed mazes (`maze-solve*`) are the exception (same maze each rep =
  consistency); randomizing them is a known TODO.
- **Compounding-error scaling:** execution difficulty is path length (success ≈
  per-step-reliability ^ steps), which is why only long mazes separate models.
- **n = 10** per cell; pass rates carry a 95% Wilson interval. Overlapping
  intervals mean "tied," not "ranked."
- **Cross-harness / hidden reasoning tokens:** GPT-5.5 runs via a different path
  and its reasoning tokens may not be fully counted, so its cost is a floor.

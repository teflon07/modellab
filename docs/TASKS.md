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

**3D finding (`maze-3d`, 2026-07):** the baseline (3 stacked 9×9 levels, ~22-move
paths) saturates the top tier — **Fable 100%, Opus 100%, Sonnet 80%, GPT-5.5 50%,
Haiku 10%**. Note the existing `maze-3d-hard` (4×11×11) is *not* meaningfully
harder: its median path is ~21 moves, essentially the baseline — its only added
load is parsing 4 grids. The real lever is path length, so we added graduated
rungs `maze-3d-15x6` (6×15×15, ~67-move) and `maze-3d-19x7` (7×19×19, ~132-move).
At **15×6: Fable 90%, Sonnet 80%, Opus 60%, GPT-5.5 100%** (Anthropic run
single-shot; GPT via Codex/ChatGPT-OAuth, unthrottled). The **19×7** rung
is being re-run serially — the first attempt ran three Anthropic models
concurrently and self-inflicted HTTP 429s (see Methodology), invalidating those
cells; GPT-5.5 (separate rate bucket) hit 100% there. *19×7 Anthropic numbers
pending the serial re-run.*

### Planning — construct an ordering under dependencies
| Task | What it tests | Dials |
|---|---|---|
| `maze-keys` / `maze-keys-hard` | doors block the exit; detour to collect the matching key(s) first, in order | #key/door pairs, size |

**Scoring:** walk the path tracking collected keys; entering a locked door without
its key fails. The generator guarantees the maze is solvable *with* keys and
unsolvable with doors as walls, so keys genuinely force planning.

**Finding (`maze-keys`, 11×11 / 1 key, 2026-07):** planning separates the field
cleanly — **Fable 100%, Sonnet 100%, Opus 90%, GPT-5.5 40%, Haiku 20%.** The one
Opus miss was an off-by-one column wall-collision (correct plan — it detoured for
the key first — but a cell-counting slip mid-path), i.e. an *execution* error on a
correct plan, not a planning failure. GPT-5.5 and Haiku drop hard here, in
contrast to their relative strength on 3D execution.

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
GLM 90%, Sonnet 80%, Haiku 50%**. The difficulty lever that matters is *required
inference depth*, not board size — the deduction analog of path length for the
maze. And the ordering echoes execution: Sonnet is the weakest of the frontier
once the task is pushed.

### Abstraction — infer the rule itself from examples, then apply it
| Task | What it tests | Dials |
|---|---|---|
| `arc-lite` / `arc-lite-hard` | ARC-style induction: infer a hidden grid transform from 3 examples, apply to a test input | grid size, #examples, rule composition |

**Scoring:** parse the emitted output grid, compare exactly to the computed
answer. `arc-lite-hard` composes two transforms (harder to induce).

**Finding (2026-07):** the single-transform baseline `arc-lite` (4×4) is fully
saturated — **all five real models 100%** (GLM excluded, see caveats) — so it
gives no signal. Composition is the lever: `arc-lite-hard` separates the field to
**Fable 100%, GPT-5.5 80%, Opus 80%, Sonnet 70%, Haiku 10%**, with a ~3.4×
token jump (Fable 1.3K → 4.4K) confirming real induction rather than pattern
match. Fable is the lone model still at 100%.

*Fixture bug fixed to make this real (commit `1ae362b`):* `arc-lite-hard` picked
two transforms independently and composed them, but ~42% of pairs collapsed back
into a single base transform (rot90∘rot90=rot180, flip∘flip=identity), 7.4% all
the way to identity — i.e. nearly half the "hard" reps were secretly the easy
tier. The generator now rejects any composition functionally equal to a single
base transform, so every composed puzzle is genuinely two-step. **Lesson: when a
hard tier is built by composing operations, verify the composition doesn't
collapse into the easy tier's operation set.**

---

## The intelligence picture so far

| Faculty | Does it separate the frontier? | Notes |
|---|---|---|
| Execution (long-horizon) | **Yes, at scale** | 96-move maze: Fable 100 / GPT-5.5 90 / Opus 80 / Sonnet 0 |
| Deduction | **Only when search-required** | easy & Zebra-scale saturate (~100%); search-required tier: Fable/Opus 100 > GPT-5.5/GLM 90 > Sonnet 80 > Haiku 50 |
| Abstraction | **Only when composed** | single transform saturates (all 100%); 2-composition: Fable 100 > GPT-5.5/Opus 80 > Sonnet 70 > Haiku 10 |
| Planning | **Yes** | maze-keys: Fable/Sonnet 100 > Opus 90 > GPT-5.5 40 > Haiku 20 |
| 3D representation | **Yes, with path length** | 9×9×3 saturates top tier (Fable/Opus 100); 15×6 (~67-move): Fable 90 > Sonnet 80 > Opus 60, GPT-5.5 100; 19×7 re-run pending |

Two headline reads:
- **Difficulty must be calibrated per faculty.** Every faculty saturates on easy
  instances; the signal appears only when you push the *right* lever — path length
  for execution, required search depth for deduction. Both then reveal the same
  frontier ordering.
- **The profile, not a scalar, is the truth.** **Fable 5 is the all-rounder** —
  100% or top on every faculty, at the lowest token cost. **GPT-5.5 is spiky**:
  strong on spatial execution (100% at 15×6 3D where Opus is 60%; 90% at the
  96-move maze, second only to Fable) but weak on planning (40% on maze-keys) and
  mid on abstraction (80%) — a jagged profile a single score would hide. **Sonnet 5** is the frontier's weakest when pushed on
  execution/deduction (0% at 96-move, 80% search-required) yet aced maze-keys
  planning (100%). **Opus 4.8** is robust but not dominant (degraded first at
  15×6). **Haiku** trails on execution/planning but is a competent deducer. The
  takeaway: pick the model by the *faculty* the workload stresses, not by a
  leaderboard rank.

---

## Headline results (pass · median tokens · estimated $/success)

Estimated cost is list-price notional: the harness prices each run at the model's public
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
| GPT-5.5 | 100% · $0.04 | 80% · $0.12 | 90% · — |
| GLM 5.2 | 60% · $0.02 | not run | not run |
| Haiku 4.5 | 10% · $0.35 | not run | not run |

At 44 moves every frontier model is perfect (GLM/Haiku already trail); at 72 the
first crack shows (GPT-5.5 → 80%); at 96 Fable holds 100%, GPT-5.5 90%, Opus drops
to 80%, and Sonnet collapses to 0%. GPT-5.5 runs via Codex (subscription-billed,
so its est. $/success is not list-priced). Gaps marked "not run" are open cells
(GLM/Haiku beyond 44) — cheap to fill.

**Deduction — logic-grid-hard (search-required 5×5), 10 reps**

| Model | Pass | Tokens (med) | Est. $/success |
|---|---|---|---|
| Fable 5 | 100% | 4.5K | $0.24 |
| Opus 4.8 | 100% | 10.7K | $0.26 |
| GPT-5.5 | 90% | 5.2K | $0.16 |
| GLM 5.2 | 90% | 9.0K | **$0.03** |
| Sonnet 5 | 80% | 8.5K | $0.12 |
| Haiku 4.5 | 50% | 24.7K | $0.25 |

**Cost inverts the capability ranking.** On deduction, GLM 5.2 solves 90% at
~$0.03/success — an order of magnitude cheaper than the Anthropic frontier — and
among the perfect scorers Fable ($0.24) edges Opus ($0.26). So "best" depends on
the axis: **capability → Fable/Opus; value → GLM (deduction), Fable (execution).**

**Abstraction — arc-lite, 10 reps (2026-07)**

| Model | arc-lite (single) | arc-lite-hard (2-comp) | Tokens (med, hard) |
|---|---|---|---|
| Fable 5 | 100% | **100%** | 4.4K |
| GPT-5.5 | 100% | 80% | 21.7K |
| Opus 4.8 | 100% | 80% | 5.5K |
| Sonnet 5 | 100% | 70% | 6.6K |
| Haiku 4.5 | 100% | 10% | 11.9K |

Single-transform saturates; composition separates. Fable is the only model that
holds 100% once the rule is two-step.

**Planning — maze-keys (11×11, 1 key), 10 reps (2026-07)**

| Model | Pass | Tokens (med) |
|---|---|---|
| Fable 5 | 100% | 2.9K |
| Sonnet 5 | 100% | 5.4K |
| Opus 4.8 | 90% | 5.8K |
| GPT-5.5 | 40% | 18.7K |
| Haiku 4.5 | 20% | 9.0K |

**3D execution — maze-3d across sizes, 10 reps (2026-07)**

Path length is the dial (as with maze-solve). The `-hard` (4×11×11) tier is
omitted — its ~21-move path barely exceeds the baseline.

| Model | 9×9×3 (~22-move) | 15×6 (~67-move) | 19×7 (~132-move) |
|---|---|---|---|
| Fable 5 | 100% | 90% | *re-run pending* |
| Opus 4.8 | 100% | 60% | *re-run pending* |
| Sonnet 5 | 80% | 80% | *re-run pending* |
| GPT-5.5 | 50% | 100% | 100% |
| Haiku 4.5 | 10% | not run | not run |

GPT-5.5's 3D strength is the standout (100% at both hard rungs, unthrottled via
Codex). Anthropic 19×7 cells are pending a serial re-run after the concurrent
first attempt self-inflicted rate-limit errors (below).

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
- **Cross-harness / hidden reasoning tokens:** GPT-5.5 runs via the Codex
  runner (ChatGPT-OAuth) — there is no single-shot path for it (the
  `openai-codex` provider only functions through Codex; default-config yields an
  empty no-op). On these single_shot specs Codex answers in **one turn** (verified:
  a direct move-string, no tool calls), so pass rates *are* comparable to the
  single-shot Anthropic runs. What is **not** comparable is cost/tokens (Codex
  reports cost=0 and counts reasoning differently, e.g. 79K vs Fable's 16K at
  15×6) — compare GPT-5.5 on pass rate and wall time, not cost. GPT also runs on a
  separate rate bucket, so it never contends with the Anthropic 429s below.
- **Rate-limit contamination (lesson, 2026-07):** the fan-out runs API models
  **concurrently**. On heavy specs (maze-3d-19x7, 35–55K tokens/rep) three
  simultaneous Anthropic streams exceeded the account tokens-per-minute limit;
  requests returned HTTP 429, exhausted their 3 retries, and recorded as empty
  0-token runs — which *look identical to a capability failure* (0% pass). This
  silently invalidated the 19×7 sweep (Opus/Sonnet "0%" was pure throttling, not
  reasoning). **Fix: run heavy specs one model at a time** (or cap fan-out
  concurrency). **Detection: a 0-token, ~sub-20s "failure" with `stopReason:
  error` / `429` in the transcript is an infra artifact, not a model result** —
  always check the transcript before trusting a 0%.

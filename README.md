<p align="center">
  <img src="assets/logo.png" alt="modellab logo" width="180" height="180" />
</p>

<p align="center"><em>Which model actually finishes? Per-faculty LLM benchmarks with reproducible cost, reliability bands, and no cherry-picked numbers.</em></p>

# modellab

A benchmark lab that measures frontier and local LLMs on real-world tasks and
abstract-reasoning probes, with an emphasis on efficiency: token count, cache
utilization, turn count, latency, and cost per successful run. Every `(spec,
model)` cell is run multiple times and reported as a distribution with a 95%
pass-rate confidence interval — not a single cherry-picked number.

modellab talks to models through pluggable **runners**. To reproduce the
published capability numbers yourself, use the OpenRouter runner with your own
API key — no private infrastructure required. See
[Reproduce the numbers](#reproduce-the-numbers).

---

## Tracks

Specs are grouped into three tracks calibrated to what each class of model can
actually do. Comparing across tracks directly is misleading; the crossover track
exists precisely to measure the gap.

| Track | What runs here | Headline metrics |
|---|---|---|
| **frontier** | Flagship API models (Claude, GPT, Gemini) | Cost per run, cost per success, cache-hit ratio |
| **local** | Models served locally via Ollama or similar | Tokens/sec, model size, tokens per success |
| **crossover** | Same task, both a frontier model and a local model | Pass rate gap, token-count ratio, honest capability delta |

The frontier track rewards models that do more with fewer tokens and cache well.
The local track rewards models that are fast and accurate without a per-token
bill. The crossover track reports the honest gap between the two on identical
tasks, which is the most useful signal for deciding when paying for frontier
inference is worth it.

---

## Methodology

- **Reps:** Each `(spec, model)` pair is run `reps` times (set per spec, typically 3-5). Results report median, min, max, standard deviation, and coefficient of variation for every metric. There is no cherry-picking: all reps are recorded, and the distribution is the result.
- **Reliability, not a single shot:** Pass rate is reported with a 95% Wilson confidence interval (`pass_ci_low`/`pass_ci_high`). A model that passes 3/5 and one that passes 5/5 are not treated as the same; the band shows how much the rep count actually tells you. `cost_cv` surfaces run-to-run cost instability, so a model that passes reliably but at wildly varying spend is not mistaken for a stable one.
- **Scoring:** Each spec declares its scoring method.
  - `programmatic` -- the fixture's `verify` commands must all exit 0. Binary pass/fail.
  - `judge` -- an LLM evaluator reads the model's output against a rubric file and returns a score from 0 to 1.0. The judge model and rubric are declared in the spec.
- **Traceability:** Every rep records its raw metrics plus the model's output (`results/<runId>/outputs.jsonl`).

---

## Cost & comparison honesty

Two numbers that print the same can mean very different things here. Read them
with the runner in mind.

**Cost provenance differs by runner.** `cost_total` does not come from one place:

| Runner | Where cost comes from | What the number means |
|---|---|---|
| openrouter | OpenRouter `usage.cost` | a real, metered API charge |
| claude | Claude Code `total_cost_usd` | notional API-equivalent price, **not** a subscription invoice |
| codex | not reported (`0`) | **not metered** — `0` means unmeasured, never "free" |

A `prices` table (per config) can override any of these to recompute cost from
token counts on a common basis. Treat a recomputed number as an estimate, not an
invoice.

**Agent runners measure the agent, not the raw model.** The CLI runners (claude,
codex) wrap the model in an agent with a large system prompt, so every call
carries tens of thousands of scaffolding tokens the task never asked for. The
same model on the same `arc-lite` task, measured two ways:

| Runner | model | tokens | peak context | cost / success |
|---|---|---|---|---|
| openrouter (raw API) | claude-sonnet-5 | ~1,960 | **~375** | **~$0.03** |
| claude (Claude Code) | sonnet | ~1,465 | **~40,000** | **~$0.13** |

The ~100x context and ~4x cost is Claude Code's harness, not the model. So:

- **To compare raw model capability or cost, use the openrouter runner** — one
  API call, no agent scaffolding, real metered cost.
- **To compare agent efficiency** (what a real Claude Code / Codex session costs
  to do the work), use the CLI runners — there the overhead *is* the measurement.
- **Never compare cost or tokens across runners**, and never read a subscription
  `0` as "cheapest." Unmetered cells print `n/m` (not `0`) in the report and are
  blank in the CSV, so a $0 can't sort as the cheapest option.

**Token counts are the most comparable proxy, not ground truth.** Different
models tokenize differently and split reasoning vs output tokens differently, so
tokens compare work only roughly — best within the same runner and model family.

---

## Runners

modellab talks to models through pluggable runners; pick one per run with `--config`.

| Runner | Config | Auth | Measures | Reproducible by anyone? |
|---|---|---|---|---|
| **openrouter** | `config/openrouter.yaml` | `OPENROUTER_API_KEY` | raw model (one API call) | **Yes** — the reproduce path |
| **claude** | `config/claude.yaml` | local Claude Code login | the Claude Code agent | Yes, with the `claude` CLI |
| **codex** | `config/codex.yaml` | local Codex CLI login | the Codex agent | Yes, with the `codex` CLI |

The **openrouter** runner is a single chat-completion call (single-shot, no tool
loop). It runs the capability probes — the maze / logic-grid / arc-lite /
planning tasks behind the published faculty numbers — against any OpenRouter
model with your own key, and reads real per-call cost straight from the API
response. Agentic coding specs need a tool loop and are skipped automatically
under this runner; use an agent runner for those.

The **claude** and **codex** runners drive the local `claude` (Claude Code) and
`codex` CLIs in headless mode, using your subscription auth. They measure the
*agent* doing the work, not the raw model: single-shot probes run with tools off,
agentic specs run in the fixture sandbox. See [Cost & comparison honesty](#cost--comparison-honesty)
before comparing their numbers to the openrouter runner.

---

## Reproduce the numbers

```sh
export OPENROUTER_API_KEY=sk-or-...
bun install
bun run bench --config config/openrouter.yaml \
  --models anthropic/claude-sonnet-5,openai/gpt-5.5 \
  --run-id repro1
```

Pass real OpenRouter model slugs via `--models` (the spec defaults use internal
aliases). Because each probe is generated fresh per rep and scored
programmatically, you are measuring the same faculties on the same task family —
your pass rates should land inside the reported confidence bands, not match a
single number exactly. Results land in `results/<runId>/` (see
[Output files](#output-files)).

### Run through an agent CLI (Claude Code or Codex)

To measure the agent rather than the raw model, use your local `claude` or
`codex` CLI auth:

```sh
bun run bench --config config/claude.yaml --models sonnet   --run-id claude1
bun run bench --config config/codex.yaml  --models gpt-5.5  --run-id codex1
```

The **claude** runner drives `claude -p --output-format json` and reads
`total_cost_usd` plus token usage (a notional API-equivalent cost, not a
subscription invoice). The **codex** runner drives `codex exec --json`; its cost
prints as `0` because subscription-backed Codex usage is not API-billed through
this harness — use tokens, wall time, and pass rate there. Both carry the agent's
system-prompt overhead, so their numbers are not comparable to the openrouter
runner (see [Cost & comparison honesty](#cost--comparison-honesty)).

### Output files

Results land in `results/<runId>/`:

| File | Contents |
|---|---|
| `report.md` | Human-readable summary with per-cell pass rates and distributions |
| `results.csv` | One row per rep, all metrics |
| `results.json` | Same data, structured |

---

## Spec format

```yaml
id: my-task
track: frontier          # frontier | local | crossover
mode: single_shot        # single_shot | agentic
prompt: "Do the thing."  # or prompt_file: ../../prompts/my-task.md
models: []               # fill before running
reps: 3
timeout_s: 120
scoring:
  kind: judge            # or: programmatic
  judge_model: anthropic/claude-opus-4-8
  rubric_file: rubrics/my-task.md
fixture:                 # required for agentic + programmatic scoring
  repo: fixtures/my-task
  setup: []
  verify: ["bun test"]
tags: [my-tag]
```

---

## Current specs

**See [`docs/TASKS.md`](docs/TASKS.md) for the full task catalog** — what each
benchmark probes (by reasoning faculty), how it is scored, its difficulty dials,
and findings so far. The tables below are a summary.

There are two families: **cost/efficiency tasks** (realistic agentic work, listed
here) and **capability probes** (abstract reasoning, single-shot/no-tools,
generated fresh per rep — see the catalog).

These map to representative daily work (coding/automation, extraction, writing to
house style, financial reasoning), scored automatically. The deterministic checkers
(`verify.py`) are rule-based or recompute the answer from inputs, so they cannot be
gamed by reading the sandbox; `harness/test/fixtures.test.ts` proves each one fails
on a wrong/missing output and passes only on a correct one.

Specs come in two difficulty tiers, because "which model is cheapest" and "which
model is capable enough" need different calibration:

- **Cost-frontier tier** — calibrated so *most* models pass, so the signal is
  cost/tokens/turns per success. Answers "what's the cheapest model that does my
  routine work."
- **Capability-ceiling tier** (tagged `headroom`) — calibrated with real headroom
  so the frontier ladder actually splits. Each embeds a trap that a naive or
  weaker approach fails: fixing only one of two coupled bugs, string-scanning a
  status instead of reading the structured flag, dropping edge cases in a messy
  extract, or ignoring a one-time item in a margin calc. Answers "where do I still
  need the expensive model." The pass-rate CI only carries information when scores
  land off the 0%/100% rails, which is what this tier is for.

| ID | Track | Tier | Scoring | Represents |
|---|---|---|---|---|
| `extract-json` | local | cost-frontier | programmatic (smoke) | schema output smoke test |
| `extract-records` | local | cost-frontier | programmatic (rule-based) | messy-text extraction |
| `summarize-changelog` | crossover | cost-frontier | judge | summarization quality |
| `style-constraints` | crossover | cost-frontier | programmatic (rule-based) | writing to house style (no em dashes, honorifics, American spelling) |
| `fix-failing-test` | frontier | cost-frontier | programmatic | TypeScript bug fix |
| `fix-bug-py` | frontier | cost-frontier | programmatic | Python bug fix (single off-by-one) |
| `financial-metric` | frontier | cost-frontier | programmatic (recomputed) | numeric reasoning (formula given) |
| `fix-multibug-py` | frontier | **headroom** | programmatic | two coupled bugs; a one-bug fix still fails |
| `fix-status-detection` | frontier | **headroom** | programmatic | real memory-dream bug: honor the `ok` flag, not a string scan |
| `financial-trap` | frontier | **headroom** | programmatic (recomputed) | exclude a one-time gain from operating margins |
| `extract-messy` | crossover | **headroom** | programmatic (rule-based) | dedup, malformed-email drop, missing-city null, state stripping |

### Capability probes (single-shot, generated per rep, faculty-mapped)

Abstract reasoning tasks that isolate a specific faculty. Run with no tools (so
the model reasons rather than writing a solver) and generated fresh each rep (so
they measure generalization). Full detail in [`docs/TASKS.md`](docs/TASKS.md).

| Task | Faculty | What it tests |
|---|---|---|
| `maze-solve` (11/15/21) | execution | track a path of up to ~96 dependent steps without drift |
| `maze-3d` / `-hard` | execution + 3D | build a 3D model from stacked 2D layers |
| `maze-keys` / `-hard` | planning | collect keys in order to open doors blocking the exit |
| `logic-grid` / `-5` / `-hard` | deduction | Zebra-style constraint solving (hard tier requires search) |
| `arc-lite` / `-hard` | abstraction | infer a hidden grid transform from examples, then apply it |

Headline finding: **each faculty saturates on easy instances and only separates
when you push the right lever** — path length for execution/3D, required search
depth for deduction, rule composition for abstraction. Pushed there, a consistent
but *jagged* profile emerges: **Fable 5** is the all-rounder (top or 100% on every
faculty, cheapest tokens); **GPT-5.5** is spiky (strong on 3D spatial, weak on
planning); **Sonnet 5** is weakest on long-horizon execution (0% at a 96-move
maze) yet aces planning; **Opus 4.8** is robust but not dominant. The suite exists
to find *where* models differ, per faculty — a single leaderboard rank hides this.
Full per-faculty results in [`docs/TASKS.md`](docs/TASKS.md).

To swap in your own real tasks, copy a fixture dir, write a `verify.py` that exits
non-zero on any wrong output, add a matching self-test case to `fixtures.test.ts`,
and drop a spec in `specs/<track>/`. For a headroom task, make sure the self-test
includes a "naive fix still fails" case so the trap is proven to bite. For a
generated probe, add a `fixture.generator` command (see `docs/TASKS.md`).

---

## Roadmap

- Schedule the suite on a cadence so a regression watch has run history to diff each `(model, spec)` cell against.
- Add a metered-vs-notional cost split for local/Codex runs whose `cost_total` is 0.
- Extend the OpenRouter runner past single-shot with a minimal tool loop, so the agentic cost suite is reproducible with a bring-your-own key too.

---

## License

Licensed under either [MIT](LICENSE-MIT) or [Apache-2.0](LICENSE-APACHE) at your
option. Contributions are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md); by
contributing you agree to the [CLA](docs/CLA.md).

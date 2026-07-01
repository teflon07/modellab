# modellab

A benchmark lab that measures frontier and local LLMs on real-world tasks, with
an emphasis on efficiency: token count, cache utilization, turn count, latency,
and cost per successful run. All results are collected through the
[Pi observability platform](https://github.com/your-org/pi), so every run is
traceable to its session, its raw metrics, and its transcript.

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
- **Traceability:** Every rep is backed by a Pi observability session ID. You can retrieve the full transcript, token-level cost breakdown, and tool-call log for any individual run.

---

## Cost honesty

`cost_total` values are **not directly comparable across providers** because
cache pricing differs: Anthropic charges for cache writes separately, OpenRouter
bundles differently, and local models cost zero. Token counts are the ground
truth for comparing work done. The `prices` table in `config/modellab.yaml`
normalizes cost to a per-token basis so cross-provider comparisons are on equal
footing, but treat normalized cost as an estimate, not an invoice.

---

## How to run

### 1. Start the obs server

```sh
cd <workspace>/.pi/observability/apps/observability
OBS_AUTH_TOKEN=devtoken OBS_HOST=127.0.0.1 OBS_PORT=43190 OBS_DB_PATH=../../db/obs.db bun server.ts
```

### 2. Configure

Edit `config/modellab.yaml` to confirm `db_path`, `server_url`, `token`, and `prices`.

You MUST also set `obs.extension_path` to the absolute path of the pi-observability
extension, for example:

```yaml
obs:
  extension_path: ~/.pi/observability/extension/pi-observability.ts
```

Without this, `pi` runs produce NO telemetry and the report will be empty.

For each spec you want to run, fill in the `models:` list. Run `pi --list-models`
to see what is available on your system, or consult `config/available-models.txt`
for the full catalog.

```yaml
# specs/local/extract-json.yaml
models: ["ollama/llama3.1"]
```

### 3. Run benchmarks

```sh
bun run bench
```

Results land in `results/<runId>/`:

| File | Contents |
|---|---|
| `report.md` | Human-readable summary with per-cell pass rates and distributions |
| `results.csv` | One row per rep, all metrics |
| `results.json` | Same data, structured |

### Run through Codex directly

To run via your local Codex CLI authentication instead of `pi`, use the Codex
config and override the spec model list with a Codex model:

```sh
bun run bench --config config/codex.yaml --models gpt-5.5 --run-id codex1
```

The Codex runner calls `codex exec --json` and reads token usage from the JSONL
stream. It uses ChatGPT-managed Codex auth when your local Codex CLI is logged
in that way. Cost is reported as `0` because subscription-backed Codex usage is
not API-billed through this harness; use token counts, wall time, and pass rate
as the comparable metrics for these runs.

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

To swap in your own real tasks, copy a fixture dir, write a `verify.py` that exits
non-zero on any wrong output, add a matching self-test case to `fixtures.test.ts`,
and drop a spec in `specs/<track>/`. For a headroom task, make sure the self-test
includes a "naive fix still fails" case so the trap is proven to bite.

---

## Roadmap

- **Phase 2 (done):** A live dashboard Benchmarks view reads modellab's `results/<runId>/` and renders per-cell heatmaps, per-run distribution strips, a cost/tokens-per-success ranking (with the 95% pass-rate band and run-to-run cost variance), and a regression watch that diffs each `(model, spec)` cell against its previous run. Lives in `tools/personal-dashboard` (`frontend/src/BenchmarksView.tsx`, `bench.ts`; `backend/sources/benchmarks.py`).
- **Next:** schedule the same suite on a cadence (via the supervisor) so the regression watch has history to diff, and add a metered-vs-notional cost split for local/Codex runs whose `cost_total` is 0.

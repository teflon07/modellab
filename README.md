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

- **Reps:** Each `(spec, model)` pair is run `reps` times (set per spec, typically 3-5). Results report median, min, and max. There is no cherry-picking: all reps are recorded, and the distribution is the result.
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

| ID | Track | Mode | Scoring |
|---|---|---|---|
| `extract-json` | local | single_shot | programmatic (smoke) |
| `summarize-changelog` | crossover | single_shot | judge |
| `fix-failing-test` | frontier | agentic | programmatic |

---

## Roadmap

- **Phase 2:** A live dashboard Benchmarks view that reads from the obs database and renders per-cell heatmaps, distribution charts, and cost-per-success rankings. This is not yet built.

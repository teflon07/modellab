# Benchmark History

`results-index.json` is the tracked summary of local benchmark runs.

Raw `modellab bench` artifacts stay under `results/<runId>/` and are ignored by
git because they are large generated outputs. The personal dashboard reads those
raw local artifacts directly; this history file exists so run metadata and core
metrics remain reviewable in source control without committing the full artifact
tree.

Regenerate after benchmark runs with the local cleanup/index command used by the
workspace agent, or replace it with a first-class `modellab` command when this
workflow stabilizes.

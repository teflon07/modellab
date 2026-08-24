import type { CellSummary, RunResult, Track } from "./types";

export interface ReportMeta {
  runId: string;
  generatedAt: string;
  piVersion: string;
}

export interface ArtifactRef {
  specId: string;
  model: string;
  rep: number;
  href: string;
}

const TRACKS: Track[] = ["frontier", "local", "crossover"];

function fmtMoney(n: number | null, metered: boolean): string {
  if (!metered) return "n/m";
  if (n === null) return "—";
  return n.toFixed(4);
}

function fmtNum(n: number | null, digits = 0): string {
  if (n === null) return "—";
  return digits === 0 ? String(Math.round(n)) : n.toFixed(digits);
}

export function renderMarkdown(cells: CellSummary[], meta: ReportMeta): string {
  const lines: string[] = [];
  lines.push(`# Benchmark Report — ${meta.runId}`, "");
  lines.push(`Generated: ${meta.generatedAt}  ·  pi ${meta.piVersion}`, "");
  for (const track of TRACKS) {
    const group = cells.filter((c) => c.track === track);
    if (group.length === 0) continue;
    lines.push(`## ${track}`, "");
    // Decision-first ordering: what you'd actually rank on (reliability + cost-per-success)
    // leads; raw medians follow. pass 95% CI is the Wilson band; cost cv% is run-to-run
    // cost instability (high = flaky spend even when it passes).
    // pass% is over COMPLETED reps (timeouts excluded). `done`/`t/o` show the
    // split so a low pass% from few completions can't be mistaken for capability.
    lines.push("| spec | model | n | done | t/o | pass% | pass 95% CI | score (med) | cost-per-success | tokens-per-success | wall-per-success | cost cv% | tokens (med) | turns (med) | wall ms (med) |");
    lines.push("|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|");
    for (const c of group) {
      const ci = `${(c.passRateCI.low * 100).toFixed(0)}–${(c.passRateCI.high * 100).toFixed(0)}%`;
      const passCell = c.completed === 0 ? "—" : `${(c.passRate * 100).toFixed(0)}%`;
      const cps = fmtMoney(c.costPerSuccess, c.metered);
      const costCv = !c.metered ? "n/m" : `${(c.cost.cv * 100).toFixed(0)}%`;
      lines.push(
        `| ${c.specId} | ${c.model} | ${c.n} | ${c.completed} | ${c.timeouts} | ${passCell} | ${ci} | ` +
        `${c.score.median.toFixed(2)} | ${cps} | ${fmtNum(c.tokensPerSuccess)} | ${fmtNum(c.wallPerSuccess)} | ` +
        `${costCv} | ${c.tokens.median} | ${c.turns.median} | ${c.wallClockMs.median} |`,
      );
    }
    lines.push("");
  }
  return lines.join("\n");
}

export function renderCsv(cells: CellSummary[]): string {
  const header = [
    "track", "spec", "model", "n", "completed", "timeouts", "pass_rate", "pass_ci_low", "pass_ci_high",
    "score_med", "tokens_med", "tokens_min", "tokens_max",
    "metered", "cost_med", "cost_cv", "cost_per_success", "tokens_per_success",
    "wall_per_success", "turns_per_success",
    "cache_hit_med", "turns_med", "tool_calls_med",
    "wall_ms_med", "ttft_ms_med", "tps_med", "peak_ctx_med",
  ].join(",");
  const rows = cells.map((c) => [
    c.track, c.specId, c.model, c.n, c.completed, c.timeouts, c.passRate.toFixed(4),
    c.passRateCI.low.toFixed(4), c.passRateCI.high.toFixed(4),
    c.score.median.toFixed(4),
    c.tokens.median, c.tokens.min, c.tokens.max,
    c.metered,
    c.metered ? c.cost.median.toFixed(6) : "",
    c.metered ? c.cost.cv.toFixed(4) : "",
    !c.metered || c.costPerSuccess === null ? "" : c.costPerSuccess.toFixed(6),
    c.tokensPerSuccess === null ? "" : c.tokensPerSuccess,
    c.wallPerSuccess === null ? "" : Math.round(c.wallPerSuccess),
    c.turnsPerSuccess === null ? "" : c.turnsPerSuccess,
    c.cacheHitRatio.median.toFixed(4), c.turns.median, c.toolCalls.median,
    c.wallClockMs.median, c.ttftMs.median, c.outputTps.median, c.peakContext.median,
  ].join(","));
  return [header, ...rows].join("\n") + "\n";
}

export function renderJson(cells: CellSummary[], results: RunResult[], meta: ReportMeta): string {
  return JSON.stringify({ meta, summaries: cells, runs: results }, null, 2);
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[ch]!));
}

function scoreBar(score: number): string {
  const pct = Math.max(0, Math.min(100, Math.round(score * 100)));
  return `<div class="bar"><span style="width:${pct}%"></span><em>${score.toFixed(2)}</em></div>`;
}

/**
 * Side-by-side visual comparison page. Viewers should see model quality at a
 * glance: rubric score bars, efficiency metrics, and an iframe of the built site.
 */
export function renderVisualHtml(
  cells: CellSummary[],
  results: RunResult[],
  meta: ReportMeta,
  artifacts: ArtifactRef[],
): string {
  const visualCells = cells.filter((c) =>
    results.some((r) => r.specId === c.specId && r.model === c.model && (r.rubric?.length || artifacts.some((a) => a.specId === r.specId))),
  );
  const specs = [...new Set((visualCells.length ? visualCells : cells).map((c) => c.specId))];
  const bySpec = specs.length ? specs : [...new Set(results.map((r) => r.specId))];

  const sections: string[] = [];
  for (const specId of bySpec) {
    const specCells = cells.filter((c) => c.specId === specId);
    if (specCells.length === 0 && !results.some((r) => r.specId === specId)) continue;
    const ranked = [...specCells].sort((a, b) => {
      const ds = b.score.median - a.score.median;
      if (ds !== 0) return ds;
      return b.passRate - a.passRate;
    });
    const cards = ranked.map((c) => {
      const art = artifacts.filter((a) => a.specId === c.specId && a.model === c.model);
      const iframe = art[0]
        ? `<iframe title="${esc(c.model)} ${esc(specId)}" src="${esc(art[0].href)}/site/index.html"></iframe>`
        : `<div class="empty">No site artifact captured.</div>`;
      const cps = fmtMoney(c.costPerSuccess, c.metered);
      return `<article class="card">
  <header>
    <h3>${esc(c.model)}</h3>
    <p class="pass">${c.completed === 0 ? "—" : `${Math.round(c.passRate * 100)}% pass`} · score ${c.score.median.toFixed(2)}</p>
  </header>
  ${scoreBar(c.score.median)}
  <dl>
    <div><dt>tokens / success</dt><dd>${fmtNum(c.tokensPerSuccess)}</dd></div>
    <div><dt>cost / success</dt><dd>${esc(cps)}</dd></div>
    <div><dt>wall / success</dt><dd>${c.wallPerSuccess === null ? "—" : `${Math.round(c.wallPerSuccess)} ms`}</dd></div>
    <div><dt>turns / success</dt><dd>${fmtNum(c.turnsPerSuccess, 1)}</dd></div>
    <div><dt>tokens (med)</dt><dd>${c.tokens.median}</dd></div>
    <div><dt>wall ms (med)</dt><dd>${c.wallClockMs.median}</dd></div>
  </dl>
  ${iframe}
</article>`;
    }).join("\n");

    const rubricRows = results
      .filter((r) => r.specId === specId && r.rubric?.length)
      .map((r) => {
        const checks = (r.rubric ?? []).map((chk) =>
          `<li class="${chk.pass ? "ok" : "no"}">${esc(chk.label)}</li>`).join("");
        return `<details><summary>${esc(r.model)} · rep ${r.rep} · ${(r.score ?? 0).toFixed(2)}</summary><ul class="rubric">${checks}</ul></details>`;
      }).join("\n");

    sections.push(`<section>
  <h2>${esc(specId)}</h2>
  <div class="grid">${cards || "<p>No cells for this spec.</p>"}</div>
  ${rubricRows ? `<div class="rubrics">${rubricRows}</div>` : ""}
</section>`);
  }

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <title>Visual compare — ${esc(meta.runId)}</title>
  <style>
    :root { --ink:#14120f; --paper:#f6f1e8; --rule:#d7cfc2; --ok:#1f7a4d; --no:#a33b2b; --bar:#2a2118; }
    * { box-sizing:border-box; }
    body { margin:0; font:16px/1.45 "Iowan Old Style", "Palatino Linotype", Palatino, serif; color:var(--ink); background:var(--paper); }
    header.top { padding:28px 32px 12px; border-bottom:1px solid var(--rule); }
    header.top p { margin:6px 0 0; color:#5c564c; }
    main { padding:12px 32px 48px; }
    h1,h2,h3 { font-weight:600; letter-spacing:-0.02em; }
    section { margin:28px 0 40px; }
    .grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(320px,1fr)); gap:18px; }
    .card { background:#fffdf8; border:1px solid var(--rule); padding:14px 14px 10px; }
    .card h3 { margin:0; font-size:1.1rem; }
    .card .pass { margin:4px 0 10px; color:#5c564c; font-size:0.92rem; }
    .bar { position:relative; height:18px; background:#ece6da; margin:0 0 12px; }
    .bar span { display:block; height:100%; background:var(--bar); }
    .bar em { position:absolute; right:6px; top:0; font-size:12px; font-style:normal; }
    dl { display:grid; grid-template-columns:1fr 1fr; gap:6px 12px; margin:0 0 12px; }
    dt { font-size:11px; text-transform:uppercase; letter-spacing:0.06em; color:#6a645a; }
    dd { margin:0; font-variant-numeric:tabular-nums; }
    iframe, .empty { width:100%; height:420px; border:1px solid var(--rule); background:#fff; }
    .empty { display:flex; align-items:center; justify-content:center; color:#6a645a; }
    .rubrics { margin-top:16px; }
    .rubric { columns:2; padding-left:18px; }
    .rubric .ok { color:var(--ok); }
    .rubric .no { color:var(--no); }
    @media (max-width:720px) { .rubric { columns:1; } header.top, main { padding-left:16px; padding-right:16px; } }
  </style>
</head>
<body>
  <header class="top">
    <h1>Visual model compare</h1>
    <p>${esc(meta.runId)} · ${esc(meta.generatedAt)} · ranked by median rubric score. Open two cards: the stronger site should be obvious without reading the table.</p>
  </header>
  <main>
    ${sections.join("\n") || "<p>No visual specs in this run.</p>"}
  </main>
</body>
</html>
`;
}

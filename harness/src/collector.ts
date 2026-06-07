import { Database } from "bun:sqlite";
import type { CollectedMetrics } from "./types";

export function collectByTag(dbPath: string, tag: string): CollectedMetrics | null {
  const db = new Database(dbPath, { readonly: true });
  try {
    const session = db.query(`
      SELECT session_id, first_ts, last_ts
      FROM sessions
      WHERE EXISTS (SELECT 1 FROM json_each(tags_json) WHERE value = $tag)
      LIMIT 1
    `).get({ $tag: tag }) as { session_id: string; first_ts: string; last_ts: string } | null;
    if (!session) return null;

    const agg = db.query(`
      SELECT
        COALESCE(SUM(CASE WHEN type='assistant_message' THEN json_extract(payload_json,'$.usage.total_tokens') END),0) AS totalTokens,
        COALESCE(SUM(CASE WHEN type='assistant_message' THEN json_extract(payload_json,'$.usage.input') END),0) AS inputTokens,
        COALESCE(SUM(CASE WHEN type='assistant_message' THEN json_extract(payload_json,'$.usage.output') END),0) AS outputTokens,
        COALESCE(SUM(CASE WHEN type='assistant_message' THEN json_extract(payload_json,'$.usage.cache_read') END),0) AS cacheRead,
        COALESCE(SUM(CASE WHEN type='assistant_message' THEN json_extract(payload_json,'$.usage.cache_write') END),0) AS cacheWrite,
        COALESCE(SUM(CASE WHEN type='assistant_message' THEN json_extract(payload_json,'$.usage.cost_total') END),0) AS costTotal,
        COALESCE(SUM(CASE WHEN type='turn_start' THEN 1 END),0) AS turns,
        COALESCE(SUM(CASE WHEN type='tool_call' THEN 1 END),0) AS toolCalls,
        COALESCE(SUM(CASE WHEN type='compaction' THEN 1 END),0) AS compactions,
        COALESCE(SUM(CASE WHEN type='error' THEN 1 END),0) AS errorCount
      FROM events WHERE session_id = $sid
    `).get({ $sid: session.session_id }) as Record<string, number>;

    // peakContext = max per-turn context (input + cache_read + cache_write); excludes output by design, so it won't reconcile with total_tokens.
    const peak = db.query(`
      SELECT COALESCE(MAX(
        COALESCE(json_extract(payload_json,'$.usage.input'),0)
        + COALESCE(json_extract(payload_json,'$.usage.cache_read'),0)
        + COALESCE(json_extract(payload_json,'$.usage.cache_write'),0)
      ),0) AS peakContext
      FROM events WHERE session_id=$sid AND type='assistant_message'
    `).get({ $sid: session.session_id }) as { peakContext: number };

    const ttftRow = db.query(`
      SELECT json_extract(payload_json,'$.prefill_ms') AS ttft
      FROM events
      WHERE session_id=$sid AND type='assistant_message'
        AND json_extract(payload_json,'$.prefill_ms') IS NOT NULL
      ORDER BY seq ASC LIMIT 1
    `).get({ $sid: session.session_id }) as { ttft: number } | null;

    const tpsRow = db.query(`
      SELECT AVG(json_extract(payload_json,'$.output_tps')) AS tps
      FROM events
      WHERE session_id=$sid AND type='assistant_message'
        AND json_extract(payload_json,'$.output_tps') IS NOT NULL
    `).get({ $sid: session.session_id }) as { tps: number | null };

    const startMs = new Date(session.first_ts).getTime();
    const endMs = new Date(session.last_ts).getTime();
    const wallClockMs = Number.isNaN(startMs) || Number.isNaN(endMs) ? 0 : Math.max(0, endMs - startMs);

    return {
      sessionId: session.session_id,
      totalTokens: agg.totalTokens,
      inputTokens: agg.inputTokens,
      outputTokens: agg.outputTokens,
      cacheRead: agg.cacheRead,
      cacheWrite: agg.cacheWrite,
      costTotal: agg.costTotal,
      turns: agg.turns,
      toolCalls: agg.toolCalls,
      compactions: agg.compactions,
      peakContext: peak.peakContext,
      wallClockMs,
      ttftMs: ttftRow ? ttftRow.ttft : null,
      outputTps: tpsRow.tps === null ? null : Math.round(tpsRow.tps),
      errorCount: agg.errorCount,
    };
  } finally {
    db.close();
  }
}

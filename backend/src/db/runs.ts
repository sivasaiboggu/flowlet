/**
 * Run history, stored in PostgreSQL. Two tables, linked by a foreign
 * key: runs (one row per accepted event) and run_steps (one row per
 * step of that run).
 *
 * Indexes:
 * - idx_runs_flow_started (flow_id, started_at DESC, id DESC): serves
 *   the run-list query, which filters by flow and pages newest first.
 * - idx_run_steps_run (run_id, position): serves fetching one run's
 *   steps in order.
 *
 * Cursor pagination: the cursor is base64url of "<startedAt ISO>|<id>".
 * Rows are ordered by (started_at DESC, id DESC), so the cursor is
 * stable even when two runs share a timestamp.
 */
import { randomUUID } from "node:crypto";
import { getPool } from "./postgres";
import type { FlowStats, RunDetail, RunRecord, RunStatus, RunStepRecord } from "../types";

export type NewStep = Omit<RunStepRecord, "id" | "runId">;
export type NewRun = Omit<RunRecord, "id">;

type RunRow = {
  id: string;
  flow_id: string;
  flow_name: string;
  status: RunStatus;
  payload: RunRecord["payload"];
  started_at: Date;
  finished_at: Date;
  duration_ms: number;
  error: string | null;
};

type StepRow = {
  id: string;
  run_id: string;
  position: number;
  type: RunStepRecord["type"];
  status: RunStepRecord["status"];
  input: RunStepRecord["input"];
  output: RunStepRecord["output"];
  error: string | null;
  duration_ms: number;
};

function toRunRecord(row: RunRow): RunRecord {
  return {
    id: row.id,
    flowId: row.flow_id,
    flowName: row.flow_name,
    status: row.status,
    payload: row.payload,
    startedAt: row.started_at.toISOString(),
    finishedAt: row.finished_at.toISOString(),
    durationMs: row.duration_ms,
    error: row.error,
  };
}

function toStepRecord(row: StepRow): RunStepRecord {
  return {
    id: row.id,
    runId: row.run_id,
    position: row.position,
    type: row.type,
    status: row.status,
    input: row.input,
    output: row.output,
    error: row.error,
    durationMs: row.duration_ms,
  };
}

/** Insert a run and all of its step records in one transaction. */
export async function insertRun(run: NewRun, steps: NewStep[]): Promise<string> {
  const pool = getPool();
  const runId = randomUUID();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO runs (id, flow_id, flow_name, status, payload, started_at, finished_at, duration_ms, error)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        runId,
        run.flowId,
        run.flowName,
        run.status,
        JSON.stringify(run.payload),
        run.startedAt,
        run.finishedAt,
        run.durationMs,
        run.error,
      ],
    );
    for (const step of steps) {
      await client.query(
        `INSERT INTO run_steps (id, run_id, position, type, status, input, output, error, duration_ms)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          randomUUID(),
          runId,
          step.position,
          step.type,
          step.status,
          JSON.stringify(step.input),
          step.output === null ? null : JSON.stringify(step.output),
          step.error,
          step.durationMs,
        ],
      );
    }
    await client.query("COMMIT");
    return runId;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export function encodeCursor(startedAt: string, id: string): string {
  return Buffer.from(`${startedAt}|${id}`, "utf8").toString("base64url");
}

export function decodeCursor(cursor: string): { startedAt: string; id: string } | null {
  try {
    const decoded = Buffer.from(cursor, "base64url").toString("utf8");
    const [startedAt, id] = decoded.split("|");
    if (!startedAt || !id) return null;
    if (Number.isNaN(Date.parse(startedAt))) return null;
    return { startedAt, id };
  } catch {
    return null;
  }
}

export type RunListResult = {
  items: RunRecord[];
  nextCursor: string | null;
};

export async function listRuns(
  flowId: string,
  opts: { status?: RunStatus; limit: number; cursor?: string },
): Promise<RunListResult> {
  const pool = getPool();
  const params: unknown[] = [flowId];
  let where = "WHERE flow_id = $1";
  if (opts.status) {
    params.push(opts.status);
    where += ` AND status = $${params.length}`;
  }
  if (opts.cursor) {
    const decoded = decodeCursor(opts.cursor);
    if (!decoded) return { items: [], nextCursor: null };
    params.push(decoded.startedAt, decoded.id);
    where += ` AND (started_at, id) < ($${params.length - 1}::timestamptz, $${params.length}::uuid)`;
  }
  params.push(opts.limit + 1);
  const { rows } = await pool.query<RunRow>(
    `SELECT id, flow_id, flow_name, status, payload, started_at, finished_at, duration_ms, error
     FROM runs ${where}
     ORDER BY started_at DESC, id DESC
     LIMIT $${params.length}`,
    params as never[],
  );
  const hasMore = rows.length > opts.limit;
  const page = hasMore ? rows.slice(0, opts.limit) : rows;
  const last = page[page.length - 1];
  return {
    items: page.map(toRunRecord),
    nextCursor:
      hasMore && last ? encodeCursor(last.started_at.toISOString(), last.id) : null,
  };
}

export async function getRun(id: string): Promise<RunDetail | null> {
  const pool = getPool();
  const { rows } = await pool.query<RunRow>(
    `SELECT id, flow_id, flow_name, status, payload, started_at, finished_at, duration_ms, error
     FROM runs WHERE id = $1`,
    [id],
  );
  if (rows.length === 0) return null;
  const steps = await pool.query<StepRow>(
    `SELECT id, run_id, position, type, status, input, output, error, duration_ms
     FROM run_steps WHERE run_id = $1 ORDER BY position ASC`,
    [id],
  );
  return { ...toRunRecord(rows[0]), steps: steps.rows.map(toStepRecord) };
}

export async function countRunsByFlow(flowId: string): Promise<number> {
  const pool = getPool();
  const { rows } = await pool.query<{ count: string }>(
    "SELECT COUNT(*) AS count FROM runs WHERE flow_id = $1",
    [flowId],
  );
  return Number(rows[0].count);
}

/**
 * Stats are computed by one SQL query — the rows are never loaded and
 * counted in JavaScript.
 */
export async function getFlowStats(flowId: string): Promise<FlowStats> {
  const pool = getPool();
  const { rows } = await pool.query<{
    total: string;
    success: string;
    failed: string;
    filtered: string;
    avg_duration_ms: string | null;
    last_run_at: Date | null;
  }>(
    `SELECT COUNT(*) AS total,
            COUNT(*) FILTER (WHERE status = 'success') AS success,
            COUNT(*) FILTER (WHERE status = 'failed') AS failed,
            COUNT(*) FILTER (WHERE status = 'filtered') AS filtered,
            AVG(duration_ms) AS avg_duration_ms,
            MAX(started_at) AS last_run_at
     FROM runs WHERE flow_id = $1`,
    [flowId],
  );
  const row = rows[0];
  return {
    total: Number(row.total),
    success: Number(row.success),
    failed: Number(row.failed),
    filtered: Number(row.filtered),
    avgDurationMs:
      row.avg_duration_ms === null ? 0 : Math.round(Number(row.avg_duration_ms)),
    lastRunAt: row.last_run_at ? row.last_run_at.toISOString() : null,
  };
}

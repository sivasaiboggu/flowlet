-- 0001_init.sql — Flowlet run history (PostgreSQL).
--
-- Two tables, linked by a foreign key:
--   runs      — one row per accepted webhook event.
--   run_steps — one row per step of that run.
--
-- Runs are deliberately NOT deleted when a flow is deleted: the run
-- history is the audit trail of what happened, and each run carries a
-- snapshot of the flow name so it stays readable afterwards. run_steps
-- rows are deleted with their run (ON DELETE CASCADE).
--
-- Indexes:
--   idx_runs_flow_started (flow_id, started_at DESC, id DESC)
--     serves the run-list query: filter by flow, newest first, cursor
--     pagination on (started_at, id).
--   idx_run_steps_run (run_id, position)
--     serves fetching one run's steps in position order.

CREATE TABLE IF NOT EXISTS runs (
  id UUID PRIMARY KEY,
  flow_id TEXT NOT NULL,
  flow_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('success', 'failed', 'filtered')),
  payload JSONB NOT NULL,
  started_at TIMESTAMPTZ NOT NULL,
  finished_at TIMESTAMPTZ NOT NULL,
  duration_ms INTEGER NOT NULL,
  error TEXT
);

CREATE TABLE IF NOT EXISTS run_steps (
  id UUID PRIMARY KEY,
  run_id UUID NOT NULL REFERENCES runs (id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('filter', 'transform', 'http_request')),
  status TEXT NOT NULL CHECK (status IN ('success', 'failed', 'skipped')),
  input JSONB NOT NULL,
  output JSONB,
  error TEXT,
  duration_ms INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_runs_flow_started
  ON runs (flow_id, started_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_run_steps_run
  ON run_steps (run_id, position);

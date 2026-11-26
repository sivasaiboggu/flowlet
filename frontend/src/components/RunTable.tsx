/**
 * Run history for one flow: status filter, cursor pagination ("Load
 * more"), newest first. Rows link to the run timeline at /runs/[id].
 */
"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { ApiError, listRuns } from "@/lib/api";
import type { RunRecord } from "@/lib/types";
import { EmptyState, ErrorState, Loading } from "./StateViews";

function statusPill(status: RunRecord["status"]) {
  if (status === "success") return <span className="pill pill-ok">Success</span>;
  if (status === "failed") return <span className="pill pill-bad">Failed</span>;
  return <span className="pill">Filtered</span>;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString();
}

export default function RunTable({
  flowId,
  refreshKey = 0,
}: {
  flowId: string;
  /** Increment to reload from the first page (e.g. after a test event). */
  refreshKey?: number;
}) {
  const [runs, setRuns] = useState<RunRecord[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  // Sequence of the latest load. A response from an older request —
  // started before the filter changed, or before a refresh — is stale
  // and must never overwrite the newer list.
  const requestSeq = useRef(0);

  const load = useCallback(
    async (cursor?: string) => {
      const seq = ++requestSeq.current;
      if (cursor) setLoadingMore(true);
      else setLoading(true);
      setError("");
      try {
        const page = await listRuns(flowId, {
          status: statusFilter || undefined,
          limit: 20,
          cursor,
        });
        if (seq !== requestSeq.current) return;
        setRuns((prev) => (cursor ? [...prev, ...page.items] : page.items));
        setNextCursor(page.nextCursor);
      } catch (err) {
        if (seq !== requestSeq.current) return;
        setError(
          err instanceof ApiError ? err.message : "Could not load runs.",
        );
      } finally {
        if (seq !== requestSeq.current) return;
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [flowId, statusFilter],
  );

  useEffect(() => {
    setRuns([]);
    setNextCursor(null);
    void load();
  }, [load, refreshKey]);

  function onFilter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
  }

  if (loading) return <Loading label="Loading runs…" />;
  if (error && runs.length === 0) {
    return <ErrorState message={error} onRetry={() => void load()} />;
  }

  return (
    <>
      <form onSubmit={onFilter} className="filter-row">
        <label htmlFor="run-status-filter">Status</label>
        <select
          id="run-status-filter"
          className="input select"
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
        >
          <option value="">All runs</option>
          <option value="success">Success</option>
          <option value="failed">Failed</option>
          <option value="filtered">Filtered</option>
        </select>
      </form>

      {runs.length === 0 ? (
        <EmptyState>
          {statusFilter
            ? `No ${statusFilter} runs yet.`
            : "No runs yet. Runs appear here after an event reaches this flow's webhook URL."}
        </EmptyState>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Status</th>
                <th>Started</th>
                <th className="col-duration">Duration</th>
                <th>Run</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <tr key={run.id}>
                  <td>{statusPill(run.status)}</td>
                  <td className="num">{formatTime(run.startedAt)}</td>
                  <td className="num col-duration">{run.durationMs} ms</td>
                  <td className="mono">
                    <Link href={`/runs/${run.id}`}>{run.id.slice(0, 8)}…</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {error && <p className="notice">{error}</p>}

      {nextCursor && (
        <div className="form-row">
          <button
            className="btn"
            type="button"
            disabled={loadingMore}
            onClick={() => void load(nextCursor)}
          >
            {loadingMore ? "Loading…" : "Load more"}
          </button>
        </div>
      )}
    </>
  );
}

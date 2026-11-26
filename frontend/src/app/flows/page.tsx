"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ApiError, listFlows, listRuns } from "@/lib/api";
import type { FlowSummary } from "@/lib/types";
import { EmptyState, ErrorState, Loading } from "@/components/StateViews";

type Row = FlowSummary & {
  /** Latest run status, null when the flow has no runs, "unavailable"
   * when the run list could not be loaded at all. */
  latestStatus: "success" | "failed" | "filtered" | null | "unavailable";
};

export default function FlowsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const flows = await listFlows();
      const withStatus = await Promise.all(
        flows.map(async (flow): Promise<Row> => {
          try {
            const page = await listRuns(flow.id, { limit: 1 });
            return {
              ...flow,
              latestStatus: page.items[0]?.status ?? null,
            };
          } catch {
            // The flow list loaded but this flow's run list did not —
            // that is not the same as "no runs".
            return { ...flow, latestStatus: "unavailable" };
          }
        }),
      );
      setRows(withStatus);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load flows.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Flows</h1>
          <p>A flow is a few steps. Send an event to its webhook URL and the steps run.</p>
        </div>
        <Link href="/flows/new" className="btn btn-primary">
          New flow
        </Link>
      </div>

      {loading && <Loading label="Loading flows…" />}
      {!loading && error && <ErrorState message={error} onRetry={() => void load()} />}
      {!loading && !error && rows.length === 0 && (
        <div className="card">
          <EmptyState>
            No flows yet. Create your first flow to get a webhook URL.
          </EmptyState>
        </div>
      )}
      {!loading && !error && rows.length > 0 && (
        <section className="card">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Enabled</th>
                  <th>Latest run</th>
                  <th className="col-created">Created</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((flow) => (
                  <tr key={flow.id}>
                    <td>
                      <Link href={`/flows/${flow.id}`}>{flow.name}</Link>
                    </td>
                    <td>{flow.enabled ? "Yes" : "No"}</td>
                    <td>
                      {flow.latestStatus === "success" && (
                        <span className="pill pill-ok">Success</span>
                      )}
                      {flow.latestStatus === "failed" && (
                        <span className="pill pill-bad">Failed</span>
                      )}
                      {flow.latestStatus === "filtered" && (
                        <span className="pill">Filtered</span>
                      )}
                      {flow.latestStatus === null && (
                        <span className="muted">No runs</span>
                      )}
                      {flow.latestStatus === "unavailable" && (
                        <span
                          className="muted"
                          title="The latest run could not be loaded"
                        >
                          Unknown
                        </span>
                      )}
                    </td>
                    <td className="num col-created">
                      {new Date(flow.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}

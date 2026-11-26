"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ApiError,
  apiUrl,
  getFlow,
  getStats,
  sendTestEvent,
  updateFlow,
} from "@/lib/api";
import type { Flow, FlowStats } from "@/lib/types";
import RunTable from "@/components/RunTable";
import { EmptyState, ErrorState, Loading } from "@/components/StateViews";

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard needs a secure context; the text is still visible to copy by hand.
    }
  }
  return (
    <button className="btn" type="button" onClick={copy}>
      {copied ? "Copied" : label}
    </button>
  );
}

const TEST_EVENT_EXAMPLE = JSON.stringify(
  {
    event: "order.created",
    order: {
      id: "ORD-1042",
      amount: 4999,
      currency: "INR",
      customer: { name: "Asha Rao", email: "asha@example.com" },
    },
  },
  null,
  2,
);

export default function FlowDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [flow, setFlow] = useState<Flow | null>(null);
  const [stats, setStats] = useState<FlowStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [testJson, setTestJson] = useState(TEST_EVENT_EXAMPLE);
  const [testResult, setTestResult] = useState<{ runId: string; status: string } | null>(null);
  const [testError, setTestError] = useState("");
  const [refreshNote, setRefreshNote] = useState("");
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);
  const [sending, setSending] = useState(false);
  const [toggling, setToggling] = useState(false);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [loadedFlow, loadedStats] = await Promise.all([
        getFlow(id),
        getStats(id),
      ]);
      setFlow(loadedFlow);
      setStats(loadedStats);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load the flow.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function toggleEnabled() {
    if (!flow) return;
    setToggling(true);
    try {
      const updated = await updateFlow(flow.id, { enabled: !flow.enabled });
      setFlow(updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not update the flow.");
    } finally {
      setToggling(false);
    }
  }

  async function onSendTest() {
    if (!flow) return;
    setSending(true);
    setTestResult(null);
    setTestError("");
    setRefreshNote("");
    try {
      JSON.parse(testJson);
    } catch {
      setTestError("The test event is not valid JSON.");
      setSending(false);
      return;
    }
    // Any JSON value is a valid event — an object, an array, or a
    // scalar — so there is nothing more to check here; the backend
    // validates the signature and runs the steps.
    let result: { runId: string; status: string };
    try {
      result = await sendTestEvent(flow, testJson);
    } catch (err) {
      setTestError(
        err instanceof ApiError ? err.message : "Could not send the test event.",
      );
      setSending(false);
      return;
    }
    setTestResult(result);
    setSending(false);
    // The send succeeded. Refresh the summary numbers and the run
    // history below — a refresh failure is not a send failure, so it
    // only shows a note and never replaces the result above.
    try {
      const fresh = await getStats(flow.id);
      setStats(fresh);
    } catch {
      setRefreshNote(
        "The test event was sent, but the summary could not be refreshed.",
      );
    }
    setHistoryRefreshKey((key) => key + 1);
  }

  if (loading) return <Loading label="Loading flow…" />;
  if (error && !flow) {
    return (
      <>
        <div className="page-head">
          <h1>Flow</h1>
        </div>
        <ErrorState message={error} onRetry={() => void load()} />
      </>
    );
  }
  if (!flow) {
    return (
      <>
        <div className="page-head">
          <h1>Flow</h1>
        </div>
        <EmptyState>This flow does not exist.</EmptyState>
      </>
    );
  }

  const curlExample = [
    `SECRET='${flow.secret}'`,
    `BODY='${JSON.stringify({ event: "order.created", order: { id: "ORD-1042", amount: 4999 } })}'`,
    `SIG=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$SECRET" | awk '{print $NF}')`,
    `curl -X POST "${flow.webhookUrl}" \\`,
    `  -H "Content-Type: application/json" \\`,
    `  -H "X-Flowlet-Signature: sha256=$SIG" \\`,
    `  -d "$BODY"`,
  ].join("\n");

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{flow.name}</h1>
          <p>{flow.description ?? "No description."}</p>
        </div>
        <div className="head-actions">
          <button
            className="btn"
            type="button"
            disabled={toggling}
            onClick={() => void toggleEnabled()}
          >
            {flow.enabled ? "Disable" : "Enable"}
          </button>
          <Link href={`/flows/${flow.id}/edit`} className="btn btn-primary">
            Edit
          </Link>
        </div>
      </div>

      {error && <p className="notice">{error}</p>}

      <section className="card">
        <h2>Webhook</h2>
        <p>
          Send a signed JSON event to this URL. The signature is HMAC-SHA256
          of the raw body, keyed by the flow secret.
        </p>
        <div className="kv">
          <span>URL</span>
          <code className="mono">{flow.webhookUrl}</code>
          <CopyButton text={flow.webhookUrl} label="Copy URL" />
        </div>
        <div className="kv">
          <span>Secret</span>
          <code className="mono">{flow.secret}</code>
          <CopyButton text={flow.secret} label="Copy secret" />
        </div>
        <h3 className="subhead">Curl example</h3>
        <pre className="pre">{curlExample}</pre>
        <p className="hint">
          The secret is filled in above — copy the example and run it
          as-is. The backend runs at {apiUrl()}.
        </p>
        <CopyButton text={curlExample} label="Copy curl example" />
      </section>

      <section className="card">
        <h2>Summary</h2>
        {stats ? (
          <div className="stat-grid">
            <div>
              <div className="stat-num num">{stats.total}</div>
              <div className="stat-label">Total runs</div>
            </div>
            <div>
              <div className="stat-num num">{stats.success}</div>
              <div className="stat-label">Success</div>
            </div>
            <div>
              <div className="stat-num num">{stats.failed}</div>
              <div className="stat-label">Failed</div>
            </div>
            <div>
              <div className="stat-num num">{stats.filtered}</div>
              <div className="stat-label">Filtered</div>
            </div>
            <div>
              <div className="stat-num num">{stats.avgDurationMs} ms</div>
              <div className="stat-label">Average duration</div>
            </div>
            <div>
              <div className="stat-num num">
                {stats.lastRunAt
                  ? new Date(stats.lastRunAt).toLocaleString()
                  : "—"}
              </div>
              <div className="stat-label">Last run</div>
            </div>
          </div>
        ) : (
          <EmptyState>No runs yet.</EmptyState>
        )}
      </section>

      <section className="card">
        <h2>Send test event</h2>
        <p>
          Edit the JSON below and send it to this flow. It is signed with
          the flow secret, exactly like a real sender would.
        </p>
        <label className="field-label" htmlFor="test-event-json">
          Event JSON
        </label>
        <textarea
          id="test-event-json"
          className="input textarea mono"
          rows={9}
          value={testJson}
          onChange={(e) => setTestJson(e.target.value)}
        />
        <div className="form-row">
          <button
            className="btn btn-primary"
            type="button"
            disabled={sending}
            onClick={() => void onSendTest()}
          >
            {sending ? "Sending…" : "Send test event"}
          </button>
        </div>
        {testError && <p className="field-error">{testError}</p>}
        {testResult && (
          <p className="notice">
            Run {testResult.status}:{" "}
            <Link href={`/runs/${testResult.runId}`}>view the run</Link>
          </p>
        )}
        {refreshNote && <p className="notice">{refreshNote}</p>}
      </section>

      <section className="card">
        <h2>Run history</h2>
        <RunTable flowId={flow.id} refreshKey={historyRefreshKey} />
      </section>
    </>
  );
}

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ApiError, getRun } from "@/lib/api";
import type { RunDetail, RunStepRecord } from "@/lib/types";
import { EmptyState, ErrorState, Loading } from "@/components/StateViews";

function statusPill(status: string) {
  if (status === "success") return <span className="pill pill-ok">Success</span>;
  if (status === "failed") return <span className="pill pill-bad">Failed</span>;
  return <span className="pill">Filtered</span>;
}

function prettyJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function StepCard({ step }: { step: RunStepRecord }) {
  return (
    <div className="step-card">
      <div className="step-head">
        <span>
          Step {step.position} · {step.type}
        </span>
        <span className="step-actions">
          {statusPill(step.status)}
          <span className="num muted">{step.durationMs} ms</span>
        </span>
      </div>
      <div className="kv">
        <span>Input</span>
        <pre className="pre">{prettyJson(step.input)}</pre>
      </div>
      {step.output !== null && (
        <div className="kv">
          <span>Output</span>
          <pre className="pre">{prettyJson(step.output)}</pre>
        </div>
      )}
      {step.error && (
        <p className="field-error">{step.error}</p>
      )}
    </div>
  );
}

export default function RunPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [run, setRun] = useState<RunDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      setRun(await getRun(id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load the run.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (loading) return <Loading label="Loading run…" />;
  if (error && !run) {
    return (
      <>
        <div className="page-head">
          <h1>Run</h1>
        </div>
        <ErrorState message={error} onRetry={() => void load()} />
      </>
    );
  }
  if (!run) {
    return (
      <>
        <div className="page-head">
          <h1>Run</h1>
        </div>
        <EmptyState>This run does not exist.</EmptyState>
      </>
    );
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>
            Run · {statusPill(run.status)}
          </h1>
          <p>
            Flow: {run.flowName} · Started{" "}
            {new Date(run.startedAt).toLocaleString()} · Duration{" "}
            <span className="num">{run.durationMs} ms</span>
          </p>
        </div>
        <Link href={`/flows/${run.flowId}`} className="btn">
          Back to flow
        </Link>
      </div>

      {run.error && (
        <p className="notice">Run failed: {run.error}</p>
      )}

      <section className="card">
        <h2>Incoming payload</h2>
        <pre className="pre">{prettyJson(run.payload)}</pre>
      </section>

      <section>
        <h2 className="section-head">Steps</h2>
        {run.steps.length === 0 ? (
          <div className="card">
            <EmptyState>No steps were recorded for this run.</EmptyState>
          </div>
        ) : (
          run.steps.map((step) => <StepCard key={step.id} step={step} />)
        )}
      </section>
    </>
  );
}

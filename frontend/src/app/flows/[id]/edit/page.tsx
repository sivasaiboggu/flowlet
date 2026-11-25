"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ApiError, deleteFlow, getFlow, updateFlow } from "@/lib/api";
import type { Flow, FlowInput } from "@/lib/types";
import FlowForm, { flowToDraft } from "@/components/FlowForm";
import { EmptyState, ErrorState, Loading } from "@/components/StateViews";
import type { FlowDraft } from "@/lib/validation";

export default function EditFlowPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();
  const [draft, setDraft] = useState<FlowDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const flow = await getFlow(id);
      setDraft(flowToDraft(flow));
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

  async function handleSubmit(input: FlowInput) {
    setSubmitting(true);
    setServerErrors({});
    setSubmitError("");
    try {
      await updateFlow(id, input);
      router.push(`/flows/${id}`);
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.details).length > 0) {
        setServerErrors(err.details);
      } else {
        setSubmitError(
          err instanceof ApiError ? err.message : "Could not save the flow.",
        );
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!window.confirm("Delete this flow? Its run history stays, but the webhook URL stops working.")) {
      return;
    }
    setDeleting(true);
    try {
      await deleteFlow(id);
      router.push("/flows");
    } catch (err) {
      setSubmitError(
        err instanceof ApiError ? err.message : "Could not delete the flow.",
      );
    } finally {
      setDeleting(false);
    }
  }

  if (loading) return <Loading label="Loading flow…" />;
  if (error && !draft) {
    return (
      <>
        <div className="page-head">
          <h1>Edit flow</h1>
        </div>
        <ErrorState message={error} onRetry={() => void load()} />
      </>
    );
  }
  if (!draft) {
    return (
      <>
        <div className="page-head">
          <h1>Edit flow</h1>
        </div>
        <EmptyState>This flow does not exist.</EmptyState>
      </>
    );
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Edit flow</h1>
          <p>Change the name, description, enabled flag or steps.</p>
        </div>
      </div>
      {submitError && <p className="notice">{submitError}</p>}
      <FlowForm
        initial={draft}
        submitLabel="Save changes"
        submitting={submitting}
        serverErrors={serverErrors}
        onSubmit={handleSubmit}
      />
      <section className="card danger-zone">
        <h2>Delete this flow</h2>
        <p>
          The webhook URL stops working. Past runs stay in the history, so
          what already happened is still visible.
        </p>
        <button
          className="btn btn-danger"
          type="button"
          disabled={deleting}
          onClick={() => void handleDelete()}
        >
          {deleting ? "Deleting…" : "Delete flow"}
        </button>
      </section>
    </>
  );
}

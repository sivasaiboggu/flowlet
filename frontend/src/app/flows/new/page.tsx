"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError, createFlow } from "@/lib/api";
import type { FlowInput } from "@/lib/types";
import FlowForm from "@/components/FlowForm";

export default function NewFlowPage() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState("");

  async function handleSubmit(input: FlowInput) {
    setSubmitting(true);
    setServerErrors({});
    setSubmitError("");
    try {
      const flow = await createFlow(input);
      router.push(`/flows/${flow.id}`);
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.details).length > 0) {
        setServerErrors(err.details);
      } else {
        setSubmitError(
          err instanceof ApiError ? err.message : "Could not create the flow.",
        );
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>New flow</h1>
          <p>Give it a name and steps. The webhook URL is created with it.</p>
        </div>
      </div>
      {submitError && <p className="notice">{submitError}</p>}
      <FlowForm
        submitLabel="Create flow"
        submitting={submitting}
        serverErrors={serverErrors}
        onSubmit={handleSubmit}
      />
    </>
  );
}

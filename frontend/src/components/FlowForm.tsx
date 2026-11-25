/**
 * The flow form, shared by /flows/new and /flows/[id]/edit.
 * Name, description, enabled flag, and a step list with add, remove
 * and reorder. Every field has a label, and every invalid field shows
 * its message next to it — from client validation first, then from the
 * server's field errors (props.serverErrors).
 */
"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import type { Flow, FlowInput } from "@/lib/types";
import {
  draftToInput,
  newKey,
  validateDraft,
  type FlowDraft,
  type StepDraft,
} from "@/lib/validation";

export function flowToDraft(flow: Flow): FlowDraft {
  return {
    name: flow.name,
    description: flow.description ?? "",
    enabled: flow.enabled,
    steps: flow.steps.map((step): StepDraft => {
      if (step.type === "filter") {
        return {
          key: newKey(),
          type: "filter",
          field: step.field,
          operator: step.operator,
          valueText: JSON.stringify(step.value),
        };
      }
      if (step.type === "transform") {
        return {
          key: newKey(),
          type: "transform",
          mapping: Object.entries(step.mapping).map(([outKey, path]) => ({
            key: newKey(),
            outKey,
            path,
          })),
        };
      }
      return {
        key: newKey(),
        type: "http_request",
        url: step.url,
        method: step.method,
      };
    }),
  };
}

function Field({
  label,
  htmlFor,
  error,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="field">
      <label htmlFor={htmlFor}>{label}</label>
      {children}
      {hint && <p className="hint">{hint}</p>}
      {error && <p className="field-error">{error}</p>}
    </div>
  );
}

const STEP_TYPE_LABELS: Record<StepDraft["type"], string> = {
  filter: "Filter",
  transform: "Transform",
  http_request: "HTTP request",
};

export default function FlowForm({
  initial,
  submitLabel,
  submitting,
  serverErrors,
  onSubmit,
}: {
  initial?: FlowDraft;
  submitLabel: string;
  submitting: boolean;
  serverErrors: Record<string, string>;
  onSubmit: (input: FlowInput) => Promise<void>;
}) {
  const [draft, setDraft] = useState<FlowDraft>(
    initial ?? {
      name: "",
      description: "",
      enabled: true,
      steps: [
        {
          key: newKey(),
          type: "filter",
          field: "order.amount",
          operator: "gt",
          valueText: "1000",
        },
      ],
    },
  );
  const [clientErrors, setClientErrors] = useState<Record<string, string>>({});
  const [newStepType, setNewStepType] = useState<StepDraft["type"]>("filter");

  // Server errors first, client errors on top after a submit attempt.
  const errors = { ...serverErrors, ...clientErrors };

  function updateDraft(patch: Partial<FlowDraft>) {
    setDraft((prev) => ({ ...prev, ...patch }));
  }

  function updateStep(index: number, patch: Partial<StepDraft>) {
    setDraft((prev) => ({
      ...prev,
      steps: prev.steps.map((step, i) =>
        i === index ? ({ ...step, ...patch } as StepDraft) : step,
      ),
    }));
  }

  function moveStep(index: number, direction: -1 | 1) {
    setDraft((prev) => {
      const steps = [...prev.steps];
      const target = index + direction;
      if (target < 0 || target >= steps.length) return prev;
      [steps[index], steps[target]] = [steps[target], steps[index]];
      return { ...prev, steps };
    });
  }

  function removeStep(index: number) {
    setDraft((prev) => ({
      ...prev,
      steps: prev.steps.filter((_, i) => i !== index),
    }));
  }

  function addStep() {
    const base: StepDraft =
      newStepType === "filter"
        ? { key: newKey(), type: "filter", field: "", operator: "eq", valueText: "" }
        : newStepType === "transform"
          ? { key: newKey(), type: "transform", mapping: [{ key: newKey(), outKey: "", path: "" }] }
          : { key: newKey(), type: "http_request", url: "", method: "POST" };
    setDraft((prev) => ({ ...prev, steps: [...prev.steps, base] }));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const found = validateDraft(draft);
    setClientErrors(found);
    if (Object.keys(found).length > 0) return;
    await onSubmit(draftToInput(draft));
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <section className="card">
        <Field label="Name" htmlFor="flow-name" error={errors.name}>
          <input
            id="flow-name"
            className="input"
            type="text"
            value={draft.name}
            onChange={(e) => updateDraft({ name: e.target.value })}
            maxLength={80}
            placeholder="High value orders"
          />
        </Field>
        <Field
          label="Description (optional)"
          htmlFor="flow-description"
          error={errors.description}
        >
          <textarea
            id="flow-description"
            className="input textarea"
            value={draft.description}
            onChange={(e) => updateDraft({ description: e.target.value })}
            rows={2}
            maxLength={500}
            placeholder="What this flow is for"
          />
        </Field>
        <div className="field">
          <label className="check-label">
            <input
              type="checkbox"
              checked={draft.enabled}
              onChange={(e) => updateDraft({ enabled: e.target.checked })}
            />
            Enabled — a disabled flow answers its webhook with 409
          </label>
        </div>
      </section>

      <section className="card">
        <h2>Steps</h2>
        <p>Steps run in order. A filter that fails stops the run here.</p>
        {errors.steps && <p className="field-error">{errors.steps}</p>}

        {draft.steps.map((step, i) => (
          <div className="step-card" key={step.key}>
            <div className="step-head">
              <span>
                Step {i + 1} · {STEP_TYPE_LABELS[step.type]}
              </span>
              <span className="step-actions">
                <button
                  type="button"
                  className="mini-btn"
                  disabled={i === 0}
                  onClick={() => moveStep(i, -1)}
                  aria-label={`Move step ${i + 1} up`}
                >
                  ↑ Up
                </button>
                <button
                  type="button"
                  className="mini-btn"
                  disabled={i === draft.steps.length - 1}
                  onClick={() => moveStep(i, 1)}
                  aria-label={`Move step ${i + 1} down`}
                >
                  ↓ Down
                </button>
                <button
                  type="button"
                  className="mini-btn mini-btn-danger"
                  onClick={() => removeStep(i)}
                  aria-label={`Remove step ${i + 1}`}
                >
                  Remove
                </button>
              </span>
            </div>

            {step.type === "filter" && (
              <>
                <Field
                  label="Field (dot path)"
                  htmlFor={`step-${i}-field`}
                  error={errors[`steps.${i}.field`]}
                >
                  <input
                    id={`step-${i}-field`}
                    className="input mono"
                    type="text"
                    value={step.field}
                    onChange={(e) => updateStep(i, { field: e.target.value })}
                    placeholder="order.amount"
                  />
                </Field>
                <Field label="Operator" htmlFor={`step-${i}-operator`}>
                  <select
                    id={`step-${i}-operator`}
                    className="input select"
                    value={step.operator}
                    onChange={(e) =>
                      updateStep(i, {
                        operator: e.target.value as
                          | "eq"
                          | "neq"
                          | "gt"
                          | "lt"
                          | "contains",
                      })
                    }
                  >
                    <option value="eq">equals (eq)</option>
                    <option value="neq">not equals (neq)</option>
                    <option value="gt">greater than (gt)</option>
                    <option value="lt">less than (lt)</option>
                    <option value="contains">contains</option>
                  </select>
                </Field>
                <Field
                  label="Value (JSON)"
                  htmlFor={`step-${i}-value`}
                  error={errors[`steps.${i}.value`]}
                  hint='A JSON value: 1000, "active", true, or ["a", "b"].'
                >
                  <input
                    id={`step-${i}-value`}
                    className="input mono"
                    type="text"
                    value={step.valueText}
                    onChange={(e) => updateStep(i, { valueText: e.target.value })}
                    placeholder="1000"
                  />
                </Field>
              </>
            )}

            {step.type === "transform" && (
              <>
                {errors[`steps.${i}.mapping`] && (
                  <p className="field-error">{errors[`steps.${i}.mapping`]}</p>
                )}
                {step.mapping.map((entry, j) => (
                  <div className="mapping-row" key={entry.key}>
                    <Field
                      label="Output field"
                      htmlFor={`step-${i}-map-${j}-key`}
                      error={errors[`steps.${i}.mapping.${j}.outKey`]}
                    >
                      <input
                        id={`step-${i}-map-${j}-key`}
                        className="input mono"
                        type="text"
                        value={entry.outKey}
                        onChange={(e) =>
                          updateStep(i, {
                            mapping: step.mapping.map((m, k) =>
                              k === j ? { ...m, outKey: e.target.value } : m,
                            ),
                          })
                        }
                        placeholder="orderId"
                      />
                    </Field>
                    <Field
                      label="Dot path"
                      htmlFor={`step-${i}-map-${j}-path`}
                      error={errors[`steps.${i}.mapping.${j}.path`]}
                    >
                      <input
                        id={`step-${i}-map-${j}-path`}
                        className="input mono"
                        type="text"
                        value={entry.path}
                        onChange={(e) =>
                          updateStep(i, {
                            mapping: step.mapping.map((m, k) =>
                              k === j ? { ...m, path: e.target.value } : m,
                            ),
                          })
                        }
                        placeholder="order.id"
                      />
                    </Field>
                    <button
                      type="button"
                      className="mini-btn mini-btn-danger"
                      onClick={() =>
                        updateStep(i, {
                          mapping: step.mapping.filter((_, k) => k !== j),
                        })
                      }
                      aria-label="Remove mapping row"
                    >
                      Remove
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className="btn"
                  onClick={() =>
                    updateStep(i, {
                      mapping: [
                        ...step.mapping,
                        { key: newKey(), outKey: "", path: "" },
                      ],
                    })
                  }
                >
                  Add output field
                </button>
              </>
            )}

            {step.type === "http_request" && (
              <>
                <Field
                  label="URL"
                  htmlFor={`step-${i}-url`}
                  error={errors[`steps.${i}.url`]}
                >
                  <input
                    id={`step-${i}-url`}
                    className="input mono"
                    type="text"
                    value={step.url}
                    onChange={(e) => updateStep(i, { url: e.target.value })}
                    placeholder="http://localhost:4000/api/mock/receiver"
                  />
                </Field>
                <Field label="Method" htmlFor={`step-${i}-method`}>
                  <select
                    id={`step-${i}-method`}
                    className="input select"
                    value={step.method}
                    onChange={(e) =>
                      updateStep(i, { method: e.target.value as "POST" | "PUT" })
                    }
                  >
                    <option value="POST">POST</option>
                    <option value="PUT">PUT</option>
                  </select>
                </Field>
              </>
            )}
          </div>
        ))}

        <div className="form-row">
          <select
            className="input select"
            value={newStepType}
            onChange={(e) =>
              setNewStepType(e.target.value as StepDraft["type"])
            }
            aria-label="New step type"
          >
            <option value="filter">Filter</option>
            <option value="transform">Transform</option>
            <option value="http_request">HTTP request</option>
          </select>
          <button type="button" className="btn" onClick={addStep}>
            Add step
          </button>
        </div>
      </section>

      <div className="form-row">
        <button className="btn btn-primary" type="submit" disabled={submitting}>
          {submitting ? "Saving…" : submitLabel}
        </button>
      </div>
    </form>
  );
}

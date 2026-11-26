/**
 * Client-side validation for the flow form. It mirrors the backend
 * rules (backend/src/validation.ts) so mistakes are caught before the
 * request leaves the browser; the backend still re-validates everything
 * and its field errors are shown the same way.
 */
import type { FlowStep, JsonValue } from "./types";

export type StepDraft =
  | {
      key: string;
      type: "filter";
      field: string;
      operator: "eq" | "neq" | "gt" | "lt" | "contains";
      valueText: string;
    }
  | {
      key: string;
      type: "transform";
      mapping: { key: string; outKey: string; path: string }[];
    }
  | { key: string; type: "http_request"; url: string; method: "POST" | "PUT" };

export type FlowDraft = {
  name: string;
  description: string;
  enabled: boolean;
  steps: StepDraft[];
};

const DOT_PATH = /^([A-Za-z_$][A-Za-z0-9_$]*)(\.[A-Za-z_$][A-Za-z0-9_$]*|\[\d+\])*$/;

export function validateDraft(draft: FlowDraft): Record<string, string> {
  const errors: Record<string, string> = {};
  const name = draft.name.trim();
  if (name.length < 3) errors.name = "Name must be at least 3 characters";
  else if (name.length > 80) errors.name = "Name must be at most 80 characters";
  if (draft.description.length > 500) {
    errors.description = "Description must be at most 500 characters";
  }
  if (draft.steps.length < 1) errors.steps = "A flow needs at least 1 step";
  if (draft.steps.length > 5) errors.steps = "A flow can have at most 5 steps";

  draft.steps.forEach((step, i) => {
    const base = `steps.${i}`;
    if (step.type === "filter") {
      if (!DOT_PATH.test(step.field)) {
        errors[`${base}.field`] = "Field must be a dot path like order.amount";
      }
      try {
        JSON.parse(step.valueText);
      } catch {
        errors[`${base}.value`] = "Value must be valid JSON, e.g. 1000";
      }
    }
    if (step.type === "transform") {
      if (step.mapping.length === 0) {
        errors[`${base}.mapping`] = "Add at least one output field";
      }
      const seenNames = new Set<string>();
      step.mapping.forEach((entry, j) => {
        if (!entry.outKey.trim()) {
          errors[`${base}.mapping.${j}.outKey`] = "Output field name is required";
        } else if (seenNames.has(entry.outKey.trim())) {
          // A mapping is an object, so a repeated name would silently
          // overwrite the earlier row — flag it at the row instead.
          errors[`${base}.mapping.${j}.outKey`] =
            "Output field names must be unique";
        } else {
          seenNames.add(entry.outKey.trim());
        }
        if (!DOT_PATH.test(entry.path)) {
          errors[`${base}.mapping.${j}.path`] =
            "Path must be a dot path like order.id";
        }
      });
    }
    if (step.type === "http_request") {
      if (!step.url.trim()) {
        errors[`${base}.url`] = "URL is required";
      } else {
        try {
          const parsed = new URL(step.url);
          if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
            errors[`${base}.url`] = "URL must start with http:// or https://";
          }
        } catch {
          errors[`${base}.url`] = "URL is not valid";
        }
      }
    }
  });
  return errors;
}

/** Convert a valid draft into the API payload. Call only after validation passes. */
export function draftToInput(draft: FlowDraft): {
  name: string;
  description: string | null;
  enabled: boolean;
  steps: FlowStep[];
} {
  return {
    name: draft.name.trim(),
    description: draft.description.trim() || null,
    enabled: draft.enabled,
    steps: draft.steps.map((step): FlowStep => {
      if (step.type === "filter") {
        return {
          type: "filter",
          field: step.field,
          operator: step.operator,
          value: JSON.parse(step.valueText) as JsonValue,
        };
      }
      if (step.type === "transform") {
        const mapping: Record<string, string> = {};
        for (const entry of step.mapping) {
          mapping[entry.outKey.trim()] = entry.path.trim();
        }
        return { type: "transform", mapping };
      }
      return { type: "http_request", url: step.url.trim(), method: step.method };
    }),
  };
}

let keyCounter = 0;
export function newKey(): string {
  keyCounter += 1;
  return `step-${Date.now()}-${keyCounter}`;
}

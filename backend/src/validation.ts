/**
 * Runtime validation for every request body. TypeScript types disappear
 * at runtime, so nothing from a client is trusted until it passes here.
 * Errors are keyed by field path (e.g. "steps.0.field") so the frontend
 * can show each message next to the field it belongs to.
 */
import type { FlowStep, JsonValue } from "./types";
import { validationError, type ApiError } from "./lib/errors";

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: ApiError };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isJsonValue(value: unknown): value is JsonValue {
  if (value === null) return true;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return true;
  }
  if (Array.isArray(value)) return value.every(isJsonValue);
  if (isRecord(value)) return Object.values(value).every(isJsonValue);
  return false;
}

/** A dot path such as order.amount or order.items[0].price. */
const DOT_PATH = /^([A-Za-z_$][A-Za-z0-9_$]*)(\.[A-Za-z_$][A-Za-z0-9_$]*|\[\d+\])*$/;

const FILTER_OPERATORS = ["eq", "neq", "gt", "lt", "contains"] as const;

export type FlowInput = {
  name: string;
  description: string | null;
  enabled: boolean;
  steps: FlowStep[];
};

export type FlowPatch = {
  name?: string;
  description?: string | null;
  enabled?: boolean;
  steps?: FlowStep[];
};

function validateName(
  value: unknown,
  errors: Record<string, string>,
  field: string,
): string | undefined {
  if (typeof value !== "string") {
    errors[field] = "Name must be a string";
    return undefined;
  }
  const name = value.trim();
  if (name.length < 3) {
    errors[field] = "Name must be at least 3 characters";
    return undefined;
  }
  if (name.length > 80) {
    errors[field] = "Name must be at most 80 characters";
    return undefined;
  }
  return name;
}

function validateDescription(
  value: unknown,
  errors: Record<string, string>,
  field: string,
): string | null | undefined {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") {
    errors[field] = "Description must be a string";
    return undefined;
  }
  if (value.length > 500) {
    errors[field] = "Description must be at most 500 characters";
    return undefined;
  }
  return value;
}

function validateSteps(
  value: unknown,
  errors: Record<string, string>,
  field: string,
): FlowStep[] | undefined {
  if (!Array.isArray(value)) {
    errors[field] = "Steps must be a list";
    return undefined;
  }
  if (value.length < 1) {
    errors[field] = "A flow needs at least 1 step";
    return undefined;
  }
  if (value.length > 5) {
    errors[field] = "A flow can have at most 5 steps";
    return undefined;
  }
  const steps: FlowStep[] = [];
  value.forEach((raw, i) => {
    const base = `${field}.${i}`;
    if (!isRecord(raw)) {
      errors[base] = "Step must be an object";
      return;
    }
    if (raw.type === "filter") {
      if (typeof raw.field !== "string" || !DOT_PATH.test(raw.field)) {
        errors[`${base}.field`] = "Field must be a dot path like order.amount";
      }
      if (
        typeof raw.operator !== "string" ||
        !(FILTER_OPERATORS as readonly string[]).includes(raw.operator)
      ) {
        errors[`${base}.operator`] =
          "Operator must be one of eq, neq, gt, lt, contains";
      }
      if (!("value" in raw) || !isJsonValue(raw.value)) {
        errors[`${base}.value`] = "Value must be a JSON value";
      }
      if (!errors[`${base}.field`] && !errors[`${base}.operator`] && !errors[`${base}.value`]) {
        steps.push({
          type: "filter",
          field: raw.field as string,
          operator: raw.operator as "eq" | "neq" | "gt" | "lt" | "contains",
          value: raw.value as JsonValue,
        });
      }
      return;
    }
    if (raw.type === "transform") {
      if (!isRecord(raw.mapping) || Object.keys(raw.mapping).length === 0) {
        errors[`${base}.mapping`] = "Mapping must be a non-empty object";
        return;
      }
      let bad = false;
      // Error keys are by row index (steps.0.mapping.0.path), the same
      // keys the frontend uses to show each message next to its field.
      // Keying by the output name instead meant the message never
      // appeared anywhere.
      Object.entries(raw.mapping).forEach(([outKey, dotPath], j) => {
        if (!outKey.trim()) {
          errors[`${base}.mapping.${j}.outKey`] = "Output field name is required";
          bad = true;
        }
        if (typeof dotPath !== "string" || !DOT_PATH.test(dotPath)) {
          errors[`${base}.mapping.${j}.path`] =
            "Each mapping value must be a dot path like order.id";
          bad = true;
        }
      });
      if (!bad) {
        steps.push({
          type: "transform",
          mapping: raw.mapping as Record<string, string>,
        });
      }
      return;
    }
    if (raw.type === "http_request") {
      if (typeof raw.url !== "string") {
        errors[`${base}.url`] = "URL must be a string";
      } else {
        try {
          const parsed = new URL(raw.url);
          if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
            errors[`${base}.url`] = "URL must start with http:// or https://";
          }
        } catch {
          errors[`${base}.url`] = "URL is not valid";
        }
      }
      if (raw.method !== "POST" && raw.method !== "PUT") {
        errors[`${base}.method`] = "Method must be POST or PUT";
      }
      if (!errors[`${base}.url`] && !errors[`${base}.method`]) {
        steps.push({
          type: "http_request",
          url: raw.url as string,
          method: raw.method as "POST" | "PUT",
        });
      }
      return;
    }
    errors[`${base}.type`] = "Step type must be filter, transform or http_request";
  });
  return Object.keys(errors).length === 0 ? steps : undefined;
}

export function validateFlowInput(body: unknown): ValidationResult<FlowInput> {
  const errors: Record<string, string> = {};
  if (!isRecord(body)) {
    return {
      ok: false,
      error: validationError("Request body must be a JSON object"),
    };
  }
  const name = validateName(body.name, errors, "name");
  const description = validateDescription(body.description, errors, "description");
  let enabled = true;
  if (body.enabled !== undefined) {
    if (typeof body.enabled !== "boolean") {
      errors.enabled = "Enabled must be true or false";
    } else {
      enabled = body.enabled;
    }
  }
  const steps = validateSteps(body.steps, errors, "steps");
  if (Object.keys(errors).length > 0 || name === undefined || description === undefined || steps === undefined) {
    return {
      ok: false,
      error: validationError("Flow is not valid", errors),
    };
  }
  return { ok: true, value: { name, description, enabled, steps } };
}

export function validateFlowPatch(body: unknown): ValidationResult<FlowPatch> {
  const errors: Record<string, string> = {};
  if (!isRecord(body)) {
    return {
      ok: false,
      error: validationError("Request body must be a JSON object"),
    };
  }
  const patch: FlowPatch = {};
  if ("name" in body) {
    const name = validateName(body.name, errors, "name");
    if (name !== undefined) patch.name = name;
  }
  if ("description" in body) {
    const description = validateDescription(body.description, errors, "description");
    if (description !== undefined) patch.description = description;
  }
  if ("enabled" in body) {
    if (typeof body.enabled !== "boolean") {
      errors.enabled = "Enabled must be true or false";
    } else {
      patch.enabled = body.enabled;
    }
  }
  if ("steps" in body) {
    const steps = validateSteps(body.steps, errors, "steps");
    if (steps !== undefined) patch.steps = steps;
  }
  if (Object.keys(patch).length === 0 && Object.keys(errors).length === 0) {
    return {
      ok: false,
      error: validationError("Nothing to update — send name, description, enabled or steps"),
    };
  }
  if (Object.keys(errors).length > 0) {
    return {
      ok: false,
      error: validationError("Flow update is not valid", errors),
    };
  }
  return { ok: true, value: patch };
}

/** A MongoDB ObjectId as a 24-character hex string. */
export function isFlowId(value: string): boolean {
  return /^[0-9a-fA-F]{24}$/.test(value);
}

/** A UUID (run ids are random UUIDs). */
export function isRunId(value: string): boolean {
  return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(value);
}

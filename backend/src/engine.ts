/**
 * The step engine: pure logic, no database, no HTTP server. Every step
 * runs in order, in the webhook request, against the current data.
 *
 * - filter: compares a dot-path field; false stops the run as filtered.
 * - transform: rebuilds the data from a mapping; the new object becomes
 *   the data for the next step.
 * - http_request: posts the current data; a network error, a timeout or
 *   a non-2xx response fails the step and the run. The data does not
 *   change after an http_request — only transform reshapes it.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import type { FilterOperator, FlowStep, JsonValue, RunStatus } from "./types";

export const HTTP_TIMEOUT_MS = 5000;
const MAX_HTTP_BODY_CHARS = 2048;

/** Read a dot path such as order.amount or order.items[0].price. */
export function getValueAtPath(data: unknown, path: string): unknown {
  const tokens = path.match(/[^.[\]]+|\[(\d+)\]/g) ?? [];
  let current: unknown = data;
  for (const token of tokens) {
    if (current === null || current === undefined) return undefined;
    const indexMatch = /^\[(\d+)\]$/.exec(token);
    if (indexMatch) {
      if (!Array.isArray(current)) return undefined;
      current = current[Number(indexMatch[1])];
      continue;
    }
    if (typeof current !== "object") return undefined;
    // Own properties only: a lookup must never read an inherited
    // property (constructor, toString, __proto__, …) off the prototype.
    if (!Object.prototype.hasOwnProperty.call(current, token)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[token];
  }
  return current;
}

/**
 * Deep equality that does not depend on key order: two objects are
 * equal when they have the same keys with deeply equal values.
 * Arrays keep their order — [1, 2] is not [2, 1].
 */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) {
    return false;
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
      return false;
    }
    return a.every((item, i) => deepEqual(item, b[i]));
  }
  const aRecord = a as Record<string, unknown>;
  const bRecord = b as Record<string, unknown>;
  const aKeys = Object.keys(aRecord);
  const bKeys = Object.keys(bRecord);
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every(
    (key) =>
      Object.prototype.hasOwnProperty.call(bRecord, key) &&
      deepEqual(aRecord[key], bRecord[key]),
  );
}

/** A filter passes only when the comparison is true. Missing fields, type mismatches and non-numeric gt/lt all fail the filter. */
export function evalFilter(
  fieldValue: unknown,
  operator: FilterOperator,
  expected: JsonValue,
): boolean {
  // A missing field fails every operator, including neq: "not equal to
  // 1000" is not a claim about a value that does not exist.
  if (fieldValue === undefined) return false;
  switch (operator) {
    case "eq":
      return deepEqual(fieldValue, expected);
    case "neq":
      return !deepEqual(fieldValue, expected);
    case "gt":
      return (
        typeof fieldValue === "number" &&
        typeof expected === "number" &&
        fieldValue > expected
      );
    case "lt":
      return (
        typeof fieldValue === "number" &&
        typeof expected === "number" &&
        fieldValue < expected
      );
    case "contains":
      if (typeof fieldValue === "string" && typeof expected === "string") {
        return fieldValue.includes(expected);
      }
      if (Array.isArray(fieldValue)) {
        return fieldValue.some((item) => deepEqual(item, expected));
      }
      return false;
  }
}

/** A JSON-safe deep copy, so a step's recorded input can never be mutated by a later step. */
function snapshot(value: JsonValue): JsonValue {
  return JSON.parse(JSON.stringify(value)) as JsonValue;
}

export type StepOutcome = {
  position: number;
  type: FlowStep["type"];
  status: "success" | "failed" | "skipped";
  input: JsonValue;
  output: JsonValue | null;
  error: string | null;
  durationMs: number;
};

export type EngineResult = {
  status: RunStatus;
  steps: StepOutcome[];
  error: string | null;
};

async function runHttpStep(
  step: Extract<FlowStep, { type: "http_request" }>,
  data: JsonValue,
  position: number,
): Promise<StepOutcome> {
  const started = performance.now();
  const input = snapshot(data);
  try {
    const res = await fetch(step.url, {
      method: step.method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
      // Never follow redirects: a 3xx must be reported as the failure
      // it is, not silently turned into the redirect target's 2xx.
      redirect: "manual",
      signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
    });
    const text = await res.text();
    const body = text.slice(0, MAX_HTTP_BODY_CHARS);
    const output: JsonValue = { status: res.status, body };
    if (!res.ok) {
      return {
        position,
        type: "http_request",
        status: "failed",
        input,
        output,
        error: `HTTP ${res.status} from ${step.url}`,
        durationMs: Math.round(performance.now() - started),
      };
    }
    return {
      position,
      type: "http_request",
      status: "success",
      input,
      output,
      error: null,
      durationMs: Math.round(performance.now() - started),
    };
  } catch (err) {
    const message =
      err instanceof Error && err.name === "TimeoutError"
        ? `Request to ${step.url} timed out after ${HTTP_TIMEOUT_MS}ms`
        : `Request to ${step.url} failed: ${err instanceof Error ? err.message : "unknown error"}`;
    return {
      position,
      type: "http_request",
      status: "failed",
      input,
      output: null,
      error: message,
      durationMs: Math.round(performance.now() - started),
    };
  }
}

/** Records for the steps that never ran, once a run has stopped. */
function skippedOutcomes(
  steps: FlowStep[],
  fromIndex: number,
  data: JsonValue,
): StepOutcome[] {
  const outcomes: StepOutcome[] = [];
  for (let j = fromIndex; j < steps.length; j++) {
    outcomes.push({
      position: j + 1,
      type: steps[j].type,
      status: "skipped",
      input: snapshot(data),
      output: null,
      error: null,
      durationMs: 0,
    });
  }
  return outcomes;
}

export async function runSteps(
  steps: FlowStep[],
  initialData: JsonValue,
): Promise<EngineResult> {
  const outcomes: StepOutcome[] = [];
  let data = initialData;

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const position = i + 1;

    if (step.type === "filter") {
      const started = performance.now();
      const fieldValue = getValueAtPath(data, step.field);
      const matched = evalFilter(fieldValue, step.operator, step.value);
      outcomes.push({
        position,
        type: "filter",
        status: "success",
        input: snapshot(data),
        output: { matched },
        error: null,
        durationMs: Math.round(performance.now() - started),
      });
      if (!matched) {
        // The run stops here as filtered; the rest are skipped.
        outcomes.push(...skippedOutcomes(steps, i + 1, data));
        return { status: "filtered", steps: outcomes, error: null };
      }
      continue;
    }

    if (step.type === "transform") {
      const started = performance.now();
      const next: { [key: string]: JsonValue } = {};
      for (const [outKey, dotPath] of Object.entries(step.mapping)) {
        const value = getValueAtPath(data, dotPath);
        next[outKey] = value === undefined ? null : (value as JsonValue);
      }
      outcomes.push({
        position,
        type: "transform",
        status: "success",
        input: snapshot(data),
        output: snapshot(next),
        error: null,
        durationMs: Math.round(performance.now() - started),
      });
      data = next;
      continue;
    }

    // http_request
    const outcome = await runHttpStep(step, data, position);
    outcomes.push(outcome);
    if (outcome.status === "failed") {
      // The run stops here as failed, but the later steps still get
      // records — a run's step list must always cover every step.
      outcomes.push(...skippedOutcomes(steps, i + 1, data));
      return { status: "failed", steps: outcomes, error: outcome.error };
    }
  }

  return { status: "success", steps: outcomes, error: null };
}

/**
 * HMAC-SHA256 signature, from brief section 3.2:
 * X-Flowlet-Signature: sha256=<hex of HMAC(raw body, flow secret)>.
 * Comparison is timing-safe; a length mismatch is a plain failure
 * (timingSafeEqual throws on different lengths).
 */
export function signBody(secret: string, rawBody: Buffer): string {
  return createHmac("sha256", secret).update(rawBody).digest("hex");
}

export function verifySignature(
  secret: string,
  rawBody: Buffer,
  header: string | null,
): boolean {
  if (!header || !header.startsWith("sha256=")) return false;
  const provided = header.slice("sha256=".length);
  if (!/^[0-9a-fA-F]{64}$/.test(provided)) return false;
  const expected = Buffer.from(signBody(secret, rawBody), "utf8");
  const actual = Buffer.from(provided.toLowerCase(), "utf8");
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}

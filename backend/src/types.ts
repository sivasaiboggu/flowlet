/**
 * Domain types. Strict TypeScript throughout: no `any` anywhere.
 * JSON values are modelled as a recursive union so every payload,
 * mapping and step record is type-checked.
 */

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export type JsonObject = { [key: string]: JsonValue };

export type FilterOperator = "eq" | "neq" | "gt" | "lt" | "contains";

export type FlowStep =
  | {
      type: "filter";
      field: string;
      operator: FilterOperator;
      value: JsonValue;
    }
  | { type: "transform"; mapping: Record<string, string> }
  | { type: "http_request"; url: string; method: "POST" | "PUT" };

export type Flow = {
  id: string;
  name: string;
  description: string | null;
  enabled: boolean;
  steps: FlowStep[];
  secret: string;
  webhookUrl: string;
  createdAt: string;
  updatedAt: string;
};

/** What GET /api/flows returns: no step configuration, no secret. */
export type FlowSummary = Omit<Flow, "steps" | "secret">;

export type RunStatus = "success" | "failed" | "filtered";
export type StepStatus = "success" | "failed" | "skipped";

export type RunStepRecord = {
  id: string;
  runId: string;
  position: number;
  type: FlowStep["type"];
  status: StepStatus;
  input: JsonValue;
  output: JsonValue | null;
  error: string | null;
  durationMs: number;
};

export type RunRecord = {
  id: string;
  flowId: string;
  flowName: string;
  status: RunStatus;
  payload: JsonValue;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  error: string | null;
};

export type RunDetail = RunRecord & { steps: RunStepRecord[] };

export type FlowStats = {
  total: number;
  success: number;
  failed: number;
  filtered: number;
  avgDurationMs: number;
  lastRunAt: string | null;
};

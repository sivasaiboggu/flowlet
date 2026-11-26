/**
 * API client for the Flowlet backend. All calls go to NEXT_PUBLIC_API_URL
 * (default http://localhost:4000 — the brief fixes the backend port).
 * Errors arrive in the brief's shape { error: { code, message, details } }
 * and surface as ApiError, so forms can show each message next to its field.
 */
import type {
  Flow,
  FlowInput,
  FlowPatch,
  FlowStats,
  FlowSummary,
  RunDetail,
  RunRecord,
} from "./types";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export class ApiError extends Error {
  readonly code: string;
  readonly details: Record<string, string>;

  constructor(code: string, message: string, details: Record<string, string> = {}) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

type ErrorBody = {
  error?: { code?: string; message?: string; details?: Record<string, string> };
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    });
  } catch {
    throw new ApiError(
      "NETWORK_ERROR",
      "Could not reach the backend. Is it running on port 4000?",
    );
  }
  if (res.status === 204) {
    return undefined as T;
  }
  const body = (await res.json().catch(() => null)) as ErrorBody | T | null;
  if (!res.ok) {
    const err = (body as ErrorBody | null)?.error;
    throw new ApiError(
      err?.code ?? "UNKNOWN_ERROR",
      err?.message ?? `Request failed with status ${res.status}`,
      err?.details ?? {},
    );
  }
  return body as T;
}

export async function listFlows(): Promise<FlowSummary[]> {
  // The API defaults to 50 flows; ask for the maximum (100) so the
  // list shows every flow instead of stopping at the default page.
  return request<FlowSummary[]>("/api/flows?limit=100");
}

export async function getFlow(id: string): Promise<Flow> {
  return request<Flow>(`/api/flows/${id}`);
}

export async function createFlow(input: FlowInput): Promise<Flow> {
  return request<Flow>("/api/flows", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateFlow(id: string, patch: FlowPatch): Promise<Flow> {
  return request<Flow>(`/api/flows/${id}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export async function deleteFlow(id: string): Promise<void> {
  await request<void>(`/api/flows/${id}`, { method: "DELETE" });
}

export type RunList = { items: RunRecord[]; nextCursor: string | null };

export async function listRuns(
  flowId: string,
  opts: { status?: string; limit?: number; cursor?: string } = {},
): Promise<RunList> {
  const params = new URLSearchParams();
  if (opts.status) params.set("status", opts.status);
  if (opts.limit) params.set("limit", String(opts.limit));
  if (opts.cursor) params.set("cursor", opts.cursor);
  const query = params.toString();
  return request<RunList>(`/api/flows/${flowId}/runs${query ? `?${query}` : ""}`);
}

export async function getRun(id: string): Promise<RunDetail> {
  return request<RunDetail>(`/api/runs/${id}`);
}

export async function getStats(flowId: string): Promise<FlowStats> {
  return request<FlowStats>(`/api/flows/${flowId}/stats`);
}

/**
 * HMAC-SHA256 of the raw body, keyed by the flow secret — the literal
 * secret string, exactly as the backend signs it. (An earlier version
 * decoded the secret as hex bytes, which produced a different HMAC
 * and every signed test event failed with 401.)
 */
export async function signBody(secret: string, text: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(text),
  );
  return [...new Uint8Array(sig)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Send a test event to a flow's webhook, signing it the way a real
 * sender would. Returns the run the backend recorded.
 */
export async function sendTestEvent(
  flow: Flow,
  jsonText: string,
): Promise<{ runId: string; status: string }> {
  const signature = await signBody(flow.secret, jsonText);
  return request<{ runId: string; status: string }>(
    `/api/hooks/${flow.id}`,
    {
      method: "POST",
      headers: { "X-Flowlet-Signature": `sha256=${signature}` },
      body: jsonText,
    },
  );
}

export function apiUrl(): string {
  return API_URL;
}

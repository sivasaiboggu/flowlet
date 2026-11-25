/**
 * Flow CRUD: POST /api/flows, GET /api/flows, GET /api/flows/:id,
 * PATCH /api/flows/:id, DELETE /api/flows/:id.
 *
 * GET /api/flows uses a MongoDB projection (no step configuration, no
 * secret) and a limit. GET /api/flows/:id returns the full flow,
 * including steps and the webhook secret.
 */
import { createFlow, deleteFlow, getFlow, listFlows, updateFlow } from "../db/flows";
import { json, readJsonBody, type Route } from "../lib/http";
import { notFound, validationError } from "../lib/errors";
import { isFlowId, validateFlowInput, validateFlowPatch } from "../validation";

function originOf(req: Request): string {
  return new URL(req.url).origin;
}

function requireFlowId(params: Record<string, string>): string {
  const id = params.id;
  if (!isFlowId(id)) {
    throw validationError("Flow id is not valid");
  }
  return id;
}

function parseLimit(search: URLSearchParams, fallback: number, max: number): number {
  const raw = search.get("limit");
  if (raw === null) return fallback;
  const limit = Number(raw);
  if (!Number.isInteger(limit) || limit < 1 || limit > max) {
    throw validationError(`Limit must be an integer between 1 and ${max}`);
  }
  return limit;
}

export const flowRoutes: Route[] = [
  {
    method: "POST",
    pattern: ["api", "flows"],
    handler: async (req) => {
      const body = await readJsonBody(req);
      const result = validateFlowInput(body);
      if (!result.ok) throw result.error;
      const flow = await createFlow(result.value, originOf(req));
      return json(flow, 201);
    },
  },
  {
    method: "GET",
    pattern: ["api", "flows"],
    handler: async (req) => {
      const search = new URL(req.url).searchParams;
      const limit = parseLimit(search, 50, 100);
      const flows = await listFlows(limit, originOf(req));
      return json(flows);
    },
  },
  {
    method: "GET",
    pattern: ["api", "flows", ":id"],
    handler: async (req, params) => {
      const id = requireFlowId(params);
      const flow = await getFlow(id, originOf(req));
      if (!flow) throw notFound("Flow not found");
      return json(flow);
    },
  },
  {
    method: "PATCH",
    pattern: ["api", "flows", ":id"],
    handler: async (req, params) => {
      const id = requireFlowId(params);
      const body = await readJsonBody(req);
      const result = validateFlowPatch(body);
      if (!result.ok) throw result.error;
      const flow = await updateFlow(id, result.value, originOf(req));
      if (!flow) throw notFound("Flow not found");
      return json(flow);
    },
  },
  {
    method: "DELETE",
    pattern: ["api", "flows", ":id"],
    handler: async (_req, params) => {
      const id = requireFlowId(params);
      const deleted = await deleteFlow(id);
      if (!deleted) throw notFound("Flow not found");
      return new Response(null, { status: 204 });
    },
  },
];

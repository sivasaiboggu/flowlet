/**
 * Run history and stats:
 *   GET /api/flows/:id/runs?status=&limit=&cursor=
 *   GET /api/runs/:runId
 *   GET /api/flows/:id/stats
 *
 * The run list is newest first with cursor pagination (default limit
 * 20, maximum 100). Stats come from one SQL query (see db/runs.ts),
 * never from loading rows and counting them in JavaScript.
 */
import { getFlowDoc } from "../db/flows";
import { decodeCursor, getFlowStats, getRun, listRuns } from "../db/runs";
import { json, type Route } from "../lib/http";
import { notFound, validationError } from "../lib/errors";
import { isFlowId, isRunId } from "../validation";
import type { RunStatus } from "../types";

const RUN_STATUSES: RunStatus[] = ["success", "failed", "filtered"];

function parseLimit(search: URLSearchParams): number {
  const raw = search.get("limit");
  if (raw === null) return 20;
  const limit = Number(raw);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw validationError("Limit must be an integer between 1 and 100");
  }
  return limit;
}

export const runRoutes: Route[] = [
  {
    method: "GET",
    pattern: ["api", "flows", ":id", "runs"],
    handler: async (req, params) => {
      const id = params.id;
      if (!isFlowId(id)) throw notFound("Flow not found");
      const flow = await getFlowDoc(id);
      if (!flow) throw notFound("Flow not found");
      const search = new URL(req.url).searchParams;
      const statusRaw = search.get("status");
      let status: RunStatus | undefined;
      if (statusRaw !== null) {
        if (!(RUN_STATUSES as string[]).includes(statusRaw)) {
          throw validationError("Status must be one of success, failed, filtered");
        }
        status = statusRaw as RunStatus;
      }
      const cursor = search.get("cursor") ?? undefined;
      if (cursor !== undefined && !decodeCursor(cursor)) {
        throw validationError("Cursor is not valid");
      }
      const result = await listRuns(id, {
        status,
        limit: parseLimit(search),
        cursor,
      });
      return json(result);
    },
  },
  {
    method: "GET",
    pattern: ["api", "runs", ":runId"],
    handler: async (_req, params) => {
      const runId = params.runId;
      if (!isRunId(runId)) throw validationError("Run id is not valid");
      const run = await getRun(runId);
      if (!run) throw notFound("Run not found");
      return json(run);
    },
  },
  {
    method: "GET",
    pattern: ["api", "flows", ":id", "stats"],
    handler: async (_req, params) => {
      const id = params.id;
      if (!isFlowId(id)) throw notFound("Flow not found");
      const flow = await getFlowDoc(id);
      if (!flow) throw notFound("Flow not found");
      const stats = await getFlowStats(id);
      return json(stats);
    },
  },
];

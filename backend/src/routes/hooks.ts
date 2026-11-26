/**
 * Webhook trigger: POST /api/hooks/:flowId (brief section 3.2).
 *
 * Order of checks, exactly as the brief's table lists them:
 *   1. flow missing            -> 404
 *   2. signature missing/wrong -> 401, and no run is recorded
 *   3. body is not valid JSON   -> 400
 *   4. flow disabled           -> 409
 *   5. accepted                -> 200 { runId, status }
 *
 * The HMAC is computed over the raw request bytes, before any parsing,
 * and compared timing-safe. Steps run in order, in the request; the
 * run and its step records are written to PostgreSQL in one transaction.
 */
import { getFlowDoc } from "../db/flows";
import { insertRun } from "../db/runs";
import { runSteps, verifySignature } from "../engine";
import { json, type Route } from "../lib/http";
import { conflict, notFound, unauthorized, validationError } from "../lib/errors";
import { isFlowId } from "../validation";
import type { JsonValue } from "../types";

export const hookRoutes: Route[] = [
  {
    method: "POST",
    pattern: ["api", "hooks", ":flowId"],
    handler: async (req, params) => {
      const flowId = params.flowId;
      if (!isFlowId(flowId)) {
        // A malformed id names no flow, so it is a 404 like any
        // unknown id — not a 400 about the request body.
        throw notFound("Flow not found");
      }
      const flow = await getFlowDoc(flowId);
      if (!flow) throw notFound("Flow not found");

      const rawBody = Buffer.from(await req.arrayBuffer());
      const signature = req.headers.get("X-Flowlet-Signature");
      if (!verifySignature(flow.secret, rawBody, signature)) {
        // Deliberately no run is recorded for a failed signature.
        throw unauthorized("Signature is missing or wrong");
      }

      let payload: unknown;
      try {
        payload = JSON.parse(new TextDecoder().decode(rawBody)) as unknown;
      } catch {
        throw validationError("Request body is not valid JSON");
      }
      // Any JSON value is a valid event — an object, an array, or a
      // scalar. Steps read what they need from it via dot paths; a
      // filter on a missing field simply does not match.

      if (!flow.enabled) {
        throw conflict("Flow is disabled");
      }

      const startedAt = new Date();
      const result = await runSteps(flow.steps, payload as JsonValue);
      const finishedAt = new Date();
      const runId = await insertRun(
        {
          flowId: flow._id.toHexString(),
          flowName: flow.name,
          status: result.status,
          payload: payload as JsonValue,
          startedAt: startedAt.toISOString(),
          finishedAt: finishedAt.toISOString(),
          durationMs: finishedAt.getTime() - startedAt.getTime(),
          error: result.error,
        },
        result.steps.map((step) => ({
          position: step.position,
          type: step.type,
          status: step.status,
          input: step.input,
          output: step.output,
          error: step.error,
          durationMs: step.durationMs,
        })),
      );
      return json({ runId, status: result.status });
    },
  },
];

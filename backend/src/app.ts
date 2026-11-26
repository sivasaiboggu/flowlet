/**
 * Request handling, kept separate from the server entrypoint so tests can
 * call handleRequest directly without opening a port.
 */
import { checkMongo } from "./db/mongo";
import { checkPostgres } from "./db/postgres";
import { ApiError } from "./lib/errors";
import {
  corsHeaders,
  error,
  json,
  matchRoute,
  withCors,
  type Route,
} from "./lib/http";
import { flowRoutes } from "./routes/flows";
import { hookRoutes } from "./routes/hooks";
import { mockRoutes } from "./routes/mock";
import { runRoutes } from "./routes/runs";

const VERSION = "0.1.0";

const routes: Route[] = [
  {
    method: "GET",
    pattern: ["health"],
    handler: async () =>
      json({ status: "ok", service: "flowlet", version: VERSION }),
  },
  {
    method: "GET",
    pattern: ["health", "db"],
    handler: async () => {
      const postgres = await checkPostgres();
      const mongo = await checkMongo();
      const ok = postgres === "ok" && mongo === "ok";
      return json({ status: ok ? "ok" : "degraded", postgres, mongo }, ok ? 200 : 503);
    },
  },
  ...flowRoutes,
  ...hookRoutes,
  ...runRoutes,
  ...mockRoutes,
];

export async function handleRequest(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;
  const cors = corsHeaders(req);

  if (req.method === "OPTIONS") {
    // Preflight for the browser frontend: answer without a route, so
    // the browser's real request is allowed through.
    return new Response(null, {
      status: 204,
      headers: {
        ...cors,
        "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, X-Flowlet-Signature",
        "Access-Control-Max-Age": "86400",
      },
    });
  }

  for (const route of routes) {
    if (route.method !== req.method) continue;
    const params = matchRoute(route.pattern, path);
    if (!params) continue;
    try {
      return withCors(await route.handler(req, params), cors);
    } catch (err) {
      if (err instanceof ApiError) {
        return withCors(error(err), cors);
      }
      console.error(`[http] ${req.method} ${path} failed:`, err);
      return withCors(
        error(new ApiError(500, "INTERNAL_ERROR", "Internal server error")),
        cors,
      );
    }
  }

  return withCors(
    error(new ApiError(404, "NOT_FOUND", `No route for ${req.method} ${path}`)),
    cors,
  );
}

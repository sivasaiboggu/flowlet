/**
 * Request handling, kept separate from the server entrypoint so tests can
 * call handleRequest directly without opening a port.
 */
import { checkMongo } from "./db/mongo";
import { checkPostgres } from "./db/postgres";
import { ApiError } from "./lib/errors";
import { error, json, matchRoute, type Route } from "./lib/http";
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

  for (const route of routes) {
    if (route.method !== req.method) continue;
    const params = matchRoute(route.pattern, path);
    if (!params) continue;
    try {
      return await route.handler(req, params);
    } catch (err) {
      if (err instanceof ApiError) {
        return error(err);
      }
      console.error(`[http] ${req.method} ${path} failed:`, err);
      return error(
        new ApiError(500, "INTERNAL_ERROR", "Internal server error"),
      );
    }
  }

  return error(new ApiError(404, "NOT_FOUND", `No route for ${req.method} ${path}`));
}

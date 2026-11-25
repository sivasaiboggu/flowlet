/**
 * Mock receiver: POST /api/mock/receiver.
 *
 * A test target for http_request steps. Returns 200 and echoes the
 * request body. With ?fail=1 it returns 500 instead, so a flow can be
 * tested against a failing downstream system.
 */
import { json, readJsonBody, type Route } from "../lib/http";
import { ApiError } from "../lib/errors";

export const mockRoutes: Route[] = [
  {
    method: "POST",
    pattern: ["api", "mock", "receiver"],
    handler: async (req) => {
      const body = await readJsonBody(req);
      const fail = new URL(req.url).searchParams.get("fail") === "1";
      if (fail) {
        throw new ApiError(500, "MOCK_FAILURE", "Mock receiver forced failure");
      }
      return json(body);
    },
  },
];

/**
 * Tiny HTTP helpers shared by every route: one JSON shape for success,
 * one for errors, and a safe JSON body parser.
 */

import { errorBody, validationError, type ApiError } from "./errors";

export type Route = {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  /** Path segments, e.g. ["api", "flows", ":id"]. */
  pattern: string[];
  handler: (req: Request, params: Record<string, string>) => Promise<Response>;
};

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Every error response uses the brief's shape: { error: { code, message, details } }. */
export function error(err: ApiError): Response {
  return json(errorBody(err), err.status);
}

const MAX_BODY_BYTES = 1_000_000;

export async function readJsonBody(req: Request): Promise<unknown> {
  const text = await req.text();
  if (text.length > MAX_BODY_BYTES) {
    throw validationError("Request body too large");
  }
  if (!text.trim()) return null;
  try {
    return JSON.parse(text);
  } catch {
    throw validationError("Request body is not valid JSON");
  }
}

/** Match a request path against a route pattern, extracting :params. */
export function matchRoute(
  pattern: string[],
  path: string,
): Record<string, string> | null {
  const segments = path.split("/").filter(Boolean);
  if (segments.length !== pattern.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < pattern.length; i++) {
    const part = pattern[i];
    if (part.startsWith(":")) {
      params[part.slice(1)] = decodeURIComponent(segments[i]);
    } else if (part !== segments[i]) {
      return null;
    }
  }
  return params;
}

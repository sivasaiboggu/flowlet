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

/**
 * Cross-origin support for the local frontend. In development the web
 * app runs on :3000 and the API on :4000, so browser calls are
 * cross-origin and need these headers; without them the browser blocks
 * every API response. Only the local frontend origins are allowed.
 */
const ALLOWED_ORIGINS = new Set([
  "http://localhost:3000",
  "http://127.0.0.1:3000",
]);

export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin");
  if (!origin || !ALLOWED_ORIGINS.has(origin)) return {};
  return { "Access-Control-Allow-Origin": origin, Vary: "Origin" };
}

/** Attach the CORS headers for this request to a response. */
export function withCors(
  res: Response,
  headers: Record<string, string>,
): Response {
  for (const [name, value] of Object.entries(headers)) {
    res.headers.set(name, value);
  }
  return res;
}

/** Every error response uses the brief's shape: { error: { code, message, details } }. */
export function error(err: ApiError): Response {
  return json(errorBody(err), err.status);
}

const MAX_BODY_BYTES = 1_000_000;

export async function readJsonBody(req: Request): Promise<unknown> {
  const text = await req.text();
  // Byte length, not string length: a body of multi-byte characters
  // (é, emoji, CJK) can hold far more than 1 MB of bytes in under
  // 1,000,000 UTF-16 code units, so text.length would let it through.
  if (Buffer.byteLength(text, "utf8") > MAX_BODY_BYTES) {
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

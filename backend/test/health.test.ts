import { expect, test } from "bun:test";

// Env vars are read at import time by src/config.ts, so set fallbacks
// before dynamically importing the app. Same resolution as the other
// test files — TEST_DATABASE_URL first — so parallel test files can
// never disagree about which database the shared pool uses.
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  process.env.DATABASE_URL ??
  "postgresql://flowlet:flowlet_dev@localhost:5432/flowlet_dev";
process.env.MONGODB_URI ??= "mongodb://localhost:27017/flowlet_dev";
process.env.MONGODB_DB ??= "flowlet_dev";

const { handleRequest } = await import("../src/app");

test("GET /health returns ok", async () => {
  const res = await handleRequest(new Request("http://localhost/health"));
  expect(res.status).toBe(200);
  const body = (await res.json()) as Record<string, unknown>;
  expect(body.status).toBe("ok");
  expect(body.service).toBe("flowlet");
});

test("unknown path returns 404 JSON", async () => {
  const res = await handleRequest(new Request("http://localhost/nope"));
  expect(res.status).toBe(404);
  const body = (await res.json()) as Record<string, unknown>;
  const err = body.error as Record<string, unknown>;
  expect(err.code).toBe("NOT_FOUND");
  expect(typeof err.message).toBe("string");
});

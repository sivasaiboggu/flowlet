import { afterAll, expect, test } from "bun:test";

// Tests run against a throwaway database: TEST_DATABASE_URL when set,
// otherwise DATABASE_URL. Env must be set before importing app modules.
// MongoDB comes from test/setup.ts (loaded via --preload): one shared
// in-memory server for the whole suite, already pointed at by
// MONGODB_URI. Starting a second server here would race the shared
// MongoClient singleton (see setup.ts).
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  process.env.DATABASE_URL ??
  "postgresql://flowlet:flowlet_dev@localhost:5432/flowlet_dev";
process.env.MONGODB_DB = "flowlet_test";

const { handleRequest } = await import("../src/app");
const { applyMigrations } = await import("../src/db/migrate");
const { getPool, closePostgres } = await import("../src/db/postgres");
const { closeMongo } = await import("../src/db/mongo");
const { signBody } = await import("../src/engine");

await applyMigrations(getPool());
const server = Bun.serve({ port: 0, fetch: handleRequest });
const base = `http://localhost:${server.port}`;

const flowIds: string[] = [];

type ApiResult = { status: number; body: Record<string, unknown> };

async function api(
  method: string,
  path: string,
  body?: unknown,
  headers: Record<string, string> = {},
): Promise<ApiResult> {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...headers },
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
  const parsed = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  return { status: res.status, body: parsed ?? {} };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value as Record<string, unknown>;
}

function asList(value: unknown): Record<string, unknown>[] {
  return value as Record<string, unknown>[];
}

const ORDER_EVENT = {
  event: "order.created",
  order: {
    id: "ORD-1042",
    amount: 4999,
    currency: "INR",
    customer: { name: "Asha Rao", email: "asha@example.com" },
  },
};

let flowId = "";
let secret = "";

afterAll(async () => {
  if (flowIds.length > 0) {
    await getPool().query("DELETE FROM runs WHERE flow_id = ANY($1)", [flowIds]);
  }
  server.stop();
  await closePostgres();
  await closeMongo();
});

test("API: create flow returns 201 with secret and steps", async () => {
  const { status, body } = await api("POST", "/api/flows", {
    name: "High value orders",
    enabled: true,
    steps: [
      { type: "filter", field: "order.amount", operator: "gt", value: 1000 },
      {
        type: "transform",
        mapping: {
          orderId: "order.id",
          total: "order.amount",
          email: "order.customer.email",
        },
      },
      { type: "http_request", url: `${base}/api/mock/receiver`, method: "POST" },
    ],
  });
  expect(status).toBe(201);
  expect(typeof body.id).toBe("string");
  expect(typeof body.secret).toBe("string");
  expect((body.secret as string).length).toBe(64);
  expect((body.webhookUrl as string).endsWith(`/api/hooks/${body.id as string}`)).toBe(true);
  flowId = body.id as string;
  secret = body.secret as string;
  flowIds.push(flowId);
});

test("API: list flows excludes steps and secret", async () => {
  const { status, body } = await api("GET", "/api/flows");
  expect(status).toBe(200);
  const flows = asList(body);
  expect(flows.length).toBeGreaterThanOrEqual(1);
  const mine = flows.find((f) => f.id === flowId);
  expect(mine).toBeDefined();
  expect("steps" in (mine as Record<string, unknown>)).toBe(false);
  expect("secret" in (mine as Record<string, unknown>)).toBe(false);
});

test("API: get flow returns steps and secret", async () => {
  const { status, body } = await api("GET", `/api/flows/${flowId}`);
  expect(status).toBe(200);
  expect(body.name).toBe("High value orders");
  expect(asList(body.steps)).toHaveLength(3);
  expect(body.secret).toBe(secret);
});

test("API: validation rejects bad flows", async () => {
  const shortName = await api("POST", "/api/flows", {
    name: "ab",
    steps: [{ type: "filter", field: "a.b", operator: "eq", value: 1 }],
  });
  expect(shortName.status).toBe(400);
  expect(asRecord(shortName.body.error).code).toBe("VALIDATION_ERROR");
  expect(asRecord(asRecord(shortName.body.error).details).name).toContain("3 characters");

  const noSteps = await api("POST", "/api/flows", { name: "No steps", steps: [] });
  expect(noSteps.status).toBe(400);

  const tooMany = await api("POST", "/api/flows", {
    name: "Too many",
    steps: Array.from({ length: 6 }, () => ({
      type: "filter",
      field: "a.b",
      operator: "eq",
      value: 1,
    })),
  });
  expect(tooMany.status).toBe(400);

  const badOperator = await api("POST", "/api/flows", {
    name: "Bad operator",
    steps: [{ type: "filter", field: "a.b", operator: "gte", value: 1 }],
  });
  expect(badOperator.status).toBe(400);
});

test("API: hook success end-to-end (brief example)", async () => {
  const raw = JSON.stringify(ORDER_EVENT);
  const sig = signBody(secret, Buffer.from(raw, "utf8"));
  const { status, body } = await api("POST", `/api/hooks/${flowId}`, raw, {
    "X-Flowlet-Signature": `sha256=${sig}`,
  });
  expect(status).toBe(200);
  expect(body.status).toBe("success");
  expect(typeof body.runId).toBe("string");

  const run = await api("GET", `/api/runs/${body.runId as string}`);
  expect(run.status).toBe(200);
  expect(run.body.status).toBe("success");
  const steps = asList(run.body.steps);
  expect(steps).toHaveLength(3);
  expect(steps[0].status).toBe("success");
  expect(steps[2].status).toBe("success");
  expect(steps[2].input).toEqual({
    orderId: "ORD-1042",
    total: 4999,
    email: "asha@example.com",
  });
  const output = asRecord(steps[2].output);
  expect(output.status).toBe(200);
});

test("API: hook filtered when amount is 500", async () => {
  const event = { ...ORDER_EVENT, order: { ...ORDER_EVENT.order, amount: 500 } };
  const raw = JSON.stringify(event);
  const sig = signBody(secret, Buffer.from(raw, "utf8"));
  const { status, body } = await api("POST", `/api/hooks/${flowId}`, raw, {
    "X-Flowlet-Signature": `sha256=${sig}`,
  });
  expect(status).toBe(200);
  expect(body.status).toBe("filtered");

  const run = await api("GET", `/api/runs/${body.runId as string}`);
  const steps = asList(run.body.steps);
  expect(steps).toHaveLength(3);
  expect(asRecord(steps[0].output).matched).toBe(false);
  expect(steps[1].status).toBe("skipped");
  expect(steps[2].status).toBe("skipped");
});

test("API: hook with failing receiver fails the run", async () => {
  const { status, body } = await api("POST", "/api/flows", {
    name: "Failing downstream",
    steps: [
      { type: "http_request", url: `${base}/api/mock/receiver?fail=1`, method: "POST" },
    ],
  });
  expect(status).toBe(201);
  const failFlowId = body.id as string;
  const failSecret = body.secret as string;
  flowIds.push(failFlowId);

  const raw = JSON.stringify({ ping: 1 });
  const sig = signBody(failSecret, Buffer.from(raw, "utf8"));
  const hook = await api("POST", `/api/hooks/${failFlowId}`, raw, {
    "X-Flowlet-Signature": `sha256=${sig}`,
  });
  expect(hook.status).toBe(200);
  expect(hook.body.status).toBe("failed");

  const run = await api("GET", `/api/runs/${hook.body.runId as string}`);
  expect(run.body.status).toBe("failed");
  expect(typeof run.body.error).toBe("string");
  expect((run.body.error as string).includes("HTTP 500")).toBe(true);
});

test("API: wrong signature is 401 and records no run", async () => {
  const before = await api("GET", `/api/flows/${flowId}/stats`);
  const totalBefore = before.body.total as number;

  const raw = JSON.stringify(ORDER_EVENT);
  const badSig = signBody("c".repeat(64), Buffer.from(raw, "utf8"));
  const { status, body } = await api("POST", `/api/hooks/${flowId}`, raw, {
    "X-Flowlet-Signature": `sha256=${badSig}`,
  });
  expect(status).toBe(401);
  expect(asRecord(body.error).code).toBe("UNAUTHORIZED");

  const missing = await api("POST", `/api/hooks/${flowId}`, raw);
  expect(missing.status).toBe(401);

  const after = await api("GET", `/api/flows/${flowId}/stats`);
  expect(after.body.total).toBe(totalBefore);
});

test("API: unknown flow 404, disabled flow 409, invalid JSON 400", async () => {
  const unknown = await api("POST", "/api/hooks/000000000000000000000000", "{}");
  expect(unknown.status).toBe(404);

  const disabled = await api("PATCH", `/api/flows/${flowId}`, { enabled: false });
  expect(disabled.status).toBe(200);
  const raw = JSON.stringify(ORDER_EVENT);
  const sig = signBody(secret, Buffer.from(raw, "utf8"));
  const hook = await api("POST", `/api/hooks/${flowId}`, raw, {
    "X-Flowlet-Signature": `sha256=${sig}`,
  });
  expect(hook.status).toBe(409);
  const reenabled = await api("PATCH", `/api/flows/${flowId}`, { enabled: true });
  expect(reenabled.status).toBe(200);

  const badRaw = "{not json";
  const badSig = signBody(secret, Buffer.from(badRaw, "utf8"));
  const bad = await api("POST", `/api/hooks/${flowId}`, badRaw, {
    "X-Flowlet-Signature": `sha256=${badSig}`,
  });
  expect(bad.status).toBe(400);
});

test("API: stats are computed per flow", async () => {
  const { status, body } = await api("GET", `/api/flows/${flowId}/stats`);
  expect(status).toBe(200);
  expect(body.total).toBe(2);
  expect(body.success).toBe(1);
  expect(body.filtered).toBe(1);
  expect(body.failed).toBe(0);
  expect(typeof body.avgDurationMs).toBe("number");
  expect(body.lastRunAt).not.toBeNull();
});

test("API: runs list paginates with cursor", async () => {
  for (let i = 0; i < 3; i++) {
    const raw = JSON.stringify(ORDER_EVENT);
    const sig = signBody(secret, Buffer.from(raw, "utf8"));
    await api("POST", `/api/hooks/${flowId}`, raw, {
      "X-Flowlet-Signature": `sha256=${sig}`,
    });
  }
  const page1 = await api("GET", `/api/flows/${flowId}/runs?limit=2`);
  expect(page1.status).toBe(200);
  expect(asList(page1.body.items)).toHaveLength(2);
  expect(typeof page1.body.nextCursor).toBe("string");

  const page2 = await api(
    "GET",
    `/api/flows/${flowId}/runs?limit=2&cursor=${page1.body.nextCursor as string}`,
  );
  expect(asList(page2.body.items)).toHaveLength(2);
  expect(typeof page2.body.nextCursor).toBe("string");

  const page3 = await api(
    "GET",
    `/api/flows/${flowId}/runs?limit=2&cursor=${page2.body.nextCursor as string}`,
  );
  expect(asList(page3.body.items)).toHaveLength(1);
  expect(page3.body.nextCursor).toBeNull();

  const filtered = await api("GET", `/api/flows/${flowId}/runs?status=filtered`);
  expect(asList(filtered.body.items)).toHaveLength(1);
  expect(asList(filtered.body.items)[0].status).toBe("filtered");
});

test("API: mock receiver echoes and fails on ?fail=1", async () => {
  const ok = await api("POST", "/api/mock/receiver", { hello: "world" });
  expect(ok.status).toBe(200);
  expect(ok.body).toEqual({ hello: "world" });

  const fail = await api("POST", "/api/mock/receiver?fail=1", { hello: "world" });
  expect(fail.status).toBe(500);
  expect(asRecord(fail.body.error).code).toBe("MOCK_FAILURE");
});

test("API: malformed flow ids return 404, not 400", async () => {
  const get = await api("GET", "/api/flows/not-an-id");
  expect(get.status).toBe(404);
  expect(asRecord(get.body.error).code).toBe("NOT_FOUND");

  const hook = await api("POST", "/api/hooks/not-an-id", "{}");
  expect(hook.status).toBe(404);

  const runs = await api("GET", "/api/flows/not-an-id/runs");
  expect(runs.status).toBe(404);

  const stats = await api("GET", "/api/flows/not-an-id/stats");
  expect(stats.status).toBe(404);
});

test("API: webhook accepts array and scalar events", async () => {
  const { status, body } = await api("POST", "/api/flows", {
    name: "Any JSON event",
    steps: [{ type: "http_request", url: `${base}/api/mock/receiver`, method: "POST" }],
  });
  expect(status).toBe(201);
  const anyFlowId = body.id as string;
  const anySecret = body.secret as string;
  flowIds.push(anyFlowId);

  for (const raw of ["[1, 2, 3]", "42", '"hello"']) {
    const sig = signBody(anySecret, Buffer.from(raw, "utf8"));
    const hook = await api("POST", `/api/hooks/${anyFlowId}`, raw, {
      "X-Flowlet-Signature": `sha256=${sig}`,
    });
    expect(hook.status).toBe(200);
    expect(hook.body.status).toBe("success");
  }
});

test("API: CORS preflight and headers for the local frontend", async () => {
  const preflight = await fetch(`${base}/api/flows`, {
    method: "OPTIONS",
    headers: {
      Origin: "http://localhost:3000",
      "Access-Control-Request-Method": "POST",
    },
  });
  expect(preflight.status).toBe(204);
  expect(preflight.headers.get("Access-Control-Allow-Origin")).toBe(
    "http://localhost:3000",
  );
  expect(preflight.headers.get("Access-Control-Allow-Methods")).toContain("POST");
  expect(preflight.headers.get("Access-Control-Allow-Headers")).toContain(
    "X-Flowlet-Signature",
  );

  const res = await fetch(`${base}/api/flows`, {
    headers: { Origin: "http://localhost:3000" },
  });
  expect(res.status).toBe(200);
  expect(res.headers.get("Access-Control-Allow-Origin")).toBe(
    "http://localhost:3000",
  );

  const other = await fetch(`${base}/api/flows`, {
    headers: { Origin: "http://evil.example.com" },
  });
  expect(other.headers.get("Access-Control-Allow-Origin")).toBeNull();
});

test("API: transform mapping errors are keyed by row index", async () => {
  const emptyKey = await api("POST", "/api/flows", {
    name: "Empty key",
    steps: [{ type: "transform", mapping: { "": "order.id" } }],
  });
  expect(emptyKey.status).toBe(400);
  expect(asRecord(asRecord(emptyKey.body.error).details)["steps.0.mapping.0.outKey"]).toBe(
    "Output field name is required",
  );

  const badPath = await api("POST", "/api/flows", {
    name: "Bad path",
    steps: [{ type: "transform", mapping: { orderId: "order..id" } }],
  });
  expect(badPath.status).toBe(400);
  expect(asRecord(asRecord(badPath.body.error).details)["steps.0.mapping.0.path"]).toBe(
    "Each mapping value must be a dot path like order.id",
  );
});

test("API: transform keeps a __proto__ output field end to end", async () => {
  const created = await api("POST", "/api/flows", {
    name: "Proto flow",
    steps: [
      {
        type: "transform",
        // Built with JSON.parse on purpose: a __proto__ key in an object
        // literal would set the prototype instead of storing the entry.
        mapping: JSON.parse(
          '{"__proto__":"order.id","total":"order.amount"}',
        ) as Record<string, string>,
      },
      { type: "http_request", url: `${base}/api/mock/receiver`, method: "POST" },
    ],
  });
  expect(created.status).toBe(201);
  const protoFlowId = created.body.id as string;
  const protoSecret = created.body.secret as string;
  flowIds.push(protoFlowId);

  const raw = JSON.stringify(ORDER_EVENT);
  const sig = signBody(protoSecret, Buffer.from(raw, "utf8"));
  const hook = await api("POST", `/api/hooks/${protoFlowId}`, raw, {
    "X-Flowlet-Signature": `sha256=${sig}`,
  });
  expect(hook.status).toBe(200);
  expect(hook.body.status).toBe("success");

  const run = await api("GET", `/api/runs/${hook.body.runId as string}`);
  const steps = asList(run.body.steps);
  const output = asRecord(steps[0].output);
  expect(Object.prototype.hasOwnProperty.call(output, "__proto__")).toBe(true);
  expect(output["__proto__"]).toBe("ORD-1042");
  expect(output["total"]).toBe(4999);
  expect(steps[1].input).toEqual(
    JSON.parse('{"__proto__":"ORD-1042","total":4999}'),
  );
});

test("API: webhook rejects an oversized body with 400", async () => {
  const big = JSON.stringify({
    event: "order.created",
    order: { id: "ORD-BIG", amount: 4999, pad: "x".repeat(1_100_000) },
  });
  expect(big.length).toBeGreaterThan(1_000_000);
  const sig = signBody(secret, Buffer.from(big, "utf8"));
  const hook = await api("POST", `/api/hooks/${flowId}`, big, {
    "X-Flowlet-Signature": `sha256=${sig}`,
  });
  expect(hook.status).toBe(400);
  expect(asRecord(hook.body.error).code).toBe("VALIDATION_ERROR");
});

test("API: webhook rejects a NUL character with 400 and records no run", async () => {
  const before = await api("GET", `/api/flows/${flowId}/stats`);
  const totalBefore = before.body.total as number;

  const raw = JSON.stringify({
    event: "order.created",
    order: { id: "ORD-NUL", amount: 4999, note: "a\u0000b" },
  });
  const sig = signBody(secret, Buffer.from(raw, "utf8"));
  const hook = await api("POST", `/api/hooks/${flowId}`, raw, {
    "X-Flowlet-Signature": `sha256=${sig}`,
  });
  expect(hook.status).toBe(400);
  expect(asRecord(hook.body.error).code).toBe("VALIDATION_ERROR");

  const after = await api("GET", `/api/flows/${flowId}/stats`);
  expect(after.body.total).toBe(totalBefore);
});

test("API: patch renames a flow; delete removes it", async () => {
  const patched = await api("PATCH", `/api/flows/${flowId}`, {
    name: "High value orders v2",
  });
  expect(patched.status).toBe(200);
  expect(patched.body.name).toBe("High value orders v2");

  const deleted = await api("DELETE", `/api/flows/${flowId}`);
  expect(deleted.status).toBe(204);

  const gone = await api("GET", `/api/flows/${flowId}`);
  expect(gone.status).toBe(404);
});

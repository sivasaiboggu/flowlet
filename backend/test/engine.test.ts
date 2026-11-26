import { expect, test } from "bun:test";
import { evalFilter, getValueAtPath, runSteps } from "../src/engine";
import type { FlowStep, JsonValue } from "../src/types";

test("getValueAtPath reads nested paths and array indexes", () => {
  const data = {
    order: {
      id: "ORD-1",
      amount: 4999,
      items: [{ sku: "A" }, { sku: "B" }],
    },
  };
  expect(getValueAtPath(data, "order.id")).toBe("ORD-1");
  expect(getValueAtPath(data, "order.amount")).toBe(4999);
  expect(getValueAtPath(data, "order.items[1].sku")).toBe("B");
  expect(getValueAtPath(data, "order.missing")).toBeUndefined();
  expect(getValueAtPath(data, "order.amount.cents")).toBeUndefined();
});

test("filter operators: eq, neq, gt, lt, contains", () => {
  expect(evalFilter(4999, "eq", 4999)).toBe(true);
  expect(evalFilter(4999, "eq", 500)).toBe(false);
  expect(evalFilter(4999, "neq", 500)).toBe(true);
  expect(evalFilter(4999, "gt", 1000)).toBe(true);
  expect(evalFilter(4999, "gt", 5000)).toBe(false);
  expect(evalFilter(500, "lt", 1000)).toBe(true);
  expect(evalFilter("hello world", "contains", "world")).toBe(true);
  expect(evalFilter("hello", "contains", "z")).toBe(false);
  expect(evalFilter(["a", "b"], "contains", "b")).toBe(true);
  // Missing fields and type mismatches fail the filter, they never throw.
  expect(evalFilter(undefined, "eq", 1)).toBe(false);
  expect(evalFilter(undefined, "gt", 1)).toBe(false);
  expect(evalFilter("4999", "gt", 1000)).toBe(false);
});

test("filter operators: object equality ignores key order", () => {
  expect(evalFilter({ a: 1, b: 2 }, "eq", { b: 2, a: 1 })).toBe(true);
  expect(evalFilter({ a: { x: 1, y: 2 } }, "eq", { a: { y: 2, x: 1 } })).toBe(true);
  expect(evalFilter({ a: 1, b: 2 }, "eq", { a: 1, b: 3 })).toBe(false);
  expect(evalFilter({ a: 1 }, "eq", { a: 1, b: 2 })).toBe(false);
  // Arrays keep their order.
  expect(evalFilter([1, 2], "eq", [2, 1])).toBe(false);
  expect(evalFilter([{ a: 1, b: 2 }], "contains", { b: 2, a: 1 })).toBe(true);
});

test("filter operators: a missing field fails neq too", () => {
  expect(evalFilter(undefined, "neq", 1)).toBe(false);
  expect(evalFilter(undefined, "neq", "x")).toBe(false);
  expect(evalFilter(undefined, "neq", null)).toBe(false);
  // A field that is present still compares normally.
  expect(evalFilter(4999, "neq", 500)).toBe(true);
  expect(evalFilter(null, "neq", 1)).toBe(true);
});

test("getValueAtPath reads own properties only", () => {
  const data = { order: { id: "ORD-1" } };
  expect(getValueAtPath(data, "order.id")).toBe("ORD-1");
  expect(getValueAtPath(data, "constructor")).toBeUndefined();
  expect(getValueAtPath(data, "toString")).toBeUndefined();
  expect(getValueAtPath(data, "__proto__")).toBeUndefined();
  expect(getValueAtPath(data.order, "constructor")).toBeUndefined();
});

test("transform mapping: nested paths, missing path becomes null", async () => {
  const steps: FlowStep[] = [
    {
      type: "transform",
      mapping: {
        orderId: "order.id",
        total: "order.amount",
        email: "order.customer.email",
        missing: "order.nope",
      },
    },
  ];
  const data: JsonValue = {
    event: "order.created",
    order: { id: "ORD-1042", amount: 4999, customer: { email: "asha@example.com" } },
  };
  const result = await runSteps(steps, data);
  expect(result.status).toBe("success");
  expect(result.steps).toHaveLength(1);
  expect(result.steps[0].output).toEqual({
    orderId: "ORD-1042",
    total: 4999,
    email: "asha@example.com",
    missing: null,
  });
});

test("engine: filter pass, transform, http_request — success run", async () => {
  const received: unknown[] = [];
  const server = Bun.serve({
    port: 0,
    fetch: async (req) => {
      received.push(await req.json());
      return Response.json({ received: true });
    },
  });
  try {
    const steps: FlowStep[] = [
      { type: "filter", field: "order.amount", operator: "gt", value: 1000 },
      {
        type: "transform",
        mapping: {
          orderId: "order.id",
          total: "order.amount",
          email: "order.customer.email",
        },
      },
      { type: "http_request", url: `http://localhost:${server.port}/target`, method: "POST" },
    ];
    const data: JsonValue = {
      event: "order.created",
      order: {
        id: "ORD-1042",
        amount: 4999,
        currency: "INR",
        customer: { name: "Asha Rao", email: "asha@example.com" },
      },
    };
    const result = await runSteps(steps, data);
    expect(result.status).toBe("success");
    expect(result.steps).toHaveLength(3);
    expect(result.steps[0].status).toBe("success");
    expect(result.steps[0].output).toEqual({ matched: true });
    expect(result.steps[2].status).toBe("success");
    expect(result.steps[2].input).toEqual({
      orderId: "ORD-1042",
      total: 4999,
      email: "asha@example.com",
    });
    expect(received).toHaveLength(1);
    expect(received[0]).toEqual({
      orderId: "ORD-1042",
      total: 4999,
      email: "asha@example.com",
    });
  } finally {
    server.stop();
  }
});

test("engine: filter false — run filtered, remaining steps skipped", async () => {
  const steps: FlowStep[] = [
    { type: "filter", field: "order.amount", operator: "gt", value: 1000 },
    { type: "transform", mapping: { total: "order.amount" } },
    { type: "http_request", url: "http://localhost:9/never", method: "POST" },
  ];
  const data: JsonValue = { order: { id: "ORD-1", amount: 500 } };
  const result = await runSteps(steps, data);
  expect(result.status).toBe("filtered");
  expect(result.steps).toHaveLength(3);
  expect(result.steps[0].output).toEqual({ matched: false });
  expect(result.steps[1].status).toBe("skipped");
  expect(result.steps[2].status).toBe("skipped");
});

test("engine: http_request non-2xx fails the step and the run", async () => {
  const server = Bun.serve({
    port: 0,
    fetch: () => new Response("boom", { status: 500 }),
  });
  try {
    const steps: FlowStep[] = [
      { type: "http_request", url: `http://localhost:${server.port}/target`, method: "POST" },
    ];
    const result = await runSteps(steps, { ping: 1 });
    expect(result.status).toBe("failed");
    expect(result.steps[0].status).toBe("failed");
    expect(result.steps[0].error).toContain("HTTP 500");
    const output = result.steps[0].output as { status: number; body: string };
    expect(output.status).toBe(500);
    expect(output.body).toBe("boom");
  } finally {
    server.stop();
  }
});

test("engine: http_request failure still records the later steps as skipped", async () => {
  const server = Bun.serve({
    port: 0,
    fetch: () => new Response("boom", { status: 500 }),
  });
  try {
    const steps: FlowStep[] = [
      { type: "http_request", url: `http://localhost:${server.port}/target`, method: "POST" },
      { type: "transform", mapping: { total: "order.amount" } },
      { type: "http_request", url: `http://localhost:${server.port}/target`, method: "POST" },
    ];
    const result = await runSteps(steps, { order: { amount: 1 } });
    expect(result.status).toBe("failed");
    expect(result.steps).toHaveLength(3);
    expect(result.steps[0].status).toBe("failed");
    expect(result.steps[1].status).toBe("skipped");
    expect(result.steps[2].status).toBe("skipped");
  } finally {
    server.stop();
  }
});

test("transform mapping: __proto__ as an output name keeps the value", async () => {
  const steps: FlowStep[] = [
    {
      type: "transform",
      // Built with JSON.parse on purpose: a __proto__ key in an object
      // literal would set the prototype instead of storing the entry.
      mapping: JSON.parse(
        '{"__proto__":"order.id","normal":"order.amount"}',
      ) as Record<string, string>,
    },
  ];
  const data: JsonValue = { order: { id: "ORD-1042", amount: 4999 } };
  const result = await runSteps(steps, data);
  expect(result.status).toBe("success");
  const output = result.steps[0].output as Record<string, unknown>;
  // A plain object would swallow "__proto__" (it sets the prototype
  // instead of storing the value), so the field would vanish and the
  // run would still report success.
  expect(Object.prototype.hasOwnProperty.call(output, "__proto__")).toBe(true);
  expect(output["__proto__"]).toBe("ORD-1042");
  expect(output["normal"]).toBe(4999);
  // The stored record round-trips through JSON the same way.
  expect(JSON.parse(JSON.stringify(output)) as Record<string, unknown>).toEqual(
    JSON.parse('{"__proto__":"ORD-1042","normal":4999}') as Record<string, unknown>,
  );
});

test("transform mapping: a later filter can read a __proto__ field", async () => {
  const steps: FlowStep[] = [
    {
      type: "transform",
      mapping: JSON.parse('{"__proto__":"order.id"}') as Record<string, string>,
    },
    { type: "filter", field: "__proto__", operator: "eq", value: "ORD-1042" },
  ];
  const data: JsonValue = { order: { id: "ORD-1042", amount: 4999 } };
  const result = await runSteps(steps, data);
  expect(result.status).toBe("success");
  expect(result.steps[1].status).toBe("success");
  expect(result.steps[1].output).toEqual({ matched: true });
});

test("engine: http_request does not follow redirects", async () => {
  let targetHits = 0;
  const server = Bun.serve({
    port: 0,
    fetch: (req) => {
      const url = new URL(req.url);
      if (url.pathname === "/redirect") {
        return new Response(null, {
          status: 302,
          headers: { Location: `${url.origin}/target` },
        });
      }
      targetHits += 1;
      return Response.json({ ok: true });
    },
  });
  try {
    const steps: FlowStep[] = [
      { type: "http_request", url: `http://localhost:${server.port}/redirect`, method: "POST" },
    ];
    const result = await runSteps(steps, { ping: 1 });
    expect(result.status).toBe("failed");
    expect(result.steps[0].status).toBe("failed");
    expect(result.steps[0].error).toContain("HTTP 302");
    expect(targetHits).toBe(0);
  } finally {
    server.stop();
  }
});

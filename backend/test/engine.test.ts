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

import { expect, test } from "bun:test";
import { signBody, verifySignature } from "../src/engine";

const SECRET = "a".repeat(64);
const BODY = Buffer.from(
  JSON.stringify({ event: "order.created", order: { id: "ORD-1", amount: 10 } }),
  "utf8",
);

test("signature: valid signature verifies", () => {
  const sig = signBody(SECRET, BODY);
  expect(verifySignature(SECRET, BODY, `sha256=${sig}`)).toBe(true);
});

test("signature: wrong secret fails", () => {
  const sig = signBody("b".repeat(64), BODY);
  expect(verifySignature(SECRET, BODY, `sha256=${sig}`)).toBe(false);
});

test("signature: tampered body fails", () => {
  const sig = signBody(SECRET, BODY);
  const tampered = Buffer.from(
    JSON.stringify({ event: "order.created", order: { id: "ORD-1", amount: 11 } }),
    "utf8",
  );
  expect(verifySignature(SECRET, tampered, `sha256=${sig}`)).toBe(false);
});

test("signature: missing or malformed header fails", () => {
  const sig = signBody(SECRET, BODY);
  expect(verifySignature(SECRET, BODY, null)).toBe(false);
  expect(verifySignature(SECRET, BODY, sig)).toBe(false);
  expect(verifySignature(SECRET, BODY, "sha256=xyz")).toBe(false);
  expect(verifySignature(SECRET, BODY, "sha256=")).toBe(false);
});

test("signature: uppercase hex is accepted", () => {
  const sig = signBody(SECRET, BODY).toUpperCase();
  expect(verifySignature(SECRET, BODY, `sha256=${sig}`)).toBe(true);
});

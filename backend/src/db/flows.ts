/**
 * Flow definitions, stored in MongoDB. A flow document is the shape the
 * user edits; runs are deliberately kept out of MongoDB (see README).
 *
 * Index: { createdAt: -1 } on flows. It serves the list query, which
 * sorts newest first (GET /api/flows) — without it MongoDB would sort
 * the whole collection in memory on every list call.
 */
import { randomBytes } from "node:crypto";
import { Collection, ObjectId } from "mongodb";
import { getDb } from "./mongo";
import type { Flow, FlowStep, FlowSummary } from "../types";
import type { FlowInput, FlowPatch } from "../validation";

export type FlowDoc = {
  _id: ObjectId;
  name: string;
  description: string | null;
  enabled: boolean;
  steps: FlowStep[];
  secret: string;
  createdAt: Date;
  updatedAt: Date;
};

let collection: Collection<FlowDoc> | null = null;
let indexesReady: Promise<void> | null = null;

export async function getFlowCollection(): Promise<Collection<FlowDoc>> {
  if (!collection) {
    const db = await getDb();
    collection = db.collection<FlowDoc>("flows");
    if (!indexesReady) {
      // Serves the list query's newest-first sort.
      indexesReady = collection
        .createIndex({ createdAt: -1 }, { name: "flows_createdAt_desc" })
        .then(() => undefined);
    }
    await indexesReady;
  }
  return collection;
}

export function webhookUrlFor(origin: string, id: string): string {
  return `${origin}/api/hooks/${id}`;
}

function toFlow(doc: FlowDoc, origin: string): Flow {
  return {
    id: doc._id.toHexString(),
    name: doc.name,
    description: doc.description,
    enabled: doc.enabled,
    steps: doc.steps,
    secret: doc.secret,
    webhookUrl: webhookUrlFor(origin, doc._id.toHexString()),
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

function toFlowSummary(doc: FlowDoc, origin: string): FlowSummary {
  const { steps: _steps, secret: _secret, ...rest } = toFlow(doc, origin);
  void _steps;
  void _secret;
  return rest;
}

export async function createFlow(input: FlowInput, origin: string): Promise<Flow> {
  const col = await getFlowCollection();
  const now = new Date();
  const doc: FlowDoc = {
    _id: new ObjectId(),
    name: input.name,
    description: input.description,
    enabled: input.enabled,
    steps: input.steps,
    // Server-generated webhook secret; never accepted from the client.
    secret: randomBytes(32).toString("hex"),
    createdAt: now,
    updatedAt: now,
  };
  await col.insertOne(doc);
  return toFlow(doc, origin);
}

export async function listFlows(limit: number, origin: string): Promise<FlowSummary[]> {
  const col = await getFlowCollection();
  const docs = await col
    .find({}, { projection: { steps: 0, secret: 0 } })
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray();
  return docs.map((doc) => toFlowSummary(doc, origin));
}

export async function getFlow(id: string, origin: string): Promise<Flow | null> {
  const col = await getFlowCollection();
  const doc = await col.findOne({ _id: new ObjectId(id) });
  return doc ? toFlow(doc, origin) : null;
}

/** The raw document, for the webhook handler (it needs the secret). */
export async function getFlowDoc(id: string): Promise<FlowDoc | null> {
  const col = await getFlowCollection();
  return col.findOne({ _id: new ObjectId(id) });
}

export async function updateFlow(
  id: string,
  patch: FlowPatch,
  origin: string,
): Promise<Flow | null> {
  const col = await getFlowCollection();
  const result = await col.findOneAndUpdate(
    { _id: new ObjectId(id) },
    { $set: { ...patch, updatedAt: new Date() } },
    { returnDocument: "after" },
  );
  return result ? toFlow(result, origin) : null;
}

export async function deleteFlow(id: string): Promise<boolean> {
  const col = await getFlowCollection();
  const result = await col.deleteOne({ _id: new ObjectId(id) });
  return result.deletedCount === 1;
}

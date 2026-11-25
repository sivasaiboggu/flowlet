/**
 * MongoDB client. Event payloads and run logs live here.
 * One client for the process; callers use `getDb`, never the client.
 */
import { MongoClient, type Db } from "mongodb";
import { config } from "../config";

let client: MongoClient | null = null;

export function getClient(): MongoClient {
  if (!client) {
    client = new MongoClient(config.mongodbUri, {
      serverSelectionTimeoutMS: 5_000,
    });
  }
  return client;
}

export async function getDb(): Promise<Db> {
  const c = getClient();
  await c.connect();
  return c.db(config.mongodbDb);
}

/** Cheap liveness check used by /health/db and by tests. */
export async function checkMongo(): Promise<"ok" | "error"> {
  try {
    const c = getClient();
    await c.connect();
    await c.db(config.mongodbDb).admin().ping();
    return "ok";
  } catch {
    return "error";
  }
}

export async function closeMongo(): Promise<void> {
  if (client) {
    await client.close();
    client = null;
  }
}

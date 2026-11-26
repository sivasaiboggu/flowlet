import { expect, test } from "bun:test";

// Env vars are read at import time by src/config.ts, so set fallbacks
// before dynamically importing the database modules. Tests prefer
// TEST_DATABASE_URL when it is set, so they never touch the dev database.
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  process.env.DATABASE_URL ??
  "postgresql://flowlet:flowlet_dev@localhost:5432/flowlet_dev";
process.env.MONGODB_URI ??= "mongodb://localhost:27017/flowlet_dev";
process.env.MONGODB_DB ??= "flowlet_dev";

const { checkPostgres, query, closePostgres } = await import("../src/db/postgres");
const { closeMongo } = await import("../src/db/mongo");
const { MongoClient } = await import("mongodb");
const { randomUUID } = await import("node:crypto");

/**
 * MongoDB comes from test/setup.ts (loaded via --preload): one shared
 * in-memory server for the whole suite, already pointed at by
 * MONGODB_URI. This file used to start a second server of its own,
 * which raced the shared MongoClient singleton and could try to
 * download a second server binary — now it reuses the shared one,
 * with a unique database name per test so nothing leaks between files.
 */
const MONGO_URI =
  process.env.MONGODB_URI ?? "mongodb://localhost:27017/flowlet_dev";

test("postgres: liveness check and round-trip", async () => {
  expect(await checkPostgres()).toBe("ok");

  await query("CREATE TEMP TABLE scaffold_probe (id INT PRIMARY KEY, note TEXT)");
  await query("INSERT INTO scaffold_probe (id, note) VALUES ($1, $2)", [1, "hello"]);
  const rows = await query<{ note: string }>(
    "SELECT note FROM scaffold_probe WHERE id = $1",
    [1],
  );
  expect(rows).toHaveLength(1);
  expect(rows[0].note).toBe("hello");
  await closePostgres();
});

test(
  "mongo: shared in-memory server round-trip",
  async () => {
    const dbName = `flowlet_probe_${randomUUID().replaceAll("-", "")}`;
    const client = new MongoClient(MONGO_URI);
    try {
      await client.connect();
      const db = client.db(dbName);
      const col = db.collection<{ _id: string; note: string }>("probe");
      await col.insertOne({ _id: "p1", note: "hello" });
      const doc = await col.findOne({ _id: "p1" });
      expect(doc?.note).toBe("hello");
    } finally {
      await client.db(dbName).dropDatabase().catch(() => undefined);
      await client.close();
    }
    await closeMongo();
  },
  180_000,
);

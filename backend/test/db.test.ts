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
const { MongoMemoryServer } = await import("mongodb-memory-server");
const { MongoClient } = await import("mongodb");
const { randomUUID } = await import("node:crypto");
const { join } = await import("node:path");
const { mkdir } = await import("node:fs/promises");

/**
 * mongodb-memory-server puts its data directory in os.tmpdir() by
 * default. On this VM /tmp is a 512 MB tmpfs and a mongod data directory
 * needs ~200 MB, so parallel test files exhaust it. Point the data
 * directory at the repo's (gitignored) .dev folder on the main disk
 * instead, with a unique suffix per instance.
 *
 * Two gotchas: the option is dbPath (capital P — lowercase dbpath is
 * silently ignored), and the directory must already exist.
 */
async function startMemoryServer(): Promise<InstanceType<typeof MongoMemoryServer>> {
  const dbPath = join(import.meta.dir, "..", ".dev", `mongo-mem-${randomUUID()}`);
  await mkdir(dbPath, { recursive: true });
  return MongoMemoryServer.create({ instance: { dbPath } });
}

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
  "mongo: in-memory server round-trip",
  async () => {
    const server = await startMemoryServer();
    try {
      const client = new MongoClient(server.getUri());
      await client.connect();
      const db = client.db("flowlet_probe");
      const col = db.collection<{ _id: string; note: string }>("probe");
      await col.insertOne({ _id: "p1", note: "hello" });
      const doc = await col.findOne({ _id: "p1" });
      expect(doc?.note).toBe("hello");
      await client.close();
    } finally {
      await server.stop();
    }
    await closeMongo();
  },
  180_000,
);

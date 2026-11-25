/**
 * Test setup, loaded once before any test file (see package.json:
 * `bun test --preload ./test/setup.ts`).
 *
 * Starts ONE shared in-memory MongoDB for the whole suite and points
 * MONGODB_URI at it before any app module is imported. That matters:
 * the backend keeps one MongoClient per process, configured at import
 * time, so if test files each started their own server the first file
 * to import the app would fix the URI for everyone else and the rest
 * would hang on a dead server.
 *
 * The data directory lives in the repo's (gitignored) .dev folder, not
 * /tmp — on this VM /tmp is a 512 MB tmpfs and a mongod data directory
 * needs ~200 MB. The directory is unique per run; old ones can be
 * deleted by hand. The database is dropped at startup for a clean slate.
 */
import { mkdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { MongoClient } from "mongodb";
import { MongoMemoryServer } from "mongodb-memory-server";

const dbPath = join(import.meta.dir, "..", ".dev", `mongo-test-${randomUUID()}`);
await mkdir(dbPath, { recursive: true });

// NOTE: the option is dbPath (capital P); lowercase dbpath is ignored.
const server = await MongoMemoryServer.create({ instance: { dbPath } });

process.env.MONGODB_URI = server.getUri();
process.env.MONGODB_DB = "flowlet_test";

const client = new MongoClient(server.getUri());
await client.connect();
await client.db("flowlet_test").dropDatabase();
await client.close();

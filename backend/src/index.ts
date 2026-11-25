/**
 * Flowlet backend entrypoint. Bun serves handleRequest; shutdown closes
 * both database clients so the process exits cleanly.
 */
import { config } from "./config";
import { closeMongo } from "./db/mongo";
import { closePostgres } from "./db/postgres";
import { handleRequest } from "./app";

const server = Bun.serve({
  port: config.port,
  fetch: handleRequest,
});

console.log(`[flowlet] backend listening on http://localhost:${server.port}`);
console.log(`[flowlet] health: http://localhost:${server.port}/health`);

let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[flowlet] ${signal} received, closing database clients...`);
  await Promise.all([closePostgres(), closeMongo()]);
  server.stop();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

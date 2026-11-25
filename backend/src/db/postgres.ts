/**
 * PostgreSQL client. Flows, steps and run records live here.
 * One pool for the process; callers use `query`, never the pool directly.
 */
import { Pool, type QueryResultRow } from "pg";
import { config } from "../config";

let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: config.databaseUrl,
      max: 10,
      idleTimeoutMillis: 30_000,
    });
    pool.on("error", (err) => {
      // A single idle-client error must not take the server down silently.
      console.error("[postgres] idle client error:", err);
    });
  }
  return pool;
}

export async function query<T extends QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const result = await getPool().query<T>(text, params as never[]);
  return result.rows;
}

/** Cheap liveness check used by /health/db and by tests. */
export async function checkPostgres(): Promise<"ok" | "error"> {
  try {
    await getPool().query("SELECT 1");
    return "ok";
  } catch {
    return "error";
  }
}

export async function closePostgres(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

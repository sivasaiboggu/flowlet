/**
 * Migration runner. Applies numbered *.sql files from migrations/ in
 * order, recording each in the schema_migrations table so a file is
 * never applied twice. Run with `bun run db:migrate`.
 *
 * applyMigrations is exported so tests can migrate a throwaway test
 * database without shelling out.
 */
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Pool } from "pg";
import { getPool, closePostgres } from "./postgres";

const MIGRATIONS_DIR = join(import.meta.dir, "..", "..", "migrations");

export async function applyMigrations(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  const applied = new Set(
    (await pool.query<{ filename: string }>("SELECT filename FROM schema_migrations"))
      .rows.map((row) => row.filename),
  );

  const files = (await readdir(MIGRATIONS_DIR))
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of files) {
    if (applied.has(file)) {
      console.log(`[migrate] already applied: ${file}`);
      continue;
    }
    const sql = await readFile(join(MIGRATIONS_DIR, file), "utf8");
    await pool.query("BEGIN");
    try {
      if (sql.trim()) await pool.query(sql);
      await pool.query("INSERT INTO schema_migrations (filename) VALUES ($1)", [file]);
      await pool.query("COMMIT");
      console.log(`[migrate] applied: ${file}`);
    } catch (err) {
      await pool.query("ROLLBACK");
      throw err;
    }
  }
}

if (import.meta.main) {
  applyMigrations(getPool())
    .then(() => closePostgres())
    .then(() => console.log("[migrate] done"))
    .catch((err) => {
      console.error("[migrate] failed:", err);
      process.exit(1);
    });
}

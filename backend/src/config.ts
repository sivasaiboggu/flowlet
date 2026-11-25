/**
 * Configuration. Every value comes from the environment; nothing secret
 * is hard-coded here. Missing required values fail fast with the variable
 * name, so a bad setup is obvious instead of silently wrong.
 *
 * .env files: Bun loads .env from the process working directory, which
 * depends on how the server was started. So this module also loads the
 * repo-root .env (and backend/.env) explicitly, relative to this file.
 * Real environment variables always win over .env files.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

function loadEnvFile(path: string): void {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

// backend/src/config.ts -> repo root is two levels up.
loadEnvFile(join(import.meta.dir, "..", "..", ".env"));
loadEnvFile(join(import.meta.dir, "..", ".env"));

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optional(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

export const config = {
  // The brief fixes the backend port at 4000.
  port: Number(optional("PORT", "4000")),
  nodeEnv: optional("NODE_ENV", "development"),
  databaseUrl: required("DATABASE_URL"),
  mongodbUri: required("MONGODB_URI"),
  mongodbDb: optional("MONGODB_DB", "flowlet_dev"),
} as const;

# Flowlet backend

Bun + TypeScript, no framework. One `Bun.serve` process, `pg` for
PostgreSQL (run history) and the official `mongodb` driver for MongoDB
(flow definitions). The routing is a small table in `src/app.ts`, so
every request path is visible in one place.

## Run

```bash
cp ../.env.example ../.env   # fill in real values; never commit .env
bun install
bun run db:migrate           # applies migrations/ in order
bun run dev                  # watch mode, http://localhost:4000
```

Health checks: `GET /health` (process up), `GET /health/db` (both
databases reachable; 503 otherwise). The root scripts do the same from
the repo root: `bun run migrate`, `bun run dev`, `bun test`.

## Layout

- `src/index.ts` — entrypoint: serves, logs, shuts pools down cleanly.
- `src/app.ts` — route table + request handler (testable without a port).
- `src/config.ts` — environment only; a missing value fails fast by name.
- `src/types.ts` — Flow, Run, Stats. Strict TypeScript, no `any`.
- `src/validation.ts` — runtime validation of every request body, with
  field-path errors (e.g. `steps.0.field`).
- `src/engine.ts` — step execution (dot-path reads, the five filter
  operators, transform mapping, `http_request` with a 5s timeout) and
  HMAC sign/verify with a timing-safe compare.
- `src/db/flows.ts` — MongoDB: flow documents, server-generated secret,
  index `{createdAt: -1}` for the newest-first list.
- `src/db/runs.ts` — PostgreSQL: run + step inserts in one transaction,
  cursor pagination, stats by a single SQL query.
- `src/db/mongo.ts`, `src/db/postgres.ts` — one client / pool each.
- `src/db/migrate.ts` — numbered `*.sql` runner; never applies a file twice.
- `src/routes/` — `flows.ts`, `hooks.ts`, `runs.ts`, `mock.ts`.
- `src/lib/` — `errors.ts` (the `{error: {code, message, details}}`
  shape), `http.ts` (small response helpers).
- `migrations/0001_init.sql` — `runs` + `run_steps`, linked by
  `run_steps.run_id REFERENCES runs(id) ON DELETE CASCADE`, with the
  indexes the run-list and run-detail queries use. Runs are not deleted
  when a flow is deleted: `runs.flow_id` is plain text (no foreign key
  can point into MongoDB) and each run snapshots the flow name.
- `test/` — `bun test` (42 tests). `setup.ts` is loaded with
  `--preload` and starts one shared in-memory MongoDB for the whole
  suite; the backend keeps a single MongoClient per process, configured
  at import time, so each test file starting its own server would race
  it. Tests use `TEST_DATABASE_URL` when set, otherwise `DATABASE_URL`,
  and clean up their own runs.

## Local databases (this machine)

There is no Docker daemon here, so `docker compose up -d` was not run
locally. Instead:

- PostgreSQL 16 lives in `~/pg` (the system install was wiped by a VM
  rebuild). Start it as the data-dir owner (uid 1000) after allowing
  traversal of the home dir:
  `chmod o+x /home/hatch`
  `setpriv --reuid=1000 --regid=1000 --clear-groups env LD_LIBRARY_PATH=/home/hatch/pg/usr/lib/x86_64-linux-gnu /home/hatch/pg/usr/lib/postgresql/16/bin/pg_ctl -D /home/hatch/pg-data -l /home/hatch/pg-log/server.log -o "-p 5432 -k /tmp" start`
  Then check it with:
  `psql "postgresql://flowlet:flowlet_dev@localhost:5432/flowlet_dev" -c "SELECT 1"`
- MongoDB has no server installed. Tests use `mongodb-memory-server`,
  which downloads a real `mongod` binary once (cached in
  `~/.cache/mongodb-binaries/`) and runs it in memory. The data
  directory is pointed at `backend/.dev/` (gitignored), not `/tmp`,
  because `/tmp` on this machine is a 512 MB tmpfs and a mongod data
  directory needs ~200 MB. For the dev server, a `mongod` was started
  by hand from the cached binary with `--dbpath backend/.dev/mongo-dev`.
  Reviewers use `docker-compose.yml` at the repo root instead.

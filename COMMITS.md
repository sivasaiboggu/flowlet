# COMMITS.md — Flowlet commit log

The parent replays these as real GitHub commits, in order, one logical
step per commit. Each entry gives the message and the files it touches.
`BRIEF.md` (a local verbatim copy of the take-home brief) is NOT in
this log — it stays out of the repo (see `.gitignore`).

## 1. Scaffold the repo: Bun backend, Next.js frontend, databases

Message: `Scaffold Flowlet: Bun backend, Next.js frontend, docker-compose for MongoDB + PostgreSQL`

Files:

- `.gitignore`
- `.env.example`
- `docker-compose.yml`
- `README.md` (skeleton)
- `backend/package.json`, `backend/tsconfig.json`, `backend/src/bun.d.ts`
- `backend/src/index.ts`, `backend/src/app.ts`, `backend/src/config.ts`
- `backend/src/db/postgres.ts`, `backend/src/db/mongo.ts`, `backend/src/db/migrate.ts`
- `backend/migrations/0001_init.sql` (empty at this point)
- `backend/test/health.test.ts`
- `frontend/package.json`, `frontend/tsconfig.json`, `frontend/next.config.ts`
- `frontend/src/app/layout.tsx`, `frontend/src/app/page.tsx`, `frontend/src/app/globals.css`
- `frontend/DESIGN.md`

## 2. Local databases: system PostgreSQL + in-memory MongoDB for tests

Message: `Tests: run Postgres from the system cluster, MongoDB in memory`

Files:

- `backend/package.json` (adds `mongodb-memory-server`)
- `backend/test/db.test.ts`
- `.gitignore` (adds `.dev/`)

## 3. Backend core: types, validation, engine, routes, migration

Message: `Backend core: flows in MongoDB, runs in PostgreSQL, HMAC webhooks`

Files:

- `backend/src/types.ts`
- `backend/src/validation.ts`
- `backend/src/engine.ts`
- `backend/src/lib/errors.ts`, `backend/src/lib/http.ts`
- `backend/src/db/flows.ts`, `backend/src/db/runs.ts`
- `backend/src/routes/flows.ts`, `backend/src/routes/hooks.ts`
- `backend/src/routes/runs.ts`, `backend/src/routes/mock.ts`
- `backend/src/app.ts` (rewired to the real routes)
- `backend/migrations/0001_init.sql` (runs + run_steps, indexes)

## 4. Tests: engine, signature, API end to end

Message: `Tests: filter/transform operators, signature verification, API end to end`

Files:

- `backend/test/engine.test.ts`
- `backend/test/signature.test.ts`
- `backend/test/api.test.ts`
- `backend/test/setup.ts` (shared in-memory MongoDB, loaded with `--preload`)

## 5. Frontend: flows pages, form, run timeline

Message: `Frontend: flows list, form with step editor, flow detail with test event, run timeline`

Files:

- `frontend/src/lib/api.ts`, `frontend/src/lib/types.ts`, `frontend/src/lib/validation.ts`
- `frontend/src/components/FlowForm.tsx`, `frontend/src/components/RunTable.tsx`, `frontend/src/components/StateViews.tsx`
- `frontend/src/app/page.tsx` (redirect to /flows)
- `frontend/src/app/flows/page.tsx`
- `frontend/src/app/flows/new/page.tsx`
- `frontend/src/app/flows/[id]/page.tsx`
- `frontend/src/app/flows/[id]/edit/page.tsx`
- `frontend/src/app/runs/[id]/page.tsx`
- `frontend/src/app/globals.css`

## 6. Root restructure: workspaces, one lockfile, root scripts

Message: `Root: Bun workspaces, one bun.lock, migrate/dev/test/typecheck scripts`

Files:

- `package.json` (workspaces + scripts)
- `bun.lock`
- `scripts/dev.sh`
- `.env.example` (ports 4000/3000, `NEXT_PUBLIC_API_URL`)

## 7. Verification fixes: test MongoDB path, script invocation, dev ports

Message: `Fix test and dev scripts: dbPath option, shared test MongoDB, bun --cwd, per-process PORT`

Files:

- `backend/test/db.test.ts`, `backend/test/api.test.ts`, `backend/test/setup.ts`
- `backend/package.json` (test script gains `--preload`)
- `package.json` (`bun --cwd <dir> <script>` — `run` breaks it)
- `scripts/dev.sh` (PORT set per command; an exported PORT made Next.js bind 4000)

## 8. Docs: README per the brief, hours log, this commit log

Message: `Docs: README with the five questions, honest hours log, commit log`

Files:

- `README.md`
- `backend/README.md`
- `frontend/README.md`
- `HOURS.md`
- `COMMITS.md`

## 9. GitHub Actions: type check + tests

Message: `CI: GitHub Actions runs typecheck and tests`

Files:

- `.github/workflows/ci.yml`

Done — the one optional extra, added after the core was verified.

## 10. Verification fixes (parent): consistent test DB fallback, frontend API URL

Message: `Fix: test DB fallback password consistent across test files; frontend API URL back to 4000`

Files:

- `backend/test/health.test.ts`, `backend/test/db.test.ts` (fallback password `CHANGE_ME` → `flowlet_dev`, matching `api.test.ts` and `.env.example`; `health.test.ts` runs first and its `CHANGE_ME` value was locking the shared pool, so `bun test` failed 2 tests + 1 error in a clean run — now 28 pass, 0 fail, with no explicit env)
- `.env` (local dev values only, gitignored: `NEXT_PUBLIC_API_URL` `http://localhost:3001` → `http://localhost:4000`; the 3001 value would have made the UI call a dead port)

## After step 10 — pushes and polish (26 Nov 2026)

- Steps 09–13 pushed to GitHub main via the browser web UI (23 commits total, head `6809185`): CI workflow, test fixes, README hours, Codex review fixes (9 directory-grouped commits), polish (mobile table columns, `limit=100`, README answers trimmed to 5 lines each). Verified by read-back.
- Tests: 36 pass, 0 fail (was 28; +8 from the Codex fixes).
- Screenshots in README: five fresh live screenshots of the running app with the demo flow (flows list desktop + mobile, flow detail, run timeline, new flow) under `preview/`, embedded in README.md. The demo webhook secret is redacted in the flow-detail screenshot before publishing.
- Hours updated to about 4 hours 45 minutes (see HOURS.md).

## Fix-up (26 Nov 2026, after submission)

- 7 bugs fixed and verified live: transform `__proto__` output key dropped (now `Object.create(null)` in engine + form), empty transform output names rejected, mapping error keys index-based to match the frontend, webhook body capped at 1 MB (400), NUL in an event answered 400 with no run (was 500), flow secret masked on screen with Show/Hide (copy still works).
- 6 new tests: 42 pass, 0 fail. Both typechecks, migration, production build, worked example re-verified live.
- README rewritten in plain words; "AI tools used" section and the five questions kept exactly as they were; "What is not finished" removed (recording dropped by decision, submission sent); Known bugs renamed "Limits". Hours now about 5 hours 45 minutes.
- flow-detail.png retaken with the masked secret.

## Upgrade round (28 Nov 2026, after submission)

- 1 bug fixed: the JSON body cap counted characters, not bytes, so a
  body of multi-byte characters could pass the 1 MB cap with over 1 MB
  of UTF-8 behind it (`Buffer.byteLength` in `readJsonBody`). 1 new test:
  43 pass, 0 fail. Both typechecks, production build pass.
- Deps updated: mongodb 6.22.0 -> 7.9.1, mongodb-memory-server 10.4.3 ->
  11.4.0 (paired: v11 ships its own driver 7 and a mongod 8.2 binary),
  @types/node 22.20.5 -> 22.20.7, @types/react 19.3.1 -> 19.3.3.
  No code changes were needed for the driver upgrade.
- `bun test` from the repo root did not run the test setup, so the
  MongoDB tests silently fell back to localhost:27017 and only passed
  while a local mongod happened to be running there. Added
  `bunfig.toml` with the test preload, so plain `bun test` now starts
  the in-memory MongoDB itself (verified: 43 pass from the root, and
  `bun run test` still passes with no double start).
- Not changed: Next.js 15 (v16 is a major with App Router changes),
  TypeScript 5 (v7 is a native preview), the assignment behaviour,
  the API, the frontend, or the README.

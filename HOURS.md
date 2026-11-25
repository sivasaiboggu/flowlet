# Hours spent — Flowlet

Honest running log. Work started **~00:23 IST, Wed 25 Nov 2026**.
The clock on the build machine has been unreliable before, so times
below are the session record, not a single clock reading; the total is
the wall-clock span of continuous work, and it is still running.

| When (IST, 25 Nov) | What | Approx. |
|---|---|---|
| ~00:23 – ~00:30 | Scaffold: repo layout, docker-compose (databases only), `.env.example`, `.gitignore`, README skeleton, Bun health endpoint, Next.js shell + design system. | ~10 min |
| ~00:30 – ~01:30 | Full build after the brief was read: backend core (types, validation, engine, Mongo/Postgres layers, all routes, migration), 28 tests, frontend rebuild (all pages, form, run timeline), root restructure (workspaces, root `migrate`/`dev`/`test`/`typecheck` scripts, one `bun.lock`). Includes reinstalling the system PostgreSQL after the VM restarted mid-build. | ~1 h |
| ~01:30 – onwards | Verification and fixes: the `dbPath` fix (lowercase `dbpath` is silently ignored), the shared-Mongo test preload, the `bun --cwd` script fix, the `dev.sh` PORT fix, live dev-server checks, the brief's example end to end with curl, and this documentation. | ~25 min and counting |

| ~01:07 – ~01:30 | Parent verification + fixes: re-ran `bun test` clean (found 2 fail + 1 error from the inconsistent `CHANGE_ME` fallback in `health.test.ts`), fixed it and the `.env` API URL (3001 → 4000), re-verified 28 pass / 0 fail with no explicit env, `bun run migrate` and `bun run typecheck` clean, dev servers up with the demo flow live and the frontend chunk pointing at port 4000. | ~25 min |

**Running total: about 1 hour 55 minutes so far, work not finished.**
The final number goes in the submission email once the work stops —
after the screen recording, the Codex review and the repo push are done.

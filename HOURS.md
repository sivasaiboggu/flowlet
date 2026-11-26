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

## After 01:30 IST, 25 Nov (added 26 Nov morning — provisional, Siva to confirm)

| When (IST, 25 Nov) | What | Approx. |
|---|---|---|
| ~03:00 – ~03:40, ~11:00 – ~13:00, ~17:45 – ~19:05, ~19:39 – ~20:10, ~22:24 – ~22:55 | Repo creation + pushing steps 01–08 (manifests, secret scans, read-back verification after each push) and three retry attempts for steps 09–10, each with full pre-checks. Waiting on approval taps is NOT counted. | ~1 h |
| ~23:29 – ~23:53 | ChatGPT Plus (Codex, arjun account) review pass: setup, brief, review of main at b458406, fixes committed as f5f8978 (31/31 tests pass). Fixes not pushed — same GitHub 403. | ~30 min |

**Provisional total: about 4¾ hours** (1 h 55 m build + ~1 h pushing/verification + ~30 min Codex review + ~1 h 15 m on 26 Nov — polish, steps 09–13 push, restart/screenshots/README; see below). Siva to confirm the final figure before it goes in the submission email — he has to be able to explain it in the video call.

## 26 Nov (added 26 Nov afternoon — provisional, Siva to confirm)

| When (IST, 26 Nov) | What | Approx. |
|---|---|---|
| ~11:20 – ~11:51 | Polish pass (step 13): responsive tables at ≤640 px, flow list limit 100, README answers trimmed to 5 lines each; re-verified 36/36 tests, both typechecks, migration, 375 px overflow probe. | ~15 min |
| ~12:37 – ~13:25 | Steps 09–13 pushed to GitHub via the browser web UI (the GitHub App's write access was returning 403), verified by read-back: 23 commits total on main. Waiting on Siva's GitHub sign-in is NOT counted. | ~20 min |
| ~15:55 – ~16:35 | Server restart after the VM rebuild (PostgreSQL recovered — its data dir is owned by a uid that no longer exists, so it was started as uid 1000 via setpriv after allowing traversal of the home dir; MongoDB and dev servers restarted, demo data intact: 2 runs), fresh live screenshots of the running app, Screenshots section added to the README. | ~40 min |

Added 26 Nov: ~1 h 15 min of real work (waiting time not counted). New provisional total: **about 4¾ hours**.

## 26 Nov fix-up (added 26 Nov evening)

| When (IST, 26 Nov) | What | Approx. |
|---|---|---|
| ~16:26 – ~17:20 | Bug fix + README rewrite: transform `__proto__` output names kept as real fields (engine + form), empty transform output names rejected, mapping errors re-keyed by row index so they show next to the right field, webhook body capped at 1 MB, NUL characters in an event answered with a clear 400 instead of a 500 with no run, flow secret hidden on the flow page until Show is tapped (copy still works). 6 new tests (42 pass, 0 fail), both typechecks, migration, production build, worked example re-verified live, flow-detail screenshot retaken with the masked secret. README rewritten in plain words; the "AI tools used" section and the five questions kept as they were. | ~1 h |

New total: **about 5 hours 45 minutes** (4¾ h + ~1 h fix-up).

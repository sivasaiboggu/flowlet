#!/bin/sh
# Flowlet dev: backend on 4000, web on 3000.
# Loads .env from the repo root, then starts both servers in the
# foreground. Ctrl-C stops both.
set -e
cd "$(dirname "$0")/.."

if [ -f .env ]; then
  set -a
  . ./.env
  set +a
fi

export NEXT_PUBLIC_API_URL="${NEXT_PUBLIC_API_URL:-http://localhost:4000}"

# PORT is set per command, not exported: Next.js also reads PORT, and
# an exported PORT=4000 would make the frontend try to bind 4000 too.
PORT="${PORT:-4000}" bun --cwd backend dev &
BACKEND_PID=$!
PORT=3000 bun --cwd frontend dev &
FRONTEND_PID=$!

trap 'kill $BACKEND_PID $FRONTEND_PID 2>/dev/null' INT TERM
wait

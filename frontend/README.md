# Flowlet frontend

Next.js (App Router) dashboard for flows and runs. One page per thing:
`/flows` lists flows, `/flows/new` and `/flows/[id]/edit` are the form,
`/flows/[id]` shows a flow with its run history, `/runs/[id]` shows one
run as a step timeline. `/` redirects to `/flows`.

## Run

```bash
cp ../.env.example ../.env   # fill in real values; never commit .env
bun install
bun run dev                  # http://localhost:3000
bun run build                # production build check
```

The frontend talks to the backend at `NEXT_PUBLIC_API_URL`
(default `http://localhost:4000`).

## Pages and behaviour

- Every page has loading, empty and error states. Form fields have
  labels, and invalid input shows a clear message next to the field.
- The flow form adds, removes and reorders steps (filter, transform,
  http_request). Steps are validated per field before anything is sent.
- The flow page shows the webhook URL with a ready-to-copy curl
  example, summary numbers from `/stats`, a "Send test event" box that
  accepts JSON and signs it with the flow secret in the browser, and
  the run history with a status filter and pagination (Load more).
  The secret stays hidden on screen until you ask to see it.
- The run page is a timeline: each step with its status, duration,
  input, output and error.
- The layout is usable at 375 px wide.

## Design

See `DESIGN.md`. Paper background, pine-green accent, Space Grotesk
display + Inter body, tabular numerals for data. No gradients, no fake
rows: tables show honest empty states until the API returns.

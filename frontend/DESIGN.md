# Flowlet frontend — design notes

Built from the design playbook: references first, type and colour before
components, no AI-slop tells.

## References (what was borrowed)

- **Linear app shell** — narrow top bar, one wordmark, plain nav links,
  dense tables, nothing decorative. Borrowed: the shell and the
  restraint.
- **Stripe Dashboard tables** — hairline rows, small status pills, empty
  states that say what happens next instead of showing fake rows.
  Borrowed: the table and the empty-state copy.

## Type

- Display/headings: **Space Grotesk** (variable, via @fontsource).
- Body/UI: **Inter** (variable, via @fontsource).
- Data (IDs, URLs, durations): system monospace for values, tabular
  numerals (`font-feature-settings: "tnum"`) for counts and times.

## Colour (one accent, under 10% of the screen)

- Paper background `#F7F6F2`, white surfaces, ink text `#1B1B18`.
- Muted text `#6B6862`, hairline borders `#E4E2DB`.
- Accent: pine green `#176B45` — links, primary button, notice edge.
- Danger: `#B3382E` — failed runs only.

## Rules followed

- No gradients, no glass, no glow, no dot patterns.
- No emoji or decorative symbols; no cliché copy ("seamless", "supercharge").
- No fake data: the tables show honest empty states until the API lands.
- Motion: none beyond the browser's own focus ring — state changes are
  text, not animation.

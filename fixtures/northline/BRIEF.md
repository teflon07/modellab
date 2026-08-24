# Northline Dispatch — product brief

A freight-yard operations board. It should feel like a darkened radio room at
02:10, not a Circlelite admin template.

## Brand

- Name (exact): Northline Dispatch
- Colors (use these hex values in CSS):
  - void `#0B0E12`
  - amber `#F5A524`
  - steel `#8B9BB4`
  - signal `#E23B3B`
- Type: **IBM Plex Mono** for data, IBM Plex Sans or a grotesque for chrome

## Required landmarks

| testid | What it is |
|---|---|
| `radio-log` | Scrolling/stacked radio chatter |
| `incident-board` | Table or cards of every row in `data/incidents.json` |
| `yard-clock` | A clock / shift mark (can be static) |
| `status-pills` | Open / holding / cleared counts or pills |

Render every incident `id` and `yard`. Do **not** write "Welcome to our website".

## Output

Write the site under `site/`. Do not edit `verify.py`, `server.py`, or `data/`.

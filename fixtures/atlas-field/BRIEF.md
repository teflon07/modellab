# Atlas Field Notes — product brief

A paper travel journal. It should look like a stamped passport and a stack of
polaroids, not a Medium clone.

## Brand

- Name (exact): Atlas Field Notes
- Colors (use these hex values in CSS):
  - paper `#F7F1E3`
  - terracotta `#C45C26`
  - ocean `#1B4B6B`
  - stamp `#B42318`
- Type: **Newsreader** for titles, a humanist sans for notes

## Required landmarks

| testid | What it is |
|---|---|
| `stamp-rail` | A row of passport-style stamps |
| `route-ledger` | Every note from `data/notes.json` (title + region) |
| `polaroid-stack` | Tilted / stacked photo frames (CSS is enough) |
| `compass-mark` | A compass rose or bearing mark |

Do **not** write "Welcome to our website".

## Output

Write the site under `site/`. Do not edit `verify.py`, `server.py`, or `data/`.

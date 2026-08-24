# Northline Dispatch rubric

Empirical checks (see `verify.py`). Score = passed / total. Pass requires every check.

## Step 1 — static ops board

- `site/index.html` exists
- Visible name is **Northline Dispatch**
- Landmarks: `radio-log`, `incident-board`, `yard-clock`, `status-pills`
- CSS contains `#0B0E12`, `#F5A524`, `#8B9BB4`, `#E23B3B`
- CSS names **IBM Plex Mono**
- Every incident id and yard from `data/incidents.json` is rendered
- Rejects a generic "Welcome to our website" hero

## Step 2 — interactive (adds)

- `status-filter` and `incident-sort` landmarks
- `site/logic.js` exports `filterIncidents(items, status)` and `sortIncidents(items, key)`
- Filter `'open'` keeps only open rows; `'all'` keeps all
- Sort by `'severity'` is descending (9 before 5 before 2)
- App JS references the filter helpers

## Step 3 — auth (adds)

- `crew-login` and `supervisor-panel` landmarks
- Email + password fields
- JS calls `/api/login`, `/api/private`, `/api/logout`
- The supervisor near-miss note from `data/private.json` is **not** hardcoded

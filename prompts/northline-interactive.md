Build the Northline Dispatch board described in BRIEF.md, then add interaction.

This is step 2 of 3. Step 1 still applies.

Additionally:
- Add status filters (`data-testid="status-filter"`) for open / holding / cleared / all.
- Add sort controls (`data-testid="incident-sort"`).
- Implement site/logic.js as ES modules:
  - export function filterIncidents(items, status) — "all" returns all; otherwise match item.status
  - export function sortIncidents(items, key) — when key is "severity", return a new array sorted descending by severity
- Wire those helpers from site/app.js or equivalent.
- Do not edit verify.py, server.py, or data/.

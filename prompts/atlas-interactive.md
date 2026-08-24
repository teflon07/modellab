Build the Atlas Field Notes journal described in BRIEF.md, then add interaction.

This is step 2 of 3. Step 1 still applies.

Additionally:
- Add a region filter (`data-testid="region-filter"`).
- Add a search box (`data-testid="note-search"`).
- Implement site/logic.js as ES modules:
  - export function filterNotes(items, region) — "all" returns all; otherwise match item.region
  - export function searchNotes(items, query) — case-insensitive match on title or body; empty query returns all
- Wire those helpers from site/app.js or equivalent.
- Do not edit verify.py, server.py, or data/.

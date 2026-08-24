Build the Harbor & Pine bakery site described in BRIEF.md, then add interaction.

This is step 2 of 3 (static + interactive). Step 1 still applies.

Additionally:
- Add a filter bar (`data-testid="menu-filter"`) that can show pastry / loaf / sweet / all.
- Add a reservation form (`data-testid="reserve-form"`) with name, email, date, and party size.
- Implement site/logic.js as ES modules:
  - export function filterMenu(items, tag) — tag "all" (or "") returns all; otherwise keep items whose tag matches
  - export function reservationValid({name, email, date, party}) — true only when name and date are non-empty, email contains "@" and a ".", and party is an integer 2–8
- Wire the filters (and form validation) from site/app.js or equivalent.
- Do not edit verify.py, server.py, or data/.

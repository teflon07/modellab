# Harbor & Pine rubric

Empirical checks (see `verify.py`). Score = passed / total. Pass requires every check.

## Step 1 — static brand site

- `site/index.html` exists
- Visible name is **Harbor & Pine** (not a generic bakery)
- Landmarks present: `split-hero`, `chalkboard`, `tide-ribbon`, `hours-rail`, `pastry-list`
- Chalkboard copy mentions the fir-sugar bun
- CSS contains `#1F3D2B`, `#F4E8D0`, `#B87333`, `#2A2118`
- CSS names **Fraunces**
- Every `data/menu.json` name and price is rendered
- Every `data/hours.json` day and hours string is rendered
- Rejects a generic "Welcome to our website" hero

## Step 2 — interactive (adds)

- `menu-filter` and `reserve-form` landmarks
- `site/logic.js` exports `filterMenu(items, tag)` and `reservationValid({name,email,date,party})`
- `filterMenu(..., 'pastry')` returns only pastry-tagged items; `'all'` returns all
- `reservationValid` accepts party 2–8 with a plausible email; rejects party 1 and bad email
- App JS wires the filter controls

## Step 3 — auth (adds)

- `member-login` and `member-panel` landmarks
- Email + password fields
- JS calls `/api/login`, `/api/private`, `/api/logout` on the shipped `server.py`
- The private tasting note from `data/private.json` is **not** hardcoded in HTML

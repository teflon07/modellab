# Atlas Field Notes rubric

Empirical checks (see `verify.py`). Score = passed / total. Pass requires every check.

## Step 1 — static journal

- `site/index.html` exists
- Visible name is **Atlas Field Notes**
- Landmarks: `stamp-rail`, `route-ledger`, `polaroid-stack`, `compass-mark`
- CSS contains `#F7F1E3`, `#C45C26`, `#1B4B6B`, `#B42318`
- CSS names **Newsreader**
- Every note title and region from `data/notes.json` is rendered
- Rejects a generic "Welcome to our website" hero

## Step 2 — interactive (adds)

- `region-filter` and `note-search` landmarks
- `site/logic.js` exports `filterNotes(items, region)` and `searchNotes(items, query)`
- Filter `'Andes'` keeps only Andes rows; `'all'` keeps all
- Search `'red'` matches "Red Pass"; empty query returns all
- App JS references the filter helpers

## Step 3 — auth (adds)

- `author-login` and `private-panel` landmarks
- Email + password fields
- JS calls `/api/login`, `/api/private`, `/api/logout`
- The unpublished coordinate from `data/private.json` is **not** hardcoded

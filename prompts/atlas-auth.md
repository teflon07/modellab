Build the full Atlas Field Notes journal described in BRIEF.md, including interaction and author auth.

This is step 3 of 3. Steps 1 and 2 still apply.

Additionally:
- Add an author login form (`data-testid="author-login"`) with email and password.
- Add a private panel (`data-testid="private-panel"`) filled only after login.
- Talk to the shipped server.py API:
  - POST /api/login, GET /api/private, POST /api/logout
- Account: nara@atlas.test / red-stamp
- Do not hardcode the unpublished coordinate from data/private.json into the HTML.
- Do not edit verify.py, server.py, or data/.

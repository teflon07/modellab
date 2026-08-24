Build the full Harbor & Pine bakery site described in BRIEF.md, including interaction and member auth.

This is step 3 of 3. Steps 1 and 2 still apply.

Additionally:
- Add a member login form (`data-testid="member-login"`) with email and password.
- Add a member panel (`data-testid="member-panel"`) that stays empty until login succeeds.
- Talk to the shipped server.py API (do not rewrite it):
  - POST /api/login with JSON {email, password}
  - GET /api/private after a successful login (show the tasting note in the member panel)
  - POST /api/logout
- Test account: guest@harborpine.test / cedar-ladder
- Do not hardcode the private tasting note from data/private.json into the HTML.
- Do not edit verify.py, server.py, or data/.

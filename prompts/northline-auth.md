Build the full Northline Dispatch board described in BRIEF.md, including interaction and crew auth.

This is step 3 of 3. Steps 1 and 2 still apply.

Additionally:
- Add a crew login form (`data-testid="crew-login"`) with email and password.
- Add a supervisor panel (`data-testid="supervisor-panel"`) filled only after login.
- Talk to the shipped server.py API:
  - POST /api/login, GET /api/private, POST /api/logout
- Accounts: ada@northline.test / signal-19 (dispatcher), kim@northline.test / yard-7 (supervisor)
- Do not hardcode the private near-miss note from data/private.json into the HTML.
- Do not edit verify.py, server.py, or data/.

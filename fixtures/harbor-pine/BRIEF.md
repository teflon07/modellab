# Harbor & Pine — product brief

A neighborhood bakery-cafe in Seaglass Cove. The site must look like a printed
menu left on a fir table, not a generic SaaS landing page.

## Brand

- Name (exact): Harbor & Pine
- Tagline: Bread, tide tables, and a quiet corner in Seaglass Cove
- Colors (use these hex values in CSS):
  - pine `#1F3D2B`
  - cream `#F4E8D0`
  - copper `#B87333`
  - ink `#2A2118`
  - foam `#E7F0EA`
- Type: display **Fraunces**, body Georgia or "Source Serif 4"

## Required landmarks

Give these elements `data-testid` values, exactly:

| testid | What it is |
|---|---|
| `split-hero` | Asymmetric hero: bakery name + a tide/weather aside |
| `chalkboard` | Daily pastry board; must mention the fir-sugar bun |
| `tide-ribbon` | A thin ribbon with a fabricated tide line |
| `hours-rail` | Hours from `data/hours.json` |
| `pastry-list` | Every item from `data/menu.json` with name and price |

Do **not** write a purple-gradient "Welcome to our website" page.

## Output

Write the site under `site/` (`index.html`, CSS, JS). Do not edit `verify.py`,
`server.py`, or `data/`.

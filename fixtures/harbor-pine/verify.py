"""Harbor & Pine — graded visual rubric. Do not edit.

Checks are empirical (files, brand tokens, fixture data, exported JS, auth
wiring). Reading this file is not enough: a generic page still fails.
"""
from __future__ import annotations

import pathlib
import re

import scoreboard as sb

ROOT = pathlib.Path(".").resolve()
SITE = ROOT / "site"
INDEX = SITE / "index.html"
STEP = sb.step()


def main() -> None:
    dom = sb.parse_html(INDEX)
    css = sb.css_blob(SITE, dom) if SITE.is_dir() else ""
    js = sb.js_blob(SITE, dom) if SITE.is_dir() else ""
    text = dom.text if dom else ""
    testids = dom.testids if dom else set()
    menu = sb.load_json(ROOT / "data" / "menu.json")
    hours = sb.load_json(ROOT / "data" / "hours.json")
    private = sb.load_json(ROOT / "data" / "private.json")

    checks: list[tuple[str, str, sb.CheckFn]] = [
        ("index", "site/index.html exists", lambda: INDEX.is_file()),
        ("title", "page uses the Harbor & Pine name", lambda: bool(dom) and "Harbor & Pine" in text),
        ("split_hero", "split-hero landmark is present", lambda: "split-hero" in testids),
        ("chalkboard", "daily pastry chalkboard is present", lambda: "chalkboard" in testids),
        ("chalkboard_copy", "chalkboard names the fir-sugar bun", lambda: "fir-sugar" in text.lower()),
        ("tide_ribbon", "tide-ribbon landmark is present", lambda: "tide-ribbon" in testids),
        ("hours_rail", "hours-rail landmark is present", lambda: "hours-rail" in testids),
        ("pastry_list", "pastry-list landmark is present", lambda: "pastry-list" in testids),
        ("color_pine", "CSS uses pine #1F3D2B", lambda: sb.has_hex(css, "#1F3D2B")),
        ("color_cream", "CSS uses cream #F4E8D0", lambda: sb.has_hex(css, "#F4E8D0")),
        ("color_copper", "CSS uses copper #B87333", lambda: sb.has_hex(css, "#B87333")),
        ("color_ink", "CSS uses ink #2A2118", lambda: sb.has_hex(css, "#2A2118")),
        ("font_display", "CSS names Fraunces", lambda: sb.has_font(css, "Fraunces")),
        ("menu_items", "every menu item name is rendered", lambda: all(item["name"] in text for item in menu)),
        ("menu_prices", "every menu price is rendered", lambda: all(item["price"] in text for item in menu)),
        ("hours_rows", "every hours row is rendered", lambda: all(row["day"] in text and row["hours"] in text for row in hours)),
        ("no_generic_hero", "does not use a generic Welcome hero", lambda: "welcome to our website" not in text.lower()),
    ]

    if STEP >= 2:
        checks.extend([
            ("filter_bar", "menu filter bar is present", lambda: "menu-filter" in testids),
            ("reserve_form", "reservation form is present", lambda: "reserve-form" in testids),
            ("logic_file", "site/logic.js exists", lambda: (SITE / "logic.js").is_file()),
            ("filter_fn", "filterMenu keeps only the requested tag", lambda: sb.bun_check(SITE, FILTER_EXPR)),
            ("reserve_fn", "reservationValid rejects a party of 1", lambda: sb.bun_check(SITE, RESERVE_EXPR)),
            ("filter_wired", "app JS listens for filter clicks or changes", lambda: bool(re.search(r"filterMenu|data-tag|menu-filter", js))),
        ])

    if STEP >= 3:
        secret = private["note"]
        checks.extend([
            ("login_form", "member login form is present", lambda: "member-login" in testids),
            ("login_fields", "login has email and password fields", lambda: bool(dom) and "email" in INDEX.read_text(encoding="utf-8", errors="replace").lower() and "password" in INDEX.read_text(encoding="utf-8", errors="replace").lower()),
            ("login_api", "JS posts to /api/login", lambda: "/api/login" in js),
            ("private_api", "JS reads /api/private after auth", lambda: "/api/private" in js),
            ("logout_api", "JS calls /api/logout", lambda: "/api/logout" in js),
            ("secret_hidden", "private tasting note is not hardcoded in HTML", lambda: secret not in INDEX.read_text(encoding="utf-8", errors="replace")),
            ("member_panel", "member-panel landmark is present", lambda: "member-panel" in testids),
        ])

    sb.finish(sb.collect(checks), ROOT)


FILTER_EXPR = r"""
const { filterMenu } = await import('./logic.js');
const items = [
  { name: 'A', tag: 'pastry' },
  { name: 'B', tag: 'loaf' },
  { name: 'C', tag: 'pastry' },
];
const pastry = filterMenu(items, 'pastry');
if (pastry.length !== 2 || pastry.some((i) => i.tag !== 'pastry')) process.exit(1);
const all = filterMenu(items, 'all');
if (all.length !== 3) process.exit(1);
"""

RESERVE_EXPR = r"""
const { reservationValid } = await import('./logic.js');
const ok = reservationValid({ name: 'Ada', email: 'ada@example.com', date: '2026-09-01', party: 3 });
const tiny = reservationValid({ name: 'Ada', email: 'ada@example.com', date: '2026-09-01', party: 1 });
const badMail = reservationValid({ name: 'Ada', email: 'nope', date: '2026-09-01', party: 3 });
if (!ok || tiny || badMail) process.exit(1);
"""


if __name__ == "__main__":
    main()

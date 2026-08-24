"""Atlas Field Notes — graded visual rubric. Do not edit."""
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
    notes = sb.load_json(ROOT / "data" / "notes.json")
    private = sb.load_json(ROOT / "data" / "private.json")

    checks: list[tuple[str, str, sb.CheckFn]] = [
        ("index", "site/index.html exists", lambda: INDEX.is_file()),
        ("title", "page uses the Atlas Field Notes name", lambda: bool(dom) and "Atlas Field Notes" in text),
        ("stamp_rail", "stamp-rail landmark is present", lambda: "stamp-rail" in testids),
        ("route_ledger", "route-ledger landmark is present", lambda: "route-ledger" in testids),
        ("polaroid_stack", "polaroid-stack landmark is present", lambda: "polaroid-stack" in testids),
        ("compass_mark", "compass-mark landmark is present", lambda: "compass-mark" in testids),
        ("color_paper", "CSS uses paper #F7F1E3", lambda: sb.has_hex(css, "#F7F1E3")),
        ("color_terra", "CSS uses terracotta #C45C26", lambda: sb.has_hex(css, "#C45C26")),
        ("color_ocean", "CSS uses ocean #1B4B6B", lambda: sb.has_hex(css, "#1B4B6B")),
        ("color_stamp", "CSS uses stamp #B42318", lambda: sb.has_hex(css, "#B42318")),
        ("font_news", "CSS names Newsreader", lambda: sb.has_font(css, "Newsreader")),
        ("notes", "every field-note title is rendered", lambda: all(item["title"] in text for item in notes)),
        ("regions", "every region label is rendered", lambda: all(item["region"] in text for item in notes)),
        ("no_generic_hero", "does not use a generic Welcome hero", lambda: "welcome to our website" not in text.lower()),
    ]

    if STEP >= 2:
        checks.extend([
            ("filter_bar", "region filter bar is present", lambda: "region-filter" in testids),
            ("search_box", "note search box is present", lambda: "note-search" in testids),
            ("logic_file", "site/logic.js exists", lambda: (SITE / "logic.js").is_file()),
            ("filter_fn", "filterNotes keeps only the requested region", lambda: sb.bun_check(SITE, FILTER_EXPR)),
            ("search_fn", "searchNotes matches title text", lambda: sb.bun_check(SITE, SEARCH_EXPR)),
            ("filter_wired", "app JS references the filter helpers", lambda: bool(re.search(r"filterNotes|region-filter", js))),
        ])

    if STEP >= 3:
        secret = private["note"]
        checks.extend([
            ("login_form", "author login form is present", lambda: "author-login" in testids),
            ("login_fields", "login has email and password fields", lambda: "email" in INDEX.read_text(encoding="utf-8", errors="replace").lower() and "password" in INDEX.read_text(encoding="utf-8", errors="replace").lower()),
            ("login_api", "JS posts to /api/login", lambda: "/api/login" in js),
            ("private_api", "JS reads /api/private after auth", lambda: "/api/private" in js),
            ("logout_api", "JS calls /api/logout", lambda: "/api/logout" in js),
            ("secret_hidden", "unpublished coordinate is not hardcoded in HTML", lambda: secret not in INDEX.read_text(encoding="utf-8", errors="replace")),
            ("private_panel", "private-panel landmark is present", lambda: "private-panel" in testids),
        ])

    sb.finish(sb.collect(checks), ROOT)


FILTER_EXPR = r"""
const { filterNotes } = await import('./logic.js');
const items = [
  { title: 'A', region: 'Andes' },
  { title: 'B', region: 'Sahel' },
  { title: 'C', region: 'Andes' },
];
const andes = filterNotes(items, 'Andes');
if (andes.length !== 2 || andes.some((i) => i.region !== 'Andes')) process.exit(1);
if (filterNotes(items, 'all').length !== 3) process.exit(1);
"""

SEARCH_EXPR = r"""
const { searchNotes } = await import('./logic.js');
const items = [
  { title: 'Red Pass', body: 'wind' },
  { title: 'Blue Harbor', body: 'fog' },
];
const hit = searchNotes(items, 'red');
if (hit.length !== 1 || hit[0].title !== 'Red Pass') process.exit(1);
if (searchNotes(items, '').length !== 2) process.exit(1);
"""


if __name__ == "__main__":
    main()

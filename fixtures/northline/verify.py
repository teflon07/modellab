"""Northline Dispatch — graded visual rubric. Do not edit."""
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
    incidents = sb.load_json(ROOT / "data" / "incidents.json")
    private = sb.load_json(ROOT / "data" / "private.json")

    checks: list[tuple[str, str, sb.CheckFn]] = [
        ("index", "site/index.html exists", lambda: INDEX.is_file()),
        ("title", "page uses the Northline Dispatch name", lambda: bool(dom) and "Northline Dispatch" in text),
        ("radio_log", "radio-log landmark is present", lambda: "radio-log" in testids),
        ("incident_board", "incident-board landmark is present", lambda: "incident-board" in testids),
        ("yard_clock", "yard-clock landmark is present", lambda: "yard-clock" in testids),
        ("status_pills", "status-pills landmark is present", lambda: "status-pills" in testids),
        ("color_void", "CSS uses void #0B0E12", lambda: sb.has_hex(css, "#0B0E12")),
        ("color_amber", "CSS uses amber #F5A524", lambda: sb.has_hex(css, "#F5A524")),
        ("color_steel", "CSS uses steel #8B9BB4", lambda: sb.has_hex(css, "#8B9BB4")),
        ("color_signal", "CSS uses signal #E23B3B", lambda: sb.has_hex(css, "#E23B3B")),
        ("font_mono", "CSS names IBM Plex Mono", lambda: sb.has_font(css, "IBM Plex Mono")),
        ("incidents", "every incident id is rendered", lambda: all(item["id"] in text for item in incidents)),
        ("incident_yards", "every incident yard is rendered", lambda: all(item["yard"] in text for item in incidents)),
        ("no_generic_hero", "does not use a generic Welcome hero", lambda: "welcome to our website" not in text.lower()),
    ]

    if STEP >= 2:
        checks.extend([
            ("filter_bar", "status filter bar is present", lambda: "status-filter" in testids),
            ("sort_bar", "incident sort controls are present", lambda: "incident-sort" in testids),
            ("logic_file", "site/logic.js exists", lambda: (SITE / "logic.js").is_file()),
            ("filter_fn", "filterIncidents keeps only the requested status", lambda: sb.bun_check(SITE, FILTER_EXPR)),
            ("sort_fn", "sortIncidents orders by severity descending", lambda: sb.bun_check(SITE, SORT_EXPR)),
            ("filter_wired", "app JS references the filter helpers", lambda: bool(re.search(r"filterIncidents|status-filter", js))),
        ])

    if STEP >= 3:
        secret = private["note"]
        checks.extend([
            ("login_form", "crew login form is present", lambda: "crew-login" in testids),
            ("login_fields", "login has email and password fields", lambda: "email" in INDEX.read_text(encoding="utf-8", errors="replace").lower() and "password" in INDEX.read_text(encoding="utf-8", errors="replace").lower()),
            ("login_api", "JS posts to /api/login", lambda: "/api/login" in js),
            ("private_api", "JS reads /api/private after auth", lambda: "/api/private" in js),
            ("logout_api", "JS calls /api/logout", lambda: "/api/logout" in js),
            ("secret_hidden", "supervisor note is not hardcoded in HTML", lambda: secret not in INDEX.read_text(encoding="utf-8", errors="replace")),
            ("supervisor_panel", "supervisor-panel landmark is present", lambda: "supervisor-panel" in testids),
        ])

    sb.finish(sb.collect(checks), ROOT)


FILTER_EXPR = r"""
const { filterIncidents } = await import('./logic.js');
const items = [
  { id: 'A', status: 'open', severity: 2 },
  { id: 'B', status: 'cleared', severity: 9 },
  { id: 'C', status: 'open', severity: 5 },
];
const open = filterIncidents(items, 'open');
if (open.length !== 2 || open.some((i) => i.status !== 'open')) process.exit(1);
if (filterIncidents(items, 'all').length !== 3) process.exit(1);
"""

SORT_EXPR = r"""
const { sortIncidents } = await import('./logic.js');
const items = [
  { id: 'A', severity: 2 },
  { id: 'B', severity: 9 },
  { id: 'C', severity: 5 },
];
const sorted = sortIncidents(items, 'severity');
if (sorted.map((i) => i.id).join('') !== 'BCA') process.exit(1);
"""


if __name__ == "__main__":
    main()

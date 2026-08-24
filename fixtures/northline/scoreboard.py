"""Graded rubric runner shared by the visual website series.

Writes score.json + score.md, then exits 0 iff every check passed. Partial
scores stay on disk so a 0.7 vs 0.2 failure is still comparable.
"""
from __future__ import annotations

import json
import pathlib
import re
import subprocess
import sys
from dataclasses import dataclass
from html.parser import HTMLParser
from typing import Callable


@dataclass
class Check:
    id: str
    label: str
    ok: bool


class _Dom(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.testids: set[str] = set()
        self.ids: set[str] = set()
        self.text_parts: list[str] = []
        self.links: list[str] = []
        self.scripts: list[str] = []
        self.stylesheets: list[str] = []
        self.inline_css: list[str] = []
        self._capture_style = False
        self._capture_script = False

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        ad = {k: (v or "") for k, v in attrs}
        if ad.get("data-testid"):
            self.testids.add(ad["data-testid"])
        if ad.get("id"):
            self.ids.add(ad["id"])
        if tag == "a" and ad.get("href"):
            self.links.append(ad["href"])
        if tag == "link" and "stylesheet" in ad.get("rel", "") and ad.get("href"):
            self.stylesheets.append(ad["href"])
        if tag == "script" and ad.get("src"):
            self.scripts.append(ad["src"])
        if tag == "style":
            self._capture_style = True
        if tag == "script" and not ad.get("src"):
            self._capture_script = True

    def handle_endtag(self, tag: str) -> None:
        if tag == "style":
            self._capture_style = False
        if tag == "script":
            self._capture_script = False

    def handle_data(self, data: str) -> None:
        if self._capture_style:
            self.inline_css.append(data)
        elif self._capture_script:
            pass
        else:
            self.text_parts.append(data)

    @property
    def text(self) -> str:
        return " ".join(self.text_parts)


def parse_html(path: pathlib.Path) -> _Dom | None:
    if not path.is_file():
        return None
    dom = _Dom()
    try:
        dom.feed(path.read_text(encoding="utf-8", errors="replace"))
    except Exception:
        return None
    return dom


def css_blob(site: pathlib.Path, dom: _Dom | None) -> str:
    chunks: list[str] = []
    if dom:
        chunks.extend(dom.inline_css)
        for href in dom.stylesheets:
            p = (site / href).resolve()
            if p.is_file() and site.resolve() in p.parents or p.parent == site.resolve():
                chunks.append(p.read_text(encoding="utf-8", errors="replace"))
    for css in site.glob("*.css"):
        chunks.append(css.read_text(encoding="utf-8", errors="replace"))
    return "\n".join(chunks)


def js_blob(site: pathlib.Path, dom: _Dom | None) -> str:
    chunks: list[str] = []
    for js in site.glob("*.js"):
        chunks.append(js.read_text(encoding="utf-8", errors="replace"))
    if dom:
        for src in dom.scripts:
            p = (site / src).resolve()
            if p.is_file():
                chunks.append(p.read_text(encoding="utf-8", errors="replace"))
    return "\n".join(chunks)


def has_hex(css: str, color: str) -> bool:
    return re.search(re.escape(color), css, re.IGNORECASE) is not None


def has_font(css: str, name: str) -> bool:
    return re.search(re.escape(name), css, re.IGNORECASE) is not None


def load_json(path: pathlib.Path):
    return json.loads(path.read_text(encoding="utf-8"))


def bun_check(cwd: pathlib.Path, expr: str) -> bool:
    """Run a small ESM snippet with bun or node (CI has bun; many laptops have node)."""
    script = cwd / "._rubric_check.mjs"
    script.write_text(expr, encoding="utf-8")
    try:
        for exe in ("bun", "node"):
            try:
                r = subprocess.run([exe, str(script)], cwd=str(cwd), capture_output=True, text=True)
            except FileNotFoundError:
                continue
            if r.returncode == 0:
                return True
        return False
    finally:
        if script.exists():
            script.unlink()


def finish(checks: list[Check], out: pathlib.Path) -> None:
    passed = sum(1 for c in checks if c.ok)
    total = len(checks) or 1
    score = passed / total
    payload = {
        "score": round(score, 4),
        "pass": passed == len(checks) and len(checks) > 0,
        "threshold": 1.0,
        "passed": passed,
        "total": len(checks),
        "checks": [{"id": c.id, "label": c.label, "pass": c.ok} for c in checks],
    }
    (out / "score.json").write_text(json.dumps(payload, indent=2) + "\n")
    lines = [f"# Rubric  {passed}/{len(checks)}  score={payload['score']}", ""]
    for c in checks:
        mark = "PASS" if c.ok else "FAIL"
        lines.append(f"- [{mark}] {c.id} — {c.label}")
    (out / "score.md").write_text("\n".join(lines) + "\n")
    for c in checks:
        if not c.ok:
            print(f"FAIL: {c.id}: {c.label}", file=sys.stderr)
    if payload["pass"]:
        print(f"ok {passed}/{len(checks)}")
        sys.exit(0)
    print(f"FAIL {passed}/{len(checks)} score={payload['score']}", file=sys.stderr)
    sys.exit(1)


def step() -> int:
    raw = (sys.argv[1] if len(sys.argv) > 1 else None) or __import__("os").environ.get("MODELLAB_STEP", "1")
    try:
        n = int(raw)
    except ValueError:
        n = 1
    return n if n in (1, 2, 3) else 1


CheckFn = Callable[[], bool]


def collect(pairs: list[tuple[str, str, CheckFn]]) -> list[Check]:
    out: list[Check] = []
    for cid, label, fn in pairs:
        try:
            ok = bool(fn())
        except Exception:
            ok = False
        out.append(Check(cid, label, ok))
    return out

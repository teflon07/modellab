#!/usr/bin/env python3
"""Render a faculty pass/fail card as an animated GIF (on-brand, side-by-side).

Covers the 2D-maze family: execution (plain maze) and planning (keys + locked
doors). Feed a maze grid plus a PASS move-string and a FAIL move-string; both
routes animate move-by-move, cyan while legal, red at the first illegal step (a
wall, or a locked door whose key wasn't collected yet).

Keys are lowercase letters, doors uppercase (S/E excluded); detected
automatically, so a plain execution maze simply has none.

Usage:
  render_faculty.py --maze M.txt --out card.gif \
     --pass "DDRR..."  --pass-label "PASS · solved" \
     --fail "DDRR..."  --fail-label "FAIL · wall clip"
  # planning demo: derive the archetypal "didn't get the key" fail automatically
  render_faculty.py --maze M.txt --out card.gif --pass "<solution>" --auto-fail
"""
import argparse, os
from collections import deque
from PIL import Image, ImageDraw, ImageFont

CELL, HEAD, GAP = 40, 52, 22
BG=(10,13,18); WALL=(24,29,38); OPEN=(40,48,61)
S_COL=(61,184,225); E_COL=(240,180,40); KEY_COL=(240,205,90); DOOR_COL=(150,92,96)
OK=(61,184,225); BAD=(232,119,119); INK=(232,238,242)
MOVES={"U":(-1,0),"D":(1,0),"L":(0,-1),"R":(0,1)}


def font(sz):
    for p in ("/System/Library/Fonts/Menlo.ttc", "/System/Library/Fonts/SFNSMono.ttf"):
        try: return ImageFont.truetype(p, sz)
        except Exception: pass
    return ImageFont.load_default(size=sz)


def parse(path):
    return [list(l) for l in open(path).read().splitlines() if l]


def find(g, ch):
    for r, row in enumerate(g):
        for c, x in enumerate(row):
            if x == ch: return (r, c)


def is_door(ch): return ch.isalpha() and ch.isupper() and ch not in ("S", "E")
def is_key(ch):  return ch.isalpha() and ch.islower()


def naive_fail(g):
    """Shortest S->E treating doors as open: the 'didn't plan the key' route."""
    S, E = find(g, "S"), find(g, "E")
    prev = {S: None}; q = deque([S])
    while q:
        r, c = q.popleft()
        if (r, c) == E: break
        for m, (dr, dc) in MOVES.items():
            nr, nc = r + dr, c + dc
            if 0 <= nr < len(g) and 0 <= nc < len(g[nr]) and g[nr][nc] != "#" and (nr, nc) not in prev:
                prev[(nr, nc)] = (r, c, m); q.append((nr, nc))
    seq = []; cur = E
    while prev.get(cur): pr, pc, m = prev[cur]; seq.append(m); cur = (pr, pc)
    return "".join(reversed(seq))


def positions(g, moves, cell):
    """Cell centers walked, stopping at the first illegal step. -> (pts, broke)."""
    r, c = find(g, "S"); keys = set(); broke = False
    def cx(rr, cc): return (cc * cell + cell // 2, HEAD + rr * cell + cell // 2)
    pts = [cx(r, c)]
    for m in moves:
        if m not in MOVES: continue
        dr, dc = MOVES[m]; r, c = r + dr, c + dc
        ch = g[r][c] if 0 <= r < len(g) and 0 <= c < len(g[r]) else "#"
        if is_key(ch): keys.add(ch.upper())
        legal = ch != "#" and not (is_door(ch) and ch not in keys)
        if not legal: broke = True
        pts.append(cx(r, c))
        if broke: break
    return pts, broke


def base_panel(g, title, ok, cell):
    h = len(g); w = max(len(r) for r in g)
    img = Image.new("RGB", (w * cell, HEAD + h * cell), BG); d = ImageDraw.Draw(img)
    d.text((10, 16), title, fill=(OK if ok else BAD), font=font(21))
    for r in range(h):
        for c in range(w):
            ch = g[r][c] if c < len(g[r]) else "#"; x0, y0 = c * cell, HEAD + r * cell
            col = WALL if ch == "#" else OPEN
            if ch == "S": col = S_COL
            elif ch == "E": col = E_COL
            elif is_key(ch): col = KEY_COL
            elif is_door(ch): col = DOOR_COL
            d.rectangle([x0 + 1, y0 + 1, x0 + cell - 1, y0 + cell - 1], fill=col)
            if ch.isalpha() and ch not in ("#", "."):
                d.text((x0 + cell // 2 - 6, y0 + cell // 2 - 11), ch,
                       fill=(BG if ch in "SEae" else INK), font=font(19))
    return img


def draw_reveal(base, pts, broke, reveal):
    img = base.copy(); d = ImageDraw.Draw(img)
    n = min(reveal, len(pts) - 1)
    for i in range(1, n + 1):
        red = broke and i == len(pts) - 1
        d.line([pts[i - 1], pts[i]], fill=(BAD if red else OK), width=5, joint="curve")
    for i in range(0, n + 1):
        red = broke and i == len(pts) - 1 and n == len(pts) - 1
        x, y = pts[i]; d.ellipse([x - 6, y - 6, x + 6, y + 6], fill=(BAD if red else OK))
    return img


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--maze", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--pass", dest="pass_", required=True, help="PASS move string (UDLR)")
    ap.add_argument("--fail", help="FAIL move string (UDLR)")
    ap.add_argument("--auto-fail", action="store_true", help="derive the naive 'didn't plan' route")
    ap.add_argument("--pass-label", default="PASS")
    ap.add_argument("--fail-label", default="FAIL")
    ap.add_argument("--cell", type=int, default=CELL)
    ap.add_argument("--duration", type=int, default=110, help="ms per move")
    ap.add_argument("--hold", type=int, default=14, help="frames to hold the final image")
    a = ap.parse_args()

    g = parse(os.path.expanduser(a.maze))
    fail_moves = a.fail if a.fail else (naive_fail(g) if a.auto_fail else "")
    if not fail_moves:
        ap.error("provide --fail MOVES or --auto-fail")
    fp, fb = positions(g, fail_moves, a.cell)
    pp, pb = positions(g, a.pass_, a.cell)
    lbase = base_panel(g, a.fail_label, False, a.cell)
    rbase = base_panel(g, a.pass_label, True, a.cell)
    W, H = lbase.width + GAP + rbase.width, lbase.height
    maxr = max(len(fp), len(pp))
    frames = []
    for t in range(0, maxr + 1):
        card = Image.new("RGB", (W, H), BG)
        card.paste(draw_reveal(lbase, fp, fb, t), (0, 0))
        card.paste(draw_reveal(rbase, pp, pb, t), (lbase.width + GAP, 0))
        frames.append(card)
    frames += [frames[-1]] * a.hold
    out = os.path.expanduser(a.out)
    frames[0].save(out, save_all=True, append_images=frames[1:], duration=a.duration, loop=0, optimize=True)
    print(f"wrote {out}  {W}x{H}  {len(frames)} frames  {os.path.getsize(out)//1024} KB")


if __name__ == "__main__":
    main()

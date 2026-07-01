#!/usr/bin/env python3
"""Render a maze (and optionally a solver's path) to a PNG for visual inspection.

Usage: render_maze.py MAZE.txt OUT.png [PATH]
PATH is a string of U/D/L/R moves; the walked cells are drawn, green if the path
legally reaches E, red from the first illegal/among-walls step onward.
"""
import sys

from PIL import Image, ImageDraw

CELL = 24
WALL = (30, 30, 38)
OPEN = (245, 245, 245)
START = (60, 140, 240)
EXIT = (240, 180, 40)
PATH_OK = (70, 190, 120)
PATH_BAD = (220, 80, 80)

DELTA = {"U": (-1, 0), "D": (1, 0), "L": (0, -1), "R": (0, 1)}


def main():
    maze_file, out = sys.argv[1], sys.argv[2]
    moves = "".join(ch for ch in (sys.argv[3].upper() if len(sys.argv) > 3 else "") if ch in "UDLR")
    grid = [list(l) for l in open(maze_file).read().splitlines() if l]
    h = len(grid)
    w = max(len(r) for r in grid)

    def cell(r, c):
        return grid[r][c] if 0 <= r < h and 0 <= c < len(grid[r]) else "#"

    def find(ch):
        for r in range(h):
            for c in range(len(grid[r])):
                if grid[r][c] == ch:
                    return (r, c)
        return None

    img = Image.new("RGB", (w * CELL, h * CELL), OPEN)
    d = ImageDraw.Draw(img)
    for r in range(h):
        for c in range(w):
            ch = cell(r, c)
            color = WALL if ch == "#" else OPEN
            if ch == "S":
                color = START
            elif ch == "E":
                color = EXIT
            d.rectangle([c * CELL, r * CELL, (c + 1) * CELL - 1, (r + 1) * CELL - 1], fill=color)

    if moves:
        start = find("S")
        exit_ = find("E")
        r, c = start
        broke = False
        for m in moves:
            dr, dc = DELTA[m]
            r, c = r + dr, c + dc
            legal = cell(r, c) != "#"
            if not legal:
                broke = True
            col = PATH_BAD if broke else PATH_OK
            cx, cy = c * CELL + CELL // 2, r * CELL + CELL // 2
            d.ellipse([cx - 5, cy - 5, cx + 5, cy + 5], fill=col)
            if broke:
                break
        reached = (not broke) and (r, c) == exit_
        d.text((4, 4), "SOLVED" if reached else "FAILED", fill=(0, 0, 0))

    img.save(out)
    print(f"wrote {out} ({w}x{h} maze, {len(moves)} moves)")


if __name__ == "__main__":
    main()

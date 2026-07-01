You are given a maze on a character grid. `#` is a wall, `.` is open space, `S`
is the start, and `E` is the exit.

From S, move one cell at a time using these moves:
  U = up    (row - 1)
  D = down  (row + 1)
  L = left  (col - 1)
  R = right (col + 1)

You may step only onto `.`, `S`, or `E` cells, never onto a `#`, and never off
the grid. Find a path from S to E.

Output ONLY the path, as a single line of the letters U, D, L, R with nothing
else (no spaces, no commentary). Reason it out yourself.

Maze:
###########
#S......#.#
#######.#.#
#...#...#.#
#.#.#.###.#
#.#.#.#...#
#.###.#.#.#
#.#...#.#.#
#.#.###.#.#
#.......#E#
###########

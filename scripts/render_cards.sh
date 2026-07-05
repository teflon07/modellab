#!/usr/bin/env bash
# Regenerate all faculty pass/fail cards from the stored real instances (cards/).
# Deduction has no faithful spatial form and is intentionally omitted.
# Usage: scripts/render_cards.sh [OUTDIR]   (default: scripts/cards/out)
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
C="$DIR/cards"
OUT="${1:-$C/out}"
mkdir -p "$OUT"

python3 "$DIR/render_faculty.py" --maze "$C/planning.txt" --out "$OUT/planning-passfail.gif" \
  --pass "DDDDRRRRRRRRUUUULLDDLLLLUDRRRRUURRDDDDDDDD" --auto-fail \
  --pass-label "PASS  ·  Fable 5  ·  detours for the key, then through" \
  --fail-label "FAIL  ·  beelines to the door, no key"

python3 "$DIR/render_faculty.py" --maze "$C/execution.txt" --out "$OUT/execution-passfail.gif" --cell 22 \
  --pass "RRDDLLDDDDRRDDDDDDRRDDRRRRUUUUUURRRRUULLLLLLUUUULLUURRRRRRDDRRDDRRUURRDDRRDDDDDDLLDDDDLLDDRRRRDD" \
  --fail "RRDDLLDDDDRRDDDDDDRRDDRRRRUUUUUURRRRUULLLLLLUUUULLUURRRRRRDDDDRRRRUURRDDRRDDDDDDLLDDDDLLDDRRRRDD" \
  --pass-label "PASS  ·  Fable 5  ·  96 moves, no drift" \
  --fail-label "FAIL  ·  Sonnet 5  ·  clips a wall"

python3 "$DIR/render_arc.py" --data "$C/arc.json" --out "$OUT/abstraction-passfail.gif" \
  --pass-label "PASS  ·  Fable 5"

python3 "$DIR/render_3d.py" --data "$C/spatial.json" --out "$OUT/spatial-passfail.gif" --auto-fail \
  --pass-label "PASS  ·  Fable 5  ·  climbs L0 → L1 → L2 to E"

echo "cards -> $OUT"

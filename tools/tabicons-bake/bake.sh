#!/usr/bin/env bash
# Bakes the ten notch tab icons: one headless-Chromium screenshot of
# harness.html (2 tint rows x 10 icon cells, transparent background),
# sliced into 64px PNGs under app/icons/tabs/.
#
# Artwork: lucide v1.72.0 icon nodes (icons.js — transcribed from the
# reference checkout's lucide-react, the exact artwork the develop site
# rendered), rendered in the lucide convention: 24-unit viewBox, fill
# none, 2px round stroke. Two tints: white (idle tabs) and notch ink
# #1E2768 (the active tab pill).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="$ROOT/app/icons/tabs"
SLOT="${SLOT:-64}"
PORT="${PORT:-8478}"
PROFILE="$(mktemp -d)"

CHROME="$(command -v google-chrome || command -v google-chrome-stable || command -v chromium-browser || true)"
if [ -z "$CHROME" ]; then
  echo "no chromium binary found" >&2
  exit 1
fi

mkdir -p "$OUT"
cd "$ROOT"
python3 -m http.server "$PORT" --bind 127.0.0.1 >/dev/null 2>&1 &
SERVER=$!
trap 'kill $SERVER 2>/dev/null || true; rm -rf "$PROFILE"' EXIT

for _ in $(seq 1 50); do
  if curl -sf "http://127.0.0.1:$PORT/tools/tabicons-bake/harness.html" >/dev/null; then break; fi
  sleep 0.1
done

"$CHROME" --headless=new \
  --screenshot="$OUT/atlas.png" \
  --window-size="$((SLOT * 10)),$((SLOT * 2))" \
  --default-background-color=00000000 \
  --hide-scrollbars --force-device-scale-factor=1 \
  --virtual-time-budget=5000 \
  --user-data-dir="$PROFILE" \
  "http://127.0.0.1:$PORT/tools/tabicons-bake/harness.html?slot=$SLOT" \
  >/dev/null 2>&1

python3 - "$OUT/atlas.png" "$OUT" "$SLOT" << 'PYEOF'
import sys
from PIL import Image

atlas_path, out, slot = sys.argv[1], sys.argv[2], int(sys.argv[3])
TABS = ["music", "focus", "todo", "board", "mixer",
        "noise", "mirror", "system", "ai", "home"]
TINTS = ["", "-ink"]  # row 0: white, row 1: notch ink

atlas = Image.open(atlas_path).convert("RGBA")
assert atlas.size == (slot * 10, slot * 2), f"unexpected atlas size {atlas.size}"
for row, suffix in enumerate(TINTS):
    for column, name in enumerate(TABS):
        cell = atlas.crop((column * slot, row * slot, (column + 1) * slot, (row + 1) * slot))
        path = f"{out}/{name}{suffix}.png"
        cell.save(path)
        opaque = sum(1 for p in cell.getdata() if p[3] > 0)
        print(f"{path}: {cell.size[0]}x{cell.size[1]}, {opaque} painted px")
PYEOF

rm -f "$OUT/atlas.png"
echo "baked into $OUT"

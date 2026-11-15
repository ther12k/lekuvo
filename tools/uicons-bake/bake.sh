#!/usr/bin/env bash
# Bakes the 24 UI control icons: one headless-Chromium screenshot of
# harness.html (2 tint rows x 24 icon cells, transparent background),
# sliced into 64px PNGs under app/icons/ui/.
#
# Artwork: lucide v1.72.0 icon nodes (icons.js — same source as the tab
# icons), rendered in the lucide convention: 24-unit viewBox, fill none,
# 2px round stroke. Two tints: white (idle controls) and notch ink
# #1E2768 (on accent fills).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="$ROOT/app/icons/ui"
SLOT="${SLOT:-64}"
ICONS="${ICONS:-24}"
PORT="${PORT:-8479}"
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
  if curl -sf "http://127.0.0.1:$PORT/tools/uicons-bake/harness.html" >/dev/null; then break; fi
  sleep 0.1
done

"$CHROME" --headless=new \
  --screenshot="$OUT/atlas.png" \
  --window-size="$((SLOT * ICONS)),$((SLOT * 2))" \
  --default-background-color=00000000 \
  --hide-scrollbars --force-device-scale-factor=1 \
  --virtual-time-budget=5000 \
  --user-data-dir="$PROFILE" \
  "http://127.0.0.1:$PORT/tools/uicons-bake/harness.html?slot=$SLOT" \
  >/dev/null 2>&1

python3 - "$OUT/atlas.png" "$OUT" "$SLOT" "$ICONS" << 'PYEOF'
import sys
from PIL import Image

atlas_path, out, slot, icons = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4])
NAMES = ["wifi", "bluetooth", "bell-off", "moon", "pin", "rotate-ccw",
         "chevron-left", "chevron-right", "refresh-cw", "bell", "cloud-rain",
         "trees", "waves", "music-2", "flame", "wind", "moon-star",
         "audio-waveform", "lightbulb", "plug", "thermometer", "power",
         "clipboard-list", "volume-2"]
TINTS = ["", "-ink"]  # row 0: white, row 1: notch ink
assert len(NAMES) == icons, f"{len(NAMES)} names but {icons} columns expected"

atlas = Image.open(atlas_path).convert("RGBA")
assert atlas.size == (slot * icons, slot * 2), f"unexpected atlas size {atlas.size}"
empty = 0
for row, suffix in enumerate(TINTS):
    for column, name in enumerate(NAMES):
        cell = atlas.crop((column * slot, row * slot, (column + 1) * slot, (row + 1) * slot))
        path = f"{out}/{name}{suffix}.png"
        cell.save(path)
        opaque = sum(1 for p in cell.getdata() if p[3] > 0)
        if opaque < 40:
            empty += 1
            print(f"WARNING {path}: only {opaque} painted px")
print(f"sliced {2 * icons} icons ({empty} suspicious)")
PYEOF

rm -f "$OUT/atlas.png"
echo "baked into $OUT"

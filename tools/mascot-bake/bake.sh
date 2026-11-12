#!/usr/bin/env bash
# Bakes the Lekuvo mascot sprite atlas: one headless-Chromium screenshot
# per variant (12 moods x N frames), sliced into per-frame PNGs plus
# manifest.json under assets/mascot/.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="$ROOT/assets/mascot"
FRAMES="${FRAMES:-8}"
PORT="${PORT:-8477}"
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
  if curl -sf "http://127.0.0.1:$PORT/tools/mascot-bake/harness.html" >/dev/null; then break; fi
  sleep 0.1
done

bake_variant() {
  local variant="$1" slot="$2"
  echo "baking $variant (${slot}px, $FRAMES frames)..."
  "$CHROME" --headless=new \
    --screenshot="$OUT/atlas-$variant.png" \
    --window-size="$((slot * FRAMES)),$((slot * 12))" \
    --default-background-color=00000000 \
    --hide-scrollbars --force-device-scale-factor=1 \
    --virtual-time-budget=15000 \
    --user-data-dir="$PROFILE" \
    "http://127.0.0.1:$PORT/tools/mascot-bake/harness.html?variant=$variant&slot=$slot&frames=$FRAMES" \
    >/dev/null 2>&1
}

bake_variant full 96
bake_variant compact 28

python3 - "$OUT" "$FRAMES" << 'PYEOF'
import json, sys, os
from PIL import Image

out, frames = sys.argv[1], int(sys.argv[2])
MOODS = ["lazy","awake","wave","listening","dance","sleep",
         "surprised","dizzy","focus","thinking","success","alert"]

DEFAULT_CYCLES = {
    "dance": 900,
    "wave": 1650,
    "listening": 1800,
    "thinking": 1800,
    "alert": 2200,
    "dizzy": 2300,
    "sleep": 5000,
    "awake": 5400,
    "success": 1650,
    "surprised": 480,
    "focus": 10000,
    "lazy": 9000,
}

LOOPING_MOODS = {
    "lazy", "awake", "listening", "dance", "sleep", "focus", "thinking"
}

manifest = {"moods": {}}

for variant in ("full", "compact"):
    atlas = Image.open(os.path.join(out, f"atlas-{variant}.png")).convert("RGBA")
    slot = atlas.width // frames
    for row, mood in enumerate(MOODS):
        # Extract all frames
        cells = [
            atlas.crop((i * slot, row * slot, (i + 1) * slot, (row + 1) * slot))
            for i in range(frames)
        ]
        
        # Check if all frames are completely identical (truly static)
        all_identical = all(list(cells[i].getdata()) == list(cells[0].getdata()) for i in range(1, frames))
        
        kept = 0
        if all_identical:
            cells[0].save(os.path.join(out, f"{mood}-{variant}-00.png"))
            kept = 1
        else:
            for i, cell in enumerate(cells):
                cell.save(os.path.join(out, f"{mood}-{variant}-{i:02d}.png"))
            kept = frames
            
        manifest["moods"].setdefault(mood, {})[variant] = {
            "frames": kept,
            "duration_ms": DEFAULT_CYCLES.get(mood, 1800),
            "loop": mood in LOOPING_MOODS
        }
        print(f"{mood}-{variant}: {kept} frames (cycle {DEFAULT_CYCLES.get(mood, 1800)}ms)")

with open(os.path.join(out, "manifest.json"), "w") as handle:
    json.dump(manifest, handle, indent=2, sort_keys=True)
print("manifest.json written successfully")
PYEOF

echo "baked into $OUT"

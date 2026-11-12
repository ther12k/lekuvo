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

manifest = {"moods": {}}
for variant in ("full", "compact"):
    atlas = Image.open(os.path.join(out, f"atlas-{variant}.png")).convert("RGBA")
    slot = atlas.width // frames
    for row, mood in enumerate(MOODS):
        kept = 0
        for index in range(frames):
            cell = atlas.crop((index * slot, row * slot, (index + 1) * slot, (row + 1) * slot))
            # Drop trailing frames that render identically (static moods):
            # keeping them wastes memory and adds no animation.
            if kept > 0:
                prev = Image.open(os.path.join(out, f"{mood}-{variant}-{kept-1:02d}.png"))
                if list(cell.getdata()) == list(prev.getdata()):
                    continue
            cell.save(os.path.join(out, f"{mood}-{variant}-{kept:02d}.png"))
            kept += 1
        manifest["moods"].setdefault(mood, {})[variant] = kept
        print(f"{mood}-{variant}: {kept} frames")

with open(os.path.join(out, "manifest.json"), "w") as handle:
    json.dump(manifest, handle, indent=2, sort_keys=True)
print("manifest.json written")
PYEOF

echo "baked into $OUT"

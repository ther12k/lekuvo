#!/usr/bin/env bash
# Installs Lekuvo into an XDG-compatible prefix so the application
# launches from any working directory (no checkout or cwd dependence).
#
#   ./install.sh                 -> ~/.local (user install)
#   ./install.sh /usr/local      -> system install (needs sudo)
#
# Layout produced:
#   <prefix>/bin/lekuvo
#   <prefix>/share/lekuvo/app/…
#   <prefix>/share/lekuvo/assets/…
#   <prefix>/share/applications/lekuvo.desktop
#   <prefix>/share/icons/lekuvo.png
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
PREFIX="${1:-$HOME/.local}"

mkdir -p "$PREFIX/bin" \
  "$PREFIX/share/lekuvo" \
  "$PREFIX/share/applications" \
  "$PREFIX/share/icons"

# Binary (build if missing)
if [ ! -x "$ROOT/target/release/lekuvo" ]; then
  echo "building release binary..."
  (cd "$ROOT" && cargo build --release)
fi
install -m 0755 "$ROOT/target/release/lekuvo" "$PREFIX/bin/lekuvo"

# Runtime resources
cp -r "$ROOT/app" "$PREFIX/share/lekuvo/app"
cp -r "$ROOT/assets" "$PREFIX/share/lekuvo/assets"
install -m 0644 "$ROOT/lekuvo.png" "$PREFIX/share/icons/lekuvo.png"

# Desktop entry with resolved absolute paths
cat > "$PREFIX/share/applications/lekuvo.desktop" << EOF
[Desktop Entry]
Version=1.0
Type=Application
Name=Lekuvo
Comment=Dynamic Notch Bar for Linux powered by the VelquView native Tailwind renderer
Exec=$PREFIX/bin/lekuvo
Icon=$PREFIX/share/icons/lekuvo.png
Terminal=false
Categories=Utility;DesktopUtility;
StartupNotify=false
EOF

update-desktop-database "$PREFIX/share/applications" 2>/dev/null || true

echo "installed:"
echo "  $PREFIX/bin/lekuvo"
echo "  $PREFIX/share/lekuvo/{app,assets}"
echo "  $PREFIX/share/applications/lekuvo.desktop"

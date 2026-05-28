#!/usr/bin/env bash
# build-web.sh — bundle the Next.js static export from the source repo into
# this desktop repo's web/out/. Runs the source-repo build with the
# FA_PORTAL_BUILD=desktop env flag which flips next.config.ts to
# output: "export".
#
# Records the source-repo SHA in web/out/.source-sha so the desktop release
# proves which source commit was bundled (closes the 2026-05-24 dual-file
# drift failure mode — yuki/tasks/lessons.md).

set -euo pipefail

SOURCE="${SOURCE:-../fa_client_portal}"
DESKTOP_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SOURCE_ABS="$(cd "$DESKTOP_ROOT/$SOURCE" && pwd)"

echo "[build-web] Source repo: $SOURCE_ABS"
echo "[build-web] Desktop repo: $DESKTOP_ROOT"

cd "$SOURCE_ABS"
echo "[build-web] Building static export (FA_PORTAL_BUILD=desktop)…"
FA_PORTAL_BUILD=desktop npm run build

if [ ! -d out ]; then
  echo "[build-web] ERROR: source build did not produce out/ — aborting." >&2
  exit 1
fi

echo "[build-web] Copying $SOURCE_ABS/out → $DESKTOP_ROOT/web/out…"
rm -rf "$DESKTOP_ROOT/web/out"
mkdir -p "$DESKTOP_ROOT/web"
cp -r out "$DESKTOP_ROOT/web/out"

# Provenance — surface this SHA on the desktop app's About page (Phase D5)
SHA=$(git rev-parse HEAD)
echo "$SHA" > "$DESKTOP_ROOT/web/out/.source-sha"
echo "[build-web] Bundled source SHA: $SHA"
echo "[build-web] Done."

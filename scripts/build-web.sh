#!/usr/bin/env bash
# build-web.sh — bundle the Next.js static export from the source repo into
# this desktop repo's web/out/. Runs the source-repo build with the
# FA_PORTAL_BUILD=desktop env flag (added in Phase D2) which flips
# next.config to output: "export".
#
# Records the source-repo SHA in web/out/.source-sha so the desktop release
# can prove which source commit was bundled (closes the 2026-05-24 dual-file
# drift failure mode — yuki/tasks/lessons.md).
#
# Phase D1 will wire this up properly. For D0, this script just announces
# intent and exits non-zero so anyone running it early gets a clear message.

set -euo pipefail

SOURCE="${SOURCE:-../fa_client_portal}"
DESKTOP_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "[build-web] PHASE D0 — script not yet wired. Wait for Phase D1."
echo "[build-web] When live, will:"
echo "[build-web]   1. cd $SOURCE"
echo "[build-web]   2. FA_PORTAL_BUILD=desktop npm run build"
echo "[build-web]   3. rm -rf $DESKTOP_ROOT/web/out && cp -r out $DESKTOP_ROOT/web/out"
echo "[build-web]   4. git -C $SOURCE rev-parse HEAD > $DESKTOP_ROOT/web/out/.source-sha"
exit 1

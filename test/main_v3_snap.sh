#!/usr/bin/env bash
# Private, self-contained copy of the project for the Main v3 work (insulated from other modules' in-progress edits): src/ of every module as it is NOW, except 40_game.js, which
# comes from backup/v3/game_40_game.js (the pre-wave Game) unless GAME=live; plus test/ and tools/ and a build in out/v3/main/snap/dist.
# Run the suites FROM the snapshot:  (cd out/v3/main/snap && node test/main_v2.mjs)   or point the main_v3_* scripts at it with V3_HTML=out/v3/main/snap/dist/fizzpop.html
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SNAP="$ROOT/out/v3/main/snap"
mkdir -p "$SNAP/src" "$SNAP/test" "$SNAP/tools"
cp "$ROOT"/src/*.js "$ROOT"/src/template.html "$SNAP/src/"
if [[ "${GAME:-}" != "live" ]]; then cp "$ROOT/backup/v3/game_40_game.js" "$SNAP/src/40_game.js"; fi
cp -r "$ROOT"/test/stubs "$SNAP/test/"
cp "$ROOT"/test/*.mjs "$ROOT"/test/*.js "$ROOT"/test/*.html "$ROOT"/test/*.sh "$SNAP/test/" 2>/dev/null || true
cp "$ROOT"/tools/* "$SNAP/tools/"
cp "$ROOT/build.sh" "$SNAP/build.sh"
mkdir -p "$SNAP/out"
"$SNAP/build.sh" | cut -c1-120

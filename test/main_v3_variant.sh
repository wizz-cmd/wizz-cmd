#!/usr/bin/env bash
# Builds an A/B variant page: main_v3_variant.sh <name> [main=old|new] [gfx=old|new] [cast=old|new]  -> out/v3/main/ab/<name>/dist/fizzpop.html
# (old = backup/v3 = the pre-wave file; the Game is always the pre-wave one; every other module is the current src)
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NAME="$1"; shift
D="$ROOT/out/v3/main/ab/$NAME"; mkdir -p "$D/src"
cp "$ROOT"/src/*.js "$ROOT"/src/template.html "$D/src/"
cp "$ROOT/backup/v3/game_40_game.js" "$D/src/40_game.js"
for a in "$@"; do
  case "$a" in
    main=old) cp "$ROOT/backup/v3/main_50_main.js" "$D/src/50_main.js"; cp "$ROOT/backup/v3/main_template.html" "$D/src/template.html";;
    gfx=old) cp "$ROOT/backup/v3/10_gfx.js" "$D/src/10_gfx.js"; cp "$ROOT/backup/v3/09_neon.js" "$D/src/09_neon.js";;
    cast=old) cp "$ROOT/backup/v3/cast_11_gfx_cast.js" "$D/src/11_gfx_cast.js";;
  esac
done
cp "$ROOT/build.sh" "$D/build.sh"; "$D/build.sh" | cut -c1-100

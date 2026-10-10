#!/bin/bash
# Re-runs the verified first-time-lens checks and stores their console output in out/qa3/firsttime/*.txt (does not touch src/dist).
cd "$(dirname "$0")/.." || exit 1
O=out/qa3/firsttime
for n in 08_story 11_focused_nogesture 12_blur 20_postgameover_music 21_jingle_race 24_touch_howto_label 25_typing 06_gameover; do
  f=test/qa3_firsttime_$n.mjs
  node $f $( [ "$n" = 06_gameover ] && echo B ) > $O/log_$n.txt 2>&1
  echo "$n -> $(grep -c '^FAIL' $O/log_$n.txt) FAIL lines"
done
# fix verification: same race test against a patched COPY of the artifact fragment
FT_FRAG=test/out/qa3_firsttime_patched.html node test/qa3_firsttime_21_jingle_race.mjs > $O/log_21_jingle_race_PATCHED.txt 2>&1
FT_FRAG=test/out/qa3_firsttime_patched.html node test/qa3_firsttime_20_postgameover_music.mjs > $O/log_20_postgameover_music_PATCHED.txt 2>&1
echo "patched race: $(grep -c '^FAIL' $O/log_21_jingle_race_PATCHED.txt) FAIL lines"

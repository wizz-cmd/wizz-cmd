// Do any enemy spawn boxes sit on / next to the player spawn points (instant death when the READY! banner ends)?
import { boot, log } from './qa_codereview_lib.mjs';
const b = await boot({});
const r = await b.page.evaluate(() => {
  const out = [];
  fz.LEVELS.forEach((L, i) => {
    for (const e of L.enemies) {
      const sx = e.c * 8, sy = 16 + e.r * 8;
      for (const [pi, px] of [[0, 24], [1, 216]]) {
        const dx = Math.abs(sx - px), dy = Math.abs(sy - 200);
        // enemy hit box [sx+2,sy+2,12,12] vs player body [px+2,202,12,14]
        const hit = (sx + 2 < px + 14) && (px + 2 < sx + 14) && (sy + 2 < 216) && (202 < sy + 14);
        if (hit || (dx < 28 && dy < 28)) out.push({ round: i + 1, t: e.t, c: e.c, r: e.r, player: pi + 1, dx, dy, overlap: hit });
      }
    }
  });
  return out;
});
log(r.length ? JSON.stringify(r) : 'no enemy spawn within 28px of a spawn pad');
await b.t.close();

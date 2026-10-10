// Landable tiles in rows 1-4 (top of the playfield): the rising-ceiling clamp at y=24 (PLAY_TOP) truncates / cancels jumps from them.
import { boot, log } from './qa_codereview_lib.mjs';
const b = await boot({});
const r = await b.page.evaluate(() => {
  const out = [];
  fz.LEVELS.forEach((L, i) => {
    const m = L.map;
    for (let r = 1; r <= 4; r++) {
      let cols = [];
      for (let c = 2; c < 30; c++) if (m[r][c] === '#' && m[r - 1][c] !== '#') cols.push(c);
      if (cols.length) out.push({ round: i + 1, row: r, standY: r * 8, maxJumpPx: Math.min(44, r * 8 - 24), cols: cols.join(',') });
    }
  });
  return out;
});
log(r.length ? r.map((x) => JSON.stringify(x)).join('\n') : 'no landable tiles in rows 1-4');
await b.t.close();

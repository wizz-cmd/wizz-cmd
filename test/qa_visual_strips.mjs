// Animation strips: every frame of selected sprites side by side at x8, plus actual-size (x1 and x2) row
import { launch, canvasFnShot, fp } from '../tools/harness.mjs';
const t = await launch();
const g = fp(t.page);
await g.freeze(true);
const groups = {
  players: ['p1_idle','p1_walk','p1_jump','p1_fall','p1_shoot','p1_die','p1_stun','p2_idle','p2_walk','p2_jump','p2_fall','p2_shoot','p2_die','p2_stun'],
  nibbler: ['nibbler_move','nibbler_angry','nibbler_trapped','nibbler_die'],
  crabbit: ['crabbit_move','crabbit_angry','crabbit_trapped','crabbit_die','crabbit_throw'],
  jellop: ['jellop_move','jellop_angry','jellop_trapped','jellop_die'],
  springle: ['springle_move','springle_angry','springle_trapped','springle_die','springle_squash'],
  glimmer: ['glimmer_move','glimmer_angry','glimmer_trapped','glimmer_die','glimmer_fire'],
  bubbles: ['bubble_shot','bubble','bubble_warn','bubble_pop','trap_overlay','bubble_thunder','bubble_fire','bubble_water','bubble_letter'],
  misc: ['bonefin','pebble','spark','ink','bolt','fire_drop','flame','water_flow','water_fall','sparkle','poof'],
  items: ['food_0','food_1','food_2','food_3','food_4','food_5','food_6','food_7','pu_shoes','pu_pink','pu_blue','pu_gold','pu_parasol','pu_clock','pu_bomb','pu_heart'],
};
for (const [name, list] of Object.entries(groups)) {
  const scale = name==='items'?8:8;
  await canvasFnShot(t.page, `out/qa/visual/strip_${name}.png`, (list, scale) => {
    const GFX = fz.GFX;
    const rows = list.map(n => ({ n, f: GFX.frames(n), s: GFX.size(n) }));
    const pad = 4, labelW = 0;
    const maxW = 1400;
    // layout: each sprite one row, frames left to right
    let H = 0, W = 0;
    const rowH = rows.map(r => r.s.h * scale + 20);
    for (let i=0;i<rows.length;i++){ H += rowH[i]; W = Math.max(W, rows[i].f * (rows[i].s.w*scale+pad)+ 120); }
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d'); ctx.imageSmoothingEnabled=false;
    ctx.fillStyle = '#10101c'; ctx.fillRect(0,0,W,H);
    const big = document.createElement('canvas');
    let y = 0;
    rows.forEach((r,i) => {
      ctx.fillStyle = '#9ab'; ctx.font = '12px monospace'; ctx.fillText(r.n + ' ' + r.s.w + 'x' + r.s.h + ' f' + r.f, 2, y+11);
      for (let f=0; f<r.f; f++) {
        const t = document.createElement('canvas'); t.width = r.s.w; t.height = r.s.h;
        const tc = t.getContext('2d'); GFX.draw(tc, r.n, f, 0, 0);
        ctx.fillStyle = '#1c1c34'; ctx.fillRect(f*(r.s.w*scale+pad)+2, y+14, r.s.w*scale, r.s.h*scale);
        ctx.drawImage(t, f*(r.s.w*scale+pad)+2, y+14, r.s.w*scale, r.s.h*scale);
      }
      y += rowH[i];
    });
    return cv;
  }, { args: [list, scale], scale: 1 });
}
console.log('errors', t.errors);
await t.close();

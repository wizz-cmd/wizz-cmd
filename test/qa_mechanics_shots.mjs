import { boot, OUT, canvasShot } from './qa_mechanics_lib.mjs';
const { t, g, ev, page } = await boot({ level: 1, god: true, clear: true });
// water on L1: pop water bubble at x=100,y=100 with a nibbler on path
await ev((H) => {
  const S = H.S(); const p = H.P(); p.inv = 1e9; p.noPopT = 0;
  H.D.spawn('nibbler', 70, 40); S.enemies[0].state = 'frozen'; S.enemies[0].freezeT = 1e6;
  H.D.spawn('water', 150, 40); S.bubbles[0].att = null; p.x = 144; p.y = 34; p.vy = 0; H.step(1); p.x = 24; p.y = 200;
  H.step(40);
});
await canvasShot(page, OUT + '/water_a.png');
await ev((H) => { H.step(30); });
await canvasShot(page, OUT + '/water_b.png');
// fire
await ev((H) => {
  const S = H.S(); const p = H.P(); S.streams.length = 0; S.enemies.length = 0; p.noPopT = 0;
  H.D.spawn('fire', 120, 30); S.bubbles[S.bubbles.length - 1].att = null; p.x = 114; p.y = 24; p.vy = 0; H.step(1); p.x = 24; p.y = 200;
  H.step(40);
});
await canvasShot(page, OUT + '/fire_a.png');
// thunder
await ev((H) => {
  const S = H.S(); const p = H.P(); S.flames.length = 0; p.noPopT = 0; p.face = 1;
  H.D.spawn('nibbler', 190, 90); S.enemies[0].state = 'frozen'; S.enemies[0].freezeT = 1e6;
  H.D.spawn('thunder', 60, 88); S.bubbles[S.bubbles.length - 1].att = null; p.x = 54; p.y = 82; p.vy = 0; p.face = 1; H.step(1); p.x = 24; p.y = 200;
  H.step(12);
});
await canvasShot(page, OUT + '/thunder_a.png');
await t.close();

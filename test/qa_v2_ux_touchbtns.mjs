// QA v2 (ux lens): touch buttons on non-play scenes: SOUND (mute state visible?), PAUSE on title / story / howto / scores; also a multi-finger hold in play (move+jump+fire).
import path from 'path';
import { open, OUT, wait, touchKit } from './qa_v2_ux_lib.mjs';
const t = await open({ w: 390, h: 844, dpr: 3, touch: true, name: 'tb', scheme: 'dark' });
const k = await touchKit(t);
await wait(1000);
const ov = await t.ev(() => { const r = document.getElementById('focus').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height * 0.92]; });
const f0 = await (await t.frame.frameElement()).boundingBox();
await k.tap(f0.x + ov[0], f0.y + ov[1]); await wait(1200);
const S = (l) => t.page.screenshot({ path: path.join(OUT, `tb_${l}.png`) });
const info = () => t.ev(() => ({ scene: fz.scene(), paused: fz._main.paused(), muted: fz.AUDIO.isMuted(), ctx: fz.AUDIO._state().ctxState, holds: fz._main.holds(), muteAttr: document.querySelector('#touch [data-k="sound"]').dataset.muted }));
console.log('start', JSON.stringify(await info()));
let b = await k.btn('sound'); await k.tap(b.x, b.y); await wait(500);
console.log('after SOUND tap', JSON.stringify(await info())); await S('muted_title');
await k.tap(b.x, b.y); await wait(500);
console.log('after SOUND tap 2', JSON.stringify(await info()));
b = await k.btn('pause'); await k.tap(b.x, b.y); await wait(500);
console.log('PAUSE on title', JSON.stringify(await info())); await S('pause_on_title');
// story
await t.ev(() => fz.goto('story', { next: { players: 1, level: 1, seed: 3 } })); await wait(800);
await k.tap(b.x, b.y); await wait(600);
console.log('PAUSE on story', JSON.stringify(await info()));
await wait(1500);
// howto
await t.ev(() => fz.goto('howto', { page: 0 })); await wait(800);
await k.tap(b.x, b.y); await wait(600);
console.log('PAUSE on howto', JSON.stringify(await info()));
await t.ev(() => fz.goto('title')); await wait(500);
// play: multi finger
await t.ev(() => fz.start(1, 1, 5)); await wait(3500);
const bl = await k.btn('right'), bf = await k.btn('fire'), bj = await k.btn('jump');
const d1 = await k.down(bl.x, bl.y), d2 = await k.down(bj.x, bj.y), d3 = await k.down(bf.x, bf.y);
await wait(500);
const st1 = await t.ev(() => { const s = fz.Game.debug.state(); return { x: s.players[0].x, y: s.players[0].y, holds: fz._main.holds() }; });
await S('multi_touch');
await k.up(d2); await k.up(d1); await k.up(d3);
console.log('multi', JSON.stringify(st1));
console.log('errors', JSON.stringify(t.errors));
await t.close();

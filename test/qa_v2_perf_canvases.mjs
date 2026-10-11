// How many live <canvas> objects does the game keep (GPU: each is a texture / shared image; small ones are CPU-backed and re-uploaded)? by size class, after a play session.
import { open, K_VIEWS, BUSY, DRIVE, sleep } from './qa_v2_perf_lib.mjs';
const k = +(process.argv[2] || 4);
const [vw, vh, dpr] = K_VIEWS[k];
const t = await open({ vw, vh, dpr });
await t.page.evaluate(({ setup, drive }) => { fz = window.__fizzpop; fz._main.setQuality(2, true); (0, eval)(setup); const drv = (0, eval)('(' + drive + ')'); let n = 0; setInterval(() => { n++; drv(n); }, 16); }, { setup: BUSY, drive: DRIVE(true) });
await sleep(15000);
const { result: proto } = await t.cdp.send('Runtime.evaluate', { expression: 'HTMLCanvasElement.prototype' });
const { objects } = await t.cdp.send('Runtime.queryObjects', { prototypeObjectId: proto.objectId });
const { result } = await t.cdp.send('Runtime.callFunctionOn', { objectId: objects.objectId, functionDeclaration: `function () { const a = Array.from(this); const cls = { '<=1px (released)': 0, '<4k px': 0, '4k-16k': 0, '16k-64k': 0, '64k-256k': 0, '256k-1M': 0, '>1M': 0 }; let px = 0, big = []; for (const c of a) { const p = c.width * c.height; px += p; const key = p <= 1 ? '<=1px (released)' : p < 4096 ? '<4k px' : p < 16384 ? '4k-16k' : p < 65536 ? '16k-64k' : p < 262144 ? '64k-256k' : p < 1048576 ? '256k-1M' : '>1M'; cls[key]++; } return JSON.stringify({ total: a.length, cls, MB: Math.round(px * 4 / 1048576) }); }`, returnByValue: true });
console.log(`k=${await t.page.evaluate(() => fz._main.k())}`, result.value);
await t.close();

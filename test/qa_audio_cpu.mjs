// QA (audio lens) -- main-thread CPU cost of the audio scheduler (CDP sampling profiler) while boss music runs at hurry tempo
// with an SFX storm.  Game loop frozen so only audio work is measured.
import { launch, fp } from '../tools/harness.mjs';
const t = await launch({}); const g = fp(t.page);
await t.page.keyboard.press('ArrowDown'); await t.page.waitForTimeout(300);
await g.evaluate(() => { fz.freeze(true); fz.AUDIO.stopMusic(); fz.AUDIO.setTempo(1.3); fz.AUDIO.music('boss', { restart: true }); });
await t.page.waitForTimeout(500);
const cdp = await t.context.newCDPSession(t.page);
await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 100 });
await cdp.send('Profiler.start');
const T = 6000;
await g.evaluate(async (T) => { const A = fz.AUDIO, seq = ['pop', 'kill', 'trap', 'shoot', 'jump', 'food', 'boss_hit', 'thunder', 'enemy_shot', 'bounce', 'letter', 'fire']; const t0 = performance.now(); let i = 0; while (performance.now() - t0 < T) { for (let k = 0; k < 3; k++) A.sfx(seq[(i++) % seq.length]); await new Promise((r) => setTimeout(r, 50)); } }, T);
const { profile } = await cdp.send('Profiler.stop');
const byId = new Map(profile.nodes.map((n) => [n.id, n]));
const self = {}; let total = 0, idle = 0;
const dt = profile.timeDeltas; profile.samples.forEach((id, i) => { const n = byId.get(id), d = dt[i] / 1000; const fn = n.callFrame.functionName || '(anon)'; total += d; if (fn === '(idle)') idle += d; else self[fn] = (self[fn] || 0) + d; });
const busy = total - idle;
console.log(`profile window ${(total / 1000).toFixed(1)} s, busy ${(busy / 1000).toFixed(2)} s => ${(100 * busy / total).toFixed(1)} % of one core (incl. the sfx-storm driver loop)`);
Object.entries(self).sort((a, b) => b[1] - a[1]).slice(0, 14).forEach(([k, v]) => console.log(`  ${k.padEnd(22)} ${v.toFixed(0).padStart(6)} ms  (${(100 * v / total).toFixed(1)}%)`));
await t.close();

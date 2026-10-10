// QA platform: CPU profile (self time by function) of the busiest scenes at 1x (to find optimisation targets for low-end phones).
import { launchBrowser, open, ev, log } from './qa_platform_lib.mjs';
const b = await launchBrowser({ autoplay: true });
const scen = {
  chain_cluster: () => { fz.start(2, 20, 8); const G = fz.Game.debug; G.skipIntro(); G.god(true); const r = fz.U.rng(4); for (let i = 0; i < 38; i++) G.spawn(['thunder', 'fire', 'water'][i % 3], 120 + r.int(-14, 14), 100 + r.int(-14, 14)); for (const e of ['nibbler', 'crabbit', 'jellop', 'glimmer', 'springle']) G.spawn(e, 60 + Math.random() * 100, 100); G.setPlayer(0, { x: 112, y: 96 }); },
  bubbles40: () => { fz.start(2, 20, 8); const G = fz.Game.debug; G.skipIntro(); G.god(true); const r = fz.U.rng(3); for (let i = 0; i < 40; i++) G.spawn(['thunder', 'fire', 'water'][i % 3], r.int(30, 220), r.int(30, 190)); },
  title: () => { fz.goto('title'); },
};
for (const [name, setup] of Object.entries(scen)) {
  const t = await open({ browser: b });
  const cdp = t.cdp; await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 100 });
  await ev(t.page, setup); await t.page.waitForTimeout(300);
  await ev(t.page, () => { fz.input.set(0, { fire: true, left: true }); fz.input.set(1, { fire: true, right: true }); });
  await cdp.send('Profiler.start'); await t.page.waitForTimeout(4000);
  const { profile } = await cdp.send('Profiler.stop');
  const byId = new Map(profile.nodes.map((n) => [n.id, n])); const self = new Map(); const dt = profile.timeDeltas;
  profile.samples.forEach((id, i) => self.set(id, (self.get(id) || 0) + (dt[i] || 0)));
  const agg = new Map(); for (const [id, us] of self) { const n = byId.get(id); const k = `${n.callFrame.functionName || '(anon)'}:${n.callFrame.lineNumber}`; agg.set(k, (agg.get(k) || 0) + us); }
  const tot = [...agg.values()].reduce((a, b) => a + b, 0); const idle = (agg.get('(idle):-1') || 0);
  log(`${name}: busy ${((tot - idle) / 4000000 * 100).toFixed(1)}% of wall; top self (ms over 4 s):`, JSON.stringify([...agg.entries()].filter(([k]) => !k.startsWith('(idle')).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => [k, +(v / 1000).toFixed(0)])));
  await t.close();
}
await b.close();

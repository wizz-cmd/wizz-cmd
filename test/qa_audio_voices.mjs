// QA (audio lens) -- real-time voice budget + stress: node budget per track (AUDIO._stats().voices), SFX drop behaviour under a storm,
// 30-bubble chain pop (voice limiting), and a live-output peak/clip probe through AUDIO._tap() during the storm.
//   node test/qa_audio_voices.mjs
import { launch, fp } from '../tools/harness.mjs';
const t = await launch({}); const g = fp(t.page);
await t.page.keyboard.press('ArrowDown'); await t.page.waitForTimeout(300);
const log = (...a) => console.log(...a);

log('#### music-only voice usage (MAX_VOICES budget is 90; SFX are dropped above it)');
for (const [name, tempo] of [['stage1', 1], ['stage2', 1], ['boss', 1], ['boss', 1.3], ['title', 1], ['ending', 1]]) {
  const r = await g.evaluate(async (name, tempo) => {
    const A = fz.AUDIO; A.stopMusic(); A.setTempo(tempo); A.music(name, { restart: true });
    let max = 0, sum = 0, n = 0, maxGroups = 0;
    const t0 = performance.now();
    while (performance.now() - t0 < 7000) { await new Promise((r) => setTimeout(r, 40)); const s = A._stats(); max = Math.max(max, s.voices); sum += s.voices; n++; }
    A.setTempo(1);
    return { max, avg: +(sum / n).toFixed(1) };
  }, name, tempo);
  log(`${name.padEnd(8)} tempo ${tempo}: voices max ${r.max}  avg ${r.avg}   => SFX headroom ${90 - r.max}`);
}

log('\n#### SFX storm on boss music @1.3 tempo: fire a game-like burst mix for 6 s, count dropped calls (no nodes created) per sfx');
const storm = await g.evaluate(async () => {
  const A = fz.AUDIO; A.stopMusic(); A.setTempo(1.3); A.music('boss', { restart: true });
  await new Promise((r) => setTimeout(r, 500));
  const tap = A._tap(); const buf = new Float32Array(tap.fftSize);
  const calls = {}, dropped = {}, maxVoices = { v: 0, g: 0 };
  let peak = 0, over = 0, samples = 0;
  const fire = (n) => { const gb = A._stats().groups, vb = A._stats().voices; A.sfx(n); const ga = A._stats().groups; calls[n] = (calls[n] || 0) + 1; if (ga === gb && vb === A._stats().voices) dropped[n] = (dropped[n] || 0) + 1; };
  const t0 = performance.now(); let i = 0;
  const seq = ['pop', 'pop', 'pop', 'kill', 'trap', 'shoot', 'jump', 'food', 'pop', 'boss_hit', 'thunder', 'enemy_shot', 'land', 'bounce', 'letter', 'powerup', 'death', 'bomb', 'oneup', 'fire', 'water'];
  while (performance.now() - t0 < 6000) {
    for (let k = 0; k < 3; k++) fire(seq[(i++) % seq.length]);        // 3 sfx per 50 ms = 60/s (a very busy chain-reaction scene)
    await new Promise((r) => setTimeout(r, 50));
    tap.getFloatTimeDomainData(buf); for (const x of buf) { const a = Math.abs(x); if (a > peak) peak = a; if (a > 0.9) over++; } samples += buf.length;
    const s = A._stats(); maxVoices.v = Math.max(maxVoices.v, s.voices); maxVoices.g = Math.max(maxVoices.g, s.groups);
  }
  A.setTempo(1); A.stopMusic();
  return { calls, dropped, peak, over, maxVoices };
});
log('peak', storm.peak.toFixed(3), 'samples>0.9:', storm.over, ' max voices', storm.maxVoices.v, 'max groups', storm.maxVoices.g);
for (const k of Object.keys(storm.calls)) log(`  ${k.padEnd(11)} calls ${String(storm.calls[k]).padStart(3)}  dropped(no nodes) ${String(storm.dropped[k] || 0).padStart(3)}`);

log('\n#### 30-bubble chain pop: pop sfx at the game cadence (4-frame delay per generation => 67 ms), 30 times + the kills');
const chain = await g.evaluate(async () => {
  const A = fz.AUDIO; A.music('stage1', { restart: true }); await new Promise((r) => setTimeout(r, 300));
  const tap = A._tap(); const buf = new Float32Array(tap.fftSize);
  let peak = 0, maxG = 0, maxPopGroups = 0; const stamp = [];
  for (let i = 0; i < 30; i++) {
    A.sfx('pop'); if (i % 6 === 2) A.sfx('kill'); if (i % 10 === 5) A.sfx('food');
    await new Promise((r) => setTimeout(r, 67));
    tap.getFloatTimeDomainData(buf); for (const x of buf) peak = Math.max(peak, Math.abs(x));
    maxG = Math.max(maxG, A._stats().groups);
  }
  // same-frame burst: 30 pops in a single task (all bubbles of a cluster popping in one frame)
  const gb = A._stats().groups; for (let i = 0; i < 30; i++) A.sfx('pop'); const gAfter = A._stats().groups;
  await new Promise((r) => setTimeout(r, 400));
  const settled = A._stats();
  A.stopMusic();
  return { peak, maxG, burstGroups: gAfter - gb, settled: { voices: settled.voices, groups: settled.groups } };
});
log(JSON.stringify(chain));
log('errors:', t.errors.length ? t.errors : 'none');
await t.close();

// QA (audio lens) -- scene/flow fuzz in real time: random hops between scenes, game starts, level jumps, pauses, mutes, hurry, extend,
// kills.  Samples AUDIO._stats() every 25 ms and asserts the "exactly one music track" invariants + no leaks + no errors.
//   node test/qa_audio_fuzz.mjs [seconds=45] [seed=1]
import { launch, fp } from '../tools/harness.mjs';
const SECS = +(process.argv[2] || 45), SEED = +(process.argv[3] || 1);
const t = await launch({}); const g = fp(t.page);
await t.page.keyboard.press('ArrowDown'); await t.page.waitForTimeout(300);
const res = await g.evaluate(async (SECS, SEED) => {
  const A = fz.AUDIO, D = fz.Game.debug;
  let s = SEED >>> 0; const rnd = () => { s = (s + 0x6D2B79F5) >>> 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const viol = []; let maxTracks = 0, maxActive = 0, samples = 0; const hist = {};
  const sample = () => {
    const st = A._stats(), sd = A._state(); samples++;
    maxTracks = Math.max(maxTracks, st.tracks); maxActive = Math.max(maxActive, st.active);
    if (st.active > 2) viol.push(['active>2', st.active, fz.scene()]);
    if (st.tracks > 4) viol.push(['tracks>4', st.tracks, fz.scene()]);
    if (sd.music && sd.jingle) viol.push(['music+jingle', sd.music, sd.jingle]);
    hist[fz.scene() + ':' + (sd.music || sd.jingle || 'none')] = (hist[fz.scene() + ':' + (sd.music || sd.jingle || 'none')] || 0) + 1;
  };
  const iv = setInterval(sample, 25);
  const actions = [
    () => fz.goto('title'), () => fz.goto('story', { next: { players: 1, level: 1, seed: 3 } }), () => fz.goto('howto'), () => fz.goto('scores'),
    () => fz.goto('entry', { entries: [{ pi: 0, score: 4000, round: 3 }] }),
    () => { fz.start(rnd() < 0.3 ? 2 : 1, pick([1, 5, 16, 29, 30]), (rnd() * 1000) | 0); D.god(true); if (rnd() < 0.6) D.skipIntro(); },
    () => { try { D.setLevel(pick([1, 2, 15, 16, 17, 29, 30])); if (rnd() < 0.5) D.skipIntro(); } catch (e) {} },
    () => { try { D.killAll(); } catch (e) {} },
    () => { try { D.setHurryTimer(3500); } catch (e) {} },
    () => A.toggleMuted(), () => fz._main.setPaused(!fz._main.paused()),
    () => { try { const S = D._S(); const p = S.players[0]; p.letters = [true, true, true, true, true, false]; D.spawn('letter', p.x, p.y); } catch (e) {} },
    () => { try { D.setPlayer(0, { lives: 0 }); D.god(false); const p = D.state().players[0]; D.spawn('nibbler', p.x, p.y); } catch (e) {} },
    () => window.dispatchEvent(new Event('blur')), () => window.dispatchEvent(new Event('focus')),
    () => A.sfx(pick(A.sfxNames())),
  ];
  const t0 = performance.now(); let n = 0; const errs = [];
  while (performance.now() - t0 < SECS * 1000) {
    try { pick(actions)(); n++; } catch (e) { errs.push(String(e).slice(0, 120)); }
    await new Promise((r) => setTimeout(r, 60 + rnd() * 900));
  }
  // settle: unpause, unmute, back to title
  if (fz._main.paused()) fz._main.setPaused(false);
  if (A.isMuted()) A.setMuted(false);
  window.dispatchEvent(new Event('focus'));
  fz.goto('title'); await new Promise((r) => setTimeout(r, 1500));
  clearInterval(iv);
  const fin = A._stats(), sd = A._state();
  return { actions: n, samples, maxTracks, maxActive, violations: viol.slice(0, 8), nViol: viol.length, errs: errs.slice(0, 5), final: { tracks: fin.tracks, active: fin.active, voices: fin.voices, groups: fin.groups, current: fin.current, ctx: fin.ctxState, paused: sd.paused, muted: sd.muted, tempo: sd.tempo, resyncs: fin.resyncs } };
}, SECS, SEED);
console.log(JSON.stringify(res, null, 1));
console.log('page errors:', t.errors.length ? t.errors : 'none');
await t.close();

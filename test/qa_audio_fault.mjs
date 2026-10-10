// QA (audio lens) -- fault injection: what happens to the GAME when a WebAudio feature is missing/throws (older Safari, exotic WebViews)?
//   mode detune : OscillatorNode.detune is undefined          -> exceptions inside music scheduler and some sfx
//   mode panner : createStereoPanner missing                  -> buildChain fails inside init()
//   mode sfxfn  : createBiquadFilter throws (noise sfx)       -> exceptions inside sfx()
import { launch, fp } from '../tools/harness.mjs';
for (const mode of ['detune', 'panner', 'filter']) {
  const init = {
    detune: `Object.defineProperty(OscillatorNode.prototype, 'detune', { get() { return undefined; } });`,
    panner: `delete AudioContext.prototype.createStereoPanner; AudioContext.prototype.createStereoPanner = undefined;`,
    filter: `const o = BaseAudioContext.prototype.createBiquadFilter; BaseAudioContext.prototype.createBiquadFilter = function () { throw new Error('injected: createBiquadFilter'); };`,
  }[mode];
  const t = await launch({ initScript: init }); const g = fp(t.page);
  await t.page.keyboard.press('ArrowDown'); await t.page.waitForTimeout(400);
  await g.evaluate(() => { fz.start(1, 3, 3); fz.Game.debug.god(true); fz.Game.debug.skipIntro(); });
  await t.page.waitForTimeout(5500);
  // exercise sfx through gameplay: spawn enemies, shoot, jump
  await g.evaluate(() => { fz.input.set(0, { fire: true, jump: true }); });
  await t.page.waitForTimeout(1500);
  await g.evaluate(() => { fz.input.clear(); });
  const st = await g.evaluate(() => ({ scene: fz.scene(), frame: fz.Game.debug.state().frame, music: fz.AUDIO._state().music, ctx: fz.AUDIO._state().ctxState }));
  const f0 = st.frame; await t.page.waitForTimeout(1000);
  const f1 = await g.evaluate(() => fz.Game.debug.state().frame);
  const uniq = [...new Set(t.errors.map((e) => e.replace(/\d+/g, '#').slice(0, 110)))];
  console.log(`\n[${mode}] scene=${st.scene} music=${st.music} ctx=${st.ctx}  game advancing: ${f1 > f0} (frame ${f0} -> ${f1})  console/page errors: ${t.errors.length}  distinct: ${JSON.stringify(uniq.slice(0, 4))}`);
  await t.close();
}

import { boot } from './qa_mechanics_lib.mjs';
const run = async (mode) => {
  const { t, g, ev } = await boot({ level: 8, seed: 77, god: true });
  const r = await ev((H, mode) => {
    const S = H.S();
    if (mode === 'batch') { fz.step(900); }
    else { for (let i = 0; i < 900; i++) fz.step(1); }
    return JSON.stringify(H.D.state());
  }, mode);
  await t.close();
  return r;
};
const a = await run('batch'), b = await run('single'), c = await run('single');
console.log('batch==single:', a === b, ' single==single:', b === c, ' len', a.length);

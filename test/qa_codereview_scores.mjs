// Hi-score / storage edge cases through Main: private-mode storage, corrupt storage, 2 qualifying players in the wrong order,
// ties, score exactly at the cut, full table.
import { launch, fp, log } from './qa_codereview_lib.mjs';

async function run(label, { init, entries, keys = 'AAA', setup }) {
  const t = await launch({ initScript: init });
  const g = fp(t.page);
  await g.freeze(true);
  if (setup) await g.evaluate(setup);
  await g.evaluate((e) => { fz._main.resetScores && 0; }, null);
  await g.goto('title');
  const before = await g.evaluate(() => fz._main.scores());
  await g.goto('entry', { entries });
  const trace = [];
  // drive: wait guard, then confirm 3 letters per qualifying entry
  for (let round = 0; round < entries.length; round++) {
    const e = await g.evaluate(() => fz._main.entry());
    trace.push({ cur: e.cur && { pi: e.cur.pi, score: e.cur.score }, queued: e.queued });
    if (!e.cur) break;
    await g.step(25);
    for (let k = 0; k < 3; k++) { await g.set(0, { fire: true }); await g.step(1); await g.set(0, { fire: false }); await g.step(1); }
    await g.step(60);   // OK! moment
  }
  const after = await g.evaluate(() => fz._main.scores());
  const sc = await g.scene();
  log(`== ${label}: scene=${sc} before top=${before.map((s) => s.score).join(',')}`);
  log('   after  ', after.map((s) => s.name + ':' + s.score + ':R' + s.round).join('  '));
  log('   trace', JSON.stringify(trace), 'errors', JSON.stringify(t.errors));
  const stored = await t.page.evaluate(() => { try { return localStorage.getItem('fizzpop.v1.scores'); } catch (e) { return 'THROWS'; } });
  log('   stored', stored && stored.slice(0, 80));
  await t.close();
  return after;
}
const E = (pi, score, round = 5) => ({ pi, score, round });
await run('normal: P1 low, P2 high (P1 enters first)', { entries: [E(0, 5000), E(1, 40000)] });
await run('both below table', { entries: [E(0, 500), E(1, 900)] });
await run('tie with 8th place (2000) must not qualify; 2001 must', { entries: [E(0, 2000), E(1, 2001)] });
await run('tie with top (32000) ranks below', { entries: [E(0, 32000)] });
await run('storage throws (private mode)', { init: `Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('denied', 'SecurityError'); } });`, entries: [E(0, 50000)] });
await run('corrupt stored table (garbage objects)', { init: `try { localStorage.setItem('fizzpop.v1.scores', JSON.stringify([{name: 5, score: 'x'}, null, {name:'abcdef', score: 1e9, round: 99}, {score: -5}])); } catch (e) {}`, entries: [E(0, 50000)] });
await run('corrupt stored table (not JSON)', { init: `try { localStorage.setItem('fizzpop.v1.scores', '{{{{'); } catch (e) {}`, entries: [E(0, 50000)] });
await run('stored table with 3 entries', { init: `try { localStorage.setItem('fizzpop.v1.scores', JSON.stringify([{name:'AAA',score:100,round:1},{name:'BBB',score:50,round:1},{name:'CCC',score:10,round:1}])); } catch (e) {}`, entries: [E(0, 5)] });

// Builds out/qa/codereview/fizzpop_patched.html = dist/fizzpop.html + the minimal fixes proposed in the QA report (src/ untouched, build.sh
// not run). Usage: node test/qa_codereview_fixes.mjs  -> then FIZZ_HTML=<that file> node test/qa_codereview_<repro>.mjs to see the repro go green.
import fs from 'fs';
import path from 'path';
import { PROJECT } from './qa_codereview_lib.mjs';
const src = fs.readFileSync(path.join(PROJECT, 'dist', 'fizzpop.html'), 'utf8');
const OUTF = path.join(PROJECT, 'out', 'qa', 'codereview', 'fizzpop_patched.html');
const patches = [
  // F1 40_game.js physStep: the rising-ceiling clamp must never push an entity DOWN (jump from a row-2 platform fell through it)
  ['else if (e.y < PLAY_TOP) { e.y = PLAY_TOP; e.vy = 0; }', 'else if (e.y < PLAY_TOP) { e.y = Math.min(y0, PLAY_TOP); e.vy = 0; }'],
  // F2 40_game.js startRound: a player who finished dying with 0 lives while the round was being cleared must become 'out', not normal
  ["if (p.state === 'out') continue;", "if (p.state === 'out' || (p.state === 'dying' && p.lives <= 0)) { p.state = 'out'; continue; }"],
  // F3 40_game.js playLogic: no HURRY UP re-trigger once the boss is defeated
  ['if (!S.hurry && S.hurryT >= hurryAt) startHurry();', "if (!S.hurry && S.hurryT >= hurryAt && !(L.boss && S.bossPhase !== 'fight')) startHurry();"],
  // F4 40_game.js leadingPlayer: start from the first player that is not out
  ['let best = 0;\n    S.players.forEach((p, i) => { if (p.state !== \'out\' && p.score > S.players[best].score) best = i; });\n    return best;',
   'let best = -1;\n    S.players.forEach((p, i) => { if (p.state !== \'out\' && (best < 0 || p.score > S.players[best].score)) best = i; });\n    return best < 0 ? 0 : best;'],
];
let out = src;
for (const [a, b] of patches) {
  const n = out.split(a).length - 1;
  if (n !== 1) { console.error('patch does not match exactly once (' + n + '): ' + a.slice(0, 60)); process.exit(1); }
  out = out.replace(a, () => b);
}
fs.writeFileSync(OUTF, out);
console.log('wrote', OUTF, out.length);

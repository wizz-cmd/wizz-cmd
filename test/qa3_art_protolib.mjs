// QA3 art: prototype harness. Builds a PATCHED COPY of src/10_gfx.js (exposes GFX._dbg internals; src/ is never touched),
// loads it in a blank page and lets a proposal script register extra sprites and render them next to the originals.
import fs from 'fs';
import path from 'path';
import { launch, PROJECT } from '../tools/harness.mjs';
export const PROTO = path.join(PROJECT, 'out/qa3/art/proto');
export async function protoPage() {
  fs.mkdirSync(PROTO, { recursive: true });
  let src = fs.readFileSync(path.join(PROJECT, 'src/10_gfx.js'), 'utf8');
  const names = ['sprite', 'spriteFinished', 'spriteFinishedAndRegister', 'outlineGrid', 'put', 'G', 'stamp', 'addSteam', 'blank', 'shiftGrid', 'polyline', 'sym', 'rot90',
    'SPRING_PAL', 'SPRING_ANGRY', 'CRAB_PAL', 'CRAB_ANGRY', 'GLIM_PAL', 'GLIM_ANGRY', 'NIB_PAL', 'NIB_ANGRY', 'JELLY_PAL', 'JELLY_ANGRY', 'PAL_P1', 'PAL_P2', 'OL', 'ANGRY_BODY', 'ANGRY_EYES', 'STEAM_PAL',
    'playerFrame', 'P_HEAD', 'FROND_NEAR', 'FROND_FAR', 'EYE_OPEN', 'EYE_BLINK', 'M_SMILE', 'BODY_PARTS', 'TAIL', 'SKIP_FRILL', 'springFrame', 'SPRING_HEAD', 'SPRING_FIN', 'SPRING_PARTS', 'BOLT', 'boltFrame', 'prep', 'renderStrip', 'addStrip', 'tonedPalette', 'THEME_DEFS', 'bgOf', 'rgbOf', 'themeOf', 'variantOf'];
  const hook = 'return { _dbg: { ' + names.map((n) => `get ${n}() { return typeof ${n} === 'undefined' ? undefined : ${n}; }`).join(', ') + ' }, init, draw,';
  if (!src.includes('return { init, draw,')) throw new Error('gfx return statement not found');
  src = src.replace('return { init, draw,', hook);
  fs.writeFileSync(path.join(PROTO, 'gfx_patched.js'), src);
  fs.writeFileSync(path.join(PROTO, 'proto.html'), `<!doctype html><meta charset="utf-8"><body style="margin:0;background:#14102a"><canvas id="screen" width="256" height="224"></canvas>
<script src="${path.join(PROJECT, 'src/00_shared.js')}"></script><script src="gfx_patched.js"></script><script>GFX.init();</script>`);
  const t = await launch({ html: path.join(PROTO, 'proto.html') });
  return t;
}

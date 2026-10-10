// Builds test/out/main_stubs.html: like build.sh, but with the STUB modules (test/stubs/*) instead of
// src/10..40, so Main (src/50_main.js + src/template.html) can be tested in isolation.
// Usage:  node test/main_build.mjs            (also importable: import { buildMainPage } from './main_build.mjs')
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MAIN_STUB_PAGE = path.join(ROOT, 'test', 'out', 'main_stubs.html');
export const MAIN_PAGE = MAIN_STUB_PAGE;
export const MAIN_REAL_PAGE = path.join(ROOT, 'test', 'out', 'main_real.html');

/** Build the page. real=false: stubs for src/10..40 (default, what the tests use);
 *  real=true: the actual src/10..40 modules (read-only visual check; writes test/out/main_real.html, never dist/). */
export function buildMainPage(real = false) {
  const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
  const files = real
    ? ['src/00_shared.js', 'src/10_gfx.js', 'src/20_audio.js', 'src/30_levels.js', 'src/40_game.js', 'src/50_main.js']
    : ['src/00_shared.js', 'test/stubs/gfx_stub.js', 'test/stubs/audio_stub.js', 'test/stubs/levels_stub.js',
      'test/stubs/game_stub.js', 'src/50_main.js'];
  const MAIN_PAGE = real ? MAIN_REAL_PAGE : MAIN_STUB_PAGE;
  let js = '(() => { "use strict";\n';
  for (const f of files) js += `\n/* ===== ${path.basename(f)} ===== */\n${read(f)}\n`;
  js += '})();';
  if (/<\/script/i.test(js)) throw new Error("bundle contains a literal '</script'");
  const tpl = read('src/template.html');
  const marker = '<!--@@SCRIPTS@@-->';
  const i = tpl.indexOf(marker);
  if (i < 0) throw new Error('template has no marker');
  const html = tpl.slice(0, i) + '<script>\n' + js + '</script>' + tpl.slice(i + marker.length);
  fs.mkdirSync(path.dirname(MAIN_PAGE), { recursive: true });
  fs.writeFileSync(MAIN_PAGE, html);
  fs.writeFileSync(MAIN_PAGE.replace(/\.html$/, '.bundle.js'), js);
  return MAIN_PAGE;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const out = buildMainPage(process.argv.includes('--real'));
  console.log('built ' + out + ' (' + fs.statSync(out).size + ' bytes)');
}

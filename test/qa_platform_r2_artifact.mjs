// Artifact page contract: (a) static checks of dist, (b) publish-skeleton wrapping (nested doc) + safe-area insets, (c) theme matrix
// (OS scheme x data-theme), (d) size/CSP-ish checks.
import fs from 'fs';
import { launchBrowser, open, ev, DIST, OUT, save, sleep } from './qa_platform_r2_lib.mjs';
const html = fs.readFileSync(DIST, 'utf8');
const out = {};
// (a) static
out.static = {
  bytes: Buffer.byteLength(html), title: (html.match(/<title>(.*?)<\/title>/) || [])[1],
  viewport: (html.match(/<meta name="viewport"[^>]*>/) || [])[0],
  externalRefs: [...html.matchAll(/(?:src|href)=["'](https?:)?\/\/[^"']+/g)].map((m) => m[0]),
  cssUrlRefs: [...html.matchAll(/url\(([^)]+)\)/g)].map((m) => m[1]).slice(0, 5),
  hasViewportFitCover: /viewport-fit=cover/.test(html),
  darkBlocks: { media: /@media \(prefers-color-scheme: dark\)\s*\{\s*:root:not\(\[data-theme="light"\]\)/.test(html), forced: /:root\[data-theme="dark"\]/.test(html) },
  colorSchemeDeclarations: [...html.matchAll(/color-scheme:[^;]+;/g)].map((m) => m[0]),
  bodyBg: /body \{[^}]*background: var\(--page-bg\)/.test(html),
  userScalableLock: /user-scalable|maximum-scale/.test(html),
  touchActionOnRoot: /(html|body)[^{]*\{[^}]*touch-action/.test(html),
  overscrollBehavior: /overscroll-behavior/.test(html),
  wakeLock: /wakeLock/.test(html), fullscreenApi: /requestFullscreen/.test(html), gesturestart: /gesturestart/.test(html),
  hotSnapshot: /claude\??\.hot|window\.claude/.test(html),
};
// (b) skeleton wrap
const skeleton = (body) => `<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover"><style>:root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0;font:14px system-ui,sans-serif}img{max-width:100%}[hidden]{display:none!important}</style></head><body>${body}</body></html>`;
const wrapped = skeleton(html);
fs.writeFileSync(OUT + '/wrapped.html', wrapped);
const browser = await launchBrowser({ autoplay: true });
out.skeleton = {};
for (const [name, w, h, ins, touch] of [['port390x844_ins', 390, 844, { top: 47, bottom: 34, left: 0, right: 0 }, true], ['port390x844_noins', 390, 844, { top: 0, bottom: 0, left: 0, right: 0 }, true], ['land844x390_ins', 844, 390, { top: 0, bottom: 21, left: 47, right: 47 }, true], ['desk1280', 1280, 800, null, false]]) {
  for (const file of [DIST, OUT + '/wrapped.html']) {
    const t = await open({ browser, html: file, viewport: { width: w, height: h }, dpr: 3, touch });
    if (ins) await t.cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: ins }).catch((e) => { out.insetErr = String(e).slice(0, 100); });
    await ev(t.page, () => { fz.freeze(true); fz.start(1, 5, 3); fz.step(150); fz._main.fit(); });
    await sleep(250);
    const r = await t.page.evaluate(() => { const R = (e) => { const b = e.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.top), Math.round(b.right), Math.round(b.bottom)]; }; const de = document.documentElement; const o = { vp: [innerWidth, innerHeight], canvas: R(document.getElementById('screen')), touchBar: R(document.getElementById('touch')), rootPad: getComputedStyle(de).paddingTop + '/' + getComputedStyle(de).paddingBottom, scroll: [de.scrollWidth, de.scrollHeight], docTitle: document.title, bodyChildrenOfBody: document.body.children.length, htmlCount: document.querySelectorAll('html').length, metas: [...document.querySelectorAll('meta[name=viewport]')].map((m) => m.content) }; document.querySelectorAll('#touch [data-k]').forEach((b) => { o['btn_' + b.dataset.k] = R(b); }); return o; });
    out.skeleton[`${name}|${file === DIST ? 'plain' : 'wrapped'}`] = r;
    if (file !== DIST) await t.page.screenshot({ path: `${OUT}/skeleton_${name}.png` });
    await t.close();
  }
}
// (c) theme matrix on the wrapped doc
out.theme = {};
for (const os of ['light', 'dark']) for (const forced of ['none', 'light', 'dark']) {
  const t = await open({ browser, html: OUT + '/wrapped.html', viewport: { width: 900, height: 700 }, colorScheme: os });
  if (forced !== 'none') await t.page.evaluate((f) => document.documentElement.setAttribute('data-theme', f), forced);
  await sleep(150);
  out.theme[`os=${os} forced=${forced}`] = await t.page.evaluate(() => { const cs = getComputedStyle(document.body); const de = getComputedStyle(document.documentElement); return { bodyBg: cs.backgroundColor, fg: cs.color, pageBgToken: de.getPropertyValue('--page-bg').trim(), colorScheme: de.colorScheme, legendColor: getComputedStyle(document.getElementById('legend')).color }; });
  await t.page.screenshot({ path: `${OUT}/theme_${os}_${forced}.png`, clip: { x: 0, y: 0, width: 900, height: 700 } });
  await t.close();
}
await browser.close();
save('artifact.json', out);
console.log(JSON.stringify(out, null, 1));

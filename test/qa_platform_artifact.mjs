// QA platform: Artifact page contract. (1) static checks of dist/fizzpop.html against SPEC 2.5 + artifact-design rules,
// (2) the page inside the publish skeleton (full document nested in a body), (3) theme matrix incl. forced data-theme, (4) contrast ratios.
import fs from 'fs'; import path from 'path';
import { launchBrowser, open, ev, DIST, OUT, log } from './qa_platform_lib.mjs';
const D = path.join(OUT, 'artifact'); fs.mkdirSync(D, { recursive: true });
const html = fs.readFileSync(DIST, 'utf8');
// ---- static checks
const head = html.slice(0, html.indexOf('<script>'));
const ext = [...html.matchAll(/(?:src|href)\s*=\s*["'](https?:)?\/\/[^"']+/gi)].map((m) => m[0]);
const urlsInJs = [...html.matchAll(/https?:\/\/[^\s"'`)]+/g)].map((m) => m[0]).filter((u, i, a) => a.indexOf(u) === i);
const titleIdx = html.indexOf('<title>');
log('size bytes', Buffer.byteLength(html), '| <title> at byte', titleIdx, '| title text:', (html.match(/<title>([^<]*)/) || [])[1]);
log('doctype/html/head/body in file:', /<!doctype/i.test(html), /<html/i.test(html), /<head>/i.test(html), /<body/i.test(html));
log('viewport meta:', (html.match(/<meta name="viewport"[^>]*>/) || [])[0], '| has viewport-fit=cover:', /viewport-fit=cover/.test(html));
log('external resources (src/href):', JSON.stringify(ext), '| URLs anywhere in file:', JSON.stringify(urlsInJs));
log('alert/confirm/prompt/print/window.open calls:', JSON.stringify([...html.matchAll(/\b(alert|confirm|prompt)\s*\(|window\.print|window\.open|\.requestFullscreen|navigator\.share|\.vibrate|wakeLock|window\.claude/g)].map((m) => m[0])));
const rootTokens = (html.match(/:root\s*\{([^}]*)\}/) || [])[1] || '';
const tokenNames = [...rootTokens.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]);
const darkBlock1 = (html.match(/prefers-color-scheme: dark\)\s*\{\s*:root:not\(\[data-theme="light"\]\)\s*\{([^}]*)\}/) || [])[1] || '';
const darkBlock2 = (html.match(/:root\[data-theme="dark"\]\s*\{([^}]*)\}/) || [])[1] || '';
const dn1 = [...darkBlock1.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]), dn2 = [...darkBlock2.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]);
log('tokens defined in bare :root:', tokenNames.length, '| dark media redefines', dn1.length, '| data-theme=dark redefines', dn2.length, '| undefined-in-root tokens:', JSON.stringify([...dn1, ...dn2].filter((n) => !tokenNames.includes(n))), '| color-scheme in dark blocks:', /color-scheme:\s*dark/.test(darkBlock1), /color-scheme:\s*dark/.test(darkBlock2), '| mismatched dark sets:', JSON.stringify(dn1.filter((n) => !dn2.includes(n)).concat(dn2.filter((n) => !dn1.includes(n)))));
const lit = [...html.slice(0, html.indexOf('</style>')).matchAll(/(?<!var\()#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)/g)].length;
log('literal colours in CSS outside token blocks (rough count incl. token defs):', lit);
// ---- publish skeleton simulation (full document nested inside a skeleton body)
const skeleton = (inner) => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>:root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0;font:14px system-ui}img{max-width:100%}[hidden]{display:none!important}</style></head><body>${inner}</body></html>`;
fs.writeFileSync(path.join(D, 'nested.html'), skeleton(html));
const browser = await launchBrowser({ autoplay: true });
for (const [label, file] of [['direct', DIST], ['nested-in-skeleton', path.join(D, 'nested.html')]]) {
  for (const [cs, theme] of [['light', null], ['dark', null], ['light', 'dark'], ['dark', 'light']]) {
    const t = await open({ browser, html: file, viewport: { width: 1280, height: 800 }, colorScheme: cs, initScript: theme ? `document.documentElement.setAttribute('data-theme','${theme}');` : undefined });
    await t.page.waitForTimeout(200);
    const r = await ev(t.page, () => { const cs = getComputedStyle(document.body); const lg = getComputedStyle(document.getElementById('legend')); return { bodyBg: cs.backgroundColor, legend: lg.color, htmlBg: getComputedStyle(document.documentElement).backgroundColor, colorScheme: getComputedStyle(document.documentElement).colorScheme, lay: fz._main.layout(), scrollH: document.documentElement.scrollHeight, clientH: document.documentElement.clientHeight, nHtml: document.querySelectorAll('html').length, nBody: document.querySelectorAll('body').length, title: document.title }; });
    log(`${label} OS=${cs} data-theme=${theme}: bodyBg ${r.bodyBg} legend ${r.legend} color-scheme "${r.colorScheme}" canvas ${r.lay.w}x${r.lay.h} vscroll=${r.scrollH > r.clientH} title="${r.title}" errors=${t.errors.length}`);
    if (label === 'nested-in-skeleton' && theme === 'dark') await t.page.screenshot({ path: path.join(D, 'nested_forced_dark_osLight.png') });
    await t.close();
  }
}
// ---- contrast ratios of the page tokens
const lum = (hex) => { const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const cr = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return +((x + 0.05) / (y + 0.05)).toFixed(2); };
log('contrast light: muted/bg', cr('#566080', '#e9eef6'), ' fg/bg', cr('#1b1033', '#e9eef6'), ' btn-fg/btn-bg', cr('#1b1033', '#ffffff'), ' btn-edge/bg', cr('#98a2c6', '#e9eef6'), ' PRESSED btn-on-fg/btn-on', cr('#ffffff', '#ff6fae'), ' frame/bg', cr('#1b1033', '#e9eef6'));
log('contrast dark : muted/bg', cr('#9d9bc0', '#0b0a14'), ' fg/bg', cr('#e8e6ff', '#0b0a14'), ' btn-fg/btn-bg', cr('#e8e6ff', '#1b1933'), ' btn-edge/bg', cr('#4a4680', '#0b0a14'), ' btn-bg/page-bg', cr('#1b1933', '#0b0a14'), ' PRESSED', cr('#1b1033', '#ff6fae'), ' frame/bg', cr('#26214f', '#0b0a14'));
await browser.close();

// FIZZ & POP — test/audio_v3_proof_sfx.mjs   (FIXPLAN_V3 A1 / A3 / A4: a picture of the SFX mix before / after)
// Reads the numbers the QA wave measured on the v2.0 module (out/qa_v2/audio: masking_D2_meas.txt, sfx_live.json, the pump figures of QA_V2_FINDINGS A3) and the numbers of the current
// module (out/v3/audio/mix_final.json from test/audio_v3_mix.mjs --json, out/v3/audio/live.json from test/audio_v3_live.mjs --json) and draws three panels into out/v3/audio/proof_sfx.png:
//   1 live K-active level of every SFX (hierarchy: quiet tier, everyday sounds, critical cues)   2 music dip under a single everyday SFX over stage1 D2   3 critical cues over the loudest drop (SNR)
// Usage: node test/audio_v3_proof_sfx.mjs [--out file.png] [--mix mix.json] [--live live.json]
import fs from 'fs';
import path from 'path';
import { launch, PROJECT } from '../tools/harness.mjs';

const OUT = process.argv.indexOf('--out') >= 0 ? path.resolve(process.argv[process.argv.indexOf('--out') + 1]) : path.join(PROJECT, 'out', 'v3', 'audio', 'proof_sfx.png');
const rd = (p) => JSON.parse(fs.readFileSync(path.join(PROJECT, p), 'utf8'));
const arg = (k, d) => (process.argv.indexOf(k) >= 0 ? process.argv[process.argv.indexOf(k) + 1] : d);
const mix = rd(arg('--mix', 'out/v3/audio/mix_final.json')), live = rd(arg('--live', 'out/v3/audio/live.json')).live, liveBefore = rd('out/qa_v2/audio/sfx_live.json').out;
const beforeSnr = {};
for (const line of fs.readFileSync(path.join(PROJECT, 'out/qa_v2/audio/masking_D2_meas.txt'), 'utf8').split('\n')) { const c = line.trim().split(/\s+/); if (c.length >= 4) beforeSnr[c[0]] = +c[3]; }
const beforeDip = { jump: -3.8, pop: -6.5, kill: -4.9, enemy_shot: -5.7, bounce: -2.4 };           // QA_V2_FINDINGS A3 (polarity-pair estimator, stage1 D2)
const afterDip = Object.fromEntries((mix.pump.stage1_D2 || []).map((r) => [r.n, r.dip]));
const afterSnr = Object.fromEntries((mix.priority.stage1_D2 || []).map((r) => [r.n, r.snr]));
const CRIT = ['hurry', 'death', 'ghost', 'oneup', 'letter', 'clear', 'powerup'], EVERY = ['jump', 'shoot', 'pop', 'kill', 'bounce', 'enemy_shot', 'menu_move', 'land'];
const COL = { before: '#e0699a', after: '#58e6c8', line: '#ffd45a' };

function bars(title, rows, o) {                      // rows [{label, before, after}], value range [lo, hi], optional threshold line
  const W = 600, H = 300, L = 46, B = 70, T = 34, R = 10, n = rows.length, bw = (W - L - R) / n;
  const y = (v) => T + (H - T - B) * (1 - (v - o.lo) / (o.hi - o.lo));
  let s = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg"><rect width="${W}" height="${H}" fill="#10131a"/><text x="${L}" y="20" fill="#cde" font-size="14" font-family="monospace">${title}</text>`;
  for (let v = Math.ceil(o.lo / o.step) * o.step; v <= o.hi; v += o.step) s += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="#2a3342"/><text x="4" y="${y(v) + 4}" fill="#8ab" font-size="11" font-family="monospace">${v}</text>`;
  rows.forEach((r, i) => {
    const x0 = L + i * bw + bw * 0.12, w = bw * 0.38;
    [['before', r.before], ['after', r.after]].forEach(([k, v], j) => { if (v === undefined || !Number.isFinite(v)) return; const yy = y(Math.max(v, o.lo)), y0 = y(Math.min(Math.max(o.base, o.lo), o.hi)); s += `<rect x="${x0 + j * w}" y="${Math.min(yy, y0)}" width="${w - 2}" height="${Math.abs(yy - y0)}" fill="${COL[k]}"/>`; });
    s += `<text transform="translate(${x0 + w},${H - B + 12}) rotate(55)" fill="#cde" font-size="11" font-family="monospace">${r.label}</text>`;
  });
  if (o.line !== undefined) s += `<line x1="${L}" x2="${W - R}" y1="${y(o.line)}" y2="${y(o.line)}" stroke="${COL.line}" stroke-dasharray="5 4"/><text x="${W - 150}" y="${y(o.line) - 4}" fill="${COL.line}" font-size="11" font-family="monospace">${o.lineLabel}</text>`;
  return s + '</svg>';
}
const lvBefore = Object.fromEntries(liveBefore.map((r) => [r.n, r.liveActive])), lvAfter = Object.fromEntries(live.map((r) => [r.n, r.act]));
const p1 = bars('1  live K-active level of the SFX (dB)  v2.0 vs now', EVERY.concat(CRIT).map((nm) => ({ label: nm, before: lvBefore[nm], after: lvAfter[nm] })), { lo: -30, hi: -6, step: 4, base: -30 });
const p2 = bars('2  music dip under ONE everyday SFX over stage1 D2 (dB)', ['jump', 'pop', 'kill', 'bounce', 'enemy_shot'].map((nm) => ({ label: nm, before: beforeDip[nm], after: afterDip[nm] })), { lo: -8, hi: 0, step: 2, base: 0, line: -1.5, lineLabel: 'limit -1.5 dB' });
const p3 = bars('3  critical cues over the loudest drop, SNR (dB)', CRIT.map((nm) => ({ label: nm, before: beforeSnr[nm], after: afterSnr[nm] })), { lo: 0, hi: 14, step: 2, base: 0, line: 8, lineLabel: 'target >= 8 dB' });
const t = await launch({ html: 'about:blank', viewport: { width: 1860, height: 400 } });
await t.page.setContent(`<style>body{background:#10131a;margin:0;padding:10px;color:#cde;font:13px monospace}svg{margin-right:8px}.k span{display:inline-block;width:12px;height:12px;margin:0 4px 0 14px;vertical-align:middle}</style><div class="k"><span style="background:${COL.before}"></span>v2.0 (QA measurement)<span style="background:${COL.after}"></span>now (FIXPLAN_V3)</div>${p1}${p2}${p3}`);
fs.mkdirSync(path.dirname(OUT), { recursive: true });
await t.page.screenshot({ path: OUT });
console.log(OUT);
await t.close();

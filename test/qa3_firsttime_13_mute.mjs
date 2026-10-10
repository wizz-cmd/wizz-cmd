// Step 13: mute (M key, SOUND menu row), toast feedback, silence really silent, unmute restores music; M inside a round
import { open, check, wait } from './qa3_firsttime_lib.mjs';
const t = await open({ w: 1280, h: 800, name: 'mute' });
await wait(600);
const cb = await t.ev(() => { const r = document.getElementById('focus').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
await t.page.mouse.click(cb.x + cb.w / 2, cb.y + 20);
await wait(1500);
const lv = async () => (await t.ev(() => window.__level())).rms;
console.log('rms music on', (await lv()).toFixed(3));
await t.key('KeyM', 60); await wait(250);
await t.shot('0_toast_off', { canvas: true });
await wait(600);
console.log('rms after M', (await lv()).toFixed(4), 'muted', await t.ev(() => fz.AUDIO.isMuted()));
await t.key('KeyM', 60); await wait(1000);
console.log('rms after M again', (await lv()).toFixed(3));
// SOUND row
for (let i = 0; i < 4; i++) await t.key('ArrowDown', 40);
await t.key('Enter', 60); await wait(600);
console.log('rms after SOUND row', (await lv()).toFixed(4), 'muted', await t.ev(() => fz.AUDIO.isMuted()), 'rows', JSON.stringify(await t.ev(() => fz._main.rows().map(r => r.label + (r.sel ? '*' : '')))));
await t.shot('1_sound_row_off', { canvas: true });
// start a game muted: is the mute icon visible in play? (top-right corner overlaps PUSH Q)
await t.key('ArrowUp', 40); await t.key('ArrowUp', 40); await t.key('ArrowUp', 40); await t.key('ArrowUp', 40); await t.key('Enter', 60);
await wait(800); await t.key('Enter', 60); await wait(1800);
await t.shot('2_play_muted', { canvas: true });
await t.key('KeyM', 60); await wait(500);
console.log('rms after M in play', (await lv()).toFixed(3));
await t.shot('3_play_unmuted', { canvas: true });
console.log('errors', t.errors);
await t.close();

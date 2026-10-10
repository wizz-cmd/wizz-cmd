// Step 27: Gamepad API inside the sandboxed cross-origin iframe (what the Artifact is): allowed or blocked by Permissions-Policy?
import { open, check, wait } from './qa3_firsttime_lib.mjs';
const t = await open({ w: 1280, h: 800, name: 'gp' });
await wait(500);
const r = await t.ev(() => {
  const out = {};
  try { const g = navigator.getGamepads(); out.getGamepads = 'ok len=' + (g ? g.length : 'null'); } catch (e) { out.getGamepads = 'THROWS ' + e.name + ': ' + e.message; }
  try { out.policy = document.featurePolicy ? { gamepad: document.featurePolicy.allowsFeature('gamepad'), autoplay: document.featurePolicy.allowsFeature('autoplay'), fullscreen: document.featurePolicy.allowsFeature('fullscreen'), 'wake-lock': document.featurePolicy.allowsFeature('screen-wake-lock') } : 'n/a'; } catch (e) { out.policy = 'err ' + e.message; }
  try { localStorage.setItem('x', '1'); out.localStorage = 'ok'; } catch (e) { out.localStorage = 'THROWS ' + e.name; }
  out.errsInGame = fz.U.store.get('nope', 'fallback');
  return out;
});
console.log(JSON.stringify(r, null, 1));
await t.close();

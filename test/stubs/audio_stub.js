/* FIZZ & POP — test/stubs/audio_stub.js
 * Stable stand-in for src/20_audio.js implementing the FULL public API of SPEC §3.2 as silent,
 * logging no-ops. Every call is recorded in AUDIO._log as [functionName, ...args] (capped at 2000
 * entries) so tests can assert "the game played sfx 'pop'".
 *
 * Behaviour worth knowing when developing against the stub:
 *  - jingle(name, {onEnd}) calls onEnd asynchronously (setTimeout 0), even when muted. The real
 *    module calls it when the jingle finishes (~3-4 s) — game logic must not depend on that timing.
 *  - sfx() with an unknown name warns once on the console and does not throw.
 *  - Mute state is persisted through U.store key 'muted' (like the real module).
 * Stub-only extras (not contract): AUDIO._log, AUDIO._state() -> {music, tempo, inited, paused, muted}
 */
const AUDIO = (() => {
  const LOOPS = ['title', 'stage1', 'stage2', 'boss', 'entry', 'ending'];
  const JINGLES = ['start', 'extend', 'gameover', 'clear_boss'];
  const SFX = ['jump', 'shoot', 'pop', 'trap', 'kill', 'bounce', 'food', 'powerup', 'item_appear',
    'letter', 'oneup', 'death', 'hurry', 'ghost', 'thunder', 'fire', 'water', 'freeze', 'bomb',
    'menu_move', 'menu_select', 'pause', 'boss_hit', 'boss_die', 'enemy_shot', 'spawn', 'land', 'clear'];

  const _log = [];
  const LOG_CAP = 2000;
  const log = (...a) => { _log.push(a); if (_log.length > LOG_CAP) _log.shift(); };
  const warned = {};

  let inited = false, paused = false, tempo = 1, music = null, prevMusic = null;
  let muted = !!U.store.get('muted', false);

  function init() { log('init'); inited = true; }
  const ready = () => inited && !paused;

  function playMusic(name, opts) {
    log('music', name, opts);
    if (LOOPS.indexOf(name) < 0) { if (!warned['m' + name]) { warned['m' + name] = 1; console.warn('AUDIO stub: unknown music ' + name); } return; }
    if (music === name && !(opts && opts.restart)) return;
    music = name;
  }
  function jingle(name, opts) {
    log('jingle', name, opts);
    if (JINGLES.indexOf(name) < 0 && !warned['j' + name]) { warned['j' + name] = 1; console.warn('AUDIO stub: unknown jingle ' + name); }
    prevMusic = music;
    music = null;
    setTimeout(() => {
      if (opts && opts.resume) music = prevMusic;
      if (opts && typeof opts.onEnd === 'function') opts.onEnd();
    }, 0);
  }
  function stopMusic(fadeSec = 0) { log('stopMusic', fadeSec); music = null; }
  function setTempo(scale) { log('setTempo', scale); tempo = scale; }
  function sfx(name, opts) {
    log('sfx', name, opts);
    if (SFX.indexOf(name) < 0 && !warned['s' + name]) { warned['s' + name] = 1; console.warn('AUDIO stub: unknown sfx ' + name); }
  }
  function setMuted(b) { muted = !!b; log('setMuted', muted); U.store.set('muted', muted); }
  function toggleMuted() { setMuted(!muted); return muted; }
  const isMuted = () => muted;
  function pause() { log('pause'); paused = true; }
  function resume() { log('resume'); paused = false; }
  const trackNames = () => LOOPS.concat(JINGLES);
  const sfxNames = () => SFX.slice();
  function _renderOffline(name, seconds) {
    log('_renderOffline', name, seconds);
    const rate = 22050;
    const n = Math.max(1, Math.floor((seconds || 1) * rate));
    return Promise.resolve({ sampleRate: rate, channels: [new Float32Array(n), new Float32Array(n)] });
  }
  const _state = () => ({ music, tempo, inited, paused, muted });

  return { init, ready, music: playMusic, jingle, stopMusic, setTempo, sfx, setMuted, toggleMuted, isMuted,
    pause, resume, trackNames, sfxNames, _renderOffline, _log, _state };
})();

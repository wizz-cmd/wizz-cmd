/* Game harness boot: fixed-step loop + keyboard input + window.__t test API (see game_harness.html). */
(() => {
  const canvas = document.getElementById('screen');
  const ctx = canvas.getContext('2d');
  const qs = new URLSearchParams(location.search);
  const real = qs.get('real') === '1' || qs.get('real') === 'gfx';
  // v2: backing store = k x logical, every frame under setTransform(k, 0, 0, k, 0, 0) (what Main does); stubs stay at k = 1 (pixel look)
  const K = Math.max(1, Math.min(8, +qs.get('k') || (real ? 3 : 1)));
  canvas.width = 256 * K; canvas.height = 224 * K;
  if (K === 1) canvas.className = 'px';
  let post = +(qs.get('post') || 0);
  const opts = { reducedMotion: qs.get('rm') === '1', quality: qs.has('q') ? +qs.get('q') : 2 };
  if (typeof GFX.init === 'function') GFX.init();
  if (typeof GFX.setScale === 'function') GFX.setScale(K);
  if (typeof Game.setOptions === 'function') Game.setOptions(opts);
  /** One frame exactly like Main: transform, Game.render, optional post FX. */
  function drawFrame() {
    ctx.setTransform(K, 0, 0, K, 0, 0);
    ctx.imageSmoothingEnabled = K !== 1;
    Game.render(ctx);
    if (post > 0 && typeof GFX.postFX === 'function') GFX.postFX(ctx, post);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  // record every audio call (works for the stub and the real module): [fn, ...args]
  const log = [];
  for (const fn of ['sfx', 'jingle', 'music', 'setTempo', 'stopMusic']) {
    const orig = AUDIO[fn];
    AUDIO[fn] = (...a) => { log.push([fn, ...a.map((x) => (typeof x === 'function' ? 'fn' : x))]); if (log.length > 5000) log.shift(); return orig.apply(AUDIO, a); };
  }

  // record unknown sprite names / sfx names (contract violations) instead of letting them pass silently
  const unknown = { sprites: new Set(), sfx: new Set(), music: new Set() };
  const origDraw = GFX.draw;
  GFX.draw = (c, name, ...rest) => { if (!GFX.has(name)) unknown.sprites.add(name); return origDraw.call(GFX, c, name, ...rest); };
  const sfxNames = new Set(AUDIO.sfxNames());
  const trackNames = new Set(AUDIO.trackNames());
  const origSfx = AUDIO.sfx, origMusic = AUDIO.music, origJingle = AUDIO.jingle;
  AUDIO.sfx = (n, o) => { if (!sfxNames.has(n)) unknown.sfx.add(n); return origSfx.call(AUDIO, n, o); };
  AUDIO.music = (n, o) => { if (!trackNames.has(n)) unknown.music.add(n); return origMusic.call(AUDIO, n, o); };
  AUDIO.jingle = (n, o) => { if (!trackNames.has(n)) unknown.music.add(n); return origJingle.call(AUDIO, n, o); };

  const BLANK = () => ({ left: false, right: false, jump: false, fire: false });
  const KEYS = [
    { left: ['ArrowLeft'], right: ['ArrowRight'], jump: ['ArrowUp', 'KeyX'], fire: ['Space', 'KeyZ'] },
    { left: ['KeyA'], right: ['KeyD'], jump: ['KeyW'], fire: ['KeyQ', 'ShiftLeft'] },
  ];
  const virt = [BLANK(), BLANK()];
  const prev = [BLANK(), BLANK()];
  const down = new Set();
  const tapped = new Set();
  let frozen = false;

  function readPad(i, useReal, override) {
    const cur = BLANK();
    for (const k of Object.keys(cur)) {
      cur[k] = !!virt[i][k] || !!(override && override[i] && override[i][k]) ||
        (useReal && KEYS[i][k].some((c) => down.has(c) || tapped.has(c)));
    }
    const out = {
      left: cur.left, right: cur.right, jump: cur.jump, fire: cur.fire,
      jumpPressed: cur.jump && !prev[i].jump, firePressed: cur.fire && !prev[i].fire,
    };
    prev[i] = cur;
    return out;
  }

  function tick(useReal, override) {
    const inputs = [readPad(0, useReal, override), readPad(1, useReal, override)];
    tapped.clear();
    Game.update(inputs);
  }

  window.addEventListener('keydown', (e) => { if (!down.has(e.code)) tapped.add(e.code); down.add(e.code); });
  window.addEventListener('keyup', (e) => { down.delete(e.code); });

  // ---- map building helpers for tests -------------------------------------------------------
  /** spec: { blocks: [[c0,r0,c1,r1],...], floorGap: [c0,c1] | [[c0,c1],...] } -> 26 strings. */
  function mkMap(spec) {
    const rows = [];
    for (let r = 0; r < 26; r++) {
      const a = new Array(32).fill('.');
      if (r === 0 || r === 25) a.fill('#');
      a[0] = a[1] = a[30] = a[31] = '#';
      rows.push(a);
    }
    for (const g of (spec && spec.floorGap ? (Array.isArray(spec.floorGap[0]) ? spec.floorGap : [spec.floorGap]) : [])) {
      for (let c = g[0]; c <= g[1]; c++) { rows[0][c] = '.'; rows[25][c] = '.'; }
    }
    for (const b of (spec && spec.blocks) || []) {
      for (let r = b[1]; r <= b[3]; r++) for (let c = b[0]; c <= b[2]; c++) rows[r][c] = '#';
    }
    return rows.map((a) => a.join(''));
  }

  /** Replace round `index` (0-based) of the active LEVELS with a custom map/definition. */
  function useMap(index, map, def) {
    const L = LEVELS[index];
    L.map = map;
    Object.assign(L, def || {});
  }

  function loop(now) {
    requestAnimationFrame(loop);
    if (frozen) { drawFrame(); return; }
    loop.acc = (loop.acc || 0) + Math.min(now - (loop.last || now), 100);
    loop.last = now;
    while (loop.acc >= 1000 / 60) { tick(true); loop.acc -= 1000 / 60; }
    drawFrame();
  }

  window.__t = {
    Game, GFX, AUDIO, LEVELS, C, U, K, canvas, ctx,
    mkMap, useMap, log,
    /** Game.setOptions passthrough (reducedMotion, quality) + postFX level (0 = off) for the test page. */
    opts(o) { Object.assign(opts, o || {}); if (o && o.post !== undefined) post = +o.post; if (typeof Game.setOptions === 'function') Game.setOptions({ reducedMotion: opts.reducedMotion, quality: opts.quality }); },
    drawFrame,
    unknown: () => ({ sprites: [...unknown.sprites], sfx: [...unknown.sfx], music: [...unknown.music] }),
    S: () => Game.debug._S(),
    state: () => Game.debug.state(),
    freeze(b) { frozen = b !== false; },
    set(pi, o) { Object.assign(virt[pi], o); },
    clear() { virt[0] = BLANK(); virt[1] = BLANK(); },
    render() { drawFrame(); },
    start(o) { Game.start(o); drawFrame(); },
    /** Run n fixed updates with virtual input only; `inputs` = [in1, in2] applied additionally for these steps. */
    step(n, inputs) { for (let i = 0; i < n; i++) tick(false, inputs); drawFrame(); },
    /** n fixed updates WITHOUT rendering (cost measurements, long soaks). */
    tick(n, inputs) { for (let i = 0; i < n; i++) tick(false, inputs); },
    /** Start a game and skip the intro. opts: {players, level, seed, empty (remove enemies), noClear}. */
    arena(opts) {
      const o = Object.assign({ players: 1, level: 1, seed: 7, empty: true, noClear: true }, opts || {});
      Game.start({ players: o.players, level: o.level, seed: o.seed });
      Game.debug.skipIntro();
      if (o.empty) Game.debug.clearEnemies();
      if (o.noClear) Game.debug.noClear(true);
      drawFrame();
      return Game.debug.state();
    },
  };
  loop.last = performance.now();
  requestAnimationFrame(loop);
})();

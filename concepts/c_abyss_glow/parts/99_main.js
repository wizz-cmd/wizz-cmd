/* ABYSS GLOW — page glue: hash-selected scene, animated loop, ?still freeze, window.__ready for the renderer. */
(function boot() {
  const cv = document.getElementById('c');
  const ctx = cv.getContext('2d');
  const SCENES = {
    gameplay: { w: 1024, h: 896, still: 3.35, draw: (c, t) => sceneGameplay(c, t) },
    title: { w: 1024, h: 896, still: 2.4, draw: (c, t) => sceneTitle(c, t) },
    cast: { w: 1600, h: 600, still: 1.6, draw: (c, t) => sceneCast(c, t) },
    dev: { w: 1600, h: 900, still: 1.6, draw: (c, t) => (typeof sceneDev === 'function' ? sceneDev(c, t) : 0) },
  };
  const still = /[?&]still\b/.test(location.search);
  const tOverride = /[?&]t=([0-9.]+)/.exec(location.search);       // dev: ?still&t=7.5 renders that moment
  let name = 'gameplay', raf = 0, t0 = performance.now();

  function select() {
    const h = (location.hash || '#gameplay').slice(1);
    name = SCENES[h] ? h : 'gameplay';
    const s = SCENES[name];
    if (cv.width !== s.w || cv.height !== s.h) { cv.width = s.w; cv.height = s.h; }
    document.querySelectorAll('nav a').forEach((a) => a.classList.toggle('on', a.getAttribute('href') === '#' + name));
    cancelAnimationFrame(raf);
    window.__ready = false;
    if (still) { paint(tOverride ? +tOverride[1] : s.still); window.__ready = true; }
    else { t0 = performance.now(); loop(); }
  }
  function paint(t) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; ctx.filter = 'none';
    SCENES[name].draw(ctx, t);
  }
  function loop() {
    paint(SCENES[name].still + (performance.now() - t0) / 1000);
    window.__ready = true;
    raf = requestAnimationFrame(loop);
  }
  // dev: average CPU+raster cost of one frame (forces a pixel read-back so deferred canvas work is included)
  window.__measure = (n) => {
    n = n || 15; const s = SCENES[name];
    const a = performance.now();
    for (let i = 0; i < n; i++) paint(s.still + i * 0.016);
    ctx.getImageData(0, 0, 1, 1);                       // one read-back at the end flushes the deferred canvas work
    return { scene: name, avgMs: +((performance.now() - a) / n).toFixed(1) };
  };
  // the reusable per-entity API (what would become the game's GFX module) — also handy from the devtools console
  window.AbyssGlow = { bgGradient, drawFarJellies, drawFog, drawPlankton, drawBokeh, drawBackground, drawPlatforms, buildLevelGeo, drawPlayer, drawEnemy, drawBubble, drawFood, drawPowerup, drawHud, drawPopup, drawLogo, drawMenu, drawText, drawTrail, drawPop, drawChainFlash, bloom, drawVignette, drawGrain, glow, neon, PAL, RGB, THEME_CORAL, LEVELS_MAP: () => LEVELS[0].map };
  window.addEventListener('hashchange', select);
  select();
})();

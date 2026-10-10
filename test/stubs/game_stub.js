/* FIZZ & POP — test/stubs/game_stub.js
 * Stable stand-in for src/40_game.js implementing the public API of SPEC §3.4 minimally:
 * themed background + level canvas, one or two player boxes you can walk/jump (one-way platforms,
 * floor-gap wrap), enemies that patrol/bounce harmlessly, bubbles that float up, HUD via GFX.text.
 * There is no scoring logic, no real phases (phase is always 'play'; 'gameover' once over) and
 * enemies never hurt anyone. Use the debug hooks to drive tests:
 *   Game.debug.die(pi=0)  lose one life for player pi (3 deaths of the last player => game over)
 *   Game.debug.end(won)   finish the game immediately (isOver() true, result().won = won)
 * state() shape (stub choices where SPEC is silent): players has one entry per player in the game
 * (1 or 2), `items` is [{kind, x, y}], `letters` is [[P1 letters], [P2 letters]].
 */
const Game = (() => {
  const SPEED = 1.25, GRAVITY = 0.16, TERMINAL = 2.0, JUMP_V = -3.75;
  const WALKERS = { nibbler: 1, crabbit: 1, springle: 1 };
  const FLYERS = { jellop: 1, glimmer: 1 };
  const PLAYER_COLOR = ['#ff6fae', '#6fd8ff'];
  let st = null;

  const pad = (n) => String(n).padStart(6, '0');
  const solid = (map, c, r) => r >= 0 && r < 26 && c >= 0 && c < 32 && map[r][c] === '#';
  const map = () => LEVELS[st.level - 1].map;

  function spawnPlayer(i, prev) {
    return {
      x: i === 0 ? 24 : 216, y: 200, vx: 0, vy: 0, face: i === 0 ? 1 : -1,
      lives: prev ? prev.lives : 3, score: prev ? prev.score : 0, alive: true, onGround: true, power: [],
      cooldown: 0, inv: 0,
    };
  }

  function loadLevel(n) {
    st.level = Math.max(1, Math.min(30, n | 0));
    st.highest = Math.max(st.highest, st.level);
    const lv = LEVELS[st.level - 1];
    st.enemies = lv.enemies.map((e) => ({
      t: e.t, x: e.c * 8, y: C.MAP_Y + e.r * 8, vx: 0.6 * e.d, vy: FLYERS[e.t] ? 0.6 : 0,
      state: 'active', angry: false,
    }));
    st.bubbles = []; st.items = [];
    st.bossHp = lv.boss ? 60 : 0;
    st.players = st.players.map((p, i) => spawnPlayer(i, p));
    st.bannerFrames = 90;
    AUDIO.music(st.level === 30 ? 'boss' : st.level <= 15 ? 'stage1' : 'stage2');
  }

  function start(o) {
    const n = (o && o.players) === 2 ? 2 : 1;
    st = {
      level: 1, highest: 1, frame: 0, over: false, won: false, god: false, hiScore: (o && o.hiScore) || 0,
      rng: U.rng((o && o.seed) || 1), hurry: false, ghost: false, bossHp: 0, bannerFrames: 90,
      letters: [[], []], bubbles: [], items: [], enemies: [], phase: 'play',
      players: Array.from({ length: n }, (_, i) => spawnPlayer(i, null)),
      nPlayers: n,
    };
    loadLevel((o && o.level) || 1);
    st.highest = st.level;
  }

  function movePlayer(p, inp) {
    const m = map();
    p.vx = ((inp.right ? 1 : 0) - (inp.left ? 1 : 0)) * SPEED;
    if (p.vx) p.face = p.vx > 0 ? 1 : -1;
    if (inp.jumpPressed && p.onGround) { p.vy = JUMP_V; p.onGround = false; AUDIO.sfx('jump'); }
    p.vy = Math.min(TERMINAL, p.vy + GRAVITY);
    p.x = U.clamp(p.x + p.vx, C.INNER_L, C.INNER_R - 16);
    const prevFeet = p.y + 16;
    p.y += p.vy;
    p.onGround = false;
    if (p.vy >= 0) {                                    // one-way landing check
      const feet = p.y + 16;
      const row = Math.floor((feet - C.MAP_Y) / 8);
      const top = C.MAP_Y + row * 8;
      if (row >= 1 && row <= 25 && prevFeet <= top && feet >= top) {
        const c0 = Math.floor((p.x + 2) / 8), c1 = Math.floor((p.x + 13) / 8);
        if (solid(m, c0, row) || solid(m, c1, row)) { p.y = top - 16; p.vy = 0; p.onGround = true; }
      }
    }
    if (p.y > C.H) p.y -= C.H;                           // wrap through floor gaps
    if (p.y < C.MAP_Y + 8 && p.vy < 0) { p.y = C.MAP_Y + 8; p.vy = 0; }
    if (p.cooldown > 0) p.cooldown--;
    if (inp.firePressed && p.cooldown === 0) {
      p.cooldown = 14;
      st.bubbles.push({ x: U.clamp(p.x + p.face * 10, C.INNER_L, C.INNER_R - 16), y: p.y, kind: 'empty', state: 'float', age: 0 });
      AUDIO.sfx('shoot');
    }
  }

  function update(inputs) {
    if (!st || st.over) return;
    st.frame++;
    if (st.bannerFrames > 0) st.bannerFrames--;
    st.players.forEach((p, i) => { if (p.alive) movePlayer(p, inputs[i] || {}); });
    for (const e of st.enemies) {
      e.x += e.vx; e.y += e.vy;
      if (e.x < C.INNER_L || e.x > C.INNER_R - 16) { e.vx = -e.vx; e.x = U.clamp(e.x, C.INNER_L, C.INNER_R - 16); }
      if (FLYERS[e.t] && (e.y < C.MAP_Y + 8 || e.y > 200)) { e.vy = -e.vy; e.y = U.clamp(e.y, C.MAP_Y + 8, 200); }
    }
    st.bubbles = st.bubbles.filter((b) => { b.y -= 0.5; b.age++; return b.y > C.MAP_Y + 8 && b.age < 660; });
  }

  function hud(ctx) {
    GFX.text(ctx, '1UP', 16, 0, PLAYER_COLOR[0]);
    GFX.text(ctx, 'HI SCORE', 128, 0, '#ff6a5e', { align: 'center' });
    if (st.nPlayers === 2) GFX.text(ctx, '2UP', 240, 0, PLAYER_COLOR[1], { align: 'right' });
    else if (Math.floor(st.frame / 30) % 2 === 0) GFX.text(ctx, 'PUSH Q', 240, 0, PLAYER_COLOR[1], { align: 'right' });
    GFX.text(ctx, pad(st.players[0].score), 56, 8, '#fff', { align: 'right' });
    GFX.text(ctx, pad(Math.max(st.hiScore, st.players[0].score)), 152, 8, '#fff', { align: 'right' });
    if (st.players[1]) GFX.text(ctx, pad(st.players[1].score), 240, 8, '#fff', { align: 'right' });
    GFX.text(ctx, String(st.level).padStart(2, '0'), 8, 16, GFX.theme(st.level - 1).accent2, { align: 'center' });
    st.players.forEach((p, i) => {
      for (let k = 0; k < p.lives - 1; k++) GFX.draw(ctx, 'p' + (i + 1) + '_icon', 0, i === 0 ? 4 : 244, 208 - k * 10);
    });
  }

  function render(ctx) {
    if (!st) { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, C.W, C.H); return; }
    const th = GFX.theme(st.level - 1);
    ctx.fillStyle = th.bg; ctx.fillRect(0, 0, C.W, C.H);
    ctx.drawImage(GFX.levelCanvas(st.level - 1, map()), 0, C.MAP_Y);
    const f = Math.floor(st.frame / 8);
    for (const e of st.enemies) GFX.draw(ctx, e.t + '_move', f, e.x, e.y, { flip: e.vx < 0 });
    for (const b of st.bubbles) GFX.draw(ctx, 'bubble', f, b.x, b.y);
    st.players.forEach((p, i) => {
      if (!p.alive) return;
      const pre = 'p' + (i + 1);
      const spr = !p.onGround ? (p.vy < 0 ? '_jump' : '_fall') : p.vx ? '_walk' : '_idle';
      GFX.draw(ctx, pre + spr, f, p.x, p.y, { flip: p.face < 0 });
    });
    hud(ctx);
    if (st.bannerFrames > 0) {
      GFX.text(ctx, 'ROUND ' + st.level, 128, 96, th.accent2, { align: 'center', scale: 2 });
      GFX.text(ctx, 'READY!', 128, 120, '#fff', { align: 'center' });
    }
    if (st.over) GFX.text(ctx, st.won ? 'THE MOON PEARL IS SAFE!' : 'GAME OVER', 128, 104, '#fff', { align: 'center', scale: 1 });
  }

  function join(i) {
    if (!st || i !== 1 || st.players.length > 1 || st.over) return;
    st.players.push(spawnPlayer(1, null));
    st.nPlayers = 2;
  }

  const isOver = () => !!st && st.over;
  const result = () => ({
    won: !!(st && st.won), level: st ? st.highest : 1,
    scores: [st ? st.players[0].score : 0, st && st.players[1] ? st.players[1].score : 0],
    players: st ? st.players.length : 1,
  });

  const debug = {
    setLevel(n) { if (st) { loadLevel(n); } },
    killAll() { if (st) { st.players[0].score += 1000 * st.enemies.length; st.enemies = []; } },
    god(on) { if (st) st.god = !!on; },
    state() {
      if (!st) return { level: 0, phase: 'none', frame: 0, players: [], enemies: [], bubbles: [], items: [], hurry: false, ghost: false, bossHp: 0, letters: [[], []] };
      return JSON.parse(JSON.stringify({
        level: st.level, phase: st.over ? 'gameover' : st.phase, frame: st.frame,
        players: st.players.map((p) => ({ x: p.x, y: p.y, vx: p.vx, vy: p.vy, lives: p.lives, score: p.score, alive: p.alive, onGround: p.onGround, power: p.power })),
        enemies: st.enemies.map((e) => ({ t: e.t, x: e.x, y: e.y, state: e.state, angry: e.angry })),
        bubbles: st.bubbles.map((b) => ({ x: b.x, y: b.y, kind: b.kind, state: b.state })),
        items: st.items, hurry: st.hurry, ghost: st.ghost, bossHp: st.bossHp, letters: st.letters,
      }));
    },
    spawn(type, x, y) {
      if (!st) return;
      if (WALKERS[type] || FLYERS[type] || type === 'kraken') {
        st.enemies.push({ t: type, x, y, vx: 0.6, vy: FLYERS[type] ? 0.6 : 0, state: 'active', angry: false });
      } else if (type === 'thunder' || type === 'fire' || type === 'water') {
        st.bubbles.push({ x, y, kind: type, state: 'float', age: 0 });
      } else st.items.push({ kind: type, x, y });
    },
    // ---- stub-only helpers -------------------------------------------------------------------
    end(won) { if (st) { st.over = true; st.won = !!won; } },
    die(pi = 0) {
      if (!st || !st.players[pi] || st.over) return;
      const p = st.players[pi];
      p.lives = Math.max(0, p.lives - 1);
      if (p.lives === 0) p.alive = false;
      AUDIO.sfx('death');
      if (st.players.every((q) => q.lives === 0)) st.over = true;
    },
  };

  return { start, update, render, join, isOver, result, debug };
})();

/* FIZZ & POP - 10_gfx.js
 * All art of the game, generated at runtime from hand-authored palette-indexed string grids.
 * Contract: SPEC sec. 3.1 (public API) and sec. 5 (art direction). No assets, no network, no dependencies.
 *
 * How the art pipeline works
 *  - Every sprite is a set of grids (arrays of equal-length strings). '.' = transparent, any other
 *    character is a palette key. Sprites face RIGHT; flipping is a cached draw option.
 *  - Characters/items are authored as "fill only" grids; sprite() adds the 1 px dark outline
 *    automatically (4-neighbourhood, so shapes stay round). Internal outlines are typed as 'o'.
 *    Delicate parts (axolotl gills, jellyfish tentacles, anglerfish stalk) are excluded from casting
 *    an outline, so they read as soft feathers instead of heavy bars.
 *  - Animation frames are composed from hand-authored parts (put() stamps one grid on another),
 *    "angry" enemies are palette swaps of the very same finished grids (keys v / V are brow / eyelid
 *    pixels that are invisible in the normal palette), Pop is a palette swap of Fizz, and "_die" frames
 *    are the four 90 degree rotations of one hand-drawn dizzy pose.
 *  - Symmetric creatures (crab, jellyfish, kraken crown/face) are drawn as half grids and mirrored (sym()).
 *  - A few big round masses use small generators instead of typing every pixel: disc() for bubbles,
 *    shadedEllipse() (light from the top-left, 4 bands + 2x2 ordered dither) for the kraken dome, pearls,
 *    bomb and moon pearl; arm() sweeps tapered kraken arms along hand-picked centre lines.
 *    All features (eyes, mouths, crowns, icons, frills ...) are hand-typed grids.
 *  - Each sprite is rendered once (init) into ONE atlas strip canvas (frames side by side); mirrored and
 *    white-silhouette strips are derived lazily on first use. draw() only blits cached strips.
 *    The kraken family (kraken, kraken_angry, kraken_trapped, moonpearl) is built on first draw (round 30
 *    only); has()/size()/frames() already answer for it without building.
 *  - Font: table of 7-column glyph strings in an 8 x 8 cell; tinted glyph strips are cached per colour and
 *    whole strings are cached as pre-composed canvases (HUD text = 1 drawImage).
 *  - Level looks: 6 theme patterns (hand-authored 8 x 8 tiles) x 5 palette/mix variants. Outer walls use the
 *    first tile at double size (16 x 16 blocks). Edges are bevelled from the neighbours' emptiness and a
 *    BB-style drop shadow (3 px right/down, 50 % black) falls on empty cells only.
 *  - drawLogo: puffy bubble letters rasterised from stroke skeletons into per-pixel masks (outline, bevel,
 *    dithered pink -> violet -> blue -> aqua gradient, drifting bubbles, sweeping shine), no anti-aliasing.
 *
 * Choices where the SPEC is silent
 *  - Anchors: sprite (x, y) is always the top-left corner. Trapped frames are 12 x 12 poses centred in the
 *    16 x 16 box so trap_overlay (same box) wraps them. bubble_shot discs (8/12/15 px) are centred in 16 x 16.
 *    flame is 8 x 16 with its base on the bottom row (draw at tileTop - 16).
 *  - Unknown sprite names: draw() warns once and draws a magenta 16 x 16 box (never throws).
 *  - draw(): frame is floor()ed then wrapped modulo the frame count (NaN -> 0). Calls before init() build first.
 *  - white:true keeps each pixel's alpha (translucent bubble pixels stay translucent) and sets RGB to 255.
 *  - text(): shadow offset is one font pixel (= scale px); string/colour caches are capped and reset when full.
 *  - levelCanvas: columns 0-1 and 30-31 are always drawn as wall blocks, cells outside the map count as wall,
 *    short rows/maps are tolerated. theme(i).accent = variant highlight colour, accent2 = variant accent colour
 *    (both bright, readable on the near-black backgrounds).
 *  - drawLogo(ctx, cx, y, t): y is the TOP of the logo (letters start at y+5, wobble +-2), about 219 x 38 px
 *    plus three bubbles drifting up to about y-20.
 *  - Wave 2 (FIXPLAN sec. 2): players are drawn in a 3/4 view facing right (eyes + mouth on the front half of the face, three
 *    full rear gills vs two far-side stubs, paddle tail that wags / lifts); Springle is a seahorse (crown + mane, tube snout,
 *    ringed belly, dorsal fin, lime tail ring turning into the spring); Crabbit has raised open pincers and V eye stalks;
 *    Nibbler wears a spinning cog instead of a key; enemy hues: gold / orange / violet / lime / cobalt. "Angry" = shared
 *    crimson ramp + dark eye sockets with yellow pupils + two steam puffs (addSteam) that rise in alternating phases.
 *    Bubbles carry a dark navy outer ring (trap_overlay trades its blue ring for it); bolt has a white-hot core; the moon
 *    pearl glows lilac-white; pu_shoes is a pair of flippers, food_2 an open clam with a pearl.
 *  - text(ctx, s, x, y, color, {outline:'#rrggbb'}): one font pixel (= scale px) outline in all 8 directions behind the glyphs;
 *    it replaces the default drop shadow unless {shadow:true} is also given.
 *  - bgCanvas(levelIndex): opaque 256 x 208 canvas, cached: near-black dithered gradient + faint (alpha <= 0.12) theme
 *    silhouettes, hue per variant; theme(i).bg is now per variant too (row 0 of bgCanvas == theme(i).bg).
 *  - Tile art is toned per variant (lightness x, saturation x, hue shift: `t` / `at` on each variant) so sprites pop (G9).
 *  - Wave 3 (FIXPLAN2 + review findings): Springle redrawn as a slim S seahorse (thin tube snout stepping down, thin neck, pot belly,
 *    2 px lilac dorsal fin, long tail curling forward into a spiral; the bounce sinks the body 1 row and flattens the spiral); crabbit_throw / springle_squash /
 *    glimmer_fire have *_angry twins (palette swap + steam) so the angry cue never drops out in an action pose - Game.drawEnemy
 *    must select '<pose>_angry' while e.angry; players' eyes sit 1.5 px towards the facing side (mouth 1 px more); pu_shoes is
 *    a pair of swim fins (pocket + dark opening + strap, blade that only widens, scalloped tip); bolt is one hard Z; the Nibbler cog is
 *    steel blue (its own keys x / X, legs S); angry eye sockets #4a0818; K5 camouflage: volcanic seams are deep crimson / coral,
 *    R17 / R14 tile tones were pulled away from Pop / Glimmer / lantern colours, ship + temple silhouettes are lifted towards white.
 *  - Non-contract extras (tests only): GFX._registry(), GFX._lint(), GFX._timings().
 */
const GFX = (() => {
  // ===================================================================================================
  // 0. Constants and small helpers
  // ===================================================================================================
  const OL = '#1b1033';                      // universal dark outline (not pure black)
  const TILE = C.TILE;

  const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  const lintLog = [];
  const lint = (msg) => { if (lintLog.length < 200) lintLog.push(msg); };

  /** '#rgb' | '#rrggbb' | '#rrggbbaa' | [r,g,b,a] -> [r,g,b,a] */
  function parseColor(s) {
    if (Array.isArray(s)) return s;
    let h = String(s).replace('#', '');
    if (h.length === 3) h = h.split('').map((x) => x + x).join('');
    if (h.length === 6) h += 'ff';
    const n = parseInt(h, 16);
    return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
  }
  const prep = (pal) => {
    const out = {};
    for (const k of Object.keys(pal)) out[k] = parseColor(pal[k]);
    return out;
  };
  /** Grid literal: rows separated by newlines; all whitespace inside a row is ignored (so rows can be grouped in 4s). */
  const G = (s) => s.split('\n').map((r) => r.replace(/\s+/g, '')).filter((r) => r.length > 0);

  // ---- grid operations (all pure; grids are arrays of strings) ------------------------------------------
  const blank = (w, h) => Array.from({ length: h }, () => '.'.repeat(w));
  /** Stamp `top` onto `base` at (ox, oy); '.' in `top` leaves the base pixel alone. */
  function put(base, top, ox = 0, oy = 0) {
    const out = base.map((r) => r.split(''));
    top.forEach((row, j) => {
      const y = oy + j;
      if (y < 0 || y >= out.length) return;
      for (let i = 0; i < row.length; i++) {
        const x = ox + i;
        if (row[i] !== '.' && x >= 0 && x < out[y].length) out[y][x] = row[i];
      }
    });
    return out.map((r) => r.join(''));
  }
  /** Same as put() but the character `clear` in `top` erases the base pixel. */
  function putErase(base, top, ox, oy, clear = '-') {
    const out = base.map((r) => r.split(''));
    top.forEach((row, j) => {
      const y = oy + j;
      if (y < 0 || y >= out.length) return;
      for (let i = 0; i < row.length; i++) {
        const x = ox + i;
        if (row[i] === '.' || x < 0 || x >= out[y].length) continue;
        out[y][x] = row[i] === clear ? '.' : row[i];
      }
    });
    return out.map((r) => r.join(''));
  }
  /** Add a 1 px outline (char `ch`) in every transparent cell touching an opaque one. */
  function outlineGrid(grid, ch = 'o', diag = false, skip = '') {
    const h = grid.length, w = grid[0].length;
    const solid = (x, y) => x >= 0 && y >= 0 && x < w && y < h && grid[y][x] !== '.' && !skip.includes(grid[y][x]);
    return grid.map((row, y) => {
      let s = '';
      for (let x = 0; x < w; x++) {
        if (row[x] !== '.') { s += row[x]; continue; }
        const hit = solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1) ||
          (diag && (solid(x - 1, y - 1) || solid(x + 1, y - 1) || solid(x - 1, y + 1) || solid(x + 1, y + 1)));
        s += hit ? ch : '.';
      }
      return s;
    });
  }
  const rot90 = (grid) => {                                  // clockwise, square grids only
    const n = grid.length;
    return Array.from({ length: n }, (_, y) => Array.from({ length: n }, (_, x) => grid[n - 1 - x][y]).join(''));
  };
  const mirrorGrid = (grid) => grid.map((r) => r.split('').reverse().join(''));
  /** Shift a grid by (dx, dy), filling with transparent. */
  function shiftGrid(grid, dx, dy) {
    const h = grid.length, w = grid[0].length;
    return Array.from({ length: h }, (_, y) => {
      const sy = y - dy;
      if (sy < 0 || sy >= h) return '.'.repeat(w);
      let s = '';
      for (let x = 0; x < w; x++) { const sx = x - dx; s += sx < 0 || sx >= w ? '.' : grid[sy][sx]; }
      return s;
    });
  }
  /** Pad/crop a grid to w x h placing it at (ox, oy) of a transparent canvas. */
  const place = (grid, w, h, ox, oy) => put(blank(w, h), grid, ox, oy);
  /** Author a grid from stamps [y, x, 'chars'] (a row of characters pasted at column x of row y; later stamps win). */
  const stamp = (parts, w = 16, h = 16) => parts.reduce((g, [y, x, s]) => put(g, [s], x, y), blank(w, h));

  /** Rasterise a polyline of [x,y] points into a w x h grid of char `ch` (thickness in px, 1 = thin). */
  function polyline(w, h, pts, ch, thick = 1, base) {
    const g = (base || blank(w, h)).map((r) => r.split(''));
    const dot = (x, y) => { for (let j = 0; j < thick; j++) for (let i = 0; i < thick; i++) { const xx = x + i, yy = y + j; if (xx >= 0 && yy >= 0 && xx < w && yy < h) g[yy][xx] = ch; } };
    for (let k = 0; k + 1 < pts.length; k++) {
      const [x0, y0] = pts[k], [x1, y1] = pts[k + 1];
      const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
      for (let i = 0; i <= n; i++) dot(Math.round(x0 + ((x1 - x0) * i) / n), Math.round(y0 + ((y1 - y0) * i) / n));
    }
    return g.map((r) => r.join(''));
  }

  /**
   * Shaded ellipse w x h for big round masses (kraken head, pearls). Light from the top-left; bands
   * h (highlight) / l / m / d with a 2x2 ordered dither on the band borders. keys = 'hlmd' mapping.
   */
  function shadedEllipse(w, h, keys = 'hlmd', ditherAmt = 0.05, th = [0.8, 0.5, 0.12]) {
    const cx = (w - 1) / 2, cy = (h - 1) / 2, rx = w / 2, ry = h / 2;
    const L = [-0.52, -0.62, 0.6];
    const Ln = Math.hypot(L[0], L[1], L[2]);
    const bayer = [[0, 2], [3, 1]];
    const rows = [];
    for (let y = 0; y < h; y++) {
      let r = '';
      for (let x = 0; x < w; x++) {
        const nx = (x - cx) / rx, ny = (y - cy) / ry, d2 = nx * nx + ny * ny;
        if (d2 > 1) { r += '.'; continue; }
        const nz = Math.sqrt(1 - d2);
        let v = (nx * L[0] + ny * L[1] + nz * L[2]) / Ln;
        v += (bayer[y & 1][x & 1] / 4 - 0.375) * ditherAmt * 2;
        r += v > th[0] ? keys[0] : v > th[1] ? keys[1] : v > th[2] ? keys[2] : keys[3];
      }
      rows.push(r);
    }
    return rows;
  }

  // ---- rendering grids into canvases ---------------------------------------------------------------------
  /** Paint one grid into ImageData `d` (a strip `stride` px wide) at column offset `x0`. */
  function paintGrid(d, stride, x0, grid, w, h, P, name) {
    if (grid.length !== h) lint(`${name}: ${grid.length} rows, expected ${h}`);
    for (let y = 0; y < h; y++) {
      const row = grid[y] || '';
      if (row.length !== w) lint(`${name}: row ${y} has ${row.length} chars, expected ${w}`);
      for (let x = 0; x < w; x++) {
        const ch = row[x];
        if (ch === undefined || ch === '.') continue;
        const col = P[ch];
        if (!col) { lint(`${name}: unknown palette key '${ch}' at ${x},${y}`); continue; }
        const i = (y * stride + x0 + x) * 4;
        d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = col[3];
      }
    }
  }
  /** One canvas holding all frames side by side (a sprite atlas strip). */
  function renderStrip(grids, w, h, P, name) {
    const n = grids.length, cv = mk(w * n, h), img = new ImageData(w * n, h);
    grids.forEach((g, k) => paintGrid(img.data, w * n, k * w, g, w, h, P, name));
    cv.getContext('2d').putImageData(img, 0, 0);
    cv.__px = img.data;                                    // keep the pixels: deriving flips/silhouettes needs no readback
    return cv;
  }
  const render = (grid, w, h, P, name) => renderStrip([grid], w, h, P, name);

  // ---- sprite registry: one atlas strip per sprite (frames side by side) ------------------------------------
  const REG = Object.create(null);
  const ORDER = [];
  let initDone = false;

  /** Register a sprite from an atlas strip canvas (n frames, each w x h). */
  function addStrip(name, w, h, strip, n) {
    const lazyEntry = REG[name];
    if (lazyEntry && !lazyEntry.a) {                       // a lazily registered sprite being built now
      if (lazyEntry.w !== w || lazyEntry.h !== h || lazyEntry.n !== n) lint(`${name}: lazy size/frames mismatch`);
      lazyEntry.a = strip;
      return;
    }
    if (lazyEntry) lint(`duplicate sprite ${name}`);
    REG[name] = { w, h, n, a: strip, run: null, fl: null, wh: null, wf: null };
    ORDER.push(name);
  }
  /**
   * Register sprites that are built on first use (the boss family: only seen in round 30). `specs` =
   * [[name, w, h, frames], ...]; `fn` builds all of them (via sprite()/addSprite()) and runs once.
   * Sizes and frame counts are known up front, so has()/size()/frames() never trigger the build.
   */
  function lazyGroup(specs, fn) {
    let done = false;
    const run = () => { if (!done) { done = true; fn(); } };
    for (const [name, w, h, n] of specs) {
      REG[name] = { w, h, n, a: null, run, fl: null, wh: null, wf: null };
      ORDER.push(name);
    }
  }
  /** Register a sprite from separate frame canvases (packed into a strip). */
  function addSprite(name, w, h, cvs) {
    if (cvs.length === 1) { addStrip(name, w, h, cvs[0], 1); return; }
    const strip = mk(w * cvs.length, h), g = strip.getContext('2d');
    cvs.forEach((c, k) => g.drawImage(c, k * w, 0));
    addStrip(name, w, h, strip, cvs.length);
  }
  /**
   * Define a sprite from fill grids. `o.outline` (default true) adds the dark outline; `o.diag`
   * makes the outline 8-neighbour. Returns the finished grids so callers can derive other sprites.
   */
  function sprite(name, w, h, pal, grids, o = {}) {
    const fin = o.outline === false ? grids : grids.map((g) => outlineGrid(g, 'o', !!o.diag, o.skip || ''));
    spriteFinished(name, w, h, pal, fin);
    return fin;
  }
  /** Re-use finished grids with another palette (angry enemies, Pop). */
  function spriteFinished(name, w, h, pal, fin) {
    addStrip(name, w, h, renderStrip(fin, w, h, prep(Object.assign({ o: OL }, pal)), name), fin.length);
    return fin;
  }

  // ---- flipped / white variants (whole strips), lazily cached on first use -----------------------------------
  function derive(s, flip, white) {
    const w = s.w, h = s.h, n = s.n, W = w * n;
    let a = s.a.__px;
    if (!a) a = s.a.__px = s.a.getContext('2d').getImageData(0, 0, W, h).data;   // composed strips: read once, then cached
    const out = new ImageData(W, h), b = out.data;
    for (let y = 0; y < h; y++) {
      for (let k = 0; k < n; k++) {
        for (let x = 0; x < w; x++) {
          const si = (y * W + k * w + x) * 4, di = (y * W + k * w + (flip ? w - 1 - x : x)) * 4;
          if (white) { b[di] = 255; b[di + 1] = 255; b[di + 2] = 255; b[di + 3] = a[si + 3]; }
          else { b[di] = a[si]; b[di + 1] = a[si + 1]; b[di + 2] = a[si + 2]; b[di + 3] = a[si + 3]; }
        }
      }
    }
    const cv = mk(W, h);
    cv.getContext('2d').putImageData(out, 0, 0);
    return cv;
  }
  function variant(s, flip, white) {
    if (!s.a) s.run();
    if (!flip && !white) return s.a;
    if (white) return flip ? (s.wf || (s.wf = derive(s, true, true))) : (s.wh || (s.wh = derive(s, false, true)));
    return s.fl || (s.fl = derive(s, true, false));
  }

  // ===================================================================================================
  // 1. PLAYERS: Fizz (p1, pink) and Pop (p2, aqua/lavender), drawn in a 3/4 view FACING RIGHT.
  //    One set of grids, two palettes.  Keys: b body, l light, d shade, g/G/h frill (mid/dark/tip),
  //    c belly/cream (also eye glint), e eye, k blush, y star (stun only)
  //    Facing cues (G2): eyes and mouth sit on the front half of the face, the near-side (rear) gills are
  //    three full fronds while the far-side gills only peek out as two stubs, a flat paddle tail trails
  //    behind (wags while walking, raised in the jump), the belly and the near arm point forward.
  // ===================================================================================================
  const PAL_P1 = { b: '#ff8fc8', l: '#ffc9e6', d: '#e0609f', g: '#e8368a', G: '#a8206a', h: '#ffc9e6', c: '#fff3d6', e: '#2a1347', k: '#ff5f86', y: '#ffe36b' };
  const PAL_P2 = { b: '#74e6e8', l: '#c9fbf6', d: '#3ab5cb', g: '#9a7cf2', G: '#5b43bf', h: '#c9fbf6', c: '#f4f0ff', e: '#231a4d', k: '#b69cff', y: '#ffe36b' };

  // Each grid is 16 wide. Fill only: sprite() adds the outline. Frills (g/G/h) cast no outline of their own
  // (a frill sits next to the head without a dark seam, so the gills read as soft feathers).
  const pad16 = (rows) => rows.concat(blank(16, 16 - rows.length));
  const SKIP_FRILL = 'gGh';
  const P_HEAD = pad16(G(`
    ................
    ................
    .......llbb.....
    ......lllbbd....
    .....llbbbbbd...
    .....lbbbbbbd...
    .....lbbbbbbd...
    .....lbbbbbbd...
    .....bbbbbbdd...
    ......bbbbdd....
    ......oooooo....`));
  // near-side (rear) gills: three full fronds, tips (h) point away from the face
  const FROND_NEAR = G(`
    hg..
    .ggG
    ....
    hggg
    .ggG
    ....
    hg..
    .ggG`);
  // far-side gills: only the tips peek out behind the face
  const FROND_FAR = G(`
    .g.
    GG.
    ...
    .g.
    GG.`);
  const EYE_OPEN = G(`
    ce
    ee`);
  const EYE_BLINK = G(`
    ..
    ee`);
  const EYE_SQUINT = G(`
    ee
    ..`);
  const EYE_X = G(`
    e.e
    .e.
    e.e`);
  const EYE_SPIRAL_A = G(`
    eee
    ece
    eee`);
  const EYE_SPIRAL_B = G(`
    eee
    eec
    eee`);
  const M_SMILE = G(`
    G..G
    .GG.`);
  const M_O = G(`
    GG
    ee`);
  const M_PUCKER = G(`
    ..
    GG`);
  const M_WAVY = G(`
    G.G.
    .G.G`);

  // torso + feet + arms ---------------------------------------------------------------------------------
  const rowsAt = (rows, y0) => blank(16, y0).concat(rows).concat(blank(16, 16 - y0 - rows.length));
  const BODY_PARTS = {
    // rows 11..14 (4 rows each); torso columns 6..12, belly (c) on the front, near arm points forward
    stand: rowsAt(G(`
      ......lbbbccd...
      ......lbbbcccbb.
      .......bbbccd.d.
      ......bbd.bbd...`), 11),
    contact: rowsAt(G(`
      ......lbbbccd...
      ......lbbbcccbb.
      .......bbbccd.d.
      ......bbd...bbd.`), 11),
    passR: rowsAt(G(`
      ......lbbbccd...
      ......lbbbcccbb.
      .......bbbcc.bb.
      ......bbd.......`), 11),
    passL: rowsAt(G(`
      ......lbbbccd...
      ......lbbbcccbb.
      ......bb.bccd.d.
      ..........bbd...`), 11),
    tuck: rowsAt(G(`
      ......lbbbccd...
      ......lbbbcccbb.
      .......bbbccd.d.
      .......bbbbbd...`), 11),
    dangle: rowsAt(G(`
      ......lbbbccd...
      .....bbbbbcccbb.
      .......bbbccd...
      ......bd...bd...`), 11),
    flung: rowsAt(G(`
      ....b.lbbbccd.b.
      ....bblbbbcccbb.
      .......bbbccd...
      ......bbd.bbd...`), 11),
    shoot: rowsAt(G(`
      ......lbbbccd...
      ......lbbbcccbbb
      .......bbbccd...
      ......bbd.bbd...`), 11),
  };
  const TAIL = {          // rows 11..14, columns 0..5 (the root, columns 4-5 of rows 12-13, joins the torso): a paddle fin
    up: G(`
      lll...
      lllbbd
      .ddbbd
      ......`),
    mid: G(`
      ......
      .lllbd
      lbbbbd
      .ddd..`),
    down: G(`
      ......
      ....bd
      .lllbd
      lbdddd`),
  };

  /** Compose one player frame (fill grid; the outline is added by sprite()). */
  function playerFrame(o) {
    let g = blank(16, 16);
    g = put(g, o.body || BODY_PARTS.stand);
    g = put(g, o.tail || TAIL.up, 0, 11);
    let head = o.head || P_HEAD;
    const eyes = o.eyes || EYE_OPEN;
    const ey = o.eyeY === undefined ? 5 : o.eyeY;
    const ex = o.eyeX || [8, 11];                     // 3/4 turn: the pair sits on the leading half of the face
    head = put(head, eyes, ex[0], ey);
    head = put(head, eyes, ex[1], ey);
    if (o.cheeks) {                                   // puffed cheeks (shoot)
      head = put(head, G('b\nb\nb'), 4, 6);
      head = put(head, G('d\nd\nd'), 13, 6);
    }
    if (o.blush !== false) head = put(head, G('k'), 6, 7);
    head = put(head, o.mouth || M_SMILE, o.mouthX === undefined ? 9 : o.mouthX, 7);
    let fr = blank(16, 16);
    fr = put(fr, o.frond || FROND_NEAR, 0, 3);
    fr = put(fr, FROND_FAR, 13, 3);
    fr = shiftGrid(fr, 0, o.frondDy || 0);
    head = put(head, fr);
    if (o.extra) for (const [gr, x, y] of o.extra) head = put(head, gr, x, y);
    g = put(g, shiftGrid(head, 0, o.dy || 0));
    return g;
  }

  // ===================================================================================================
  // 2. BUBBLES (translucent: o outline, r rim, f fill, g inner glow, w shine) and special icons
  // ===================================================================================================
  /**
   * Filled ellipse w x h in concentric 1 px rings (4-neighbour erosion => classic round look), outermost first:
   * rings = 2: o, r, then fill f;   rings = 3: n (dark navy outer ring, G11), o, r, then fill f.
   */
  function disc(w, h, rings = 2) {
    const cx = (w - 1) / 2, cy = (h - 1) / 2, rx = w / 2, ry = h / 2;
    const inside = (x, y) => x >= 0 && y >= 0 && x < w && y < h && (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2) <= 1;
    const erode = (pred) => (x, y) => pred(x, y) && pred(x - 1, y) && pred(x + 1, y) && pred(x, y - 1) && pred(x, y + 1);
    const layers = [inside];
    for (let i = 0; i < rings; i++) layers.push(erode(layers[i]));
    const keys = rings === 3 ? 'nor' : 'or';
    const rows = [];
    for (let y = 0; y < h; y++) {
      let r = '';
      for (let x = 0; x < w; x++) {
        let ch = 'f';
        for (let i = 0; i <= rings; i++) if (!layers[i](x, y)) { ch = i === 0 ? '.' : keys[i - 1]; break; }
        r += ch;
      }
      rows.push(r);
    }
    return rows;
  }
  // shine for the 3-ring bubbles (16 x 16 frame): crescent top-left, soft glow bottom-right, both inside the rim
  const BUB_SHINE = stamp([[4, 5, 'www'], [5, 4, 'ww'], [6, 4, 'w'], [7, 4, 'w'], [10, 11, 'g'], [11, 10, 'gg'], [12, 9, 'ggg'], [13, 7, 'ggg'], [14, 5, 'gg']]);
  const BUB_SHINE_FLAT = stamp([[3, 4, 'www'], [4, 3, 'ww'], [5, 3, 'w'], [6, 3, 'w'], [11, 12, 'g'], [12, 11, 'gg'], [13, 9, 'ggg'], [14, 7, 'ggg']]);
  const BUB_PAL = { n: '#0b1030cc', o: '#1c4fa8d8', r: '#a6f1ff', f: '#5ad8ff52', g: '#c4f8ffb0', w: '#ffffff' };
  const bubbleBase = (w, h, shine = BUB_SHINE) => {
    const d = disc(w, h, 3);
    let g = place(d, 16, 16, (16 - w) >> 1, (16 - h) >> 1);
    if (shine) g = put(g, shiftGrid(shine, (w - 16) >> 1, (h - 16) >> 1));
    return g;
  };
  const NAVY = '#0b1030cc';
  const tint = (o, r, f, g) => ({ n: NAVY, o, r, f, g, w: '#ffffff' });

  // special icons, 8 x 10, drawn with their own dark outline
  const ICON_BOLT = G(`
    ....yyy.
    ...yyy..
    ..yyy...
    .yyyyyy.
    ....yyy.
    ...yyy..
    ..yyy...
    ..yy....
    .yy.....
    .y......`);
  const ICON_FLAME = G(`
    ...r....
    ...rr...
    ..rrrr..
    ..rorrr.
    .rrooorr
    .rooyyor
    rrooyyor
    rrooyyor
    .rooyyo.
    ..rooor.`);
  const ICON_DROP = G(`
    ....b...
    ...bb...
    ..bbbb..
    ..bwbbb.
    .bwbbbbd
    .bwbbbbd
    .bbbbbdd
    .bbbbbdd
    ..bbbdd.
    ...ddd..`);

  // pop animation: dashed ring bursting outwards (frame 0), droplets flying (1), glints fading (2).
  // Dots are placed on circles around the bubble centre (7.5, 7.5) at hand-picked radii/angles.
  function popFrame(radius, count, size, offsetDeg, ch, extra, skip) {
    const g = blank(16, 16).map((r) => r.split(''));
    const dot = (x, y, c) => { for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) { const xx = x + i, yy = y + j; if (xx >= 0 && yy >= 0 && xx < 16 && yy < 16) g[yy][xx] = c; } };
    for (let k = 0; k < count; k++) {
      if (skip && skip(k)) continue;
      const a = ((offsetDeg + (360 * k) / count) * Math.PI) / 180;
      dot(Math.round(7.5 - size / 2 + Math.cos(a) * radius), Math.round(7.5 - size / 2 + Math.sin(a) * radius), ch);
    }
    if (extra) extra(dot);
    return g.map((r) => r.join(''));
  }
  const POP = [
    // dashed ring: 8 arcs of two dots each, with a bright core flash
    popFrame(6.8, 24, 2, 7.5, 'r', (dot) => { dot(7, 7, 'w'); }, (k) => k % 3 === 2),
    popFrame(6.2, 8, 2, 22.5, 'r', (dot) => { dot(7, 7, 'w'); }),
    popFrame(7.2, 8, 1, 0, 'w', (dot) => { for (const a of [22.5, 112.5, 202.5, 292.5]) dot(Math.round(7.5 + Math.cos((a * Math.PI) / 180) * 4), Math.round(7.5 + Math.sin((a * Math.PI) / 180) * 4), 'r'); }),
  ];

  function buildBubbles() {
    const none = { outline: false };
    const wide = bubbleBase(16, 15), tall = bubbleBase(15, 16);
    sprite('bubble', 16, 16, BUB_PAL, [wide, tall], none);
    // about to pop: red, then hot yellow-white flicker
    addSprite('bubble_warn', 16, 16, [
      render(wide, 16, 16, prep(tint('#a8203cd8', '#ffb3a0', '#ff5a4a44', '#ffd0c890')), 'bubble_warn'),
      render(tall, 16, 16, prep(tint('#c85a10e0', '#fff2c8', '#ffd04a66', '#fff6d8a0')), 'bubble_warn'),
    ]);
    // shot: growing 8 -> 12 -> 15 px (small ones get a single glint pixel)
    const small = (n, glint) => put(place(disc(n, n, 3), 16, 16, (16 - n) >> 1, (16 - n) >> 1), glint, (16 - n) / 2 + 3, (16 - n) / 2 + 3);
    sprite('bubble_shot', 16, 16, BUB_PAL, [small(8, G('w')), small(12, G('ww\nw')), bubbleBase(15, 15)], none);
    // trap overlay: stage 0 aqua / 1 yellow / 2 red. 16 x 16 hugs the 12 x 12 trapped pose, so only two rings fit:
    // a dark navy outer ring (G11) and a bold stage-coloured rim; the fill is faint so the enemy shows through
    const full = put(disc(16, 16, 2), BUB_SHINE_FLAT);
    const overlay = (rim, fill, glint) => ({ o: NAVY, r: rim, f: fill, g: glint, w: '#ffffff' });
    addSprite('trap_overlay', 16, 16, [
      overlay('#8cecff', '#4ccaf624', '#d6fcff80'),
      overlay('#ffd83a', '#ffd83a2c', '#fff8c880'),
      overlay('#ff5646', '#ff3a3a36', '#ffc8c080'),
    ].map((pal) => render(full, 16, 16, prep(pal), 'trap_overlay')));
    // special bubbles: tinted bubble + a 8x10 icon with its own dark outline, 2 wobble/pulse frames
    const specials = [
      ['thunder', tint('#9a6a00e0', '#fff27a', '#ffe04046', '#fffbd090'), ICON_BOLT, '#7a4a00',
        [{ y: '#ffe23a' }, { y: '#ffffff' }]],
      ['fire', tint('#a02a10e0', '#ffb066', '#ff5a2a46', '#ffe0c090'), ICON_FLAME, '#7a1a08',
        [{ r: '#ff4020', o: '#ff9a20', y: '#ffe860' }, { r: '#ff6a30', o: '#ffc040', y: '#fffbc0' }]],
      ['water', tint('#14459ae0', '#9ad0ff', '#2a7aff56', '#d0eaff90'), ICON_DROP, '#0b2a6a',
        [{ b: '#3d8cff', d: '#1f5ad0', w: '#e6f4ff' }, { b: '#6aa8ff', d: '#2f6ae0', w: '#ffffff' }]],
    ];
    for (const [nm, pal, icon, iconOutline, iconCols] of specials) {
      const iconGrid = outlineGrid(place(icon, 10, 12, 1, 1), 'o');
      const cvs = [wide, tall].map((base, i) => {
        const bubble = render(base, 16, 16, prep(pal), 'bubble_' + nm);
        const ic = render(iconGrid, 10, 12, prep(Object.assign({ o: iconOutline }, iconCols[i])), 'icon_' + nm);
        bubble.getContext('2d').drawImage(ic, 3, 2 + i);     // icon bobs 1 px with the wobble
        return bubble;
      });
      addSprite('bubble_' + nm, 16, 16, cvs);
    }
    // letter bubble: vivid, nearly opaque so a white glyph reads on top
    addSprite('bubble_letter', 16, 16, [
      render(wide, 16, 16, prep(tint('#4a1a9ae8', '#ffe36b', '#8a3cf0d4', '#c9a0ffa0')), 'bubble_letter'),
      render(tall, 16, 16, prep(tint('#4a1a9ae8', '#fff6b0', '#a050ffdc', '#e0c8ffb0')), 'bubble_letter'),
    ]);
    sprite('bubble_pop', 16, 16, { r: '#a6f1ff', w: '#ffffff' }, POP, none);
  }

  // ===================================================================================================
  // 3. PROJECTILES AND EFFECTS (8x8 unless noted)
  // ===================================================================================================
  const wrapShift = (grid, dx, dy = 0) => {                 // cyclic shift (for flowing water)
    const h = grid.length, w = grid[0].length;
    return Array.from({ length: h }, (_, y) => {
      const sy = (((y - dy) % h) + h) % h;
      return Array.from({ length: w }, (_, x) => grid[sy][(((x - dx) % w) + w) % w]).join('');
    });
  };

  const PEBBLE = G(`
    ........
    ..llgg..
    .llgggd.
    .lggdgd.
    .gggddd.
    ..gddd..
    ........
    ........`);
  const SPARK = [
    G(`
      ........
      ...gg...
      ..gyyg..
      .gywwyg.
      .gywwyg.
      ..gyyg..
      ...gg...
      ........`),
    G(`
      ...gg...
      ...yy...
      .gyywyyg
      .yywwwyy
      .gyywyyg
      ...yy...
      ...gg...
      ........`),
  ];
  // Boss ink (wave 2 integration): a bright lilac ring around a vivid violet core, so the fan reads on the near-black arena AND on the
  // purple Kraken body (the old all-dark blob vanished right after being fired -- FIXPLAN M24 is about dodging it).
  const INK = [
    G(`
      ........
      ..oooo..
      .ohdddo.
      .oddddo.
      .oddddo.
      .odddoo.
      ..oooo..
      ........`),
    G(`
      ...oo...
      ..oooo..
      .ohdddo.
      .oddddo.
      ..odddo.
      ..oddo..
      ...oo...
      ........`),
  ];
  /** Lightning segment: ONE hard Z (3 px stroke = 2 yellow rows around a 1 px white-hot core); sprite() adds the dark outline (8-neighbour).
   *  Frame B mirrors it vertically (the shimmer); the two afterimages the game draws trail it. */
  const boltFrame = (pts) => {
    const yellow = polyline(16, 8, pts.map(([x, y]) => [x, y - 1]), 'y', 3);
    return polyline(16, 8, pts, 'w', 1, yellow);
  };
  const BOLT = [
    boltFrame([[0, 2], [6, 2], [3, 5], [15, 5]]),
    boltFrame([[0, 5], [6, 5], [3, 2], [15, 2]]),
  ];
  const FIRE_DROP = [
    G(`
      ...r....
      ...ro...
      ..rroo..
      ..roooy.
      .rooyyo.
      .rooyyo.
      ..royo..
      ...rr...`),
    G(`
      ....r...
      ...rr...
      ..rrro..
      .rroooy.
      .rooyyo.
      .rooyyo.
      ..roooy.
      ...rr...`),
  ];
  const FLAME = [
    G(`
      ....r...
      ....rr..
      ...rrr..
      ...rorr.
      ..rroor.
      ..roooro
      .rrooyor
      .rooyyor
      .rooyyor
      .rooywor
      .rooywor
      .rooyyor
      rrooyyoo
      rooyyyoo
      rooyyyoo
      .rooyooo`),
    G(`
      ........
      ...r....
      ...rr...
      ..rrro..
      ..rorro.
      .rroooor
      .rooooor
      .rooyyor
      rrooyyor
      rooyyyoo
      rooywyoo
      rooywyoo
      rooyyyoo
      rooyyyoo
      rooyyyoo
      .rooyooo`),
    G(`
      .....r..
      ....rr..
      ....rrr.
      ...rorr.
      ..rroor.
      .rroooor
      .rooooyr
      .rooyyor
      .rooyyor
      rrooywor
      rooywyoo
      rooywyoo
      rooyyyoo
      rooyyyoo
      rooyyyoo
      .rooyooo`),
  ];
  const WATER_FLOW = G(`
    ........
    ........
    .ww..ww.
    wbbwwbbw
    bbbbbbbb
    bdbbdbbb
    dddddddd
    ........`);
  const WATER_FALL = G(`
    ..wbbd..
    .wbbbbd.
    .wbwbbd.
    .bbbbdd.
    .bbbwbd.
    .wbbbbd.
    .bbbbbd.
    ..bbdd..`);
  const WATER_FALL2 = G(`
    ..bbbd..
    .wbbbbd.
    .bbbwbd.
    .bwbbdd.
    .bbbbbd.
    .bbwbbd.
    .wbbbbd.
    ..bbdd..`);
  const SPARKLE = [
    G(`
      ........
      ........
      ........
      ...yy...
      ...yy...
      ........
      ........
      ........`),
    G(`
      ........
      ...y....
      ...y....
      .yywyy..
      ...y....
      ...y....
      ........
      ........`),
    G(`
      ...y....
      ...y....
      ..ywy...
      yywwwyy.
      ..ywy...
      ...y....
      ...y....
      ........`),
    G(`
      ........
      ........
      ...y....
      ..ywy...
      ...y....
      ........
      ........
      ........`),
  ];
  const POOF = [
    G(`
      ................
      ................
      ................
      ................
      .......ww.......
      ......wwlw......
      .....wwllw.ww...
      ..ww..wlld.wlw..
      .wwlw..ddd.wld..
      .wlld......dd...
      ..ddd...........
      ................
      ................
      ................
      ................
      ................`),
    G(`
      ................
      ................
      .....wwww.......
      ....wwwllw..ww..
      ...wwwlllw.wllw.
      ..wwwllldd.wldd.
      ..wwlllldd..dd..
      ..wllllddd......
      ...wlllddd..ww..
      ....ddddd..wlw..
      ..ww..dd...wdd..
      .wlw............
      ..dd............
      ................
      ................
      ................`),
    G(`
      ................
      ..ww............
      .wllw.......ww..
      .wldd......wllw.
      ..dd........ldd.
      ................
      ......w.........
      .....wlw........
      ......dd........
      ................
      ..........ww....
      .........wllw...
      ..ww.....wldd...
      .wllw.....dd....
      .wldd...........
      ..dd............`),
  ];

  function buildEffects() {
    const rot = (g) => [g, rot90(g)];
    sprite('pebble', 8, 8, { l: '#d8cfe2', g: '#a39ab8', d: '#6c6284' }, rot(PEBBLE));
    sprite('spark', 8, 8, { g: '#ffd24a60', y: '#ffe36b', w: '#ffffff' }, SPARK, { outline: false });
    sprite('ink', 8, 8, { o: '#d7b4ff', d: '#7a30e0', h: '#ffffff' }, INK);
    sprite('bolt', 16, 8, { y: '#ffe23a', w: '#ffffff' }, BOLT, { diag: true });
    sprite('fire_drop', 8, 8, { r: '#ff3a1a', o: '#ff9a20', y: '#ffe860' }, FIRE_DROP, { outline: false });
    sprite('flame', 8, 16, { r: '#ff3a1a', o: '#ff9a20', y: '#ffe860', w: '#fffbd0' }, FLAME, { outline: false });
    sprite('water_flow', 8, 8, { w: '#e6f6ff', b: '#3d8cff', d: '#1f5ad0' }, [WATER_FLOW, wrapShift(WATER_FLOW, 4)], { outline: false });
    sprite('water_fall', 8, 8, { w: '#e6f6ff', b: '#3d8cff', d: '#1f5ad0' }, [WATER_FALL, WATER_FALL2], { outline: false });
    sprite('sparkle', 8, 8, { y: '#fff27a', w: '#ffffff' }, SPARKLE, { outline: false });
    sprite('poof', 16, 16, { w: '#ffffff', l: '#e2dcf8', d: '#a79ed0' }, POOF, { outline: false });
  }

  // ===================================================================================================
  // 4. ENEMIES.  Each has 4 move frames, a hand-drawn trapped pose (2 frames, 12x12 centred in 16x16),
  //    a die pose (rotated x4) and action poses. "Angry" = the same finished grids in a crimson palette (G4),
  //    plus two steam puffs above the head that rise in alternating phases (a cue that does not rely on hue).
  //    Eye keys: w sclera, e pupil, c glint, V lid / v brow (white / skin colour when calm, dark when angry).
  // ===================================================================================================
  /** Shared angry body ramp (crimson / orange-red, dark shading) - every *_ANGRY palette extends it. */
  const ANGRY_BODY = { m: '#e0201c', l: '#ff6a3a', d: '#7a0c18', c: '#ffb48a' };
  /** Angry eyes: dark sockets with glowing yellow pupils. */
  const ANGRY_EYES = { w: '#4a0818', W: '#4a0818', e: '#ffe23a', E: '#ffe23a', c: '#ffffff', g: '#4a0818', V: '#4a0818', v: '#4a0818' };
  const STEAM_PAL = { z: '#ffffff' };
  const STEAM = [G('.zz\nzzz'), G('.z.\nzzz'), G('z.z\n.z.'), G('z..\n..z')];
  /**
   * Steam for angry sprites: one puff per anchor [x, y] (y = base row of the freshest puff), two frames out of phase,
   * each puff grows, rises one row per phase and breaks up. A dark ring keeps white puffs readable on pale tiles.
   */
  function addSteam(grids, anchors) {
    return grids.map((g, k) => {
      let layer = blank(16, 16);
      anchors.forEach(([x, y], i) => { const ph = (k + 2 * i) % 4; layer = put(layer, STEAM[ph], x, y - ph); });
      const ring = outlineGrid(layer, 'o').map((r, y) => r.split('').map((ch, x) => (ch === 'o' && g[y][x] === '.' ? 'o' : '.')).join(''));
      return put(put(g, ring), layer);
    });
  }

  // ---- Nibbler: clockwork fish on little legs; a small cog spins on its flank -------------------------------------
  // the flank cog is dark steel (x rim, X body, k hub): a pale disc with a dark centre read as a second eye. S = the legs (pale steel, same as the eye glint).
  const NIB_PAL = { m: '#f4c23a', l: '#ffe58a', d: '#c98a1c', t: '#e4602a', s: '#eef2fb', S: '#eef2fb', x: '#7d8cc8', X: '#5a6cb8', k: '#2a1347', w: '#ffffff', e: '#2a1347', g: '#eef2fb', c: '#ffffff', v: '#f4c23a', V: '#ffffff' };
  const NIB_ANGRY = Object.assign({}, NIB_PAL, ANGRY_BODY, ANGRY_EYES, STEAM_PAL, { t: '#ff9a2a', s: '#ffd6cf', S: '#ffd6cf', x: '#ffd6cf', X: '#b8607a', k: '#4a0818' });
  const NIB_COG = [
    G(`
      ..x..
      .xXx.
      xXkXx
      .xXx.
      ..x..`),
    G(`
      x...x
      .XXX.
      .XkX.
      .XXX.
      x...x`),
  ];
  const NIB_BODY = stamp([
    [4, 5, 'lllmmmmm'],
    [5, 4, 'llmmmvVVvm'],
    [6, 3, 'llmmmmwgewmd'],
    [7, 3, 'lmmmmmweewmd'],
    [8, 3, 'lmmmmmmwwmmd'],
    [9, 3, 'lmmmmmmmmmkk'],
    [10, 4, 'lmmmmmmmmd'],
    [11, 5, 'mddddddd'],
  ]);
  const NIB_TAIL = G(`
    t...
    tt..
    ttt.
    .tt.
    ttt.
    tt..
    t...`);
  const NIB_LEGS = {
    stand: G(`
      .... .SS. .SS. ....
      .... .SS. .SS. ....
      .... SSS. .SSS ....`),
    leftUp: G(`
      .... .... .SS. ....
      .... .... .SS. ....
      .... .... .SSS ....`),
    rightUp: G(`
      .... .SS. .... ....
      .... .SS. .... ....
      .... SSS. .... ....`),
  };
  function nibFrame(cog, legs, tailDy) {
    let g = put(blank(16, 16), NIB_BODY);
    g = put(g, NIB_TAIL, 0, 4 + tailDy);
    g = put(g, NIB_COG[cog], 4, 6);
    g = put(g, legs, 0, 12);
    return g;
  }

  // ---- Crabbit: crab with raised open pincers and V-shaped eye stalks (left half hand-drawn, mirrored) ---------------
  const sym = (half) => half.map((r) => r + r.split('').reverse().join(''));
  const CRAB_PAL = { m: '#e8782a', l: '#ffb468', d: '#9a4018', c: '#bfe0f4', s: '#ffe3c0', w: '#ffffff', e: '#2a1347', V: '#ffffff', k: '#2a1347', g: '#a39ab8' };
  const CRAB_ANGRY = Object.assign({}, CRAB_PAL, ANGRY_BODY, ANGRY_EYES, STEAM_PAL, { c: '#ffdcd0', s: '#ffdcd0', k: '#4a0818', g: '#a39ab8' });
  /** Left half of the crab (8 columns). o: {legs:'A'|'B'|'hop', shut, mouth} */
  function crabHalf(o = {}) {
    const parts = [
      [0, 4, 'V'], [1, 3, 'wew'], [2, 4, 'w'],                 // round eye ball on its stalk
      [3, 4, 's'], [4, 5, 's'], [5, 5, 's'], [6, 6, 's'],      // stalk: the two stalks form a V
      [7, 4, 'lmmm'], [8, 3, 'llmmm'], [9, 3, 'lmmmm'], [10, 3, 'lmmmm'],
      [11, 3, 'dcccc'], [12, 4, 'dccc'],
      // pincer: fixed finger + moving finger with a clear gap, palm, forearm joining the carapace
      [3, 0, 'l..l'], [4, 0, 'l..l'], [5, 0, o.shut ? 'llll' : 'l..l'], [6, 0, 'llll'], [7, 1, 'lll'], [8, 2, 'lm'],
      [9, 6, 'k'], [10, 7, 'k'],                               // smile
    ];
    if (o.mouth) parts.push([9, 7, 'k'], [10, 6, 'k']);
    const legs = { A: [[13, '..d.d.d.'], [14, '..d.d.d.']], B: [[13, '...d.d.d'], [14, '..dd.dd.']], hop: [[13, '...d.d..']] }[o.legs || 'A'];
    for (const [y, s2] of legs) parts.push([y, 0, s2]);
    return stamp(parts, 8, 16);
  }
  const crabFrame = (o) => sym(crabHalf(o));

  // ---- Jellop: jellyfish, diagonal flyer (dome half-grid mirrored, tentacles swayed per frame) --------------
  const JELLY_PAL = { m: '#b66cf2', l: '#ecd2ff', d: '#7a3fc0', w: '#ffffff', e: '#2a1347', t: '#ff9ad8', T: '#d85aa8', v: '#b66cf2' };
  const JELLY_ANGRY = Object.assign({}, JELLY_PAL, ANGRY_BODY, ANGRY_EYES, STEAM_PAL, { t: '#ffb040', T: '#e06020' });
  const JELLY_HALF = G(`
    ........
    .....lll
    ....llmm
    ...lmmmm
    ..llmvvm
    ..lmmwem
    ..lmmeem
    ..lmmmme
    ..dddddd`);
  const JELLY_SKIP = 'tT';
  function jellyFrame(phase, dy, len = 6) {
    let g = put(blank(16, 16), sym(JELLY_HALF), 0, dy);
    [3, 6, 9, 12].forEach((bx, k) => {
      for (let i = 0; i < len; i++) {
        const y = 9 + dy + i;
        if (y > 15) break;
        // neighbouring strands sway in opposite phase; the sway grows towards the tip
        const x = bx + Math.round(Math.sin(phase + i * 0.9 + (k % 2) * Math.PI) * Math.min(1, i / 2));
        g = put(g, [i >= len - 2 ? 'T' : (i % 2 ? 'T' : 't')], x, y);
      }
    });
    return g;
  }

  // ---- Springle: SEAHORSE.  A slim S: lilac crown, round head with a thin tube snout that steps down two rows, a thin neck
  //      (concave throat and back), a pot belly (one curved cream patch + a dark ridge below it), a 2 px lilac dorsal fin on the
  //      back and a long tail that curls forward into a spiral (~40 % of the height, like the real animal).  The bounce sinks the
  //      whole body one row and flattens the spiral (6 -> 5 rows, drawn by hand), so every pose still reads as a seahorse - the
  //      squash pose is deliberately the sunk pose.
  //      Authored with stamp(): [y, x, 'chars'] rows pasted onto a blank 16 x 16 (row budget: crown 0, head 1-4, neck 5,
  //      belly 6-8, spiral tail 9-14; the outline needs row 15).
  const SPRING_PAL = { m: '#8ad63a', l: '#c4ee6a', d: '#4a9a2a', c: '#f6ffd2', p: '#d6b8ff', P: '#8e66e6', s: '#e4ecfa', S: '#8d9bbd', e: '#2a1347', v: '#8ad63a' };
  const SPRING_ANGRY = Object.assign({}, SPRING_PAL, ANGRY_BODY, ANGRY_EYES, STEAM_PAL, { p: '#ff8a5a', P: '#6a0c14', s: '#ffffff', S: '#a05060' });
  const SPRING_BODY = [          // rows 0-8: crown, head, snout (leaves at row 3, one row thick, steps down two rows to its tip), neck, belly
    [0, 5, 'pPp'],                 // crown
    [1, 3, 'pllvvm'],              // (v = angry brow)
    [2, 2, 'pPllcemm'],            // eye: highlight + pupil
    [3, 2, 'PPlleemmmm'],          // tube snout ...
    [4, 3, 'plmmmd'], [4, 11, 'mm'],
    [5, 4, 'lmmd'], [5, 12, 'mm'], // thin neck (the back is concave between the head and the fin) ... and the snout tip
    [6, 4, 'lmmcd'],
    [7, 4, 'lmmmcccd'],           // one curved cream patch ...
    [8, 4, 'lmmmccdd'],           // ... and a single dark ridge below it
  ];
  const SPRING_FIN = [           // dorsal fin on the back, 2 px wide, two poses for the ripple
    [[6, 3, 'p'], [7, 1, 'pPP'], [8, 1, 'pPP'], [9, 3, 'P']],
    [[7, 2, 'pP'], [8, 1, 'pPP'], [9, 2, 'PP']],
  ];
  const SPRING_TAIL = [          // the spiral: down the back, round the bottom and curling forward; absolute rows, x of the first char
    [[9, 4, 'lmmmm'], [10, 4, 'mmm'], [10, 8, 'mmm'], [11, 4, 'mm'], [11, 9, 'mmm'], [12, 5, 'mm'], [12, 10, 'mmd'], [13, 5, 'mmm'], [13, 9, 'mmmd'], [14, 6, 'mmmmd']],   // tall (6 rows)
    [[10, 4, 'lmmmm'], [11, 4, 'mmm'], [11, 8, 'mmm'], [12, 5, 'mm'], [12, 10, 'mmd'], [13, 5, 'mmm'], [13, 9, 'mmmd'], [14, 6, 'mmmmd']],                                // sunk by 1 (5 rows)
  ];
  /** dy = 0 tall | 1 sunk (the whole body sits one row lower, the spiral loses a row); fin = 0 | 1.  springle_squash = the sunk pose with the fin flicked. */
  function springFrame(dy, fin = 0) {
    return put(shiftGrid(stamp(SPRING_BODY.concat(SPRING_FIN[fin])), 0, dy), stamp(SPRING_TAIL[dy]));
  }

  // ---- Glimmer: anglerfish with a glowing lantern, hovering flyer -----------------------------------------
  const GLIM_PAL = { c: '#cfe4ff', m: '#2f58d8', l: '#78a0ff', d: '#1a2f94', t: '#a070f4', y: '#ffe36b', w: '#ffffff', W: '#ffffff', E: '#3a0f40', e: '#3a0f40', K: '#3a0f40', k: '#1a2f94', V: '#ffffff', g: '#ffe36b66' };
  const GLIM_ANGRY = Object.assign({}, GLIM_PAL, ANGRY_BODY, ANGRY_EYES, STEAM_PAL, { t: '#ff9a2a', y: '#fff27a', k: '#7a0c18', g: '#ff905066', w: '#ffffff', K: '#4a0818' });
  const GLIM_BODY = G(`
    .... .... .... ....
    .... .... .... .yy.
    .... .... ...y wwy.
    .... .... ..ky wwy.
    .... .... .k.. yy..
    .... tt.. k... ....
    .... .lll mmm. ....
    ...l llmm mVVm m...
    ..ll lmmm WcEW md..
    ..lm mmmm mWWm md..
    ..lm mmmm mmwK wKw.
    ..lm mttm mmKK KKK.
    ...m mttm mmKw KwK.
    .... dddd dddd ....
    .... ..dd ddd. ....
    .... .... .... ....`);
  const GLIM_TAIL = G(`
    t.
    tt
    tt
    .t
    tt
    tt
    t.`);
  function glimFrame(o) {
    let g = put(blank(16, 16), GLIM_BODY);
    g = put(g, shiftGrid(GLIM_TAIL.concat(blank(2, 0)), 0, 0), 0, 7 + (o.tail || 0));
    if (o.lanternDy) g = put(putErase(g, G('----\n----\n----\n----'), 11, 1), GLIM_ORB, 11, 1 + o.lanternDy);
    if (o.lantern) g = put(g, o.lantern, 11, 1);
    if (o.mouth) for (const [y, row] of o.mouth) g = put(g, G(row), 0, y);
    return shiftGrid(g, 0, o.dy || 0);
  }
  const GLIM_ORB = G(`
    .yy.
    ywwy
    ywwy
    .yy.`);
  const GLIM_BITE = [[10, '..lm mmmm mmwK wKw.'], [11, '..lm mttm mmKw KwK.']];   // jaws closed on the teeth rows
  const GLIM_LANTERN_BRIGHT = G(`
    .yy.
    ywwy
    ywwy
    .yy.`);

  // ---- Bonefin: skeletal ghost fish (HURRY UP chaser) --------------------------------------------------
  const BONE_PAL = { b: '#f4f6ff', s: '#aab4e4', e: '#1b1033', g: '#69ffd2', w: '#ffffff', a: '#c9d2ff55' };
  const BONE_A = G(`
    .... .... .... ....
    .... .... .... ....
    .... .... .... ....
    .... .... .bbb bb..
    .b.b .b.. bbbb bbs.
    bb.b .b.. bbee ebs.
    .bsb sbsb bbeg ebs.
    bb.b .b.. bbee ebs.
    b..b .b.. bebe bes.
    .... b.b. .bbb bbs.
    .... .... ..ss ss..
    .... .... .... ....
    .... .... .... ....
    .... .... .... ....
    .... .... .... ....
    .... .... .... ....`);
  /** Second frame: the spine/ribs/tail half (columns 0-7) sinks one row, the skull stays: a swimming wiggle. */
  const boneWiggle = (g) => {
    const left = shiftGrid(g.map((r) => r.slice(0, 8) + '.'.repeat(8)), 0, 1).map((r) => r.slice(0, 8));
    return g.map((r, y) => left[y] + r.slice(8));
  };

  // ---- trapped poses: 12 x 12 fill (centred in 16 x 16), panicked faces, 2 frames each --------------------
  const TRAP = {
    nibbler: sym(G(`
      .....s
      ....sS
      ..lllm
      .llmmm
      lwwwmm
      lwewmm
      lwwwmm
      lmmmkk
      .mmmkk
      .ddddd
      ..S.SS
      .SS.S.`)),
    nibbler2: sym(G(`
      .....s
      ...sSS
      ..lllm
      .llmmm
      lwwwmm
      lwewmm
      lwwwmm
      lmmmkk
      .mmmkk
      .ddddd
      .S..SS
      SS..S.`)),
    crabbit: sym(G(`
      .www..
      .wwe..
      .www..
      ..s...
      l.l.s.
      l.l..s
      lll...
      .llmmm
      .lmmmm
      .lmmkk
      .dcccc
      .d.d.d`)),
    crabbit2: sym(G(`
      .www..
      .wwe..
      .www..
      ..s...
      l.l.s.
      lll..s
      lll...
      .llmmm
      .lmmmm
      .lmmkk
      .dcccc
      d.d.d.`)),
    jellop: sym(G(`
      ....ll
      ..llmm
      .lmmmm
      .lwwwm
      lmwewm
      lmwwwm
      lmmmee
      .dmmee
      .ddddd
      ..t.t.
      .t.t.t
      ..t.t.`)),
    jellop2: sym(G(`
      ....ll
      ..llmm
      .lmmmm
      .lwwwm
      lmwewm
      lmwwwm
      lmmmee
      .dmmee
      .ddddd
      .t.t.t
      ..t.t.
      .t.t.t`)),
  };
  const TRAP_SPRING = [      // 12 x 12: the seahorse squeezed into the bubble, wide eyed (same parts as the 16 x 16 one)
    G(`
      ...pPp......
      ..pllmm.....
      .pPlceemm...
      .PPleeemmmm.
      ..plmmmd.mm.
      ...lmmd...m.
      .pPlmmcd....
      .pPlmmccd...
      ..Plmmmm....
      ...mmm.mmm..
      ....mm..mmd.
      ....mmmmmd..`),
    G(`
      ...pPp......
      ..pllmm.....
      .pPleecmm...
      .PPleeemmmm.
      ..plmmmd.mm.
      ...lmmd...m.
      ..pPlmmcd...
      .pPPlmmccd..
      ..PPlmmmm...
      ...mmm.mmm..
      ....mm..mmd.
      ....mmmmmd..`),
  ];
  const TRAP_GLIM = [
    G(`
      ........yy..
      .......ywwy.
      ......kywwy.
      .....k..yy..
      ..lllmmm....
      .llmmwwwm...
      tlmmmwewm...
      tlmmmwwwm...
      .lmmmmmmeee.
      .mmmmmmewew.
      ..dddddeee..
      ...ddd......`),
    G(`
      ........yy..
      .......ywwy.
      ......kywwy.
      .....k..yy..
      ..lllmmm....
      .llmmwwwm...
      .lmmmwewm...
      tlmmmwwwm...
      tlmmmmmmeee.
      .mmmmmmewew.
      ..dddddeee..
      ...ddd......`),
  ];
  const trap16 = (g12) => place(g12, 16, 16, 2, 2);
  const trapFrames = (a, b) => [trap16(a), trap16(b)];

  function buildEnemies() {
    // --- nibbler
    const nibMove = [
      nibFrame(0, NIB_LEGS.leftUp, 0),
      nibFrame(1, NIB_LEGS.stand, -1),
      nibFrame(0, NIB_LEGS.rightUp, 0),
      nibFrame(1, NIB_LEGS.stand, 1),
    ];
    spriteFinishedAndRegister('nibbler', NIB_PAL, NIB_ANGRY, nibMove, { steam: [[2, 3], [13, 3]] });
    sprite('nibbler_trapped', 16, 16, NIB_PAL, trapFrames(TRAP.nibbler, TRAP.nibbler2));
    dieSprite('nibbler', NIB_PAL, nibMove[1], [[9, 6, G('ewe\nwew\newe')]]);
    // --- crabbit
    const crabMove = [
      crabFrame({ legs: 'A' }),
      crabFrame({ legs: 'B', shut: true }),
      crabFrame({ legs: 'hop', shut: true }),
      crabFrame({ legs: 'B' }),
    ];
    spriteFinishedAndRegister('crabbit', CRAB_PAL, CRAB_ANGRY, crabMove, { steam: [[1, 2], [13, 2]] });
    sprite('crabbit_trapped', 16, 16, CRAB_PAL, trapFrames(TRAP.crabbit, TRAP.crabbit2));
    dieSprite('crabbit', CRAB_PAL, crabMove[0], [[3, 0, G('eee\neee')], [10, 0, G('eee\neee')]]);
    // throw: the near (right) claw closes on a pebble and lifts it
    let crabThrow = crabFrame({ legs: 'A', mouth: true });
    crabThrow = put(put(crabThrow, G('llll\nllll'), 12, 4), G('gg\ngg'), 13, 2);
    const crabThrowFin = sprite('crabbit_throw', 16, 16, CRAB_PAL, [crabThrow]);
    spriteFinished('crabbit_throw_angry', 16, 16, CRAB_ANGRY, addSteam(crabThrowFin, [[1, 2], [7, 1]]));   // the throw must not drop the angry cue
    // --- jellop
    const jelly = [jellyFrame(0, 0), jellyFrame(1.6, 1, 5), jellyFrame(3.2, 0), jellyFrame(4.8, 1, 5)];
    spriteFinishedAndRegister('jellop', JELLY_PAL, JELLY_ANGRY, jelly, { skip: JELLY_SKIP, steam: [[1, 2], [13, 2]] });
    sprite('jellop_trapped', 16, 16, JELLY_PAL, trapFrames(TRAP.jellop, TRAP.jellop2), { skip: JELLY_SKIP });
    dieSprite('jellop', JELLY_PAL, jelly[0], [[5, 5, G('mm\nee')], [9, 5, G('mm\nee')]], JELLY_SKIP);
    // --- springle
    const spring = [springFrame(0, 0), springFrame(0, 1), springFrame(1, 0), springFrame(1, 1)];
    spriteFinishedAndRegister('springle', SPRING_PAL, SPRING_ANGRY, spring, { steam: [[11, 1], [13, 3]] });
    const sqFin = sprite('springle_squash', 16, 16, SPRING_PAL, [springFrame(1, 1)]);
    spriteFinished('springle_squash_angry', 16, 16, SPRING_ANGRY, addSteam(sqFin, [[11, 2], [13, 4]]));
    sprite('springle_trapped', 16, 16, SPRING_PAL, TRAP_SPRING.map(trap16));
    dieSprite('springle', SPRING_PAL, spring[0], [[6, 2, G('ece\ncec')]]);
    // --- glimmer
    const glim = [glimFrame({}), glimFrame({ tail: 1, lanternDy: 1 }), glimFrame({ tail: 0, mouth: GLIM_BITE }), glimFrame({ tail: -1, lanternDy: 1 })];
    spriteFinishedAndRegister('glimmer', GLIM_PAL, GLIM_ANGRY, glim, { skip: 'kg', steam: [[2, 4], [7, 4]] });
    sprite('glimmer_trapped', 16, 16, GLIM_PAL, TRAP_GLIM.map(trap16), { skip: 'kg' });
    dieSprite('glimmer', GLIM_PAL, glim[0], [[8, 8, G('ewwe\nweew\newwe')]], 'kg');
    const glimFireFin = sprite('glimmer_fire', 16, 16, GLIM_PAL, [glimFrame({ lantern: GLIM_LANTERN_BRIGHT, mouth: [[11, '..lm mttm mmKK KKK.']] })], { skip: 'kg' });
    spriteFinished('glimmer_fire_angry', 16, 16, GLIM_ANGRY, addSteam(glimFireFin, [[2, 4], [7, 4]]));
    // --- bonefin
    sprite('bonefin', 16, 16, BONE_PAL, [BONE_A, boneWiggle(BONE_A)]);
  }
  /** <name>_die: the move pose with dizzy/closed eyes (patches [x, y, grid]) rotated 0/90/180/270 degrees. */
  function dieSprite(name, pal, pose, patches, skip = '') {
    let g = pose;
    for (const [x, y, p] of patches) g = put(g, p, x, y);
    const fin = outlineGrid(g, 'o', false, skip);
    spriteFinished(name + '_die', 16, 16, pal, [fin, rot90(fin), rot90(rot90(fin)), rot90(rot90(rot90(fin)))]);
  }
  /** Register <name>_move and <name>_angry from the same grids; returns the finished (outlined) grids. */
  function spriteFinishedAndRegister(name, pal, angry, grids, o = {}) {
    const fin = sprite(name + '_move', 16, 16, pal, grids, o);
    spriteFinished(name + '_angry', 16, 16, angry, o.steam ? addSteam(fin, o.steam) : fin);
    return fin;
  }

  // ===================================================================================================
  // 5. FOOD (8) and POWER-UPS (8), 16 x 16, outlined
  // ===================================================================================================
  const BEAD = G(`
    .wl.
    lggd
    gggd
    .dd.`);
  function foodGrapes() {
    let g = blank(16, 16);
    g = put(g, G('kk\nk.'), 7, 0);
    for (const [x, y] of [[3, 2], [9, 2], [1, 6], [6, 6], [11, 6], [3, 10], [9, 10]]) g = put(g, BEAD, x, y);
    return g;
  }
  /** Concentric rings for the maki roll: layers [[radius, char], ...] (first match wins). */
  function ringsGrid(n, layers) {
    const c = (n - 1) / 2;
    return Array.from({ length: n }, (_, y) => Array.from({ length: n }, (_, x) => {
      const d = Math.hypot(x - c, y - c);
      for (const [r, ch] of layers) if (d <= r) return ch;
      return '.';
    }).join(''));
  }
  const FOOD = [
    // 0 sea grapes
    { pal: { g: '#7fe28a', l: '#d2ffd0', d: '#2f9a55', k: '#7a4a28', w: '#ffffff' }, grid: foodGrapes() },
    // 1 kelp roll (maki, top view)
    { pal: { n: '#1f6a43', N: '#2f8f5a', r: '#f7f6ee', a: '#ff8a3a', p: '#ff5f7a', g: '#6ad06a' },
      grid: put(place(ringsGrid(14, [[2.6, 'p'], [4.2, 'a'], [5.4, 'r'], [7, 'n']]), 16, 16, 1, 1), G(`
        ..NN..
        .N..N.
        ......
        ......
        ......
        ......`).map((r) => r.replace(/\./g, '.')), 5, 3) },
    // 2 clam with pearl: a standing ribbed fan (lavender top shell) behind a pink bowl (bottom shell) holding a white pearl
    { pal: { p: '#c4acff', P: '#9a7ae0', D: '#6a4ab0', i: '#fdd6e2', w: '#ffffff', W: '#9a8ad0', q: '#f6aacb', Q: '#d6709c', r: '#a8487c' }, grid: G(`
        ................
        .......DD.......
        ....D.DDDD.D....
        ...DDpDppDDDD...
        ...DppPppPppD...
        .DpPPpPppPpPPpD.
        .DppPPpPPpPPppDD
        .DPppPpPPpPppPD.
        .DPPPqqwwqqPPPD.
        DpqqiiwwwwiiqqpD
        .qiiiiwwwwiiiiq.
        qqiiiiwwwWiiiiqq
        rqQiiiwwWWiiiqQr
        .rQQqqiiiiQQqqr.
        ...rqqQQqqQQr...
        ................`) },
    // 3 shrimp tempura
    { pal: { b: '#e9a93a', l: '#ffd97a', d: '#b87020', t: '#ee5a2a', T: '#ffb08a' }, grid: G(`
        .... .... .... ....
        .... .... .... .tt.
        .... .... ...t tTt.
        .... .... ..tt Tt..
        .... .... ..bb bt..
        .... ..ll lbbb b...
        .... .llb bbbb ....
        ...l llbb bbbb ....
        ..ll lbbb bbbd ....
        ..lb bbbb bbdd ....
        .lbb bbbb bddd ....
        .lbb bbbb ddd. ....
        .bbb bbdd dd.. ....
        ..bb bddd .... ....
        .... .... .... ....
        .... .... .... ....`) },
    // 4 sushi (nigiri): rice + salmon + nori band
    { pal: { r: '#fbfaf2', R: '#d9d6c4', s: '#ff8a5a', S: '#ffc3a0', f: '#e0562c', n: '#1f6a43' }, grid: G(`
        .... .... .... ....
        .... .... .... ....
        .... .... .... ....
        .... .... .... ....
        ..ss SSss SSss ss..
        .sSS ssSS ssSS sSs.
        .sff SSff SSff ffs.
        .fff fSff fSff fff.
        ..nn nnnn nnnn nn..
        .rrr rrrr rrrr rrR.
        .rrr rrrr rrrr rRR.
        .rrr rrrr rrrr RRR.
        ..RR RRRR RRRR RR..
        .... .... .... ....
        .... .... .... ....
        .... .... .... ....`) },
    // 5 pudding with caramel and cherry
    { pal: { y: '#ffe27a', Y: '#e8b83a', c: '#b8641c', C: '#7a3a10', r: '#e82a3a', w: '#ffffff', g: '#3a9a3a' }, grid: G(`
        .... .... .g.. ....
        .... ..rr rg.. ....
        .... .rwr rr.. ....
        .... ..rr rr.. ....
        .... .ccc cccc ....
        ..cc cccC ccCc cc..
        .cCc cccc cccc cCc.
        .... yyyy yyyY ....
        ...y yyyy yyYY Y...
        ..yy yyyy yyYY YY..
        ..yy yyyy yyYY YY..
        .yyy yyyy yYYY YYY.
        .yyy yyyY YYYY YYY.
        .YYY YYYY YYYY YYY.
        .... .... .... ....
        .... .... .... ....`) },
    // 6 sundae
    { pal: { g: '#dff4ff', G: '#9ccde8', p: '#ff8fc0', P: '#d85a96', c: '#fff8e8', r: '#e82a3a', w: '#ffffff', k: '#c8a060' }, grid: G(`
        .... .... .... .rk.
        .... .... ..rr rk..
        .... ..cc cc.r k...
        .... .ccc cccc ....
        .... pppp pppp ....
        ...p pppp pwpp P...
        ..pp pwpp pppp PP..
        ..pp pppp pppP PP..
        ..PP cccc cccc PP..
        ..gg gggg gggg gG..
        ...g gggg gggg G...
        ....GggG gggg G....
        .... .Ggg ggG. ....
        .... ..GG GG.. ....
        .... ...G G... ....
        .... .GGG GGG. ....`) },
    // 7 golden crown
    { pal: { y: '#ffd23f', Y: '#e8a21c', D: '#a8641a', l: '#fff3a0', r: '#e8283a', b: '#3aa0ff', g: '#3ae08a' }, grid: G(`
        .... .... .... ....
        .... .... .... ....
        .y.. ..y. .y.. .y..
        .yy. .yYy .yy. yy..
        .yly yyYy yyly lyy.
        .yyy yyyy yyyy yyy.
        .yyy yllY yyyy yyY.
        .yyy yyyy yyyy yYY.
        .Yyy yyyy yyyy yyY.
        .yyy yyyy yyyy yyy.
        .YYr YYYY bYYY gYY.
        .DDD DDDD DDDD DDD.
        .... .... .... ....
        .... .... .... ....
        .... .... .... ....
        .... .... .... ....`) },
  ];

  /** A pair of mirrored 7-column fins (left fin given, rows of 7 chars) -> 16 x 16 grid with a 2 px gap. */
  const finPair = (src) => G(src).map((r) => r + '..' + r.split('').reverse().join(''));
  const PU = [
    // pu_shoes: a PAIR of swim fins (teal foot pockets with a dark opening + yellow strap, lime blades that only ever widen: no neck
    // dent, ~1.8x the pocket, ribbed, with a scalloped tip). Each fin is drawn once (7 columns) and mirrored; the outer edge leans out.
    ['shoes', { g: '#b8f7c0', m: '#6fe08a', d: '#2fa860', R: '#1f8048', p: '#35b8a0', P: '#1f7f78', y: '#ffe36b', k: '#0e2c38' }, finPair(`
        .......
        ...PppP
        ...pkkp
        ...pppP
        ...yyyy
        ...gmmd
        ..gmmmd
        ..gmmmd
        .gmmRmd
        .gRmRmd
        gmRmRmd
        gmRmRmd
        gmRmRmd
        gdmdmdd
        .......
        .......`) ],
    // pu_parasol
    ['parasol', { r: '#ff4a6a', w: '#fff6f0', R: '#b01f46', k: '#7a4a28', y: '#ffd23f' }, G(`
        .... .... .y.. ....
        .... ..rr wrrw ....
        .... rrww rrww rr..
        ..rr wwrr wwrr ww..
        .rrw wrrr wrrw wrr.
        .rwr rrwR rrwR rrw.
        rrrr wRrr wRrr wRrr
        .R.R .R.R .R.R .R..
        .... .... .k.. ....
        .... .... .k.. ....
        .... .... .k.. ....
        .... .... .k.. ....
        .... .... .k.. ....
        .... .... kk.. ....
        .... .... kk.. ....
        .... .... .... ....`)],
    // pu_clock: alarm clock
    ['clock', { b: '#4aa0ff', B: '#2060c0', f: '#fff8e8', F: '#c8c0a8', k: '#2a1347', r: '#ff4a4a', y: '#ffd23f' }, G(`
        .... .... .... ....
        ..rr .... .... rr..
        .rrr r... ..rr rrr.
        .rr. .bbb bbbb .rr.
        .... bbbb bbbb b...
        ...b bffF ffff Bb..
        ..bb fffk ffff fBb.
        ..bb ffkk kfff fBB.
        ..bb ffff kkkf fBB.
        ..bb ffff ffff fBB.
        ...b BffF ffff BB..
        .... BBBB BBBB B...
        ..b. .BBB BBBB .b..
        .bb. .... .... .bb.
        .... .... .... ....
        .... .... .... ....`)],
    // pu_heart
    ['heart', { r: '#ff3a5c', R: '#b01f46', l: '#ff9ab0', w: '#ffffff' }, G(`
        .... .... .... ....
        .... .... .... ....
        ..rr r... ..rr r...
        .rll rrr. rrrr rr..
        .rlw rrrr rrrr rrR.
        .rlr rrrr rrrr rrR.
        .rrr rrrr rrrr rrR.
        .rrr rrrr rrrr rRR.
        ..rr rrrr rrrr RR..
        ...r rrrr rrrR R...
        .... rrrr rrRR ....
        .... .rrr rRR. ....
        .... ..rr RR.. ....
        .... ...r R... ....
        .... .... .... ....
        .... .... .... ....`)],
  ];
  // Star bomb: round dark sphere with a gold star on its belly, lit fuse on top.
  function bombGrid() {
    let g = place(shadedEllipse(12, 12, 'wlkK', 0.04, [0.93, 0.7, 0.3]), 16, 16, 2, 4);
    g = put(g, G(`
      ..y..
      .yyy.
      yyyyy
      .yyy.
      y...y`).map((r) => r.replace(/y/g, 'Y')), 5, 7);
    g = put(g, G('c.\n.c\nc.'), 9, 1).map((r) => r);        // fuse cord
    g = put(g, G('..w.\n.wyw\n..w.'), 11, 0);                // spark
    return g;
  }
  // Pearls: a shaded sphere in a small clam cup. Three hues: pink (range), blue (rate), gold (speed).
  function pearlGrid() {
    const sphere = shadedEllipse(10, 10, 'wpPd');           // w highlight, p light, P mid, d dark
    let g = place(sphere, 16, 16, 3, 1);
    const cup = G(`
      .sss ssss ss..
      ssSs ssSs sSs.
      sSSS sSSS SSS.
      .SSS SSSS SS..
      ..SS SSSS S...`);
    g = put(g, cup.map((r) => r.padEnd(14, '.')), 1, 10);
    return g;
  }
  const PEARLS = [
    ['pink', { w: '#ffffff', p: '#ffc4e6', P: '#ff6fb8', d: '#b8307a', s: '#e8dcff', S: '#9a86c8' }],
    ['blue', { w: '#ffffff', p: '#bfe4ff', P: '#4aa8ff', d: '#1f5ad0', s: '#e8dcff', S: '#9a86c8' }],
    ['gold', { w: '#ffffff', p: '#fff0a0', P: '#ffd23f', d: '#c8801c', s: '#e8dcff', S: '#9a86c8' }],
  ];

  function buildItems() {
    FOOD.forEach((f, i) => sprite('food_' + i, 16, 16, f.pal, [f.grid]));
    for (const [nm, pal, grid] of PU) sprite('pu_' + nm, 16, 16, pal, [grid]);
    for (const [nm, pal] of PEARLS) sprite('pu_' + nm, 16, 16, pal, [pearlGrid()]);
    sprite('pu_bomb', 16, 16, { w: '#ffffff', l: '#8a8ab8', k: '#3a3a5c', K: '#1b1033', Y: '#ffd23f', y: '#ffe36b', c: '#c8a060' }, [bombGrid()]);
  }

  // ===================================================================================================
  // 6. KRAKEN KING (48 x 48) and the trapped boss (64 x 64).
  //    Crown + face are hand-drawn half grids (mirrored); the dome uses the shaded-ellipse generator and the
  //    arms are swept along hand-picked centre lines (tapered, with suckers). Keys:
  //    h/l/m/d dome bands, u sucker, k dark ring, w sclera, e pupil, v brow, y/Y/L gold, r/c jewels
  // ===================================================================================================
  const KR_PAL = { h: '#e2b4ff', l: '#b274f0', m: '#8a46d0', d: '#58288f', u: '#f0cfff', k: '#1b1033', w: '#ffffff', e: '#1b1033', v: '#3a1666', y: '#ffd23f', Y: '#c8801c', L: '#fff3a0', r: '#ff3a54', c: '#3ae0ff', g: '#ffe36b' };
  const KR_ANGRY = { h: '#ffb0c0', l: '#ff5a86', m: '#e0245e', d: '#8a1038', u: '#ffd0d8', k: '#1b1033', w: '#fff4c8', e: '#2a0008', v: '#2a0008', y: '#ffd23f', Y: '#c8801c', L: '#fff3a0', r: '#ff3a54', c: '#3ae0ff', g: '#ffe36b' };
  const KR_CROWN_HALF = G(`
    ......................rr
    ......................rr
    ......................LY
    ............LY........yY
    ............yY.......LyY
    ...........LyyY.....LyyY
    ..........LyyyyY...LyyyY
    ........LyyyyyyyyyyyyyyY
    ........LyyyycyyyyyyrYyY
    ........YYYYYYYYYYYYYYYY`);
  // eyes: ring k, sclera w, pupil e with a glint; left eye in a 24-wide half, rows 0..10
  const KR_EYE_L = (() => {
    const ring = disc(11, 11).map((r) => r.replace(/o/g, 'k').replace(/[rf]/g, 'w'));
    let g = ring;
    g = put(g, G(`
      .eeee
      eeeeee
      eeeeee
      eeeeee
      .eeee`), 5, 3);                                  // pupil, pushed to the inner side (right in the left eye)
    g = put(g, G('ww\nw'), 6, 4);                      // glint
    return g;
  })();
  const KR_BROW_L = polyline(14, 8, [[0, 1], [12, 5]], 'v', 3);
  const KR_MOUTH_HALF = G(`
    ..............kkkkkkkkkk
    ..............kwweeeeeee
    ...............kweeeeeee
    ................keeeeeee
    .................kkkkkkk`);

  function krakenDome() {
    const dome = shadedEllipse(40, 25, 'hlmd', 0.06);
    return put(blank(48, 48), dome, 4, 9);
  }
  /** Tapered arm along a polyline: returns a 48 x 48 grid of m, lit edge l, shade d, suckers u. */
  function arm(pts, w0, w1) {
    const g = Array.from({ length: 48 }, () => Array(48).fill('.'));
    const samples = 80;
    const path = [];
    const lenOf = (i) => Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
    const total = pts.slice(0, -1).reduce((a, _, i) => a + lenOf(i), 0);
    for (let k = 0; k <= samples; k++) {
      let d = (k / samples) * total, i = 0;
      while (i < pts.length - 2 && d > lenOf(i)) { d -= lenOf(i); i++; }
      const f = Math.min(1, d / lenOf(i));
      path.push([pts[i][0] + (pts[i + 1][0] - pts[i][0]) * f, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * f, k / samples]);
    }
    for (const [px, py, t] of path) {
      const r = (w0 + (w1 - w0) * t) / 2;
      for (let y = Math.floor(py - r); y <= Math.ceil(py + r); y++) for (let x = Math.floor(px - r); x <= Math.ceil(px + r); x++) {
        if (x >= 0 && y >= 0 && x < 48 && y < 48 && Math.hypot(x - px, y - py) <= r) g[y][x] = 'm';
      }
    }
    const at = (x, y) => (x >= 0 && y >= 0 && x < 48 && y < 48 ? g[y][x] : '.');
    const out = g.map((r) => r.slice());
    for (let y = 0; y < 48; y++) for (let x = 0; x < 48; x++) {
      if (g[y][x] !== 'm') continue;
      if (at(x - 1, y) === '.' || at(x, y - 1) === '.') out[y][x] = 'l';
      if (at(x + 1, y) === '.' || at(x, y + 1) === '.') out[y][x] = 'd';
    }
    for (let k = 18; k < samples - 8; k += 14) {            // suckers along the underside of the arm
      const [px, py] = path[k];
      const x = Math.round(px), y = Math.round(py);
      if (out[y][x] === 'm' || out[y][x] === 'l') out[y][x] = 'u';
    }
    return out.map((r) => r.join(''));
  }
  const unionArms = (list) => list.reduce((acc, g) => put(acc, g), blank(48, 48));
  const mirrorWhole = (g) => g.map((r) => r.split('').reverse().join(''));

  let krakenStatic = null;                                  // dome + crown + face, shared by both frames
  function krakenFrame(variant) {
    if (!krakenStatic) {
      let st = put(blank(48, 48), krakenDome());
      st = put(st, sym(KR_CROWN_HALF), 0, 0);
      st = put(st, KR_EYE_L, 9, 13);
      st = put(st, mirrorGrid(KR_EYE_L), 28, 13);
      st = put(st, KR_BROW_L, 8, 10);
      st = put(st, mirrorGrid(KR_BROW_L), 26, 10);
      krakenStatic = put(st, sym(KR_MOUTH_HALF), 0, 27);
    }
    const sw = variant ? [3, -2, 2] : [-1, 2, -2];          // tip swing per arm
    const left = unionArms([
      arm([[10, 30], [6, 36], [4 + sw[0], 41], [7 + sw[0] * 1.5, 46]], 8, 3),
      arm([[17, 33], [14, 38], [13 + sw[1], 43], [16 + sw[1], 46]], 8, 3),
      arm([[22, 34], [21, 39], [20 + sw[2], 43], [22 + sw[2], 46]], 7, 3),
    ]);
    return put(put(put(blank(48, 48), left), mirrorWhole(left)), krakenStatic);
  }
  /** Nearest-neighbour resample of a grid by factor f (used once: the boss squeezed into its bubble). */
  const scaleGrid = (g, f) => {
    const h = g.length, w = g[0].length, nh = Math.round(h * f), nw = Math.round(w * f);
    return Array.from({ length: nh }, (_, y) => Array.from({ length: nw }, (_, x) => g[Math.min(h - 1, Math.floor(y / f))][Math.min(w - 1, Math.floor(x / f))]).join(''));
  };
  function buildKraken() {
    let tk = performance.now();
    const frames = [krakenFrame(0), krakenFrame(1)];
    timings.krakenFrames = +(performance.now() - tk).toFixed(1); tk = performance.now();
    const fin = sprite('kraken', 48, 48, KR_PAL, frames);
    timings.krakenSprite = +(performance.now() - tk).toFixed(1); tk = performance.now();
    spriteFinished('kraken_angry', 48, 48, KR_ANGRY, fin);

    // trapped: boss (75 %) floating in a giant bubble, with sweat drops
    const big = disc(64, 64, 3);
    const only = (g, re) => g.map((r) => r.replace(re, '.'));
    const fillL = only(big, /[nor]/g);
    const rimL = only(big, /f/g);
    const shine = put(
      polyline(64, 64, [[9, 27], [10, 20], [13, 15], [18, 11], [25, 8]], 'w', 3),
      polyline(64, 64, [[8, 33], [8, 35]], 'w', 2));
    const glow = polyline(64, 64, [[54, 40], [50, 47], [44, 52], [38, 55]], 'g', 2);
    const kr = outlineGrid(scaleGrid(frames[0], 0.75), 'o');
    const sweat = G(`
      ..b.
      .bwb
      bbwb
      .bb.`);
    const P = prep(Object.assign({}, KR_PAL, BUB_PAL, { o: OL, b: '#6fc8ff', f: '#4ccaf626' }));
    const cvRim = render(put(put(rimL, shine), glow), 64, 64, Object.assign({}, P, { o: parseColor('#1c4fa8e0') }), 'kraken_trapped');
    const cvFill = render(fillL, 64, 64, P, 'kraken_trapped');
    const cvKr = render(put(put(blank(64, 64), kr, 14, 16), sweat, 48, 12), 64, 64, P, 'kraken_trapped');
    const out = mk(64, 64), g = out.getContext('2d');
    g.drawImage(cvFill, 0, 0); g.drawImage(cvKr, 0, 0); g.drawImage(cvRim, 0, 0);
    addSprite('kraken_trapped', 64, 64, [out]);
    timings.krakenTrapped = +(performance.now() - tk).toFixed(1);

    // moon pearl 32 x 32: shimmering treasure in a cool lilac-white glow (5 dithered levels), sparkles, 2 breathing frames
    const sphere = shadedEllipse(22, 22, 'wlmd', 0.03, [0.84, 0.52, 0.1]);
    const bayer2 = [[0, 2], [3, 1]];
    const haloGrid = (grow) => Array.from({ length: 32 }, (_, y) => Array.from({ length: 32 }, (_, x) => {
      const d = Math.hypot(x - 15.5, y - 15.5) - grow;
      if (d > 16) return '.';
      const lvl = ((16 - d) / 5.4) * 4 + (bayer2[y & 1][x & 1] / 4 - 0.375) * 1.2;   // 0..4 from the rim inwards
      return lvl < 0.5 ? '.' : 'xyzq'[Math.min(3, Math.floor(lvl - 0.5))];
    }).join(''));
    const SPK = G(`
      ..w..
      ..w..
      wwwww
      ..w..
      ..w..`);
    const mpFrames = [0, 1].map((i) => {
      let g2 = put(haloGrid(i ? 0.5 : 0), place(sphere, 32, 32, 5, 5));
      g2 = put(g2, i ? G('..ww\n.w..\n.w..') : G('.ww\nw..\nw..'), i ? 15 : 8, i ? 8 : 9);
      g2 = put(g2, SPK, i ? 1 : 25, i ? 24 : 2);
      g2 = put(g2, G('.w.\nwww\n.w.'), i ? 26 : 2, i ? 5 : 26);
      return g2;
    });
    sprite('moonpearl', 32, 32, { x: '#d8ccff22', y: '#e6deff44', z: '#f2ecff70', q: '#fbf8ffa0', w: '#ffffff', l: '#fff7e6', m: '#ecd8ff', d: '#a490dc' }, mpFrames, { outline: false });
  }

  // ===================================================================================================
  // 7. FONT: chunky 8 x 8 arcade font. Glyph = 7 columns x 7/8 rows of '#', centred in the 8 px cell
  //    (columns 0-6 for wide glyphs, columns 3-4 for narrow ones) so the monospace advance is exactly 8.
  // ===================================================================================================
  const GLYPH_SRC = {
    ' ': '',
    A: '..###../.##.##./##...##/##...##/#######/##...##/##...##',
    B: '######./##...##/##...##/######./##...##/##...##/######.',
    C: '.#####./##...##/##...../##...../##...../##...##/.#####.',
    D: '#####../##..##./##...##/##...##/##...##/##..##./#####..',
    E: '#######/##...../##...../#####../##...../##...../#######',
    F: '#######/##...../##...../#####../##...../##...../##.....',
    G: '.#####./##...##/##...../##.###./##...##/##...##/.#####.',
    H: '##...##/##...##/##...##/#######/##...##/##...##/##...##',
    I: '.#####./..###../..###../..###../..###../..###../.#####.',
    J: '..#####/....##./....##./....##./##..##./##..##./.####..',
    K: '##...##/##..##./##.##../####.../##.##../##..##./##...##',
    L: '##...../##...../##...../##...../##...../##...../#######',
    M: '##...##/###.###/#######/##.#.##/##...##/##...##/##...##',
    N: '##...##/###..##/####.##/#######/##.####/##..###/##...##',
    O: '.#####./##...##/##...##/##...##/##...##/##...##/.#####.',
    P: '######./##...##/##...##/######./##...../##...../##.....',
    Q: '.#####./##...##/##...##/##...##/##.#.##/##..##./.####.#',
    R: '######./##...##/##...##/######./##.##../##..##./##...##',
    S: '.#####./##...##/##...../.#####./.....##/##...##/.#####.',
    T: '#######/..###../..###../..###../..###../..###../..###..',
    U: '##...##/##...##/##...##/##...##/##...##/##...##/.#####.',
    V: '##...##/##...##/##...##/##...##/.##.##./.##.##./..###..',
    W: '##...##/##...##/##...##/##.#.##/#######/###.###/##...##',
    X: '##...##/.##.##./..###../..###../..###../.##.##./##...##',
    Y: '##...##/.##.##./..###../..###../..###../..###../..###..',
    Z: '#######/....##./...##../..##.../.##..../##...../#######',
    0: '.#####./##...##/##..###/##.#.##/###..##/##...##/.#####.',
    1: '..###../.####../..###../..###../..###../..###../.#####.',
    2: '.#####./##...##/.....##/..####./.##..../##...../#######',
    3: '.#####./##...##/.....##/..####./.....##/##...##/.#####.',
    4: '...###./..####./.##.##./##..##./#######/....##./....##.',
    5: '#######/##...../######./.....##/.....##/##...##/.#####.',
    6: '.#####./##...../######./##...##/##...##/##...##/.#####.',
    7: '#######/##...##/....##./...##../..##.../..##.../..##...',
    8: '.#####./##...##/##...##/.#####./##...##/##...##/.#####.',
    9: '.#####./##...##/##...##/.######/.....##/.....##/.#####.',
    '!': '..###../..###../..###../..###../..###../......./..###..',
    '?': '.#####./##...##/....##./...##../...##../......./...##..',
    '.': '......./......./......./......./......./..###../..###..',
    ',': '......./......./......./......./..###../..###../.###...',
    ':': '......./..###../..###../......./..###../..###../.......',
    ';': '......./..###../..###../......./..###../..###../.###...',
    '-': '......./......./......./.#####./......./......./.......',
    '+': '......./...##../...##../.######/.######/...##../...##..',
    '=': '......./......./.######/......./.######/......./.......',
    '&': '.####../##..##./##..##./.####../##.##.#/##..###/.###.##',
    "'": '...##../...##../..##.../......./......./......./.......',
    '"': '.##.##./.##.##./.#..#../......./......./......./.......',
    '/': '.....##/....##./...##../..##.../.##..../##...../#......',
    '(': '....##./...##../..##.../..##.../..##.../...##../....##.',
    ')': '.##..../..##.../...##../...##../...##../..##.../.##....',
    '%': '##...#./##..##./...##../..##.../.##..../##..##./.#...##',
    '*': '......./#..#..#/.#.#.#./..###../.#.#.#./#..#..#/.......',
    '#': '.##.##./.##.##./#######/.##.##./#######/.##.##./.##.##.',
    '<': '....##./...##../..##.../.##..../..##.../...##../....##.',
    '>': '.##..../..##.../...##../....##./...##../..##.../.##....',
    '_': '......./......./......./......./......./......./......./#######',
    '\u00a9': '..###../.#...#./#.###.#/#.#...#/#.###.#/.#...#./..###..',
    '\u2665': '.##.##./#######/#######/#######/.#####./..###../...#...',
    '\u2605': '...#.../...#.../#######/.#####./..###../.##.##./.#...#.',
    '\u2190': '...#.../..##.../.###.../#######/.###.../..##.../...#...',
    '\u2192': '...#.../...##../...###./#######/...###./...##../...#...',
  };
  const GLYPH_ORDER = Object.keys(GLYPH_SRC);              // index in the strip
  const GLYPH_INDEX = Object.create(null);
  GLYPH_ORDER.forEach((ch, i) => { GLYPH_INDEX[ch] = i; });
  let glyphMask = null;                                    // white glyph strip, GLYPH_ORDER.length * 8 x 8
  const tintCache = new Map();
  const SHADOW_COLOR = 'rgba(10,4,24,0.85)';

  function buildFont() {
    glyphMask = mk(GLYPH_ORDER.length * 8, 8);
    const g = glyphMask.getContext('2d');
    g.fillStyle = '#fff';
    GLYPH_ORDER.forEach((ch, i) => {
      const rows = GLYPH_SRC[ch] ? GLYPH_SRC[ch].split('/') : [];
      if (ch !== ' ' && rows.length > 8) lint(`font '${ch}': ${rows.length} rows`);
      rows.forEach((row, y) => {
        if (row.length > 8) lint(`font '${ch}' row ${y}: ${row.length} cols`);
        for (let x = 0; x < row.length; x++) if (row[x] === '#') g.fillRect(i * 8 + x, y, 1, 1);
      });
    });
  }
  function tintedStrip(color) {
    let c = tintCache.get(color);
    if (c) return c;
    if (tintCache.size >= 48) tintCache.clear();
    c = mk(glyphMask.width, 8);
    const g = c.getContext('2d');
    g.drawImage(glyphMask, 0, 0);
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = color;
    g.fillRect(0, 0, c.width, 8);
    tintCache.set(color, c);
    return c;
  }
  const glyphIdx = (ch) => {
    let i = GLYPH_INDEX[ch];
    if (i === undefined) { const u = ch.toUpperCase(); i = u.length === 1 ? GLYPH_INDEX[u] : undefined; }
    return i === undefined ? GLYPH_INDEX['?'] : i;
  };
  const textWidth = (str, scale = 1) => Array.from(String(str)).length * 8 * scale;

  const stringCache = new Map();                       // "scale|mode|outline|color|text" -> canvas (whole string, pre-composed)
  const STRING_CACHE_MAX = 400;
  const OFF8 = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];
  /**
   * One pre-composed canvas for a whole string. With an `outline` colour, one font pixel (= scale px) of
   * outline is stamped in all 8 directions behind the glyphs (canvas padded by `pad` on every side, so the
   * caller draws it at x - pad / y - pad; the glyph cells stay on the 8 px grid). A drop shadow is only added
   * on top of the outline when explicitly requested.
   */
  function stringCanvas(chars, color, shadowOn, scale, outline) {
    const key = scale + (shadowOn ? '|1|' : '|0|') + (outline || '') + '|' + color + '|' + chars.join('');
    let c = stringCache.get(key);
    if (c) return c;
    if (stringCache.size >= STRING_CACHE_MAX) stringCache.clear();
    const px = 8 * scale, pad = outline ? scale : 0, extra = shadowOn ? (outline ? 2 * scale : scale) : 0;
    c = mk(Math.max(1, chars.length * px + extra + 2 * pad), px + extra + 2 * pad);
    c.__pad = pad;
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    const body = tintedStrip(color), shadow = shadowOn ? tintedStrip(SHADOW_COLOR) : null;
    const rim = outline ? tintedStrip(outline) : null;
    for (let i = 0; i < chars.length; i++) {
      if (chars[i] === ' ') continue;
      const sx = glyphIdx(chars[i]) * 8, dx = i * px + pad;
      if (shadow) g.drawImage(shadow, sx, 0, 8, 8, dx + (outline ? 2 * scale : scale), pad + (outline ? 2 * scale : scale), px, px);
      if (rim) for (const [ox, oy] of OFF8) g.drawImage(rim, sx, 0, 8, 8, dx + ox * scale, pad + oy * scale, px, px);
    }
    for (let i = 0; i < chars.length; i++) {            // glyphs last, so no neighbour's outline ever covers them
      if (chars[i] === ' ') continue;
      g.drawImage(body, glyphIdx(chars[i]) * 8, 0, 8, 8, i * px + pad, pad, px, px);
    }
    stringCache.set(key, c);
    return c;
  }

  /** text(ctx, str, x, y, color, {align, scale, shadow, outline:'#rrggbb'}); outline replaces the default drop shadow. */
  function text(ctx, str, x, y, color = '#fff', opts) {
    ensure();
    const o = opts || {};
    const scale = o.scale || 1;
    const chars = Array.from(String(str));
    const w = chars.length * 8 * scale;
    const x0 = Math.round(o.align === 'center' ? x - w / 2 : o.align === 'right' ? x - w : x);
    const outline = o.outline || '';
    const shadowOn = outline ? o.shadow === true : o.shadow !== false;
    const c = stringCanvas(chars, color, shadowOn, scale, outline);
    ctx.drawImage(c, x0 - c.__pad, Math.round(y) - c.__pad);
  }

  // ===================================================================================================
  // 8. LEVEL TILES: 6 themes x 5 variants. Tiles are 8 x 8 grids over the ramp keys 1 (darkest) .. 5
  //    (highlight) plus accents a / b. A variant = a palette + a mix of the theme's tile grids.
  //    Edges are bevelled from the neighbours' emptiness, outer walls use 16 x 16 blocks, and a
  //    BB-style drop shadow (3 px right/down) falls on empty cells only.
  // ===================================================================================================
  const T = (s) => G(s);
  const THEME_DEFS = [
    { // 0 Coral Reef: staggered coral knobs
      name: 'Coral Reef', bg: '#16080f',
      tiles: [
        T(`25512551 54435443 44334433 23322332 51255125 43544354 33443344 32233223`),
        T(`2a512551 54435443 44334433 23322332 51255a25 43544354 33443344 32233223`),
        T(`25512551 54435443 44334433 23322332 51255125 43544354 33b43344 32233223`),
      ].map((g) => g.length === 1 ? g[0].match(/.{8}/g) : g),
      vars: [
        { c: { 1: '#5a1840', 2: '#a8306a', 3: '#e0508a', 4: '#ff7fa8', 5: '#ffc0d4', a: '#ffd23f', b: '#ff9a3c' }, mix: [0, 0, 0, 1, 0, 0, 2], t: [0.64,0.62,14] },
        { c: { 1: '#5a2008', 2: '#b04a14', 3: '#ee7a2a', 4: '#ffa650', 5: '#ffd8a0', a: '#ff5a7a', b: '#ffe27a' }, mix: [0, 1, 0, 0, 1, 0, 0], t: [0.6,0.55,0] },
        { c: { 1: '#401050', 2: '#7a2a9a', 3: '#b84acb', 4: '#e07af0', 5: '#f8c0ff', a: '#ffd23f', b: '#7affd0' }, mix: [0, 0, 2, 0, 0, 1, 0], t: [0.45,0.45,0] },
        { c: { 1: '#583018', 2: '#a8643a', 3: '#e09a64', 4: '#ffc89a', 5: '#fff0d8', a: '#ff6a5a', b: '#6ad0c0' }, mix: [1, 0, 0, 2, 0, 0, 0], t: [0.66,0.5,0] },
        { c: { 1: '#400818', 2: '#8a1a3a', 3: '#c8284a', 4: '#f05a70', 5: '#ffa8b4', a: '#ffe27a', b: '#ff8a3a' }, mix: [0, 0, 1, 0, 0, 0, 2], t: [0.5,0.55,-14] },
      ],
    },
    { // 1 Kelp Forest: kelp-wrapped stones
      name: 'Kelp Forest', bg: '#06140c',
      tiles: [
        T(`11111111 54444431 44444331 33333321 11111111 44415444 44314433 33213322`),
        T(`1a111111 5a444431 4ab44331 33a33321 11a11111 44ab5444 443a4433 3321a322`),
        T(`11111b11 5444ab31 444ab331 333a3321 11111111 44415444 44314433 33213322`),
      ].map((g) => g.length === 1 ? g[0].match(/.{8}/g) : g),
      vars: [
        { c: { 1: '#0a2a1a', 2: '#1f5a38', 3: '#3a8c4c', 4: '#6ac060', 5: '#b0e890', a: '#1f7a2a', b: '#a8f070' }, mix: [0, 0, 1, 0, 2, 0, 0], t: [0.6,0.62,15] },
        { c: { 1: '#202a0a', 2: '#4a5a1a', 3: '#7a8c2a', 4: '#aab840', 5: '#e0e890', a: '#2a7a3a', b: '#8ae060' }, mix: [0, 1, 0, 0, 0, 2, 0], t: [0.62,0.5,-14] },
        { c: { 1: '#08262a', 2: '#1a5a5a', 3: '#2a8c88', 4: '#58c0b0', 5: '#a8f0e0', a: '#2a9a5a', b: '#9af080' }, mix: [2, 0, 0, 1, 0, 0, 0], t: [0.58,0.6,-18] },
        { c: { 1: '#14281a', 2: '#34503a', 3: '#587a58', 4: '#88a880', 5: '#c8dcb8', a: '#3a8a3a', b: '#b8e870' }, mix: [0, 0, 0, 1, 1, 0, 2], t: [0.7,0.7,0] },
        { c: { 1: '#0a1a2a', 2: '#1a4a5a', 3: '#2a7a7a', 4: '#4aa8a0', 5: '#98e0d0', a: '#3aa05a', b: '#c0f080' }, mix: [0, 2, 0, 0, 1, 0, 0], t: [0.6,0.6,25] },
      ],
    },
    { // 2 Sunken Ship: wooden planks with nails
      name: 'Sunken Ship', bg: '#120c07',
      tiles: [
        T(`11111111 45444544 33433343 3b33333b 11111111 44544454 34333433 33323332`),
        T(`11111111 45444145 33433143 3b33313b 11111111 44544454 34333433 33323332`),
        T(`11111111 45444544 33433343 33333333 11111111 44514454 34313433 3b32333b`),
      ].map((g) => g.length === 1 ? g[0].match(/.{8}/g) : g),
      vars: [
        { c: { 1: '#2a1608', 2: '#6a3c1a', 3: '#a8683a', 4: '#d49a60', 5: '#f0c890', a: '#e8c050', b: '#ffe890' }, mix: [0, 0, 1, 0, 2, 0, 0] },
        { c: { 1: '#1e140e', 2: '#4a3828', 3: '#7a5e44', 4: '#a88c68', 5: '#d0b890', a: '#c8a040', b: '#f0d070' }, mix: [0, 1, 0, 0, 0, 2, 0] },
        { c: { 1: '#0c2430', 2: '#1e4a58', 3: '#3a7a88', 4: '#6aa8b0', 5: '#b0d8d8', a: '#d8b048', b: '#fff0a0' }, mix: [1, 0, 2, 0, 0, 0, 0], t: [0.62,0.6,15] },
        { c: { 1: '#2a0c10', 2: '#6a2028', 3: '#a8404a', 4: '#d07068', 5: '#f0b8a8', a: '#e0b850', b: '#fff0a0' }, mix: [0, 0, 0, 2, 1, 0, 0], t: [0.7,0.65,0], at: [0.88,0.5] },
        { c: { 1: '#1a1810', 2: '#4a4a30', 3: '#7a7a4a', 4: '#a8a868', 5: '#d8d8a0', a: '#d0a840', b: '#f8e080' }, mix: [2, 0, 1, 0, 0, 0, 0], t: [0.7,0.6,-10] },
      ],
    },
    { // 3 Crystal Caves: faceted crystals
      name: 'Crystal Caves', bg: '#071120',
      tiles: [
        T(`55555552 54555532 54445332 54443322 54433222 53332222 53222222 12222221`),
        T(`55555552 54445432 5444a332 54433322 54333222 53322222 52222222 12222221`),
        T(`45555532 55444322 54433222 54332222 53322222 53222221 52222211 22222111`),
      ].map((g) => g.length === 1 ? g[0].match(/.{8}/g) : g),
      vars: [
        { c: { 1: '#0a2a44', 2: '#1a6a92', 3: '#2ab0d8', 4: '#68e0f4', 5: '#d8fcff', a: '#ffffff', b: '#a0f0ff' }, mix: [0, 0, 1, 0, 2, 0, 0], t: [0.55,0.55,22] },
        { c: { 1: '#1c1050', 2: '#4a2a98', 3: '#7a54e0', 4: '#b090ff', 5: '#e8dcff', a: '#ffffff', b: '#d0b8ff' }, mix: [0, 1, 0, 0, 0, 2, 0], t: [0.5,0.3,12] },
        { c: { 1: '#082c2c', 2: '#1a6a5a', 3: '#2ab08a', 4: '#68e0b8', 5: '#d8fff0', a: '#ffffff', b: '#a0ffe0' }, mix: [2, 0, 0, 1, 0, 0, 0], t: [0.55,0.55,-10] },
        { c: { 1: '#3a1040', 2: '#8a2a8a', 3: '#d054c8', 4: '#f090e8', 5: '#ffe0fa', a: '#ffffff', b: '#ffc0f4' }, mix: [0, 0, 2, 0, 1, 0, 0], t: [0.52,0.5,-25] },
        { c: { 1: '#102a4a', 2: '#3a6a9a', 3: '#7aa8d4', 4: '#b8d8f4', 5: '#f4fcff', a: '#ffffff', b: '#d8f0ff' }, mix: [1, 0, 0, 0, 2, 0, 0], t: [0.6,0.55,0] },
      ],
    },
    { // 4 Volcanic Vents: cracked basalt with lava seams (K5: seams are deep crimson / coral, never crab-orange or angry-red; the glow lives in bgCanvas)
      name: 'Volcanic Vents', bg: '#160807',
      tiles: [
        T(`21222122 22232222 aab22322 223a2222 2223aab2 22222a32 22322aa2 12212222`),
        T(`22212222 2a222322 2ba22222 22ab2232 322abb22 22222aa2 23222a22 12122122`),
        T(`22222122 32222222 2222a322 222ab222 22aab222 2aab2232 aab22222 12221222`),
      ].map((g) => g.length === 1 ? g[0].match(/.{8}/g) : g),
      vars: [
        { c: { 1: '#0a0608', 2: '#3a3038', 3: '#5c4e58', 4: '#84727e', 5: '#b8a6b0', a: '#a8141c', b: '#f0a080' }, mix: [0, 0, 1, 0, 2, 0, 0], at: [1, 1] },
        { c: { 1: '#0e0606', 2: '#44282a', 3: '#6a4640', 4: '#946a5c', 5: '#c49c88', a: '#c8503c', b: '#f0a080' }, mix: [0, 1, 0, 0, 0, 2, 0], t: [0.7,0.5,-18], at: [1, 1] },
        { c: { 1: '#06080e', 2: '#2a323e', 3: '#465264', 4: '#6a7a90', 5: '#a0b2c8', a: '#a8141c', b: '#e08a70' }, mix: [2, 0, 0, 1, 0, 0, 0], at: [1, 1] },
        { c: { 1: '#100612', 2: '#3e2444', 3: '#62406e', 4: '#8c64a0', 5: '#c0a0d0', a: '#c82840', b: '#f0a080' }, mix: [0, 0, 2, 0, 1, 0, 0], at: [1, 1] },
        { c: { 1: '#0a0808', 2: '#403a32', 3: '#665c50', 4: '#928472', 5: '#c8baa4', a: '#a8141c', b: '#e08a70' }, mix: [1, 0, 0, 0, 2, 0, 0], at: [1, 1] },
      ],
    },
    { // 5 Abyss Temple: gold-trimmed temple bricks
      name: 'Abyss Temple', bg: '#050918',
      tiles: [
        T(`aaaaaaaa 54444431 54433321 43333221 aaaaaaaa 44431444 4432a444 3322a333`),
        T(`aaaaaaaa 5444b431 5443bb21 4333b221 aaaaaaaa 44431444 44321444 33221333`),
        T(`aaaaaaaa 54444431 54433321 43333221 aaaaaaaa a4431444 a4321444 a3221333`),
      ].map((g) => g.length === 1 ? g[0].match(/.{8}/g) : g),
      vars: [
        { c: { 1: '#0a1030', 2: '#1e3a8a', 3: '#3458c8', 4: '#5a82f0', 5: '#a0c0ff', a: '#e8b830', b: '#fff0a0' }, mix: [0, 0, 1, 0, 2, 0, 0], t: [0.55,0.4,10], at: [0.72,0.8] },
        { c: { 1: '#0e0a30', 2: '#352a8a', 3: '#5a48c8', 4: '#8a78f0', 5: '#c8c0ff', a: '#e8b830', b: '#fff0a0' }, mix: [0, 1, 0, 0, 0, 2, 0], t: [0.55,0.4,0], at: [0.72,0.8] },
        { c: { 1: '#06202a', 2: '#1a4e68', 3: '#2a7a98', 4: '#52a8c0', 5: '#a0e0f0', a: '#e8b830', b: '#fff0a0' }, mix: [2, 0, 0, 1, 0, 0, 0], t: [0.6,0.45,0], at: [0.72,0.8] },
        { c: { 1: '#18102a', 2: '#3e2a68', 3: '#64489a', 4: '#9070c8', 5: '#d0b8f4', a: '#f0c040', b: '#fff4b0' }, mix: [0, 0, 2, 0, 1, 0, 0], t: [0.58,0.4,0], at: [0.72,0.8] },
        { c: { 1: '#0c1420', 2: '#2a3a52', 3: '#4a5e7e', 4: '#7488a8', 5: '#b8c8e0', a: '#e0a828', b: '#ffe890' }, mix: [1, 0, 0, 0, 2, 0, 0], t: [0.75,0.6,0], at: [0.72,0.8] },
      ],
    },
  ];

  // ---- colour tone (G9): tile art is darker and less saturated than the sprites that walk on it ------------------
  const rgbOf = (hex) => { const c = parseColor(hex); return [c[0], c[1], c[2]]; };
  const hexOf = (r, g, b) => '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
  function toHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
    if (!d) return [0, 0, l];
    const s = d / (1 - Math.abs(2 * l - 1));
    const h = mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return [h * 60, s, l];
  }
  function fromHsl(h, s, l) {
    const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
    const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
    return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
  }
  /** Tone '#rrggbb': lightness x vf, saturation x sf, hue + dh degrees. */
  function toneColor(hex, vf, sf, dh = 0) {
    const [h, s, l] = toHsl(...rgbOf(hex));
    return hexOf(...fromHsl((h + dh + 360) % 360, Math.min(1, s * sf), Math.min(1, l * vf)));
  }
  const TILE_TONE = [0.84, 0.8, 0], ACCENT_TONE = [0.92, 0.9];       // defaults [lightness x, saturation x, hue shift]
  /** A variant's final tile palette: ramp keys 1-5 toned by v.t, accents a / b by v.at (G9, per variant overrides). */
  function tonedPalette(v) {
    const [vf, sf, dh] = v.t || TILE_TONE, [avf, asf] = v.at || ACCENT_TONE, out = {};
    for (const k of Object.keys(v.c)) out[k] = /[1-5]/.test(k) ? toneColor(v.c[k], vf, sf, dh) : toneColor(v.c[k], avf, asf);
    return out;
  }

  // ---- tile rendering ---------------------------------------------------------------------------------
  const levelCache = Object.create(null);
  const tileSets = Object.create(null);             // levelIndex -> { tiles: [canvas...], wall: canvas, mix }
  const themeOf = (i) => Math.max(0, Math.min(5, Math.floor(i / 5)));
  const variantOf = (i) => Math.max(0, Math.min(4, i % 5));

  function tileSet(levelIndex) {
    if (tileSets[levelIndex]) return tileSets[levelIndex];
    const def = THEME_DEFS[themeOf(levelIndex)], v = def.vars[variantOf(levelIndex)];
    const P = prep(tonedPalette(v));
    const tiles = def.tiles.map((g) => render(g, 8, 8, P, 'tile'));
    // wall block 16 x 16: the theme's first tile at double size (chunkier knobs / bricks / planks / facets)
    const wall = mk(16, 16), wg = wall.getContext('2d');
    wg.imageSmoothingEnabled = false;
    wg.drawImage(tiles[0], 0, 0, 8, 8, 0, 0, 16, 16);
    return (tileSets[levelIndex] = { tiles, wall, mix: v.mix });
  }
  const hash3 = (a, b, c) => (((a * 73856093) ^ (b * 19349663) ^ (c * 83492791)) >>> 0);

  /** BB-style bevel from the neighbours: lit top/left edges, dark bottom/right edges, drawn as overlays. */
  function bevel(g, x, y, w, h, up, left, down, right, strong) {
    const a = strong ? 1 : 0.7;
    if (!up) { g.fillStyle = `rgba(255,255,255,${0.5 * a})`; g.fillRect(x, y, w, 1); g.fillStyle = `rgba(255,255,255,${0.16 * a})`; g.fillRect(x, y + 1, w, 1); }
    if (!left) { g.fillStyle = `rgba(255,255,255,${0.3 * a})`; g.fillRect(x, y, 1, h); }
    if (!down) { g.fillStyle = `rgba(0,0,0,${0.5 * a})`; g.fillRect(x, y + h - 1, w, 1); g.fillStyle = `rgba(0,0,0,${0.18 * a})`; g.fillRect(x, y + h - 2, w, 1); }
    if (!right) { g.fillStyle = `rgba(0,0,0,${0.38 * a})`; g.fillRect(x + w - 1, y, 1, h); }
  }

  function levelCanvas(levelIndex, map) {
    ensure();
    if (levelCache[levelIndex]) return levelCache[levelIndex];
    const W = C.COLS, H = C.ROWS;
    const cv = mk(W * TILE, H * TILE);
    const g = cv.getContext('2d');
    const ts = tileSet(levelIndex);
    const isWall = (c) => c < 2 || c >= W - 2;
    const solid = (c, r) => {
      if (r < 0 || r >= H) return false;
      if (c < 0 || c >= W) return true;                       // outside the map counts as wall
      return isWall(c) || (map[r] && map[r][c] === '#');
    };
    // 1) drop shadow mask (union of solid tiles shifted by 3,3), drawn at 50 % and then covered by the blocks
    const sh = mk(cv.width, cv.height), sg = sh.getContext('2d');
    sg.fillStyle = '#000';
    for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) if (solid(c, r)) sg.fillRect(c * TILE + 3, r * TILE + 3, TILE, TILE);
    g.globalAlpha = 0.5; g.drawImage(sh, 0, 0); g.globalAlpha = 1;
    // 2) blocks
    for (let r = 0; r < H; r++) {
      for (let c = 0; c < W; c++) {
        if (!solid(c, r)) continue;
        if (isWall(c)) {
          if (c % 2 || r % 2) continue;                        // wall blocks are drawn from their top-left cell
          g.drawImage(ts.wall, c * TILE, r * TILE);
          bevel(g, c * TILE, r * TILE, 16, 16, false, false, false, false, true);
          if (c === 0) { g.fillStyle = 'rgba(0,0,0,0.4)'; g.fillRect(c * TILE + 15, r * TILE, 1, 16); } else { g.fillStyle = 'rgba(255,255,255,0.3)'; g.fillRect(c * TILE, r * TILE, 1, 16); }
          continue;
        }
        const k = ts.mix[hash3(c, r, levelIndex) % ts.mix.length] % ts.tiles.length;
        g.drawImage(ts.tiles[k], c * TILE, r * TILE);
        bevel(g, c * TILE, r * TILE, TILE, TILE, solid(c, r - 1), solid(c - 1, r), solid(c, r + 1), solid(c + 1, r), false);
      }
    }
    return (levelCache[levelIndex] = cv);
  }

  function theme(levelIndex) {
    const def = THEME_DEFS[themeOf(levelIndex)], v = def.vars[variantOf(levelIndex)];
    return { bg: bgOf(levelIndex), accent: v.c[4], accent2: v.c.b, name: def.name };
  }

  // ===================================================================================================
  // 8b. BACKGROUNDS (G13): bgCanvas(levelIndex) = opaque 256 x 208 art behind the tiles. A near-black vertical
  //     gradient (4-step ordered dither, hue pulled towards the round's variant) plus 2-3 very faint theme silhouettes
  //     (alpha <= 0.12, so sprites and bubbles stay the brightest things on screen): coral branches, kelp fronds,
  //     ship ribs + mast, crystal spires, volcano cones with a lava glow, temple pillars. Layout is seeded per round.
  // ===================================================================================================
  const BGW = C.W, BGH = C.ROWS * TILE;
  const bgCache = Object.create(null);
  const bgSet = (m, x, y) => { if (x >= 0 && y >= 0 && x < BGW && y < BGH) m[y * BGW + x] = 1; };
  const bgRect = (m, x, y, w, h) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) bgSet(m, x + i, y + j); };
  const bgLine = (m, x0, y0, x1, y1, th) => {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let i = 0; i <= n; i++) bgRect(m, Math.round(x0 + ((x1 - x0) * i) / n) - (th >> 1), Math.round(y0 + ((y1 - y0) * i) / n) - (th >> 1), th, th);
  };
  const bgTri = (m, x0, y0, x1, y1, x2, y2) => {
    const sgn = (ax, ay, bx, by, cx, cy) => (ax - cx) * (by - cy) - (bx - cx) * (ay - cy);
    for (let y = Math.max(0, Math.floor(Math.min(y0, y1, y2))); y <= Math.min(BGH - 1, Math.ceil(Math.max(y0, y1, y2))); y++) {
      for (let x = Math.max(0, Math.floor(Math.min(x0, x1, x2))); x <= Math.min(BGW - 1, Math.ceil(Math.max(x0, x1, x2))); x++) {
        const d1 = sgn(x + 0.5, y + 0.5, x0, y0, x1, y1), d2 = sgn(x + 0.5, y + 0.5, x1, y1, x2, y2), d3 = sgn(x + 0.5, y + 0.5, x2, y2, x0, y0);
        if (!((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0))) m[y * BGW + x] = 1;
      }
    }
  };
  const bgEllipse = (m, cx, cy, rx, ry) => {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      if ((((x + 0.5 - cx) / rx) ** 2) + (((y + 0.5 - cy) / ry) ** 2) <= 1) bgSet(m, x, y);
    }
  };
  /** One painter per theme: (rng, layer) where layer(alpha, [rgb]) returns a fresh mask painted at that alpha. */
  const BG_PAINTERS = [
    // 0 Coral Reef: forked coral branches with polyp tips + a fan coral
    (R, layer) => {
      const far = layer(0.04), near = layer(0.07);
      const branch = (m, x, y, ang, len, th, depth) => {
        const x1 = x + Math.cos(ang) * len, y1 = y - Math.sin(ang) * len;
        bgLine(m, x, y, x1, y1, th);
        if (depth > 0) {
          branch(m, x1, y1, ang + 0.45 + R.next() * 0.35, len * 0.74, Math.max(2, th - 1), depth - 1);
          branch(m, x1, y1, ang - 0.45 - R.next() * 0.35, len * 0.74, Math.max(2, th - 1), depth - 1);
        } else bgEllipse(m, x1, y1, 2.5, 2.5);
      };
      for (let k = 0; k < 4; k++) branch(k < 2 ? far : near, 24 + R.int(0, 208), BGH + 2, Math.PI / 2 + (R.next() - 0.5) * 0.5, 30 + R.int(0, 18), 4, 3);
      const fx = 30 + R.int(0, 190);
      for (let a = 0; a < 9; a++) { const ang = Math.PI * (0.12 + a * 0.095); bgLine(near, fx, BGH, fx + Math.cos(ang) * 44, BGH - Math.sin(ang) * 44, 2); }
      bgEllipse(near, fx, BGH - 2, 8, 4);
    },
    // 1 Kelp Forest: swaying fronds with leaf blades
    (R, layer) => {
      for (let k = 0; k < 8; k++) {
        const m = layer(k % 2 ? 0.045 : 0.085), x0 = 12 + R.int(0, 232), ph = R.next() * 6.3, h = 80 + R.int(0, 110), amp = 3 + R.int(0, 4);
        for (let y = BGH; y > BGH - h; y--) {
          const t = (BGH - y) / h, x = Math.round(x0 + Math.sin(y / 16 + ph) * amp * (0.35 + t));
          bgRect(m, x, y, t < 0.75 ? 3 : 2, 1);
          if ((BGH - y) % 24 === 12) bgEllipse(m, x + (((BGH - y) / 24) & 1 ? 6 : -6), y, 6, 2.2);
        }
      }
    },
    // 2 Sunken Ship: a row of curved hull ribs with a gunwale beam, and a mast with its yard and a torn sail
    (R, layer) => {
      const m = layer(0.075), far = layer(0.045);
      const x0 = 96 + R.int(0, 80);
      for (let i = 0; i < 6; i++) {
        const bx = x0 + i * 17;
        for (let y = BGH; y > 98 + i * 3; y--) { const t = (BGH - y) / 108; bgRect(m, bx + Math.round(t * t * 15), y, 3, 1); }
      }
      bgRect(m, x0 - 4, 94, 6 * 17 + 14, 3);
      const mx = 16 + R.int(0, 74);
      bgRect(far, mx, 34, 3, BGH - 34); bgRect(far, mx - 24, 60, 51, 2);
      bgTri(far, mx + 3, 62, mx + 26, 62, mx + 3, 118); bgTri(far, mx - 1, 62, mx - 23, 62, mx - 1, 104);
    },
    // 3 Crystal Caves: spires rising from the floor (lit facet + shaded facet) and stalactites from the ceiling
    (R, layer) => {
      const dark = layer(0.06), lit = layer(0.105);
      for (let k = 0; k < 6; k++) {
        const bx = 6 + k * 41 + R.int(-8, 8), w = 18 + R.int(0, 14), h = 46 + R.int(0, 74), tx = bx + (w >> 1) + R.int(-3, 3);
        bgTri(dark, bx, BGH, bx + w, BGH, tx, BGH - h); bgTri(lit, bx, BGH, tx, BGH, tx, BGH - h);
      }
      for (let k = 0; k < 5; k++) {
        const bx = 14 + k * 50 + R.int(-10, 10), w = 12 + R.int(0, 12), h = 22 + R.int(0, 34);
        bgTri(dark, bx, 0, bx + w, 0, bx + (w >> 1), h); bgTri(lit, bx, 0, bx + (w >> 1), 0, bx + (w >> 1), h);
      }
    },
    // 4 Volcanic Vents: distant cones with glowing craters and a lava glow rising from the floor
    (R, layer) => {
      const cone = layer(0.06);
      for (let k = 0; k < 2; k++) {
        const cx = 50 + k * 120 + R.int(-20, 30), w = 70 + R.int(0, 30), h = 70 + R.int(0, 40);
        bgTri(cone, cx - w, BGH, cx + w, BGH, cx - 8, BGH - h); bgTri(cone, cx + 8, BGH - h, cx - 8, BGH - h, cx + w, BGH);
        bgRect(cone, cx - 8, BGH - h, 16, 2);
      }
      const lava = [220, 70, 20];
      [[198, 0.012], [188, 0.02], [177, 0.028], [166, 0.036], [155, 0.043], [144, 0.05]].forEach(([y0, a]) => {
        const m = layer(a, lava);
        for (let y = y0; y < BGH; y++) for (let x = 0; x < BGW; x++) if (y > y0 + 1 || ((x + y) & 1)) m[y * BGW + x] = 1;
      });
    },
    // 5 Abyss Temple: tall pillars with capitals and bases, some broken, in two depths
    (R, layer) => {
      const m = layer(0.075), far = layer(0.04);
      for (let k = 0; k < 6; k++) {
        const t = k & 1 ? far : m, x = 8 + k * 42 + R.int(-6, 6), h = (k & 1 ? 70 : 100) + R.int(0, 70), top = BGH - h;
        bgRect(t, x, top + 5, 14, h - 11); bgRect(t, x - 3, top, 20, 5); bgRect(t, x - 3, BGH - 6, 20, 6);
      }
    },
  ];

  /** Near-black base colour of a round: the theme colour pulled slightly towards the variant's hue (G13). */
  function bgOf(i) {
    const def = THEME_DEFS[themeOf(i)], v = def.vars[variantOf(i)];
    const b = rgbOf(def.bg), t = rgbOf(tonedPalette(v)[2]);
    return hexOf(b[0] * 0.5 + t[0] * 0.11, b[1] * 0.5 + t[1] * 0.11, b[2] * 0.5 + t[2] * 0.11);
  }

  function bgCanvas(levelIndex) {
    ensure();
    const idx = Math.max(0, Math.min(29, levelIndex | 0));
    if (bgCache[idx]) return bgCache[idx];
    const def = THEME_DEFS[themeOf(idx)], v = def.vars[variantOf(idx)], pal = tonedPalette(v);
    const top = rgbOf(bgOf(idx)), mid = rgbOf(pal[3]);
    const bottom = top.map((c, k) => c * 0.88 + mid[k] * 0.1);            // a little lighter / warmer towards the floor
    const img = new ImageData(BGW, BGH), d = img.data, bayer = [[0, 2], [3, 1]];
    const STEPS = 4;
    for (let y = 0; y < BGH; y++) for (let x = 0; x < BGW; x++) {
      const q = Math.max(0, Math.min(STEPS, Math.floor((y / (BGH - 1)) * STEPS + (bayer[y & 1][x & 1] / 4 - 0.375) * 0.9 + 0.5))) / STEPS;
      const i = (y * BGW + x) * 4;
      d[i] = top[0] + (bottom[0] - top[0]) * q; d[i + 1] = top[1] + (bottom[1] - top[1]) * q; d[i + 2] = top[2] + (bottom[2] - top[2]) * q; d[i + 3] = 255;
    }
    // the silhouette colour is pal[4]; for the dark blue-slate themes (ship, temple) it is lifted towards white (alpha stays <= 0.12), kelp a little
    const lift = [0, 0.25, 0.55, 0, 0, 0.55][themeOf(idx)], layers = [];
    const silhouette = rgbOf(pal[4]).map((c) => c + (255 - c) * lift);
    const R = U.rng(idx * 7919 + 101);
    BG_PAINTERS[themeOf(idx)](R, (alpha, rgb) => { const m = new Uint8Array(BGW * BGH); layers.push({ m, a: Math.min(0.12, alpha * 1.25), rgb: rgb || silhouette }); return m; });
    const mirror = variantOf(idx) % 2 === 1;                              // every other variant is mirrored: more layouts
    for (const { m, a, rgb } of layers) {
      if (mirror) for (let y = 0; y < BGH; y++) for (let x = 0; x < BGW >> 1; x++) { const i0 = y * BGW + x, i1 = y * BGW + BGW - 1 - x, tmp = m[i0]; m[i0] = m[i1]; m[i1] = tmp; }
      for (let p = 0; p < m.length; p++) if (m[p]) { const i = p * 4; d[i] += (rgb[0] - d[i]) * a; d[i + 1] += (rgb[1] - d[i + 1]) * a; d[i + 2] += (rgb[2] - d[i + 2]) * a; }
    }
    const cv = mk(BGW, BGH);
    cv.getContext('2d').putImageData(img, 0, 0);
    return (bgCache[idx] = cv);
  }

  // ===================================================================================================
  // 9. LOGO: puffy bubble letters. Each letter is a stroke skeleton swept with a round brush (R px), turned
  //    into a pixel mask, then outlined (2 px), bevelled (lit top-left / shaded bottom-right) and filled
  //    with a dithered pink -> aqua gradient. Wobble + a sweeping shine are applied while drawing.
  // ===================================================================================================
  const LOGO_UNIT = 4.0, LOGO_R = 3.4, LOGO_OUT = 2, LOGO_PAD = 5;
  const ring = (cx, cy, rx, ry, a0 = 0, a1 = Math.PI * 2, n = 28) => Array.from({ length: n + 1 }, (_, i) => {
    const a = a0 + ((a1 - a0) * i) / n;
    return [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry];
  });
  const LOGO_GLYPHS = {
    F: { w: 3.1, strokes: [[[0, 0], [0, 5.6]], [[0, 0], [3.1, 0]], [[0, 2.8], [2.4, 2.8]]] },
    I: { w: 2.2, strokes: [[[1.1, 0], [1.1, 5.6]], [[0, 0], [2.2, 0]], [[0, 5.6], [2.2, 5.6]]] },
    Z: { w: 3.3, strokes: [[[0, 0], [3.3, 0], [0, 5.6], [3.3, 5.6]]] },
    '&': { w: 4.3, strokes: [ring(1.6, 1.25, 1.1, 1.15), ring(1.8, 4.0, 1.8, 1.55), [[2.7, 3.0], [4.2, 5.6]]] },
    P: { w: 3.1, strokes: [[[0, 0], [0, 5.6]], [[0, 0], [2.2, 0], [3.1, 0.8], [3.1, 2.0], [2.2, 2.8], [0, 2.8]]] },
    O: { w: 3.3, strokes: [ring(1.65, 2.8, 1.65, 2.8, 0, Math.PI * 2, 32)] },
  };
  const LOGO_TEXT = 'FIZZ & POP';
  const LOGO_GAP = 2, LOGO_SPACE = 10;
  const LOGO_STOPS = [[0, [255, 92, 168]], [0.38, [214, 110, 255]], [0.68, [90, 184, 255]], [1, [96, 246, 232]]];
  const LOGO_GOLD = [255, 226, 107], LOGO_DEEP = [84, 36, 150];
  let logo = null;            // { letters: [{ch, x, sx, w, h}], width, fill, mask, shadow (3 strips of all letters) }
  let logoScratch = null;

  const logoGradient = (tt, out) => {
    for (let i = 1; i < LOGO_STOPS.length; i++) {
      if (tt <= LOGO_STOPS[i][0] || i === LOGO_STOPS.length - 1) {
        const [t0, c0] = LOGO_STOPS[i - 1], [t1, c1] = LOGO_STOPS[i];
        const k = Math.max(0, Math.min(1, (tt - t0) / (t1 - t0)));
        out[0] = c0[0] + (c1[0] - c0[0]) * k; out[1] = c0[1] + (c1[1] - c0[1]) * k; out[2] = c0[2] + (c1[2] - c0[2]) * k;
        return;
      }
    }
  };

  function buildLogo() {
    const items = [];
    let x = 0, sheetW = 0;
    const H = Math.ceil(5.6 * LOGO_UNIT + LOGO_R * 2) + LOGO_OUT * 2 + 1;
    for (const ch of LOGO_TEXT) {
      if (ch === ' ') { x += LOGO_SPACE; continue; }
      const gl = LOGO_GLYPHS[ch];
      const w = Math.ceil(gl.w * LOGO_UNIT + LOGO_R * 2) + LOGO_OUT * 2 + 1;
      items.push({ ch, gl, x, sx: sheetW, w, h: H });
      x += w - LOGO_OUT + LOGO_GAP;
      sheetW += w;
    }
    const total = x - LOGO_GAP + LOGO_OUT;
    const fillImg = new ImageData(sheetW, H), maskImg = new ImageData(sheetW, H), shImg = new ImageData(sheetW, H);
    const df = fillImg.data, dm = maskImg.data, ds = shImg.data;
    const bayer = [[0, 2], [3, 1]];
    const RO = LOGO_R + LOGO_OUT, col = [0, 0, 0];
    for (const it of items) {
      const { gl, w, h, sx } = it;
      const mask = new Uint8Array(w * h), outer = new Uint8Array(w * h);
      const ox = LOGO_OUT + LOGO_R, oy = LOGO_OUT + LOGO_R;
      // 1) sweep a round brush along the skeleton: mask (R) and outline mask (R + 2)
      for (const pts of gl.strokes) {
        for (let k = 0; k + 1 < pts.length; k++) {
          const [x0, y0] = pts[k], [x1, y1] = pts[k + 1];
          const n = Math.ceil(Math.sqrt((x1 - x0) * (x1 - x0) + (y1 - y0) * (y1 - y0)) * LOGO_UNIT * 0.8) + 1;
          for (let i = 0; i <= n; i++) {
            const px = ox + (x0 + ((x1 - x0) * i) / n) * LOGO_UNIT, py = oy + (y0 + ((y1 - y0) * i) / n) * LOGO_UNIT;
            for (let yy = Math.max(0, Math.floor(py - RO)); yy <= Math.min(h - 1, Math.ceil(py + RO)); yy++) {
              for (let xx = Math.max(0, Math.floor(px - RO)); xx <= Math.min(w - 1, Math.ceil(px + RO)); xx++) {
                const d2 = (xx - px) * (xx - px) + (yy - py) * (yy - py);
                if (d2 <= (LOGO_R + 0.2) * (LOGO_R + 0.2)) mask[yy * w + xx] = 1;
                if (d2 <= (RO + 0.2) * (RO + 0.2)) outer[yy * w + xx] = 1;
              }
            }
          }
        }
      }
      const m = (xx, yy) => (xx >= 0 && yy >= 0 && xx < w && yy < h ? mask[yy * w + xx] : 0);
      // 2) colour: gradient over the whole logo ('&' in gold), dithered vertical shading, bevel rims
      for (let yy = 0; yy < h; yy++) {
        for (let xx = 0; xx < w; xx++) {
          const p = yy * w + xx, i = (yy * sheetW + sx + xx) * 4;
          if (outer[p]) { ds[i] = 10; ds[i + 1] = 4; ds[i + 2] = 30; ds[i + 3] = 255; }
          if (!mask[p]) {
            if (outer[p]) { df[i] = 27; df[i + 1] = 16; df[i + 2] = 51; df[i + 3] = 255; }
            continue;
          }
          dm[i + 3] = 255;
          if (it.ch === '&') { col[0] = LOGO_GOLD[0]; col[1] = LOGO_GOLD[1]; col[2] = LOGO_GOLD[2]; } else logoGradient((it.x + xx) / total, col);
          const lvl = ((yy - LOGO_OUT) / (h - LOGO_OUT * 2)) * 5 + (bayer[yy & 1][xx & 1] / 4 - 0.375) * 0.8;
          const toWhite = lvl < 1, k = toWhite ? 0.28 : lvl < 3.2 ? 0 : lvl < 4.2 ? 0.22 : 0.42;
          const lit = !m(xx - 2, yy - 2) || !m(xx - 1, yy - 1);
          const shaded = !lit && (!m(xx + 2, yy + 2) || !m(xx + 1, yy + 1));
          for (let c = 0; c < 3; c++) {
            let v = col[c];
            v += ((toWhite ? 255 : LOGO_DEEP[c]) - v) * k;
            if (lit) v += (255 - v) * 0.62; else if (shaded) v += (LOGO_DEEP[c] - v) * 0.3;
            df[i + c] = v;
          }
          df[i + 3] = 255;
        }
      }
    }
    const strip = (img) => { const c = mk(sheetW, H); c.getContext('2d').putImageData(img, 0, 0); return c; };
    logo = { letters: items, width: total, height: H, fill: strip(fillImg), mask: strip(maskImg), shadow: strip(shImg) };
    logoScratch = mk(items[0].w + 4, H + 4);
  }

  /** Logo with its top edge at y, horizontally centred on cx. t = frame counter (animation). */
  function drawLogo(ctx, cx, y, t) {
    ensure();
    if (!logo) buildLogo();
    const x0 = Math.round(cx - logo.width / 2);
    const smooth = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = false;
    const prevAlpha = ctx.globalAlpha;
    const bandX = ((t * 1.7) % (logo.width + 90)) - 45;           // diagonal shine sweeping across the logo
    const sg = logoScratch.getContext('2d');
    for (let i = 0; i < logo.letters.length; i++) {
      const L = logo.letters[i];
      const wob = Math.round(Math.sin(t / 13 + i * 0.75) * 2);
      const lx = x0 + L.x, ly = y + LOGO_PAD + wob;
      ctx.globalAlpha = prevAlpha * 0.5; ctx.drawImage(logo.shadow, L.sx, 0, L.w, L.h, lx + 2, ly + 3, L.w, L.h); ctx.globalAlpha = prevAlpha;
      ctx.drawImage(logo.fill, L.sx, 0, L.w, L.h, lx, ly, L.w, L.h);
      const rel = bandX - L.x;
      if (rel > -14 && rel < L.w + L.h + 14) {                    // shine: white diagonal band clipped to the letter
        sg.clearRect(0, 0, logoScratch.width, logoScratch.height);
        sg.fillStyle = 'rgba(255,255,255,0.75)';
        sg.beginPath(); sg.moveTo(rel + L.h, 0); sg.lineTo(rel + L.h + 6, 0); sg.lineTo(rel + 6, L.h); sg.lineTo(rel, L.h); sg.closePath(); sg.fill();
        sg.globalCompositeOperation = 'destination-in'; sg.drawImage(logo.mask, L.sx, 0, L.w, L.h, 0, 0, L.w, L.h); sg.globalCompositeOperation = 'source-over';
        ctx.drawImage(logoScratch, lx, ly);
      }
    }
    // three little bubbles drifting up from the logo's top edge
    for (let k = 0; k < 3; k++) {
      const ph = ((t * 0.45 + k * 43) % 130) / 130;
      const bx = x0 + [40, 112, logo.width - 36][k] + Math.round(Math.sin(t / 17 + k * 2) * 3);
      draw(ctx, 'bubble_shot', k % 2 ? 1 : 2, bx - 8, y + 4 - ph * 26 - 8, { alpha: Math.min(1, (1 - ph) * 1.6) });
    }
    ctx.imageSmoothingEnabled = smooth;
  }

  // ===================================================================================================
  // 10. SHEET (debug): every sprite x every frame, labelled, on a dark dotted grid
  // ===================================================================================================
  function sheet() {
    ensure();
    const W = 640, PADX = 4;
    const cells = ORDER.map((n) => ({ n, w: REG[n].w, h: REG[n].h, f: REG[n].n }));
    let x = PADX, y = 4, rowH = 0;
    const placed = cells.map((c) => {
      const cw = Math.max(c.f * (c.w + 2), textWidth(c.n)) + 6;
      const ch = c.h + 12;
      if (x + cw > W) { x = PADX; y += rowH + 4; rowH = 0; }
      const p = { c, x, y };
      x += cw; rowH = Math.max(rowH, ch);
      return p;
    });
    const cv = mk(W, y + rowH + 8);
    const g = cv.getContext('2d');
    g.fillStyle = '#10101c'; g.fillRect(0, 0, cv.width, cv.height);
    g.fillStyle = '#1a1a2c';
    for (let yy = 0; yy < cv.height; yy += 8) for (let xx = 0; xx < cv.width; xx += 8) g.fillRect(xx, yy, 1, 1);
    for (const { c, x: px, y: py } of placed) {
      text(g, c.n, px, py, '#9ab4d0', { shadow: false });
      for (let f = 0; f < c.f; f++) draw(g, c.n, f, px + f * (c.w + 2), py + 10);
    }
    return cv;
  }

  // ===================================================================================================
  // @@ART-HERE@@
  // ===================================================================================================

  // ===================================================================================================
  // N. Public API
  // ===================================================================================================
  const timings = {};
  const timed = (name, fn) => { const t0 = performance.now(); fn(); timings[name] = +(performance.now() - t0).toFixed(1); };
  function buildAll() {
    timed('players', buildPlayers);
    timed('bubbles', buildBubbles);
    timed('effects', buildEffects);
    timed('enemies', buildEnemies);
    timed('items', buildItems);
    lazyGroup([['kraken', 48, 48, 2], ['kraken_angry', 48, 48, 2], ['kraken_trapped', 64, 64, 1], ['moonpearl', 32, 32, 2]], buildKraken);
  }
  function buildPlayers() {
    const F = playerFrame;
    const idle0 = F({});
    const idle1 = F({ eyes: EYE_BLINK, frondDy: 1, tail: TAIL.mid });
    const walk = [
      F({ body: BODY_PARTS.contact, dy: 1, tail: TAIL.up }),
      F({ body: BODY_PARTS.passR, tail: TAIL.mid, frondDy: -1 }),
      F({ body: BODY_PARTS.contact, dy: 1, tail: TAIL.mid, frondDy: 1 }),
      F({ body: BODY_PARTS.passL, tail: TAIL.mid, frondDy: -1 }),
    ];
    const jump = F({ body: BODY_PARTS.tuck, mouth: M_O, mouthX: 10, tail: TAIL.up, frondDy: 1 });
    const fall = F({ body: BODY_PARTS.dangle, mouth: M_O, mouthX: 10, tail: TAIL.down, frondDy: -1 });
    const shoot = [
      F({ cheeks: true, eyes: EYE_SQUINT, mouth: M_PUCKER, mouthX: 10, body: BODY_PARTS.shoot }),
      F({ eyes: EYE_SQUINT, mouth: M_O, mouthX: 10, body: BODY_PARTS.shoot, dy: 0 }),
    ];
    const hurt = F({ body: BODY_PARTS.flung, eyes: EYE_X, eyeX: [6, 10], eyeY: 5, mouth: M_WAVY, mouthX: 8, blush: false, frondDy: -1 });
    const stun = [
      F({ eyes: EYE_SPIRAL_A, eyeX: [6, 10], eyeY: 5, mouth: M_WAVY, mouthX: 8, blush: false, extra: [[G('y..y\n.y.y'), 5, -1]] }),
      F({ eyes: EYE_SPIRAL_B, eyeX: [6, 10], eyeY: 5, mouth: M_WAVY, mouthX: 8, blush: false, frondDy: 1, extra: [[G('.y.y\ny..y'), 5, -1]] }),
    ];
    const icon = G(`
      ........
      .oooooo.
      obllbbbo
      gbbbbbbg
      obebbebo
      gbbGGbbg
      .obbbbo.
      ..oooo..`);
    const rotDie = (g) => [g, rot90(g), rot90(rot90(g)), rot90(rot90(rot90(g)))];
    const fin = (grids) => grids.map((g) => outlineGrid(g, 'o', false, SKIP_FRILL));
    const sets = {
      idle: fin([idle0, idle1]), walk: fin(walk), jump: fin([jump]), fall: fin([fall]), shoot: fin(shoot),
      die: rotDie(fin([hurt])[0]), stun: fin(stun),
    };
    for (const [pre, pal] of [['p1', PAL_P1], ['p2', PAL_P2]]) {
      for (const k of Object.keys(sets)) spriteFinished(pre + '_' + k, 16, 16, pal, sets[k]);
      sprite(pre + '_icon', 8, 8, pal, [icon], { outline: false });
    }
  }

  function init() {
    if (initDone) return;
    initDone = true;
    timed('font', buildFont);
    buildAll();
    timed('logo', buildLogo);
  }

  const ensure = () => { if (!initDone) init(); };            // forgiving: drawing before init() just builds first
  const has = (name) => { ensure(); return name in REG; };
  const frames = (name) => (has(name) ? REG[name].n : 0);
  const size = (name) => (has(name) ? { w: REG[name].w, h: REG[name].h } : { w: 0, h: 0 });
  const warned = Object.create(null);

  function draw(ctx, name, frame, x, y, opts) {
    ensure();
    const s = REG[name];
    if (!s) {
      if (!warned[name]) { warned[name] = true; console.warn('GFX: unknown sprite ' + name); }
      ctx.fillStyle = '#f0f'; ctx.fillRect(Math.round(x), Math.round(y), 16, 16);
      return;
    }
    let f = Math.floor(frame) % s.n;
    if (!(f >= 0)) f = f < 0 ? f + s.n : 0;
    const o = opts || {};
    const cv = variant(s, !!o.flip, !!o.white);
    const a = o.alpha === undefined ? 1 : o.alpha;
    const sx = f * s.w;                                  // a flipped strip mirrors every frame in place
    if (a === 1) { ctx.drawImage(cv, sx, 0, s.w, s.h, Math.round(x), Math.round(y), s.w, s.h); return; }
    const prev = ctx.globalAlpha;
    ctx.globalAlpha = prev * a;
    ctx.drawImage(cv, sx, 0, s.w, s.h, Math.round(x), Math.round(y), s.w, s.h);
    ctx.globalAlpha = prev;
  }

  const _registry = () => (ensure(), ORDER).map((n) => ({ name: n, w: REG[n].w, h: REG[n].h, frames: REG[n].n }));
  const _lint = () => lintLog.slice();
  const _timings = () => Object.assign({}, timings);

  return { init, draw, frames, size, has, text, textWidth, levelCanvas, bgCanvas, theme, drawLogo, sheet, _registry, _lint, _timings };
})();

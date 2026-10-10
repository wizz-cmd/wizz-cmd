/* FIZZ & POP — 20_audio.js
 * AUDIO: pure WebAudio chiptune synth + look-ahead sequencer + SFX bank.  Contract: SPEC §3.2 / §6, amended by FIXPLAN §0/§3 and FIXPLAN2 K7.
 *
 * ARCHITECTURE
 *  - Everything audible is built by voice functions that take (ctx, destination, time, params), so the very
 *    same code runs on the live AudioContext and on an OfflineAudioContext (AUDIO._renderOffline).
 *  - Signal path:  [track buses | sfx group]  ->  music/sfx bus -> master -> DynamicsCompressor (gentle glue: -14 dB, 2.5:1) ->
 *    soft-clip safety shaper (hard ceiling < 0.9) -> mute gain -> destination.  Lead notes also feed a
 *    ping-pong echo (light, tempo-synced) that returns into the music bus.
 *  - Sequencer: songs are tracker-like strings compiled lazily to a per-16th-step event table.  A
 *    setInterval (25 ms) pump schedules events HORIZON (0.28 s) ahead on AudioContext time.  The step clock is
 *    advanced one step at a time using the *current* tempo, so AUDIO.setTempo() takes effect on the next
 *    unscheduled step with no glitch.  Swing is a per-beat duration pattern (steps 0,1 long / 2,3 short).
 *  - Every playing track owns a gain "out" + voice buses and a registry of its source nodes; stopping a
 *    track fades it, stops its sources and disconnects it, so rapid switching never stacks tracks.
 *    Counters in `live` (voices / tracks / groups) are exposed through AUDIO._stats() for leak tests.
 *
 * SONG NOTATION (see songDefs())
 *  - Note strings: `c5/2 d#5 r/4 ...`  pitch = letter[#|b]octave (c4 = middle C = MIDI 60), `/n` = length in
 *    16th steps (default 2), `r` = rest, `|` = bar line (cosmetic, but validated: every bar must add up).
 *  - Chords: `| G | Em.Am7 | ...`  one bar per `|`; chords joined by `.` share the bar equally; `C/8` = explicit
 *    length in steps (used by jingles).  Qualities: '' m 7 m7 maj7 m7b5 dim sus 7sus 6 m6 5.
 *  - Bass / arp patterns: a cell of chord-relative symbols tiled across each chord.  1 root, 3 third, 5 fifth,
 *    7 seventh, 8 root+oct, a third+oct, c fifth+oct, e seventh+oct, 9 ninth, 6 sixth, 2 second, 4 fourth,
 *    b fifth (alias of 5).  `-` extends the previous note, `.` is a rest.  Bass roots live in MIDI 43..54 (G2..F#3).
 *  - Drum cells (16 chars/bar): k kick, s snare, x ghost snare, h hat, o open hat, t hi tom, u lo tom,
 *    c crash+kick, K kick+hat, S snare+hat.
 *  - Per-song options: `lift` (semitones added on every second pass of a loop: the same loop sounds different on its
 *    next hearing), `maxTempo` (cap for setTempo on that track), `mix` ({lead,harm,bass,drum} bus gains), `cfg` (voice
 *    overrides).  Per-section: `mix` ({lead,harm,bass,drum} multipliers, 0 = voice tacet: breakdowns / drum drop-outs).
 *
 * DESIGN CHOICES where the SPEC is silent
 *  - Calls before init(): sfx are dropped silently; music()/jingle() are remembered (a requested loop starts as
 *    soon as init() has created the context; a jingle called before init() just fires onEnd after its nominal
 *    length so game flow never stalls).  A jingle whose context never starts running (autoplay blocked) is
 *    force-finished by a wall-clock watchdog (paused time is not counted against it).
 *  - jingle(): onEnd fires when the jingle's timeline ends (once; JINGLE_END_LEAD = 40 ms early, so a loop requested from onEnd is
 *    still chained sample-accurately on the jingle's end line).  If the jingle is interrupted by another
 *    music()/jingle()/stopMusic() call its onEnd is dropped.  With {resume:true} the previous loop continues
 *    sample-accurately at the beginning of the bar it was in.  Jingles ignore setTempo().  A jingle starts at once; a loop it
 *    replaces is faded out over 150 ms under its attack (the old 40 ms fade chopped the phrase audibly).
 *  - music(name) while a jingle is playing does not cut the jingle: the requested loop is queued and starts sample-
 *    accurately when the jingle ends (same loop as the jingle's resume target = no-op), however late in the jingle it is requested
 *    (once the jingle's last notes are scheduled the loop is chained behind it at once).  The `start` jingle is 2.25 s (FIXPLAN2 K7:
 *    over before the 2.5 s round-1 intro), so Game's onEnd -> music(stage) lands on its end line.  music(name) while another
 *    LOOP is sounding is bar-aligned: the old loop plays to the end of its bar (a half bar / beat when a bar would take
 *    more than 1.6 s), then fades out over 0.2 s while the new loop starts sample-accurately on that line.  Asking for
 *    the sounding loop again cancels a pending switch.  music(name, {restart:true}) and stopMusic() act immediately.
 *  - setTempo is global state and persists across tracks (Game resets it to 1.0 at round start).
 *  - Mute is a master gain at the end of the chain plus "don't create nodes" in the scheduler; the timeline keeps
 *    running so jingle onEnd and loop positions stay right.
 *  - pause({suspend}): the scheduler stops at once and the music ducks out in ~60 ms.  suspend:true (default; blur / hidden
 *    tab): ready() turns false and the context is suspended 320 ms later (so a 'pause' blip played around the call is still
 *    heard).  suspend:false (manual pause screen): the context keeps running so menu sfx still play.  resume() undoes
 *    either, shifts every timeline by the time that passed (loops continue where they were, a half-played jingle plays
 *    out) and recovers a context that was suspended from outside.  sfx() are ignored while muted or suspended.
 *  - Failures: every scheduled event, the scheduler tick and every sfx are wrapped in try/catch.  A failing call costs
 *    that one sound; after FAULT_LIMIT (20) failing scheduler steps (sporadic ones heal after ~1 s of clean ticks) the music is
 *    switched off with a single console.warn; an sfx that fails 6 times is disabled.  Nothing ever throws into game code.
 *  - SFX voice limits steal the oldest instance of the same sound (pop x3, shoot x2, boss_hit x2 ...); a global
 *    source-node budget (MAX_VOICES) drops new SFX when exceeded.  Music is never dropped.
 *  - sfx options: {pitch: semitones, vol}.  `kill` is designed for pitch 0..+12 (Game: min(2*chain index, 12): a rising ladder).
 *    `clear` = round-clear stinger (<= 0.8 s).  boss_die has no chime tail (the clear_boss fanfare follows 1 s later).
 *  - Mix targets (verified by test/audio_analyze.mjs): music RMS -18..-20 dBFS, SFX calibrated PERCEPTUALLY: every non-quiet SFX
 *    sits on the same A-weighted active level (-19 dB, +-0.5), quiet ones (menu_move -9 dB, land -12 dB) below it; output peak
 *    <= 0.9 even with 18 SFX piled on the boss loop.  The per-SFX `trim` constants come from
 *    `node test/audio_analyze.mjs --apply-trims --target -19` (repeat until flat).
 *  - Non-contract debug extras: _info(name), _dump(name), _validate(), _stats(), _state(), _tap(), _seek(step); _renderOffline
 *    accepts a 3rd options argument {tempo, skip, sfx, noComp, noTrim, chunk, pitch, pass, vol} used by the tests only.
 */
const AUDIO = (() => {
  // ================================================================================================
  // names / constants
  // ================================================================================================
  const LOOPS = ['title', 'stage1', 'stage2', 'boss', 'entry', 'ending'];
  const JINGLES = ['start', 'extend', 'gameover', 'clear_boss'];
  const SFX_NAMES = ['jump', 'shoot', 'pop', 'trap', 'kill', 'bounce', 'food', 'powerup', 'item_appear',
    'letter', 'oneup', 'death', 'hurry', 'ghost', 'thunder', 'fire', 'water', 'freeze', 'bomb',
    'menu_move', 'menu_select', 'pause', 'boss_hit', 'boss_die', 'enemy_shot', 'spawn', 'land', 'clear'];

  const TICK_MS = 25;            // scheduler pump interval
  const HORIZON = 0.28;          // schedule this far ahead of AudioContext.currentTime (s); survives ~250 ms main-thread stalls
  const START_DELAY = 0.06;      // first step of a fresh track starts this far in the future
  const FADE_SWITCH = 0.04;      // fade used when a track is replaced at once (s)
  const FADE_XFADE = 0.2;        // fade-out of the old loop when a bar-aligned loop->loop switch lands (s)
  const SWITCH_MAX_WAIT = 1.6;   // a bar-aligned switch waits at most this long (s); longer bars fall back to half bars / beats
  const JINGLE_END_LEAD = 0.04;  // a jingle reports its end (onEnd) up to this early, so a loop requested from onEnd can still be chained on the line
  const FADE_JINGLE = 0.15;      // a jingle that replaces a sounding loop: the loop is faded out under the jingle's attack (no 40 ms chop)
  const PAUSE_SUSPEND_MS = 320;  // pause(): context is suspended this long after the music has ducked out
  const FAULT_LIMIT = 20;        // failing scheduler steps tolerated before the music is switched off for good
  const SFX_FAULT_LIMIT = 6;     // exceptions tolerated per sfx name before that sfx is disabled
  const STEPS_PER_BAR = 16;
  const OFFLINE_RATE = 44100;
  const OFFLINE_CHUNK = 2;       // seconds of music scheduled per slice in _renderOffline
  const MAX_VOICES = 90;         // global source-node budget; new SFX are dropped above this
  const MUSIC_LEVEL = 0.62, SFX_LEVEL = 1.5, MASTER_LEVEL = 0.95;
  const ECHO_FEEDBACK = 0.33, ECHO_SEND = 0.2;

  // ================================================================================================
  // small helpers
  // ================================================================================================
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const noop = () => {};
  const warned = {};
  function warnOnce(kind, name) {
    const k = kind + ':' + name;
    if (warned[k]) return;
    warned[k] = true;
    try { console.warn('AUDIO: unknown ' + kind + ' "' + name + '"'); } catch (e) { /* no console */ }
  }
  function safeCall(fn) { try { if (typeof fn === 'function') fn(); } catch (e) { /* user callback must not break audio */ } }

  // deterministic "random" start offsets into the noise buffer (reproducible offline renders)
  let nzState = 0x1234567;
  function nzReset() { nzState = 0x1234567; }
  function nzOffset() {
    nzState ^= nzState << 13; nzState >>>= 0;
    nzState ^= nzState >>> 17;
    nzState ^= nzState << 5; nzState >>>= 0;
    return (nzState % 100000) / 100000;     // 0..1
  }

  // ================================================================================================
  // live counters + source registries (leak accounting)
  // ================================================================================================
  const live = { voices: 0, tracks: 0, groups: 0, resyncs: 0 };
  let REG = null;                 // registry that receives every source node created right now

  function makeRegistry(onIdle) {
    const set = new Set();
    const r = {
      set, onIdle,
      add(src) { set.add(src); live.voices++; src.onended = () => r.drop(src); },
      drop(src) { if (set.delete(src)) { live.voices--; if (!set.size && r.onIdle) r.onIdle(); } },
      stopAll(when) { for (const s of set) { try { s.stop(when); } catch (e) { /* not started / already stopped */ } } },
      clear() { r.onIdle = null; for (const s of Array.from(set)) r.drop(s); },
    };
    return r;
  }
  function reg(src) { if (REG) REG.add(src); return src; }

  // ================================================================================================
  // per-context caches: noise buffer, pulse PeriodicWaves, bass wave
  // ================================================================================================
  const envs = new WeakMap();
  function env(ctx) {
    let e = envs.get(ctx);
    if (!e) {
      const len = Math.floor(ctx.sampleRate * 2);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      const rnd = U.rng(20240607);
      for (let i = 0; i < len; i++) d[i] = rnd.next() * 2 - 1;
      e = { noise: buf, pulse: {}, bass: null };
      envs.set(ctx, e);
    }
    return e;
  }
  /** Pulse wave with the given duty (fraction of the period spent high). Fourier series of a rectangular pulse. */
  function pulseWave(ctx, duty) {
    const e = env(ctx);
    const key = String(duty);
    if (!e.pulse[key]) {
      const N = 48;
      const re = new Float32Array(N + 1), im = new Float32Array(N + 1);
      for (let n = 1; n <= N; n++) {
        re[n] = Math.sin(2 * Math.PI * n * duty) / (n * Math.PI);
        im[n] = (1 - Math.cos(2 * Math.PI * n * duty)) / (n * Math.PI);
      }
      e.pulse[key] = ctx.createPeriodicWave(re, im);
    }
    return e.pulse[key];
  }
  /**
   * Triangle core plus a deliberately strong 2nd-4th harmonic set (h2 .30, h3 .20, h4 .12 of the fundamental) so the bass
   * line still speaks on phone / laptop speakers that roll off below ~150-300 Hz (QA A9): the harmonics sit at 200-800 Hz.
   */
  function bassWave(ctx) {
    const e = env(ctx);
    if (!e.bass) {
      const N = 16;
      const re = new Float32Array(N + 1), im = new Float32Array(N + 1);
      for (let n = 1; n <= N; n++) {
        const odd = n % 2 === 1;
        const tri = odd ? (((n - 1) / 2) % 2 === 0 ? 1 : -1) / (n * n) : 0;
        im[n] = n === 1 ? 1 : n === 2 ? 0.30 : n === 3 ? 0.20 : n === 4 ? 0.12 : tri;
      }
      e.bass = ctx.createPeriodicWave(re, im);
    }
    return e.bass;
  }
  function setWave(ctx, osc, w) {
    if (typeof w === 'number') osc.setPeriodicWave(pulseWave(ctx, w));
    else if (w === 'bass') osc.setPeriodicWave(bassWave(ctx));
    else osc.type = w === 'saw' ? 'sawtooth' : (w || 'sine');
  }
  function noiseSource(ctx, t, dur) {
    const s = reg(ctx.createBufferSource());
    s.buffer = env(ctx).noise;
    s.loop = true;
    s.start(t, nzOffset() * 1.5);
    s.stop(t + dur);
    return s;
  }

  // ================================================================================================
  // synth primitives (used by SFX; parameterised by ctx / destination / time)
  // ================================================================================================
  /**
   * tone: oscillator with an optional exponential pitch path and an amplitude envelope.
   *  o.w   'sine'|'triangle'|'saw'|'bass'|number (pulse duty)       o.f / o.f2   start / end Hz
   *  o.pts [[seconds, Hz], ...] explicit pitch path (overrides f/f2) o.d          total duration (s)
   *  o.v   peak gain      o.a attack (s)     o.sh 'exp' (default, decaying) | 'hold' (flat, then release o.r)
   *  o.at  start offset   o.vib [Hz, cents, delay s] vibrato (detune curve)   o.fix true = ignore the sfx pitch option
   *  P     {f: pitch factor, v: volume factor} from the sfx() options
   */
  function tone(ctx, dest, t, o, P) {
    const pf = P && !o.fix ? P.f : 1, pv = P ? P.v : 1;
    t += o.at || 0;
    const d = o.d;
    const osc = reg(ctx.createOscillator());
    try {
      setWave(ctx, osc, o.w);
      const pts = o.pts || [[0, o.f], [d, o.f2 || o.f]];
      osc.frequency.setValueAtTime(pts[0][1] * pf, t);
      for (let i = 1; i < pts.length; i++) osc.frequency.exponentialRampToValueAtTime(pts[i][1] * pf, t + pts[i][0]);
      if (o.vib && d > o.vib[2] + 0.04) vibrato(osc, t + o.vib[2], d - o.vib[2], o.vib[0], o.vib[1]);
      const g = ctx.createGain();
      const v = o.v * pv, a = Math.min(o.a === undefined ? 0.004 : o.a, d * 0.5);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(v, t + a);
      if (o.sh === 'hold') {
        const r = Math.min(o.r === undefined ? 0.03 : o.r, d - a);
        g.gain.setValueAtTime(v, t + d - r);
        g.gain.linearRampToValueAtTime(0, t + d);
      } else {
        g.gain.exponentialRampToValueAtTime(0.0008, t + d);
      }
      osc.connect(g); g.connect(dest);
      osc.start(t); osc.stop(t + d + 0.02);
    } catch (e) { if (REG) REG.drop(osc); throw e; }
  }
  /** Sine vibrato on osc.detune via one value curve (cheap, no LFO nodes). Depth ramps in over ~0.15 s. */
  function vibrato(osc, t0, dur, hz, cents) {
    if (!osc.detune) return;                                // very old engines: no detune AudioParam -> no vibrato
    const n = Math.max(16, Math.ceil(dur * 60));
    const curve = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * dur;
      curve[i] = Math.sin(2 * Math.PI * hz * x) * cents * Math.min(1, x / 0.15);
    }
    osc.detune.setValueCurveAtTime(curve, t0, dur);
  }
  /**
   * noise: filtered white noise burst.  o.ft filter type, o.f / o.f2 centre/cutoff sweep, o.q, o.d, o.v, o.a, o.at
   */
  function noise(ctx, dest, t, o, P) {
    const pf = P && !o.fix ? P.f : 1, pv = P ? P.v : 1;
    t += o.at || 0;
    const d = o.d;
    const src = noiseSource(ctx, t, d + 0.02);
    const f = ctx.createBiquadFilter();
    f.type = o.ft || 'bandpass';
    f.frequency.setValueAtTime(o.f * pf, t);
    if (o.f2) f.frequency.exponentialRampToValueAtTime(o.f2 * pf, t + d);
    f.Q.value = o.q === undefined ? 0.8 : o.q;
    const g = ctx.createGain();
    const v = o.v * pv, a = Math.min(o.a === undefined ? 0.003 : o.a, d * 0.5);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(v, t + a);
    g.gain.exponentialRampToValueAtTime(0.0008, t + d);
    src.connect(f); f.connect(g); g.connect(dest);
  }
  /** Bell: fundamental plus two inharmonic-ish partials, exponential decay. */
  function bell(ctx, dest, t, o, P) {
    tone(ctx, dest, t, { w: 'sine', f: o.f, d: o.d, v: o.v, at: o.at, fix: o.fix }, P);
    tone(ctx, dest, t, { w: 'sine', f: o.f * 2.01, d: o.d * 0.7, v: o.v * 0.33, at: o.at, fix: o.fix }, P);
    tone(ctx, dest, t, { w: 'sine', f: o.f * 3.97, d: o.d * 0.4, v: o.v * 0.14, at: o.at, fix: o.fix }, P);
  }
  /** Kit handed to sfx definitions: all calls are relative to the sfx start time.  k.semi = the pitch option (semitones). */
  function kit(ctx, dest, t, P) {
    return {
      semi: P ? Math.round(12 * Math.log2(P.f)) : 0,
      tone: (o) => tone(ctx, dest, t, o, P),
      noise: (o) => noise(ctx, dest, t, o, P),
      bell: (o) => bell(ctx, dest, t, o, P),
      /** run of equal-length tones: freqs[], spacing `step`, template o */
      seq: (freqs, step, o) => freqs.forEach((f, i) => tone(ctx, dest, t,
        Object.assign({}, o, { f, f2: f, at: (o.at || 0) + i * step, d: o.d || step * 1.4 }), P)),
    };
  }

  // ================================================================================================
  // SFX bank
  // ================================================================================================
  // trim: per-sfx loudness calibration -- fitted on the A-WEIGHTED active level (target -19 dB) by `node test/audio_analyze.mjs
  // --apply-trims --target -19`, so a thud and a bell of the same trim-fitted level are equally loud to the ear (QA A2).
  // max: concurrent instances.  quiet: true = 9 dB below the target, a number = that many dB below (land: 12).  lvl: dB ABOVE the target for
  // very short, fast-decaying sounds (the ear integrates over ~100-200 ms, so a 100 ms blip needs a little more level than a sustained
  // sound of the same short-window level: boss_hit +3, enemy_shot +1.5, jump / pop +1).
  // Energy plan: the heavy sounds (thunder / bomb / boss_hit / boss_die / land) keep their weight in a 200-2500 Hz band plus a short
  // sub tail, so they survive laptop and phone speakers (QA A2).
  const SFX = {
    jump: { max: 2, trim: 2.38, lvl: 1, fn(k) {              // springy chirp, kept above ~350 Hz so it carries on small speakers
      k.tone({ w: 0.25, f: 400, f2: 900, d: 0.14, v: 0.5 });
      k.tone({ w: 'sine', f: 200, f2: 450, d: 0.14, v: 0.32 });
      k.noise({ ft: 'bandpass', f: 2400, q: 1, d: 0.03, v: 0.08 });
    } },
    shoot: { max: 2, trim: 1.27, fn(k) {            // soft bubble blow: two rising bloops + airy puff
      k.tone({ w: 'sine', f: 420, f2: 1150, d: 0.10, v: 0.55 });
      k.tone({ w: 'sine', f: 640, f2: 1500, d: 0.09, v: 0.35, at: 0.045 });
      k.noise({ ft: 'bandpass', f: 1800, f2: 3400, q: 1.3, d: 0.08, v: 0.16 });
    } },
    pop: { max: 3, trim: 1.22, lvl: 1, fn(k) {               // tiny click + falling blip
      k.noise({ ft: 'highpass', f: 3200, d: 0.05, v: 0.45 });
      k.tone({ w: 'sine', f: 1500, f2: 430, d: 0.075, v: 0.55 });
      k.tone({ w: 0.125, f: 2300, f2: 900, d: 0.04, v: 0.18 });
    } },
    trap: { max: 2, trim: 0.97, fn(k) {              // enemy gets sealed: two-stage rising "bwip" + whoosh
      k.tone({ w: 'sine', f: 520, f2: 1040, d: 0.10, v: 0.5 });
      k.tone({ w: 'triangle', f: 780, f2: 1560, d: 0.11, v: 0.45, at: 0.07 });
      k.tone({ w: 0.25, f: 1560, f2: 2300, d: 0.07, v: 0.2, at: 0.13 });
      k.noise({ ft: 'bandpass', f: 900, f2: 2600, q: 1, d: 0.16, v: 0.14 });
    } },
    kill: { max: 3, trim: 0.9, fn(k) {              // rising staircase + crack + thump; the pitch option climbs with the chain
      const vs = 1 - 0.018 * Math.max(0, k.semi);       // the higher it rings the louder it sounds: tame the top of the chain
      k.seq([523, 659, 784, 1047], 0.04, { w: 0.25, v: 0.42 * vs, d: 0.075 });
      k.noise({ ft: 'bandpass', f: 2600, q: 0.8, d: 0.07, v: 0.28 * vs });
      k.tone({ w: 'triangle', f: 330, f2: 90, d: 0.28, v: 0.45, fix: true });          // the thump keeps its pitch
      if (k.semi >= 6) k.bell({ f: 2093, at: 0.16, d: 0.2, v: 0.2 * vs });                // chain of 4+: a short bell on top
    } },
    bounce: { max: 2, trim: 1.85, fn(k) {            // boing
      k.tone({ w: 'triangle', pts: [[0, 220], [0.04, 640], [0.12, 340], [0.2, 430], [0.26, 380]], d: 0.26, v: 0.65, vib: [26, 90, 0.03] });
      k.tone({ w: 0.25, pts: [[0, 440], [0.04, 1280], [0.12, 680]], d: 0.13, v: 0.2 });
    } },
    food: { max: 3, trim: 0.89, fn(k) {              // two-note chime up
      k.tone({ w: 0.25, f: 1319, d: 0.08, v: 0.5 });
      k.tone({ w: 0.25, f: 1976, d: 0.16, v: 0.5, at: 0.06 });
      k.tone({ w: 'sine', f: 3951, d: 0.12, v: 0.1, at: 0.06 });
    } },
    powerup: { max: 1, trim: 0.78, fn(k) {           // fast E-minor-pentatonic run into a shimmering stab (all notes inside the music keys)
      k.seq([659, 784, 880, 988, 1175, 1319, 1568, 1760], 0.036, { w: 0.25, v: 0.38, d: 0.06 });
      k.tone({ w: 0.25, f: 1760, d: 0.26, v: 0.4, at: 0.29, vib: [14, 40, 0.02] });
      k.tone({ w: 0.125, f: 2637, d: 0.24, v: 0.2, at: 0.29 });
    } },
    item_appear: { max: 1, trim: 0.52, fn(k) {       // bloop + three twinkles
      k.tone({ w: 'sine', f: 600, f2: 1400, d: 0.08, v: 0.4 });
      k.bell({ f: 2093, at: 0.07, d: 0.2, v: 0.3 });
      k.bell({ f: 2637, at: 0.12, d: 0.2, v: 0.3 });
      k.bell({ f: 3136, at: 0.17, d: 0.22, v: 0.28 });
      k.noise({ ft: 'highpass', f: 7000, d: 0.2, v: 0.05, at: 0.07 });
    } },
    letter: { max: 2, trim: 0.44, fn(k) {            // rising bell triad
      k.bell({ f: 784, at: 0, d: 0.16, v: 0.45 });
      k.bell({ f: 988, at: 0.08, d: 0.16, v: 0.45 });
      k.bell({ f: 1175, at: 0.16, d: 0.3, v: 0.5 });
    } },
    oneup: { max: 1, trim: 0.79, fn(k) {             // jubilant arpeggio + held trill
      k.seq([392, 494, 587, 784, 988, 1175, 1568], 0.055, { w: 0.25, v: 0.38, d: 0.09 });
      k.tone({ w: 0.25, f: 1568, d: 0.34, v: 0.4, at: 0.39, vib: [11, 60, 0.0] });
      k.tone({ w: 0.125, f: 784, d: 0.34, v: 0.2, at: 0.39 });
    } },
    death: { max: 1, trim: 1.13, fn(k) {             // cartoon spiral down + crunch
      k.tone({ w: 0.25, pts: [[0, 720], [0.12, 560], [0.24, 420], [0.5, 140], [0.7, 55]], d: 0.7, v: 0.5, vib: [10, 160, 0.05] });
      k.tone({ w: 'triangle', pts: [[0, 360], [0.7, 40]], d: 0.7, v: 0.5 });
      k.noise({ ft: 'lowpass', f: 3000, f2: 250, q: 0.7, d: 0.5, v: 0.28 });
    } },
    hurry: { max: 1, trim: 0.56, fn(k) {             // two-tone alarm
      k.seq([880, 659, 880, 659, 880, 659], 0.075, { w: 0.5, v: 0.36, d: 0.08 });
    } },
    ghost: { max: 1, trim: 0.82, fn(k) {             // eerie wail
      k.tone({ w: 'triangle', pts: [[0, 262], [0.35, 440], [0.8, 240]], d: 0.8, v: 0.4, a: 0.15, vib: [6, 70, 0.1] });
      k.tone({ w: 'sine', pts: [[0, 523], [0.35, 880], [0.8, 480]], d: 0.8, v: 0.2, a: 0.2 });
      k.noise({ ft: 'bandpass', f: 1000, f2: 450, q: 5, d: 0.8, v: 0.24, a: 0.2 });
    } },
    thunder: { max: 1, trim: 1.48, fn(k) {           // zap + rumble + crackle (energy above 200 Hz: mid noise band + a saw thump)
      k.noise({ ft: 'bandpass', f: 1800, f2: 300, q: 0.6, d: 0.55, v: 1.0 });
      k.tone({ w: 'saw', pts: [[0, 2000], [0.12, 160]], d: 0.16, v: 0.3 });
      k.tone({ w: 'saw', pts: [[0, 240], [0.45, 70]], d: 0.5, v: 0.3 });
      k.tone({ w: 'sine', pts: [[0, 95], [0.45, 34]], d: 0.5, v: 0.35 });
      [0.04, 0.1, 0.17, 0.27].forEach((at, i) => k.noise({ ft: 'highpass', f: 3000 + i * 800, d: 0.025, v: 0.3, at }));
    } },
    fire: { max: 1, trim: 2.02, fn(k) {              // rising whoosh + crackles
      k.noise({ ft: 'bandpass', f: 450, f2: 1900, q: 0.9, d: 0.42, v: 0.85, a: 0.07 });
      k.tone({ w: 'saw', pts: [[0, 130], [0.35, 290]], d: 0.38, v: 0.14, a: 0.05 });
      [0.06, 0.13, 0.2, 0.26, 0.33].forEach((at, i) => k.noise({ ft: 'highpass', f: 2500 + i * 600, d: 0.02, v: 0.2, at }));
    } },
    water: { max: 1, trim: 0.68, fn(k) {             // splash wash + gurgling blips
      k.noise({ ft: 'bandpass', f: 700, f2: 1500, q: 2.5, d: 0.45, v: 0.28, a: 0.05 });
      [[620, 0], [880, 0.06], [740, 0.11], [1040, 0.17], [820, 0.23], [1200, 0.3]].forEach(([f, at]) =>
        k.tone({ w: 'sine', f, f2: f * 1.9, d: 0.07, v: 0.35, at }));
    } },
    freeze: { max: 1, trim: 0.43, fn(k) {            // descending icy chimes + shiver
      [3136, 2637, 2349, 1976, 1568, 1319].forEach((f, i) => k.bell({ f, at: i * 0.055, d: 0.22, v: 0.3 }));
      k.tone({ w: 'sine', pts: [[0, 2200], [0.4, 500]], d: 0.45, v: 0.18, vib: [22, 120, 0] });
      k.noise({ ft: 'highpass', f: 6500, d: 0.35, v: 0.07 });
    } },
    bomb: { max: 1, trim: 1.18, fn(k) {              // explosion (mid noise band + saw thump, short sub tail)
      k.noise({ ft: 'bandpass', f: 2600, f2: 300, q: 0.5, d: 0.75, v: 1.0 });
      k.tone({ w: 'saw', pts: [[0, 320], [0.5, 60]], d: 0.55, v: 0.3 });
      k.tone({ w: 'sine', pts: [[0, 150], [0.55, 30]], d: 0.65, v: 0.4 });
      k.noise({ ft: 'highpass', f: 2200, d: 0.07, v: 0.5 });
    } },
    menu_move: { max: 2, trim: 1.22, quiet: true, fn(k) {
      k.tone({ w: 0.25, f: 1047, d: 0.04, v: 0.3 });
    } },
    menu_select: { max: 1, trim: 0.75, fn(k) {
      k.tone({ w: 0.25, f: 880, d: 0.05, v: 0.55 });
      k.tone({ w: 0.25, f: 1320, d: 0.14, v: 0.55, at: 0.05 });
    } },
    pause: { max: 1, trim: 0.7, fn(k) {
      k.tone({ w: 0.25, f: 988, d: 0.09, v: 0.55 });
      k.tone({ w: 0.25, f: 659, d: 0.15, v: 0.55, at: 0.09 });
    } },
    boss_hit: { max: 2, trim: 1.97, lvl: 3, fn(k) {  // heavy thud + metallic clank (mid-heavy: survives small speakers)
      k.tone({ w: 'sine', pts: [[0, 300], [0.1, 70]], d: 0.3, v: 0.3 });
      k.tone({ w: 'saw', pts: [[0, 700], [0.18, 220]], d: 0.24, v: 0.6 });
      k.noise({ ft: 'bandpass', f: 2200, f2: 700, q: 0.9, d: 0.2, v: 0.8 });
      k.tone({ w: 0.5, f: 415, d: 0.16, v: 0.3 });
      k.tone({ w: 0.5, f: 637, d: 0.16, v: 0.26 });
    } },
    boss_die: { max: 1, trim: 0.94, fn(k) {          // cascading explosions, then one big boom (~1 s).  No chime tail any more: the
      for (let i = 0; i < 5; i++) {                  // clear_boss fanfare follows 1 s later and must not be masked (QA M21)
        const at = i * 0.13;
        k.noise({ ft: 'bandpass', f: 3000 - i * 300, f2: 280, q: 0.6, d: 0.3, v: 0.9 - i * 0.05, at });
        k.tone({ w: 'saw', pts: [[0, 300 - i * 25], [0.26, 60]], d: 0.28, v: 0.3, at });
        k.tone({ w: 'sine', pts: [[0, 120 - i * 8], [0.28, 30]], d: 0.3, v: 0.35, at });
      }
      k.noise({ ft: 'bandpass', f: 2200, f2: 200, q: 0.5, d: 0.5, v: 1.0, at: 0.55 });
      k.tone({ w: 'saw', pts: [[0, 260], [0.45, 45]], d: 0.5, v: 0.35, at: 0.55 });
      k.tone({ w: 'sine', pts: [[0, 110], [0.5, 26]], d: 0.55, v: 0.45, at: 0.55 });
    } },
    enemy_shot: { max: 3, trim: 1.75, lvl: 1.5, fn(k) {
      k.tone({ w: 0.25, pts: [[0, 900], [0.1, 360]], d: 0.12, v: 0.6 });
      k.noise({ ft: 'bandpass', f: 2000, q: 1, d: 0.05, v: 0.15 });
    } },
    spawn: { max: 3, trim: 2.17, fn(k) {             // materialise: swelling shimmer
      k.noise({ ft: 'bandpass', f: 600, f2: 3000, q: 2, d: 0.2, v: 0.25, a: 0.03 });
      k.tone({ w: 'sine', pts: [[0, 390], [0.1, 780], [0.2, 1170]], d: 0.22, v: 0.35, vib: [18, 80, 0] });
      k.tone({ w: 'sine', pts: [[0, 780], [0.1, 1560], [0.2, 2340]], d: 0.2, v: 0.1, a: 0.04 });
    } },
    land: { max: 2, trim: 1.01, quiet: 12, fn(k) {   // soft tick + thump: quiet (12 dB under the full-level sfx) but perceivable (QA M30)
      k.noise({ ft: 'bandpass', f: 1100, q: 1.2, d: 0.045, v: 0.35 });
      k.tone({ w: 'triangle', pts: [[0, 360], [0.05, 160]], d: 0.07, v: 0.4 });
      k.tone({ w: 'sine', pts: [[0, 130], [0.06, 70]], d: 0.08, v: 0.25 });
    } },
    clear: { max: 1, trim: 0.48, fn(k) {              // round-clear stinger (~0.7 s): G-pentatonic ping run into a sparkling bell chord
      k.seq([784, 988, 1175, 1568], 0.075, { w: 0.25, v: 0.38, d: 0.1 });                   // G5 B5 D6 G6
      k.bell({ f: 1568, at: 0.3, d: 0.4, v: 0.4 });
      k.bell({ f: 1175, at: 0.3, d: 0.4, v: 0.3 });
      k.bell({ f: 988, at: 0.3, d: 0.4, v: 0.25 });
      k.tone({ w: 0.125, f: 2349, d: 0.3, v: 0.16, at: 0.3 });
      k.noise({ ft: 'highpass', f: 7000, d: 0.3, v: 0.05, at: 0.3 });
    } },
  };

  /** sfx() options -> {f: frequency factor, v: gain factor}; junk values fall back to 0 st / 1.0 */
  function sfxParams(def, opts) {
    const semis = Number.isFinite(+(opts && opts.pitch)) ? clamp(+opts.pitch, -48, 48) : 0;
    const vol = opts && opts.vol !== undefined && Number.isFinite(+opts.vol) ? clamp(+opts.vol, 0, 2) : 1;
    return { f: Math.pow(2, semis / 12), v: vol * (def.trim === undefined ? 1 : def.trim) };
  }
  const sfxDef = (name) => (typeof name === 'string' && Object.prototype.hasOwnProperty.call(SFX, name) ? SFX[name] : null);

  // ================================================================================================
  // drum voices
  // ================================================================================================
  const DV = { k: 0.45, s: 0.28, h: 0.095, o: 0.11, t: 0.28, u: 0.3, c: 0.13 };   // base levels
  function dKick(ctx, dest, t, v) {
    const o = reg(ctx.createOscillator());
    o.frequency.setValueAtTime(165, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.1);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(v, t + 0.002);
    g.gain.setTargetAtTime(0, t + 0.012, 0.04);       // short tail: no smear over the bass root on beat 1 (QA A9)
    o.connect(g); g.connect(dest);
    o.start(t); o.stop(t + 0.34);
    noise(ctx, dest, t, { ft: 'highpass', f: 2500, d: 0.012, v: v * 0.22, a: 0.001 });   // beater click
  }
  function dSnare(ctx, dest, t, v) {
    noise(ctx, dest, t, { ft: 'highpass', f: 1500, d: 0.17, v: v, q: 0.5, a: 0.001 });
    tone(ctx, dest, t, { w: 'triangle', f: 235, f2: 150, d: 0.09, v: v * 0.55, a: 0.001 });
  }
  function dHat(ctx, dest, t, v, open) {
    noise(ctx, dest, t, { ft: 'highpass', f: 7800, d: open ? 0.2 : 0.045, v: v, q: 0.4, a: 0.001 });
  }
  function dTom(ctx, dest, t, v, low) {
    tone(ctx, dest, t, { w: 'sine', f: low ? 140 : 210, f2: low ? 62 : 96, d: 0.24, v: v, a: 0.002 });
  }
  function dCrash(ctx, dest, t, v) {
    noise(ctx, dest, t, { ft: 'highpass', f: 4200, d: 1.1, v: v, q: 0.4, a: 0.002 });
  }
  function playDrum(ctx, dest, t, kind, vel) {
    const v = DV[kind] * vel;
    switch (kind) {
      case 'k': dKick(ctx, dest, t, v); break;
      case 's': dSnare(ctx, dest, t, v); break;
      case 'h': dHat(ctx, dest, t, v, false); break;
      case 'o': dHat(ctx, dest, t, v, true); break;
      case 't': dTom(ctx, dest, t, v, false); break;
      case 'u': dTom(ctx, dest, t, v, true); break;
      case 'c': dCrash(ctx, dest, t, v); break;
      default: break;
    }
  }

  // ================================================================================================
  // pitched music voice (pulse / bass), envelope via setTarget so any note length is safe
  // ================================================================================================
  /**
   * c: {duty|wave, vol, a, d, s, r, gate, vib:[hz,cents,delay]|null, scoop: cents}. `dur` is the written length in seconds.
   * Note-off at dur*gate; release time constant r/3.
   */
  function pitched(ctx, dest, t, dur, midi, c, velocity) {
    const hold = Math.max(c.a + 0.006, dur * c.gate);
    const osc = reg(ctx.createOscillator());
    try {
      setWave(ctx, osc, c.wave !== undefined ? c.wave : c.duty);
      osc.frequency.value = mtof(midi);
      if (c.scoop && hold > 0.28 && osc.detune) {         // little pitch scoop into sustained notes
        osc.detune.setValueAtTime(-c.scoop, t);
        osc.detune.linearRampToValueAtTime(0, t + 0.03);
      }
      if (c.vib && hold > 0.38) vibrato(osc, t + c.vib[2], hold - c.vib[2], c.vib[0], c.vib[1]);
      const g = ctx.createGain();
      const vol = c.vol * (velocity === undefined ? 1 : velocity);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(vol, t + c.a);
      g.gain.setTargetAtTime(vol * c.s, t + c.a, Math.max(0.004, c.d / 3));
      g.gain.setTargetAtTime(0, t + hold, Math.max(0.004, c.r / 3));
      osc.connect(g); g.connect(dest);
      osc.start(t);
      osc.stop(t + hold + c.r * 2.2 + 0.02);
    } catch (e) { if (REG) REG.drop(osc); throw e; }
  }

  // ================================================================================================
  // song notation parsing / compilation
  // ================================================================================================
  const PC = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
  const NOTE_RE = /^([a-g])([#b]?)(-?\d)(?:\/(\d+))?$/;
  const REST_RE = /^r(?:\/(\d+))?$/;
  const QUAL = { '': [0, 4, 7], m: [0, 3, 7], '7': [0, 4, 7, 10], m7: [0, 3, 7, 10], maj7: [0, 4, 7, 11],
    m7b5: [0, 3, 6, 10], dim: [0, 3, 6], sus: [0, 5, 7], '7sus': [0, 5, 7, 10], '6': [0, 4, 7, 9], m6: [0, 3, 7, 9], '5': [0, 7] };
  const NOTE_PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

  /** `c5/2 r/4 ...` -> {ev:[{s,n,m}], steps, bars:[stepsPerBar]} */
  function parseNotes(str, issues, tag) {
    const ev = [], bars = [];
    let step = 0, barStart = 0;
    const toks = String(str || '').replace(/\|/g, ' | ').split(/\s+/);
    for (const tok of toks) {
      if (!tok) continue;
      if (tok === '|') { if (step !== barStart) { bars.push(step - barStart); barStart = step; } continue; }
      let m = REST_RE.exec(tok);
      if (m) { step += m[1] ? +m[1] : 2; continue; }
      m = NOTE_RE.exec(tok);
      if (!m) { issues.push(tag + ': bad token "' + tok + '"'); continue; }
      const n = m[4] ? +m[4] : 2;
      const midi = 12 * (+m[3] + 1) + PC[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
      ev.push({ s: step, n, m: midi });
      step += n;
    }
    if (step !== barStart) bars.push(step - barStart);
    return { ev, steps: step, bars };
  }

  /** `| G | Em.Am7 | C/8 |` -> {list:[{s,n,root,ints,name}], steps, bars} */
  function parseChords(str, issues, tag) {
    const list = [], bars = [];
    let step = 0;
    for (const barStr of String(str || '').split('|')) {
      const b = barStr.trim();
      if (!b) continue;
      const toks = b.split('.');
      const parsed = toks.map((tk) => {
        const m = /^([A-G])([#b]?)([^/]*)(?:\/(\d+))?$/.exec(tk.trim());
        if (!m || !QUAL[m[3]]) { issues.push(tag + ': bad chord "' + tk + '"'); return null; }
        const root = (NOTE_PC[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + 12) % 12;
        return { root, ints: QUAL[m[3]], name: tk.trim(), n: m[4] ? +m[4] : 0 };
      }).filter(Boolean);
      if (!parsed.length) continue;
      const explicit = parsed.some((c) => c.n > 0);
      const share = explicit ? 0 : Math.floor(STEPS_PER_BAR / parsed.length);
      const barStart = step;
      for (const c of parsed) {
        const n = explicit ? c.n : share;
        list.push({ s: step, n, root: c.root, ints: c.ints, name: c.name });
        step += n;
      }
      bars.push(step - barStart);
    }
    return { list, steps: step, bars };
  }

  // chord-relative symbol -> semitones above root (octave handled by caller)
  function symbolOffset(sym, ints) {
    switch (sym) {
      case '1': return 0;
      case '2': return 2;
      case '3': return ints[1];
      case '4': return 5;
      case '5': return ints[2];
      case '6': return 9;
      case '7': return ints[3] !== undefined ? ints[3] : 12;
      case '8': return 12;
      case '9': return 14;
      case 'a': return ints[1] + 12;
      case 'c': return ints[2] + 12;
      case 'e': return (ints[3] !== undefined ? ints[3] : 12) + 12;
      case 'b': return ints[2];                 // fifth (alias; the old 'fifth below' went under 60 Hz, QA A9)
      default: return null;
    }
  }
  const BASS_LO = 43;     // root pitch classes map into MIDI 43..54 (G2..F#3): audible on small speakers (QA A9)
  const ARP_LO = 50;      //                           50..61
  const rootMidi = (pc, lo) => lo + ((pc - lo) % 12 + 12) % 12;

  /** Tile a pattern cell over a chord span; returns note events {s,n,m}. */
  function genPattern(pat, chord, lo, startStep, span) {
    const out = [];
    const base = rootMidi(chord.root, lo);
    let cur = null;
    for (let i = 0; i < span; i++) {
      const ch = pat[i % pat.length];
      if (ch === '.') { cur = null; continue; }
      if (ch === '-') { if (cur) cur.n++; continue; }
      const off = symbolOffset(ch, chord.ints);
      if (off === null) { cur = null; continue; }
      cur = { s: startStep + i, n: 1, m: base + off };
      out.push(cur);
    }
    return out;
  }

  // ---- pattern libraries -----------------------------------------------------------------------
  const BASS = {
    bnc: '1-8-1-5-',        // oom-pah octave bounce
    bnc2: '1-8-1-3-',       // same, last note walks up to the third
    pump: '1-1-8-1-',
    half: '1---5---',       // root / fifth halves
    long: '1-------',
    syn: '1--8--5-',        // 3-3-2 syncopation
    walk: '1-3-5-3-',
    gal: '11811811',        // 16th gallop with accents (boss)
    gal2: '11811813',
    soft: '1-----5-',       // entry / tender
    whole: '1---------------',
  };
  const ARP = {
    pah: '..ac..ac',        // offbeat two-note stabs
    pah2: '.ac.ac.a',       // busier variation
    roll: '1358a853',       // rolling 16ths
    gloom: 'ac.ac.ac',      // 3-3-2 shimmer (stage 2)
    fast: '1358a853',       // boss 16th arpeggio
    fast2: '13581358',
    slow: '1.3.5.3.',       // entry
    tender: '1.5.a.5.',
    hold: '5-------',
  };
  const DRUMS = {
    // stage 1 (swung)
    g1: 'K.h.S.h.K.h.S.h.',
    g1b: 'K.h.S.h.K..kS.h.',
    g1x: 'c.h.S.h.K.h.S.h.',
    g1f: 'K.h.S.h.K.s.ssSs',
    g1c: 'K.o.S.h.K.o.S.h.',
    g1d: 'K...S...K...S...',
    // stage 2
    g2: 'K.h.S.h.K.hhS.h.',
    g2b: 'K.h.S.hkK.h.S.h.',
    g2x: 'c.h.S.h.K.hhS.h.',
    g2f: 'K.h.S.h.K.s.ssSs',
    // stage 2 half-time (snare only on beat 3; the A sections) and a silent bar
    h1: 'K.h.h.h.S.h.h.h.',
    h1b: 'K.h.h.hkS.h.h.h.',
    h1x: 'c.h.h.h.S.h.h.h.',
    h1f: 'K.h.h.h.S.h.ssSs',
    none: '................',
    // boss (straight, relentless)
    d1: 'K.h.S.h.K.h.S.hh',
    d2: 'K.hkS.h.KkhkS.h.',
    d3: 'K.h.S.h.KkhkS.t.',
    d4: 'c.h.S.h.K.h.S.hh',
    d5: 'K.s.S.t.u.t.utuc',
    d6: 'KhhhShhhKhhhShhh',
    // title / ending
    t1: 'K.h.S.h.K.h.S.hK',
    t2: 'c.h.S.h.K.h.S.h.',
    e1: 'K...S...K...S...',
    e2: 'k...x...k...x..h',
    // soft entry / tender
    s1: 'k.h.x.h.k.h.x.h.',
    s2: '..h...h...h...h.',
    s3: 'c...............',
    s4: 's.s.s.sSs.s.ssSs',
    go: 'u...............',      // game over: one low tom
  };
  const DRUM_CH = {
    k: [['k', 1]], s: [['s', 1]], x: [['s', 0.4]], h: [['h', 1]], o: [['o', 1]], t: [['t', 1]], u: [['u', 1]],
    c: [['c', 1], ['k', 1]], K: [['k', 1], ['h', 0.6]], S: [['s', 1], ['h', 0.6]],
  };

  // voice defaults (per-song `cfg` and per-section `cfg` override these)
  const VOICE = {
    lead: { duty: 0.25, vol: 0.24, a: 0.004, d: 0.09, s: 0.74, r: 0.05, gate: 0.92, vib: [5.5, 14, 0.12], scoop: 45 },
    harm: { duty: 0.125, vol: 0.42, a: 0.003, d: 0.05, s: 0.55, r: 0.03, gate: 0.55, vib: null },
    bass: { wave: 'bass', vol: 0.12, a: 0.004, d: 0.02, s: 1, r: 0.03, gate: 0.88, vib: null },
  };

  /** Diatonic third below (chromatic notes: minor third below). */
  function thirdBelow(m, keyPc, mode) {
    const set = mode.map((x) => (keyPc + x) % 12);
    const scale = [];
    for (let n = 24; n < 110; n++) if (set.indexOf(n % 12) >= 0) scale.push(n);
    const i = scale.indexOf(m);
    return i >= 2 ? scale[i - 2] : m - 3;
  }

  // ================================================================================================
  // SONGS — the compositions.  Chord progression first (in comments), then the lines.
  // ================================================================================================
  let defsCache = null;
  function songDefs() {
    if (defsCache) return defsCache;
    const D = {};
    // ---- STAGE 1 "Carousel Tide" : G major, 150 bpm, swing .58, A-A'-B-C-A'' (40 bars, 64 s) -----------
    // A  : G | Em | C | D | G | B7 | Em.Am7 | D          (I vi IV V I III7 vi.ii V)
    // B  : C | Cm | G | Em | Am7 | D7 | G | D            (IV iv I vi ii V7 I V, chromatic top line e-eb-d)
    // C  : Em | Bm | C | G | Em | Bm | Am7 | D            (bridge: half-time drums, low lead, rests -- the loop breathes here)
    // Hook = bars 1-3: rest, rising G-major triad, long top note, step down, falling sequence (bar 2 starts on a repeated b5,
    // which breaks the strict descending-thirds pickup chain).  Every second pass of the loop is lifted a whole tone (lift: 2).
    const S1A = {
      chords: '| G | Em | C | D | G | B7 | Em.Am7 | D |',
      lead: `| r/2 b5/2 d6/2 g6/3 f#6/1 e6/2 d6/2 b5/2
             | r/2 b5/2 b5/2 e6/3 d6/1 b5/2 g5/2 b5/2
             | r/2 e5/2 g5/2 c6/3 b5/1 g5/2 e5/2 g5/2
             | f#5/2 a5/2 d6/4 c6/2 a5/2 f#5/4
             | g5/2 a5/2 b5/2 d6/2 g6/2 d6/2 b5/2 g5/2
             | f#5/2 a5/2 b5/2 d#6/2 f#6/3 e6/1 d#6/2 b5/2
             | e6/2 b5/2 g5/2 b5/2 c6/2 e6/2 g6/2 e6/2
             | f#6/3 e6/1 d6/2 c6/2 a5/2 f#5/2 r/4`,
      harm: { arp: 'pah' },
      bass: 'bnc',
      drums: 'g1x g1 g1 g1 g1 g1 g1 g1f',
    };
    const S1A2 = Object.assign({}, S1A, {
      lead: `| d6/2 b5/2 d6/2 g6/3 f#6/1 e6/2 d6/2 b5/2
             | b5/2 g5/2 b5/2 e6/3 d6/1 b5/2 g5/2 b5/2
             | g5/2 e5/2 g5/2 c6/3 b5/1 g5/2 e5/2 g5/2
             | f#5/2 a5/2 d6/4 f#6/4 e6/2 d6/2
             | g6/2 d6/2 b5/2 d6/2 g6/6 f#6/2
             | f#5/2 a5/2 b5/2 d#6/2 f#6/3 e6/1 d#6/2 b5/2
             | e6/2 b5/2 g5/2 b5/2 c6/2 e6/2 g6/2 e6/2
             | a5/2 b5/2 c6/2 d6/2 e6/2 f#6/2 g6/4`,
      harm: { thirds: true, gate: 0.9, vol: 0.8 },
      bass: 'bnc bnc bnc bnc2 bnc bnc bnc bnc2',
      drums: 'g1 g1 g1 g1b g1 g1 g1b g1f',
    });
    const S1B = {
      chords: '| C | Cm | G | Em | Am7 | D7 | G | D |',
      lead: `| e6/6 d6/2 c6/4 e6/4
             | eb6/6 d6/2 c6/4 g5/4
             | d6/6 c6/2 b5/4 d6/4
             | b5/6 a5/2 g5/4 b5/4
             | c6/2 e6/2 g6/4 e6/2 c6/2 e6/4
             | a5/2 d6/2 f#6/4 e6/2 d6/2 c6/4
             | b5/4 d6/4 g6/8
             | f#6/2 e6/2 d6/2 c6/2 b5/2 a5/2 d6/4`,
      harm: { arp: 'roll', gate: 0.8 },
      bass: 'half half half half syn syn pump pump',
      drums: 'g1c g1c g1c g1c g1c g1c g1c g1f',
      cfg: { lead: { vib: [5.8, 20, 0.1] } },
      mix: { harm: 1.05, drum: 1.05 },
    };
    const S1C = {
      chords: '| Em | Bm | C | G | Em | Bm | Am7 | D |',
      lead: `| e6/3 e6/3 d6/2 b5/3 g5/3 b5/2
             | d6/3 d6/3 b5/2 f#5/6 r/2
             | e6/3 e6/3 d6/2 c6/3 g5/3 c6/2
             | d6/3 d6/3 b5/2 g5/6 r/2
             | g6/4 e6/4 b5/4 e6/4
             | f#6/4 d6/4 b5/4 d6/4
             | e6/2 c6/2 a5/2 c6/2 e6/4 g6/4
             | a5/2 d6/2 f#6/2 a6/2 g6/2 f#6/2 e6/2 d6/2`,
      harm: { arp: 'tender', gate: 0.8 },
      bass: 'half half half half half half bnc bnc',
      drums: 'g1d g1d g1d g1d g1c g1c g1c g1f',
      cfg: { lead: { vib: [5.6, 18, 0.1] } },
      mix: { lead: 0.82, harm: 1.15, bass: 0.92, drum: 0.7 },
    };
    const S1A3 = Object.assign({}, S1A, {
      lead: `| r/2 b5/2 d6/2 g6/3 f#6/1 e6/2 d6/2 b5/2
             | r/2 b5/2 b5/2 e6/3 d6/1 b5/2 g5/2 b5/2
             | r/2 e5/2 g5/2 c6/3 b5/1 g5/2 e5/2 g5/2
             | f#5/2 a5/2 d6/4 c6/2 a5/2 f#5/4
             | g6/3 f#6/1 e6/2 d6/2 b5/3 g5/1 b5/2 d6/2
             | d#6/4 f#6/4 a6/4 f#6/2 d#6/2
             | e6/2 g6/2 e6/2 b5/2 c6/2 e6/2 a6/2 e6/2
             | f#6/3 e6/1 d6/2 c6/2 a5/2 f#5/2 a5/2 d6/2`,
      harm: { arp: 'pah2' },
      bass: 'bnc bnc bnc bnc2 pump pump pump bnc2',
      drums: 'g1x g1b g1b g1b g1b g1b g1b g1f',
      mix: { lead: 1.05, drum: 1.08 },
    });
    D.stage1 = {
      bpm: 150, swing: 0.58, echo: 3, key: 7, mode: [0, 2, 4, 5, 7, 9, 11], gain: 1, lift: 2,
      sections: { A: S1A, A2: S1A2, B: S1B, C: S1C, A3: S1A3 },
      order: ['A', 'A2', 'B', 'C', 'A3'],
    };

    // ---- STAGE 2 "Moonlit Arcade" : A dorian, 152 bpm, swing .56, A-B-A'-C-D (40 bars, 63 s) -------------
    // Own colour: 50 % pulse lead (hollow, clarinet-like), half-time drums in the A sections, full backbeat in B.
    // A : Am7 | D7 | Am7 | D7 | Gmaj7 | Cmaj7 | F#m7b5 | E7
    // B : Fmaj7 | G | Em7 | Am7 | Fmaj7 | G | Bm7 | E7                        (3-3-2 figures instead of the 6-2-4-4 cell)
    // A': same changes as A, a new melody (the hook answered an octave up, then climbing)
    // C : Am7 | G | F | E7 | Am7 | D7 | Bm7.E7 | E7                           (16th arps + gallop bass)
    // D : Dm7 | Dm7 | Am7 | Am7 | Fmaj7 | Fmaj7 | E7sus.E7 | E7               (breakdown: sparse lead, hats only, builds into A)
    // Every second pass is lifted a whole tone.
    const S2A = {
      chords: '| Am7 | D7 | Am7 | D7 | Gmaj7 | Cmaj7 | F#m7b5 | E7 |',
      lead: `| e6/3 e6/1 c6/2 a5/2 c6/3 b5/1 a5/2 r/2
             | f#6/3 f#6/1 d6/2 a5/2 d6/3 c6/1 a5/2 r/2
             | e6/3 e6/1 c6/2 a5/2 c6/2 e6/2 g6/4
             | f#6/2 e6/2 d6/2 c6/2 a5/4 r/4
             | b5/2 d6/2 g6/4 f#6/2 d6/2 b5/4
             | e6/2 g6/2 e6/4 d6/2 c6/2 b5/4
             | f#6/2 c6/2 a5/2 c6/2 e6/4 c6/4
             | g#5/2 b5/2 d6/2 e6/2 g#6/4 e6/2 d6/2`,
      harm: { arp: 'gloom' },
      bass: 'pump',
      drums: 'h1x h1 h1 h1 h1 h1 h1b h1f',
    };
    const S2B = {
      chords: '| Fmaj7 | G | Em7 | Am7 | Fmaj7 | G | Bm7 | E7 |',
      lead: `| r/2 a5/2 c6/3 e6/3 a6/2 e6/2 c6/2
             | r/2 b5/2 d6/3 g6/3 d6/2 b5/2 g5/2
             | e6/4 d6/2 b5/3 g5/3 b5/2 d6/2
             | c6/3 e6/3 a6/2 g6/4 e6/4
             | r/2 a5/2 c6/3 e6/3 a6/4 e6/2
             | r/2 b5/2 d6/3 g6/3 f#6/2 d6/2 b5/2
             | f#6/4 d6/2 b5/2 f#5/4 b5/4
             | g#5/2 b5/2 d6/2 e6/2 g#6/4 b5/2 g#5/2`,
      harm: { arp: 'roll', gate: 0.8 },
      bass: 'half half half half half half syn syn',
      drums: 'g1c g1c g1c g1c g1c g1c g1c g2f',
      cfg: { lead: { vib: [5.0, 22, 0.1] } },
      mix: { harm: 1.05, drum: 1.05 },
    };
    const S2A2 = {
      chords: '| Am7 | D7 | Am7 | D7 | Gmaj7 | Cmaj7 | F#m7b5 | E7 |',
      lead: `| a5/3 c6/1 e6/2 a6/3 g6/1 e6/2 c6/2 a5/2
             | a6/3 f#6/1 d6/2 f#6/3 a6/1 g6/2 f#6/2 d6/2
             | e6/2 g6/2 a6/4 g6/2 e6/2 c6/2 e6/2
             | f#6/2 a6/2 f#6/2 d6/2 c6/4 r/4
             | g5/2 b5/2 d6/2 g6/2 f#6/4 d6/4
             | c6/2 e6/2 g6/4 e6/2 b5/2 g5/4
             | a5/2 c6/2 e6/2 c6/2 f#6/2 e6/2 c6/4
             | b5/2 g#5/2 b5/2 d6/2 e6/4 d6/2 b5/2`,
      harm: { thirds: true, gate: 0.9, vol: 0.8 },
      bass: 'pump pump pump pump bnc bnc bnc2 bnc2',
      drums: 'h1x h1b h1 h1b h1 h1b h1 h1f',
      mix: { harm: 0.9 },
    };
    const S2C = {
      chords: '| Am7 | G | F | E7 | Am7 | D7 | Bm7.E7 | E7 |',
      lead: `| a5/2 c6/2 e6/2 a6/2 g6/2 e6/2 c6/2 e6/2
             | g5/2 b5/2 d6/2 g6/2 f#6/2 d6/2 b5/2 d6/2
             | a5/2 c6/2 f6/2 a6/2 g6/2 f6/2 c6/2 a5/2
             | g#5/2 b5/2 d6/2 e6/2 g#6/4 e6/4
             | e6/3 e6/3 e6/2 d6/3 c6/3 b5/2
             | f#6/3 f#6/3 f#6/2 e6/3 d6/3 c6/2
             | d6/4 b5/4 g#5/2 b5/2 d6/2 e6/2
             | g#6/4 e6/4 d6/2 b5/2 g#5/2 b5/2`,
      harm: { arp: 'fast', gate: 0.7 },
      bass: 'gal gal gal gal gal gal gal gal2',
      drums: 'g2b g2b g2b g2b g2b g2b g2b g2f',
      mix: { lead: 1.05, harm: 1.1, drum: 1.05 },
    };
    const S2D = {
      chords: '| Dm7 | Dm7 | Am7 | Am7 | Fmaj7 | Fmaj7 | E7sus.E7 | E7 |',
      lead: `| r/8 a5/4 d6/4
             | f6/8 e6/4 d6/4
             | r/8 e5/4 a5/4
             | c6/8 b5/4 a5/4
             | r/4 a5/4 c6/4 f6/4
             | e6/6 c6/2 a5/4 c6/4
             | b5/4 a5/4 g#5/4 b5/4
             | d6/2 b5/2 g#5/2 b5/2 e6/8`,
      harm: { arp: 'slow', gate: 0.7 },
      bass: 'soft soft soft soft long long half syn',
      drums: 's2 s2 s2 s2 h1 h1 h1b g2f',
      cfg: { lead: { vib: [4.4, 20, 0.2] } },
      mix: { lead: 0.85, bass: 0.9, drum: 0.65 },
    };
    D.stage2 = {
      bpm: 152, swing: 0.56, echo: 3, key: 9, mode: [0, 2, 3, 5, 7, 9, 10], gain: 1, lift: 2,
      sections: { A: S2A, B: S2B, A2: S2A2, C: S2C, D: S2D },
      order: ['A', 'B', 'A2', 'C', 'D'],
      cfg: { lead: { duty: 0.5, vol: 0.15, a: 0.006, d: 0.1, s: 0.8, r: 0.06, gate: 0.9, vib: [4.6, 18, 0.18], scoop: 30 } },
    };

    // ---- BOSS "Kraken Deep" : E minor, 170 bpm, straight 16ths, A-B-A'-C (32 bars) --------------------
    // A : Em | Em | C | B7 | Em | Em | Am | B7          (i i VI V7 i i iv V7)
    // B : C | D | Em | Em | C | D | B7 | B7             (heroic climb)
    // C : Em | F | Em | F | Am | B7 | Em | B7           (phrygian dread, run into the loop)
    // A' has its own lead (the riff an octave up, then a new answer) -- it used to repeat A and only change the harm voice.
    const BA = {
      chords: '| Em | Em | C | B7 | Em | Em | Am | B7 |',
      lead: `| e5/1 e5/1 e5/1 g5/1 b5/4 d6/1 b5/1 g5/1 b5/1 e6/4
             | e5/1 e5/1 e5/1 g5/1 b5/2 e6/2 d6/1 b5/1 a5/1 b5/1 g5/4
             | c5/1 c5/1 c5/1 e5/1 g5/4 f5/1 e5/1 c5/1 e5/1 g5/4
             | b4/1 b4/1 d#5/1 f#5/1 b5/4 a5/1 f#5/1 d#5/1 f#5/1 a5/2 g5/2
             | e6/2 b5/2 e6/2 g6/2 f#6/2 e6/2 d6/2 b5/2
             | e6/2 b5/2 g5/2 b5/2 e6/4 r/4
             | a5/2 c6/2 e6/2 c6/2 a5/2 c6/2 e6/2 a6/2
             | f#6/2 d#6/2 b5/2 a5/2 f#5/2 d#5/2 b4/4`,
      harm: { arp: 'fast', gate: 0.75 },
      bass: 'gal',
      drums: 'd4 d1 d1 d3 d1 d1 d2 d5',
      mix: { lead: 0.94, drum: 0.95 },
    };
    const BB = {
      chords: '| C | D | Em | Em | C | D | B7 | B7 |',
      lead: `| c6/6 b5/2 g5/4 e5/4
             | d6/6 c6/2 a5/4 f#5/4
             | e6/6 d6/2 b5/4 g5/4
             | g5/2 b5/2 e6/2 g6/2 e6/4 b5/4
             | c6/6 e6/2 g6/4 e6/4
             | d6/6 f#6/2 a6/4 f#6/4
             | b5/2 d#6/2 f#6/2 a6/2 f#6/2 d#6/2 b5/2 f#5/2
             | b5/8 r/4 b5/1 b5/1 b5/1 b5/1`,
      harm: { arp: 'fast2', gate: 0.7 },
      bass: 'gal2',
      drums: 'd4 d2 d2 d2 d2 d2 d2 d5',
      cfg: { lead: { vib: [6, 22, 0.1] } },
      mix: { lead: 1.08, harm: 1.05, drum: 1.05 },
    };
    const BA2 = {
      chords: '| Em | Em | C | B7 | Em | Em | Am | B7 |',
      lead: `| g6/1 e6/1 e6/1 g6/1 e6/4 d6/1 b5/1 g5/1 b5/1 d6/4
             | e6/1 e6/1 e6/1 g6/1 b5/2 e6/2 d6/1 b5/1 a5/1 b5/1 g5/4
             | c6/1 c6/1 c6/1 e6/1 g6/4 e6/1 c6/1 g5/1 c6/1 e6/4
             | b5/1 b5/1 d#6/1 f#6/1 b5/4 a5/1 f#5/1 d#5/1 f#5/1 b5/2 a5/2
             | g6/2 e6/2 b5/2 e6/2 g6/2 f#6/2 e6/2 d6/2
             | b5/2 e6/2 g6/2 e6/2 b5/4 r/4
             | e6/2 c6/2 a5/2 c6/2 e6/2 a6/2 g6/2 e6/2
             | f#6/2 a6/2 f#6/2 d#6/2 b5/2 a5/2 f#5/4`,
      harm: { thirds: true, gate: 0.85, vol: 0.8 },
      bass: 'gal',
      drums: 'd4 d2 d2 d3 d2 d2 d2 d5',
      mix: { drum: 1.08 },
    };
    const BC = {
      chords: '| Em | F | Em | F | Am | B7 | Em | B7 |',
      lead: `| e5/3 e5/3 e5/2 g5/3 e5/3 e5/2
             | f5/3 f5/3 f5/2 a5/3 f5/3 f5/2
             | e5/3 e5/3 e5/2 b5/3 g5/3 e5/2
             | f5/3 f5/3 f5/2 c6/3 a5/3 f5/2
             | a5/2 a5/2 c6/2 a5/2 e6/2 c6/2 a5/2 e5/2
             | b5/2 b5/2 d#6/2 b5/2 f#6/2 d#6/2 b5/2 f#5/2
             | e6/4 d6/2 b5/2 g5/2 b5/2 e6/2 g6/2
             | b4/1 d#5/1 f#5/1 a5/1 b5/1 d#6/1 f#6/1 a6/1 f#6/2 d#6/2 b5/2 f#5/2`,
      harm: { arp: 'fast2', gate: 0.6 },
      bass: 'gal gal2 gal gal2 gal gal gal gal2',
      drums: 'd1 d1 d3 d3 d2 d2 d2 d5',
      mix: { lead: 0.88, harm: 0.88, bass: 1.08, drum: 0.9 },
    };
    D.boss = {
      bpm: 170, swing: 0.5, echo: 3, key: 4, mode: [0, 2, 3, 5, 7, 8, 10], gain: 1, maxTempo: 1.2,
      sections: { A: BA, B: BB, A2: BA2, C: BC },
      order: ['A', 'B', 'A2', 'C'],
    };

    // ---- TITLE : G major, 144 bpm, swing .56 -- 2-bar fanfare then the hook (16-bar loop) --------------
    // Fanfare : G | D.G  (rising fourths / fifths, not the G-B-D triad of the start jingle)
    // Loop    : T1 = broad slow hook (4 bars) + answer; T2 = the hook an octave up, then a new continuation.
    const TI = {
      chords: '| G | D.G |',
      lead: `| d5/3 d5/1 g5/3 g5/1 a5/2 b5/2 d6/4
             | a5/2 d6/2 f#6/4 g6/6 d6/2`,
      harm: { arp: 'fast2', gate: 0.7 },
      bass: 'bnc',
      drums: 't2 s4',
    };
    const T1 = {
      chords: '| G | Em | C | D | G | Em | C | D |',
      lead: `| g5/4 b5/4 d6/6 b5/2
             | e6/4 d6/4 b5/6 g5/2
             | c6/4 b5/4 g5/4 e5/4
             | f#5/2 a5/2 d6/4 f#6/4 e6/2 d6/2
             | g6/6 f#6/2 e6/4 d6/4
             | e6/6 d6/2 b5/4 g5/4
             | c6/2 d6/2 e6/2 g6/2 e6/2 d6/2 c6/4
             | d6/2 e6/2 f#6/2 a6/2 f#6/4 r/4`,
      harm: { arp: 'pah' },
      bass: 'bnc',
      drums: 't2 t1 t1 t1 t1 t1 t1 g1f',
    };
    const T2 = Object.assign({}, T1, {
      lead: `| b5/4 d6/4 g6/6 d6/2
             | g6/4 f#6/4 e6/6 b5/2
             | c6/2 e6/2 g6/4 e6/4 c6/4
             | d6/2 f#6/2 a6/4 e6/2 d6/2 a5/4
             | b5/2 d6/2 g6/2 d6/2 b5/4 g5/4
             | f#6/2 e6/2 d6/2 c6/2 b5/2 a5/2 g5/4
             | e6/2 c6/2 g5/2 c6/2 e6/2 g6/2 e6/4
             | d6/2 e6/2 f#6/2 a6/2 f#6/2 e6/2 d6/4`,
      chords: '| G | Em | C | D | G | Em.Am7 | C | D |',
      harm: { thirds: true, gate: 0.9, vol: 0.8 },
      bass: 'bnc bnc bnc bnc2 pump pump pump bnc2',
      drums: 't2 t1 t1 t1 t1 t1 t1 g1f',
      mix: { harm: 0.95 },
    });
    D.title = {
      bpm: 144, swing: 0.56, echo: 3, key: 7, mode: [0, 2, 4, 5, 7, 9, 11], gain: 1,
      sections: { TI, T1, T2 },
      intro: ['TI'],
      order: ['T1', 'T2'],
    };

    // ---- ENTRY : F major, 92 bpm, lazy swing .62, 16 bars ---------------------------------------------
    // E1 : Fmaj7 | Dm7 | Gm7 | C7 | Fmaj7 | Am7 | Bbmaj7 | C7sus.C7
    const EA = {
      chords: '| Fmaj7 | Dm7 | Gm7 | C7 | Fmaj7 | Am7 | Bbmaj7 | C7sus.C7 |',
      lead: `| a5/6 g5/2 f5/4 a5/4
             | d6/6 c6/2 a5/4 f5/4
             | bb5/6 a5/2 g5/4 d5/4
             | e5/4 g5/4 bb5/4 c6/4
             | c6/6 a5/2 f5/4 c6/4
             | e6/6 d6/2 c6/4 a5/4
             | d6/4 f6/4 d6/4 bb5/4
             | g5/4 bb5/4 e6/4 c6/4`,
      harm: { arp: 'slow', gate: 0.6 },
      bass: 'soft',
      drums: 's1 s1 s1 s1 s1 s1 s1 s1',
      cfg: { lead: { duty: 0.125, vol: 0.36, a: 0.01, d: 0.12, s: 0.8, r: 0.09, gate: 0.95, vib: [4.8, 16, 0.2] } },
    };
    const EB = Object.assign({}, EA, {
      lead: `| f6/6 e6/2 c6/4 a5/4
             | a5/4 d6/4 f6/4 d6/4
             | bb5/4 d6/4 g6/4 f6/4
             | e6/6 d6/2 c6/4 bb5/4
             | a5/4 c6/4 f6/8
             | e6/4 c6/4 a5/4 c6/4
             | d6/6 c6/2 bb5/4 a5/4
             | g5/6 bb5/2 c6/8`,
      harm: { arp: 'tender', gate: 0.7 },
      drums: 's1 s1 s1 s1 s1 s1 s1 s4',
    });
    D.entry = {
      bpm: 92, swing: 0.62, echo: 3, key: 5, mode: [0, 2, 4, 5, 7, 9, 11], gain: 1,
      mix: { drum: 0.5 },
      sections: { EA, EB },
      order: ['EA', 'EB'],
    };

    // ---- ENDING : D major, 124 bpm, straight; triumphant (16) -> tender (16) ---------------------------
    // X1a : D | A | Bm | G | D | A | G | A        X1b : D | A | Bm | G | D | A | G.A | D
    // X2a : D | Bm | G | A | D | F#m | Em | A      X2b : D | Bm | G | A | D | F#m | G.A | A (build into the loop)
    const X1A = {
      chords: '| D | A | Bm | G | D | A | G | A |',
      lead: `| d6/4 d6/2 f#6/2 a6/4 f#6/4
             | c#6/4 c#6/2 e6/2 a6/4 e6/4
             | b5/4 b5/2 d6/2 f#6/4 d6/4
             | g6/4 f#6/2 e6/2 d6/4 b5/4
             | a5/2 d6/2 f#6/2 a6/2 f#6/2 d6/2 a5/4
             | a5/2 c#6/2 e6/2 a6/2 e6/2 c#6/2 a5/4
             | g5/2 b5/2 d6/2 g6/2 f#6/2 e6/2 d6/2 b5/2
             | e6/4 d6/2 c#6/2 e6/8`,
      harm: { arp: 'fast2', gate: 0.7 },
      bass: 'bnc',
      drums: 't2 e1 e1 e1 e1 e1 e1 g1f',
      mix: { lead: 1.1, drum: 1.1 },                      // triumphant half: full band
    };
    const X1B = {
      chords: '| D | A | Bm | G | D | A | G.A | D |',
      lead: `| f#6/3 e6/3 d6/2 f#6/3 a6/3 f#6/2
             | e6/2 d6/2 c#6/4 e6/2 a6/2 e6/4
             | d6/3 c#6/3 b5/2 d6/3 f#6/3 d6/2
             | b5/2 a5/2 g5/4 b5/2 d6/2 g6/4
             | a5/4 d6/4 f#6/4 a6/4
             | a6/4 e6/4 c#6/4 a5/4
             | b5/2 d6/2 g6/4 e6/2 c#6/2 a5/4
             | d6/12 r/4`,
      harm: { thirds: true, gate: 0.9, vol: 0.8 },
      bass: 'bnc bnc bnc bnc pump pump bnc2 long',
      drums: 't2 e1 e1 e1 t1 t1 t1 s3',
      mix: { lead: 1.1, drum: 1.1 },
    };
    const X2A = {
      chords: '| D | Bm | G | A | D | F#m | Em | A |',
      lead: `| f#5/4 a5/4 d6/8
             | d6/4 c#6/2 b5/2 f#5/8
             | b5/4 d6/4 g6/8
             | e6/6 d6/2 c#6/8
             | a5/4 d6/4 f#6/8
             | f#6/6 e6/2 c#6/8
             | b5/4 g5/4 e5/8
             | a5/4 c#6/4 e6/8`,
      harm: { arp: 'tender', gate: 0.8 },
      bass: 'soft',
      drums: 's2 s2 s2 s2 s2 s2 s2 s2',
      cfg: { lead: { duty: 0.125, vol: 0.36, a: 0.012, d: 0.14, s: 0.8, r: 0.1, gate: 0.97, vib: [4.8, 18, 0.2] } },
      mix: { lead: 0.7, harm: 0.85, bass: 0.9, drum: 0.5 },        // tender half: about -3 dB lead, half the drums
    };
    const X2B = {
      chords: '| D | Bm | G | A | D | F#m | G.A | A |',
      lead: `| a5/4 d6/4 f#6/4 a6/4
             | b5/4 d6/4 f#6/4 d6/4
             | g5/4 b5/4 d6/4 b5/4
             | c#6/4 e6/4 a6/4 e6/4
             | f#6/6 e6/2 d6/4 f#6/4
             | f#6/6 e6/2 c#6/4 a5/4
             | g5/2 b5/2 d6/2 g6/2 a5/2 c#6/2 e6/2 a6/2
             | a5/1 c#6/1 e6/1 a6/1 a5/1 c#6/1 e6/1 a6/1 e6/2 c#6/2 e6/2 a5/2`,
      harm: { arp: 'tender', gate: 0.8 },
      bass: 'soft soft soft soft soft soft pump pump',
      drums: 's2 s2 s2 s2 s2 s2 s4 s4',
      cfg: { lead: { duty: 0.125, vol: 0.36, a: 0.012, d: 0.14, s: 0.8, r: 0.1, gate: 0.97, vib: [4.8, 18, 0.2] } },
      mix: { lead: 0.75, harm: 0.85, bass: 0.9, drum: 0.55 },
    };
    D.ending = {
      bpm: 124, swing: 0.52, echo: 3, key: 2, mode: [0, 2, 4, 5, 7, 9, 11], gain: 1,
      mix: { lead: 1.08, harm: 1.08, bass: 1.05 },
      sections: { X1A, X1B, X2A, X2B },
      order: ['X1A', 'X1B', 'X2A', 'X2B'],
    };

    // ---- JINGLES -------------------------------------------------------------------------------------
    // start: 160 bpm, G, 24 steps (2.25 s: FIXPLAN2 K7 -- it must be over before the 2.5 s round-1 intro is).  Rising triad, held top
    // note, step down, then the leap to the held tonic on the crash; the stage loop (G, 150 bpm) takes over on the next downbeat.
    D.start = {
      kind: 'jingle', bpm: 160, swing: 0.5, echo: 3, key: 7, mode: [0, 2, 4, 5, 7, 9, 11], gain: 1,
      sections: { J: {
        chords: '| G/12.D/4 | G/8 |',
        lead: `| g5/2 b5/2 d6/2 g6/4 f#6/2 e6/2 d6/2
               | g6/8`,
        harm: { arp: 'fast2', gate: 0.7 },
        bass: 'pump long',
        drums: 'g1f t2',
      } },
      order: ['J'],
    };
    // extend: 150 bpm, G pentatonic run + held top, 32 steps
    D.extend = {
      kind: 'jingle', bpm: 150, swing: 0.5, echo: 3, key: 7, mode: [0, 2, 4, 5, 7, 9, 11], gain: 1,
      sections: { J: {
        chords: '| G | C.G |',
        lead: `| d5/1 e5/1 g5/1 a5/1 b5/1 d6/1 e6/1 g6/1 a6/2 g6/2 e6/2 d6/2
               | b5/2 d6/2 g6/12`,
        harm: { arp: 'fast2', gate: 0.6 },
        bass: 'pump long',
        drums: 's4 t2',
      } },
      order: ['J'],
    };
    // gameover: 84 bpm, A minor, 24 steps (4.3 s) -- falling phrase Am.F -> Am, last low note rings out
    D.gameover = {
      kind: 'jingle', bpm: 84, swing: 0.5, echo: 3, key: 9, mode: [0, 2, 3, 5, 7, 8, 10], gain: 1,
      sections: { J: {
        chords: '| Am.F | Am/8 |',
        lead: `| e6/4 c6/4 a5/4 f5/2 e5/2
               | a4/8`,
        harm: { arp: 'tender', gate: 0.9 },
        bass: 'soft',
        drums: 'go',
        cfg: { lead: { r: 0.12, gate: 0.97 } },
      } },
      order: ['J'],
    };
    // clear_boss: 156 bpm, E MAJOR (Picardy: the E-minor boss theme resolves to its major tonic -- a different key and contour from
    // start / title / extend, which all sit in G), 32 steps
    D.clear_boss = {
      kind: 'jingle', bpm: 156, swing: 0.5, echo: 3, key: 4, mode: [0, 2, 4, 5, 7, 9, 11], gain: 1,
      sections: { J: {
        chords: '| E | A/4.E/12 |',
        lead: `| b5/2 e6/2 g#6/2 b6/4 a6/2 g#6/4
               | a5/2 c#6/2 g#6/2 b6/2 e6/8`,
        harm: { arp: 'fast2', gate: 0.7 },
        bass: 'pump pump',
        drums: 't2 g1f',
      } },
      order: ['J'],
    };
    defsCache = D;
    return D;
  }

  // ================================================================================================
  // compilation: song def -> program { events[step] = [...], steps, loopStart, meta }
  // ================================================================================================
  const progs = {};
  function getProg(name) { return progs[name] || (progs[name] = compileSong(name)); }

  function mergeCfg(base, over) { return Object.assign({}, base, over || {}); }

  function compileSong(name) {
    const def = songDefs()[name];
    const issues = [];
    const prog = {
      name, kind: def.kind || 'loop', bpm: def.bpm, swing: def.swing, echo: def.echo || 0, key: def.key, mode: def.mode,
      steps: 0, loopStart: 0, events: [], meta: { lead: [], chords: [], issues, sections: [] },
      mix: Object.assign({ lead: 1, harm: 1, bass: 1, drum: 1 }, def.mix || {}),
      lift: def.lift || 0,                  // semitones added to every pitched voice on every second pass of a loop
      maxTempo: def.maxTempo || 0,          // cap for AUDIO.setTempo() on this track (0 = none)
    };
    const seq = (def.intro || []).concat(def.order);
    const loopIdx = (def.intro || []).length;
    let off = 0;
    seq.forEach((sn, i) => {
      if (i === loopIdx) prog.loopStart = off;
      const sec = def.sections[sn];
      off += compileSection(prog, def, sec, sn, off, issues);
    });
    prog.steps = off;
    return prog;
  }

  function addEv(prog, step, ev) {
    if (step < 0 || step >= 1e5) return;
    (prog.events[step] || (prog.events[step] = [])).push(ev);
  }

  function compileSection(prog, def, sec, sn, off, issues) {
    const tag = prog.name + '.' + sn;
    const ch = parseChords(sec.chords, issues, tag + '.chords');
    const lead = parseNotes(sec.lead, issues, tag + '.lead');
    const steps = ch.steps;
    ch.bars.forEach((b, i) => { if (b !== STEPS_PER_BAR && prog.kind !== 'jingle') issues.push(tag + '.chords: bar ' + (i + 1) + ' has ' + b + ' steps'); });
    lead.bars.forEach((b, i) => { if (ch.bars[i] !== undefined && b !== ch.bars[i]) issues.push(tag + '.lead: bar ' + (i + 1) + ' has ' + b + ' steps, chords have ' + ch.bars[i]); });
    if (lead.steps !== steps) issues.push(tag + ': lead ' + lead.steps + ' steps vs chords ' + steps);

    const cfg = {
      lead: mergeCfg(mergeCfg(VOICE.lead, def.cfg && def.cfg.lead), sec.cfg && sec.cfg.lead),
      harm: mergeCfg(mergeCfg(VOICE.harm, def.cfg && def.cfg.harm), sec.cfg && sec.cfg.harm),
      bass: mergeCfg(mergeCfg(VOICE.bass, def.cfg && def.cfg.bass), sec.cfg && sec.cfg.bass),
    };
    prog.meta.sections.push({ name: sn, start: off, steps });
    // per-section mix (QA A7): multipliers on the voice velocities; 0 = voice tacet in this section (breakdowns, drum drop-outs)
    const mx = Object.assign({ lead: 1, harm: 1, bass: 1, drum: 1 }, sec.mix || {});

    // lead
    for (const e of lead.ev) {
      // gentle accent pattern: downbeats a touch louder than off-beats (chip leads have no velocity, composers fake it)
      const vel = (e.s % 8 === 0 ? 1 : e.s % 4 === 0 ? 0.93 : 0.84) * mx.lead;
      if (mx.lead > 0) addEv(prog, off + e.s, { v: 'lead', n: e.n, m: e.m, vel, cfg: cfg.lead });
      prog.meta.lead.push({ s: off + e.s, n: e.n, m: e.m });
    }
    for (const c of ch.list) prog.meta.chords.push({ s: off + c.s, n: c.n, root: c.root, ints: c.ints, name: c.name });

    // harmony voice
    const h = sec.harm;
    if (h) {
      const hcfg = Object.assign({}, cfg.harm, h.gate !== undefined ? { gate: h.gate } : {}, h.vol !== undefined ? { vol: cfg.harm.vol * h.vol } : {});
      if (h.arp) {
        const names = h.arp.split(/\s+/);
        for (const c of ch.list) {
          const barIdx = Math.floor(c.s / STEPS_PER_BAR);
          const pat = ARP[names[barIdx % names.length]] || ARP.roll;
          if (mx.harm > 0) for (const e of genPattern(pat, c, ARP_LO, c.s, c.n)) addEv(prog, off + e.s, { v: 'harm', n: e.n, m: e.m, vel: mx.harm, cfg: hcfg });
        }
      } else if (h.thirds) {
        if (mx.harm > 0) for (const e of lead.ev) addEv(prog, off + e.s, { v: 'harm', n: e.n, m: thirdBelow(e.m, def.key, def.mode), vel: mx.harm, cfg: hcfg });
      } else if (h.notes) {
        if (mx.harm > 0) for (const e of parseNotes(h.notes, issues, tag + '.harm').ev) addEv(prog, off + e.s, { v: 'harm', n: e.n, m: e.m, vel: mx.harm, cfg: hcfg });
      }
    }

    // bass
    if (sec.bass) {
      const names = sec.bass.split(/\s+/);
      for (const c of ch.list) {
        const barIdx = Math.floor(c.s / STEPS_PER_BAR);
        const pat = BASS[names[barIdx % names.length]] || BASS.long;
        if (mx.bass > 0) for (const e of genPattern(pat, c, BASS_LO, c.s, c.n)) addEv(prog, off + e.s, { v: 'bass', n: e.n, m: e.m, vel: mx.bass, cfg: cfg.bass });
      }
    }

    // drums
    if (sec.drums && mx.drum > 0) {
      const names = sec.drums.split(/\s+/);
      for (let bar = 0; bar * STEPS_PER_BAR < steps; bar++) {
        const pat = DRUMS[names[bar % names.length]];
        if (!pat) { issues.push(tag + '.drums: unknown pattern ' + names[bar % names.length]); continue; }
        if (pat.length !== STEPS_PER_BAR) issues.push(tag + '.drums: pattern ' + names[bar % names.length] + ' has ' + pat.length + ' chars');
        for (let i = 0; i < pat.length; i++) {
          const s = bar * STEPS_PER_BAR + i;
          if (s >= steps) break;
          const hits = DRUM_CH[pat[i]];
          if (!hits) continue;
          for (const [kind, vel] of hits) addEv(prog, off + s, { v: 'drum', kind, vel: vel * mx.drum });
        }
      }
    }
    return steps;
  }

  // ================================================================================================
  // audio chain (shared by live + offline contexts)
  // ================================================================================================
  let softCurve = null;
  function softClipCurve() {
    if (softCurve) return softCurve;
    const N = 4097, LIM = 0.80, KNEE = 0.55;   // ceiling < 0.9 even after the 2x oversampling filter overshoot (and 18 piled-up sfx)
    softCurve = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const x = (i / (N - 1)) * 2 - 1, ax = Math.abs(x);
      const y = ax <= KNEE ? ax : KNEE + (LIM - KNEE) * Math.tanh((ax - KNEE) / (LIM - KNEE));
      softCurve[i] = x < 0 ? -y : y;
    }
    return softCurve;
  }

  function buildChain(ctx, startMuted) {
    const music = ctx.createGain(); music.gain.value = MUSIC_LEVEL;
    const sfx = ctx.createGain(); sfx.gain.value = SFX_LEVEL;
    const master = ctx.createGain(); master.gain.value = MASTER_LEVEL;
    const comp = ctx.createDynamicsCompressor();
    // gentle glue compressor (QA A7): high threshold + low ratio so per-section / per-voice level changes survive (the old
    // -20 dB / 4:1 turned a 4 dB section change into ~1 dB); the soft clipper after it is the actual ceiling.
    comp.threshold.value = -14; comp.knee.value = 12; comp.ratio.value = 2.5;
    comp.attack.value = 0.006; comp.release.value = 0.18;
    const shaper = ctx.createWaveShaper();
    shaper.curve = softClipCurve(); shaper.oversample = '2x';
    const mute = ctx.createGain(); mute.gain.value = startMuted ? 0 : 1;
    music.connect(master); sfx.connect(master); master.connect(comp);
    comp.connect(shaper); shaper.connect(mute); mute.connect(ctx.destination);

    // tempo-synced ping-pong echo, returns into the music bus
    const echoIn = ctx.createGain();
    const dL = ctx.createDelay(1.5), dR = ctx.createDelay(1.5);
    dL.delayTime.value = 0.3; dR.delayTime.value = 0.3;
    const fb1 = ctx.createGain(), fb2 = ctx.createGain();
    fb1.gain.value = ECHO_FEEDBACK; fb2.gain.value = ECHO_FEEDBACK;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3200;
    const pL = ctx.createStereoPanner(), pR = ctx.createStereoPanner();
    pL.pan.value = -0.55; pR.pan.value = 0.55;
    const echoOut = ctx.createGain();
    echoIn.connect(dL); dL.connect(pL); pL.connect(echoOut);
    dL.connect(fb1); fb1.connect(dR); dR.connect(pR); pR.connect(echoOut);
    dR.connect(fb2); fb2.connect(lp); lp.connect(dL);
    echoOut.connect(music);

    return {
      music, sfx, master, comp, shaper, mute, echoIn, ctx,
      setEchoTime(sec) {
        const t = ctx.currentTime;
        dL.delayTime.setTargetAtTime(sec, t, 0.08);
        dR.delayTime.setTargetAtTime(sec, t, 0.08);
      },
    };
  }

  // ================================================================================================
  // tracks (sequencer instances)
  // ================================================================================================
  let trackSeq = 0;

  function makeTrack(ctx, chain, prog, kind, realtime) {
    const out = ctx.createGain();
    out.connect(chain.music);
    const mk = (pan, mixKey, send) => {
      const g = ctx.createGain(); g.gain.value = prog.mix[mixKey];
      if (pan) { const p = ctx.createStereoPanner(); p.pan.value = pan; g.connect(p); p.connect(out); g.__p = p; } else g.connect(out);
      if (send) { const s = ctx.createGain(); s.gain.value = send; g.connect(s); s.connect(chain.echoIn); g.__s = s; }
      return g;
    };
    const bus = {
      lead: mk(0, 'lead', prog.echo ? ECHO_SEND : 0),
      harm: mk(-0.3, 'harm', 0),
      bass: mk(0, 'bass', 0),
      drum: mk(0.1, 'drum', 0),
    };
    const tr = {
      id: ++trackSeq, ctx, chain, prog, name: prog.name, kind, out, bus,
      pos: 0, count: 0, nextTime: null, done: false, endTime: 0, stopped: false, finished: false, chained: false,
      onEnd: null, resume: null, tempoFixed: null, wallDeadline: 0,
      pass: 0, passLocked: !realtime,        // loop pass counter (key lift on every second pass); offline renders stay periodic
      sw: null,                              // pending bar-aligned loop switch {name, left, make}
      startAt: 0,                            // ctx time of the first step (echo timing)
      reg: realtime ? makeRegistry() : null,
    };
    if (realtime) live.tracks++;
    return tr;
  }

  function disposeTrack(tr) {
    if (tr.disposed) return;
    tr.disposed = true;
    if (tr.reg) { tr.reg.clear(); live.tracks--; }
    const kill = (n) => { try { n.disconnect(); } catch (e) { /* already gone */ } };
    kill(tr.out);
    for (const k of Object.keys(tr.bus)) {
      const b = tr.bus[k]; kill(b); if (b.__p) kill(b.__p); if (b.__s) kill(b.__s);
    }
  }

  const FR_CACHE = {};
  function stepFractions(swing) {
    const key = swing;
    return FR_CACHE[key] || (FR_CACHE[key] = [swing / 2, swing / 2, (1 - swing) / 2, (1 - swing) / 2]);
  }
  function trackTempo(tr) {
    if (tr.tempoFixed !== null) return tr.tempoFixed;
    if (tr.kind === 'jingle') return 1;
    return tr.prog.maxTempo ? Math.min(tempo, tr.prog.maxTempo) : tempo;
  }
  function beatSeconds(tr) { return 60 / (tr.prog.bpm * trackTempo(tr)); }

  // ---- fault accounting (QA A4): audio must never throw into the game or freeze on a repeating exception ----
  let faults = 0, disabled = false;
  const sfxFaults = {}, faultWarned = {};
  function warnFault(key, msg) {                     // one console.warn per failure class (music, or one sfx name), never a flood
    if (faultWarned[key]) return;
    faultWarned[key] = true;
    try { console.warn('AUDIO: ' + msg); } catch (e) { /* no console */ }
  }
  function noteFault(err) {
    faults++;
    if (faults >= FAULT_LIMIT && !disabled) {
      disabled = true;
      warnFault('music', 'too many WebAudio failures (' + (err && err.message ? err.message : err) + ') -- music disabled');
      pendingLoop = null;
      try { if (timer !== null) { clearInterval(timer); timer = null; } } catch (e) { /* ignore */ }
      try { if (ctx) stopAll(0); } catch (e) { /* ignore */ }
    }
  }

  /** Schedule all events of one step at time t. Returns nothing; step duration is added by the caller. */
  function scheduleStep(tr, step, t, beat, silent) {
    const evs = tr.prog.events[step];
    if (!evs || silent) return;
    const fr = stepFractions(tr.prog.swing);
    const ctx = tr.ctx;
    const lift = tr.prog.lift && (tr.pass & 1) ? tr.prog.lift : 0;
    let failure = null;
    REG = tr.reg;
    try {
      for (const e of evs) {
        if (tr.skip && tr.skip.indexOf(e.v) >= 0) continue;
        try {                                                 // one bad event must not take the others (or the clock) down
          if (e.v === 'drum') { playDrum(ctx, tr.bus.drum, t, e.kind, e.vel); continue; }
          let dur = 0;
          for (let k = 0; k < e.n; k++) dur += fr[(step + k) & 3];
          dur *= beat;
          pitched(ctx, tr.bus[e.v], t, dur, e.m + lift, e.cfg, e.vel === undefined ? 1 : e.vel);
        } catch (err) { failure = err; }
      }
    } finally { REG = null; }
    if (failure) noteFault(failure);                          // one fault per failing step, however many of its events failed
  }

  /** Advance a track: schedule every step whose start time is before `until`. */
  function advanceTrack(tr, until, silent) {
    const p = tr.prog;
    const fr = stepFractions(p.swing);
    while (!tr.done && tr.nextTime < until && !(tr.sw && tr.sw.left <= 0)) {
      const step = tr.pos;
      if (step === p.loopStart && tr.kind === 'loop') nzReset();     // identical noise every cycle -> exactly periodic loop
      const beat = beatSeconds(tr);
      scheduleStep(tr, step, tr.nextTime, beat, silent);
      tr.count++;
      if (tr.sw) tr.sw.left--;
      tr.nextTime += beat * fr[step & 3];
      tr.pos++;
      if (tr.pos >= p.steps) {
        if (tr.kind === 'loop') { tr.pos = p.loopStart; if (!tr.passLocked) tr.pass++; }
        else { tr.done = true; tr.endTime = tr.nextTime; }
      }
    }
  }

  // ================================================================================================
  // runtime state
  // ================================================================================================
  let ctx = null, chain = null, timer = null;
  let paused = false, pauseKind = null, tempo = 1;       // pauseKind: 'hard' (context suspended) | 'soft' (context keeps running)
  let pausedWall = 0, pausedCtx = 0;                     // when the current pause began (wall clock / audio clock)
  let muted = !!U.store.get('muted', false);
  let pendingLoop = null;                 // loop requested before init()
  let active = [];                        // tracks currently alive (cur + finishing jingle + a loop that is fading out)
  let cur = null;                         // the track that represents "the music"
  let lastEcho = -1;
  const groups = {};                      // sfx name -> [group]
  let tapNode = null;

  const isRunning = () => !!ctx && ctx.state === 'running' && !paused;

  /** Fade a track out and release it.  `at` (ctx time, optional) delays the start of the fade (bar-aligned switch). */
  function cut(tr, fade, at) {
    if (tr.stopped) return;
    tr.stopped = true;
    tr.onEnd = null; tr.sw = null;
    const now = ctx.currentTime, t0 = at === undefined ? now : Math.max(now, at), f = Math.max(0.012, fade);
    try {
      tr.out.gain.cancelScheduledValues(now);
      tr.out.gain.setValueAtTime(tr.out.gain.value, t0);
      tr.out.gain.linearRampToValueAtTime(0, t0 + f);
    } catch (e) { /* ignore */ }
    if (tr.reg) tr.reg.stopAll(t0 + f + 0.03);
    setTimeout(() => disposeTrack(tr), (t0 - now + f + 0.12) * 1000);
  }
  function stopAll(fade) {
    const list = active; active = []; cur = null;
    for (const tr of list) cut(tr, fade);
  }
  function startLoop(name, pos, startAt, pass) {
    const tr = makeTrack(ctx, chain, getProg(name), 'loop', true);
    tr.pos = pos || 0;
    tr.pass = pass | 0;
    tr.nextTime = startAt === undefined ? null : startAt;
    tr.startAt = tr.nextTime === null ? 0 : tr.nextTime;
    active.push(tr);
    cur = tr;
    return tr;
  }
  function barStart(tr) {
    const p = tr.prog;
    if (tr.pos < p.loopStart) return tr.pos - (tr.pos % STEPS_PER_BAR);
    return p.loopStart + Math.floor((tr.pos - p.loopStart) / STEPS_PER_BAR) * STEPS_PER_BAR;
  }

  /**
   * Steps still to be scheduled before the next bar line of `tr` -- or, when that bar line is more than `capSec` away
   * (counted from now), before the next half bar / beat line.  0 = the track is exactly on a line.
   */
  function stepsToLine(tr, capSec) {
    const fr = stepFractions(tr.prog.swing), beat = beatSeconds(tr);
    const lead = Math.max(0, tr.nextTime - ctx.currentTime);       // already-scheduled time that still has to be heard
    let best = 0;
    for (const g of [STEPS_PER_BAR, STEPS_PER_BAR / 2, STEPS_PER_BAR / 4]) {
      const n = (g - (tr.pos % g)) % g;
      let sec = lead;
      for (let k = 0; k < n; k++) sec += beat * fr[(tr.pos + k) & 3];
      best = n;
      if (sec <= capSec) break;
    }
    return best;
  }
  let lastSwitch = null;                  // debug: the most recent bar-aligned switch {from, to, pos, at, requested}
  /** Start the pending switch of `tr` now: the old loop fades out from its last scheduled step on, the new track starts there. */
  function fireSwitch(tr) {
    const sw = tr.sw;
    if (!sw) return;
    tr.sw = null;
    const at = Math.max(tr.nextTime, ctx.currentTime + 0.02);
    lastSwitch = { from: tr.name, to: sw.name, pos: tr.pos, at, requested: sw.t0, now: ctx.currentTime };
    const i = active.indexOf(tr); if (i >= 0) active.splice(i, 1);
    cut(tr, FADE_XFADE, at);
    sw.make(at);
  }
  /** Plan (or retarget) a bar-aligned switch away from the sounding loop `tr`. */
  function planSwitch(tr, name, capSec, make) {
    const left = stepsToLine(tr, capSec);
    tr.sw = { name, left, make, t0: ctx.currentTime };
    if (left <= 0) fireSwitch(tr);
  }

  let lastJingleEnd = null;               // debug: timeline end (ctx time) of the most recent jingle that ended on its own
  function finishJingle(tr) {
    if (tr.finished) return;
    tr.finished = true;
    if (tr.done) lastJingleEnd = tr.endTime;
    const cb = tr.onEnd; tr.onEnd = null;
    const i = active.indexOf(tr); if (i >= 0) active.splice(i, 1);
    // let the tail ring out (dispose as soon as its last source has ended; 6 s safety net), then free the nodes
    if (!tr.stopped) tr.stopped = true;
    if (tr.reg && tr.reg.set.size) tr.reg.onIdle = () => disposeTrack(tr); else disposeTrack(tr);
    setTimeout(() => disposeTrack(tr), 6000);
    safeCall(cb);
  }

  function pump(tr, now) {
    if (tr.stopped || tr.finished) return;
    if (tr.nextTime === null) { tr.nextTime = now + START_DELAY; tr.startAt = tr.nextTime; }
    if (!tr.done && tr.nextTime < now - 0.08) { tr.nextTime = now + 0.03; live.resyncs++; }     // we were starved: resync
    advanceTrack(tr, now + HORIZON, muted);
    if (tr.sw && tr.sw.left <= 0) fireSwitch(tr);
    if (tr.kind === 'jingle' && tr.done) {
      if (!tr.chained) {
        tr.chained = true;
        if (tr.resume && cur === tr) startLoop(tr.resume.name, tr.resume.pos, tr.endTime, tr.resume.pass);
      }
      if (now >= tr.endTime - JINGLE_END_LEAD) finishJingle(tr);
    }
  }

  let okTicks = 0;
  function tick() {
    if (!ctx || disabled) return;
    const f0 = faults;
    try {
      if (ctx.state === 'running' && !paused) {
        const now = ctx.currentTime;
        for (const tr of active.slice()) pump(tr, now);
        if (cur && !cur.stopped && cur.prog.echo && cur.startAt <= now + 0.05) {
          const sec = cur.prog.echo * beatSeconds(cur) / 4;
          if (Math.abs(sec - lastEcho) > 0.002) { lastEcho = sec; chain.setEchoTime(sec); }
        }
      } else if (!paused) {
        // context not running (autoplay blocked / not yet resumed): never let a jingle stall the game
        const wall = performance.now();
        for (const tr of active.slice()) {
          if (tr.kind === 'jingle' && !tr.finished && wall > tr.wallDeadline) {
            if (tr.resume && cur === tr) startLoop(tr.resume.name, tr.resume.pos, null, tr.resume.pass);
            finishJingle(tr);
          }
        }
      }
    } catch (e) { noteFault(e); }
    if (faults === f0 && faults > 0 && ++okTicks >= 40) { okTicks = 0; faults--; }      // sporadic failures heal (~1 s of clean ticks each)
  }

  // ================================================================================================
  // public API
  // ================================================================================================
  function init() {
    if (!ctx) {
      let AC = null;
      try { AC = window.AudioContext || window.webkitAudioContext; } catch (e) { AC = null; }
      if (!AC) return;
      try { ctx = new AC({ latencyHint: 'interactive' }); } catch (e) {
        try { ctx = new AC(); } catch (e2) { ctx = null; return; }
      }
      try { chain = buildChain(ctx, muted); } catch (e) { ctx = null; chain = null; return; }
      timer = setInterval(tick, TICK_MS);
      if (pendingLoop) { const n = pendingLoop; pendingLoop = null; playMusic(n); }
    }
    if ((!paused || pauseKind === 'soft') && ctx.state !== 'running') {
      try { const p = ctx.resume(); if (p && p.catch) p.catch(noop); } catch (e) { /* ignore */ }
    }
  }
  const ready = () => isRunning();

  function playMusic(name, opts) {
    opts = opts || {};
    if (LOOPS.indexOf(name) < 0) { warnOnce('music', name); return; }
    if (disabled) return;
    if (!ctx) { pendingLoop = name; return; }
    if (cur && !cur.stopped && !opts.restart) {
      if (cur.kind === 'loop') {
        if (cur.name === name) { cur.sw = null; return; }                 // asking for the loop that is sounding cancels a pending switch
        if (cur.sw && cur.sw.name === name) return;
        if (isRunning() && cur.nextTime !== null) {
          // loop -> loop (round 16, round 30, back to the title ...): keep the old loop until the end of its bar, then switch
          planSwitch(cur, name, SWITCH_MAX_WAIT, (at) => startLoop(name, 0, at, 0));
          return;
        }
      } else {
        // A jingle is playing: don't chop it off -- the requested loop starts right after it (replacing any pending resume).
        // Once its last notes are scheduled (pump() sets `chained`, ~HORIZON before the end) cur.resume is never read again, so
        // chain the loop behind the jingle now; never earlier than a moment from now (the jingle may have ended <1 tick ago).
        if (cur.chained && cur.endTime !== undefined) { startLoop(name, 0, Math.max(cur.endTime, ctx.currentTime + 0.02), 0); return; }
        if (!cur.resume || cur.resume.name !== name) cur.resume = { name, pos: 0, pass: 0 };
        return;
      }
    }
    // A loop requested from a jingle's onEnd (or a moment after it) continues on the jingle's end line: no gap, on the downbeat.
    const line = !opts.restart && cur && cur.kind === 'jingle' && cur.finished && cur.endTime > 0 && ctx.currentTime - cur.endTime < 0.1
      ? Math.max(cur.endTime, ctx.currentTime + 0.01) : null;
    stopAll(FADE_SWITCH);
    startLoop(name, 0, line);
  }

  function softJingle(name, opts) {
    // No usable context: behave as a silent timer with the jingle's nominal length.
    const prog = getProg(name);
    const secs = prog.steps / 4 * 60 / prog.bpm;
    const keep = opts.resume ? pendingLoop : null;
    pendingLoop = null;
    setTimeout(() => {
      if (keep && pendingLoop === null) { if (ctx && !disabled) playMusic(keep); else if (!disabled) pendingLoop = keep; }
      safeCall(opts.onEnd);
    }, secs * 1000);
  }

  function jingle(name, opts) {
    opts = opts || {};
    if (JINGLES.indexOf(name) < 0) { warnOnce('jingle', name); if (opts.onEnd) setTimeout(() => safeCall(opts.onEnd), 0); return; }
    if (!ctx || disabled) { softJingle(name, opts); return; }
    let rs = null;
    if (opts.resume && cur && !cur.stopped) {
      if (cur.kind === 'loop') {
        rs = cur.sw ? { name: cur.sw.name, pos: 0, pass: 0 } : { name: cur.name, pos: barStart(cur), pass: cur.pass };
      } else if (cur.resume) rs = cur.resume;             // jingle replacing a jingle inherits the pending resume
    }
    const prog = getProg(name);
    // the fanfare starts at once (it is a game event: no waiting for a bar line); a sounding loop is faded out under its attack
    stopAll(cur && !cur.stopped && cur.kind === 'loop' ? FADE_JINGLE : FADE_SWITCH);
    const tr = makeTrack(ctx, chain, prog, 'jingle', true);
    tr.onEnd = opts.onEnd || null;
    tr.resume = rs;
    tr.wallDeadline = performance.now() + (prog.steps / 4 * 60 / prog.bpm + 1.2) * 1000;
    active.push(tr);
    cur = tr;
  }

  function stopMusic(fadeSec) {
    pendingLoop = null;
    if (ctx) stopAll(Math.max(0, +fadeSec || 0));
  }

  function setTempo(scale) {
    tempo = clamp(+scale || 1, 0.5, 2);
  }

  function sfx(name, opts) {
    const def = sfxDef(name);
    if (!def) { warnOnce('sfx', name); return; }
    if (!ctx || ctx.state !== 'running' || muted) return;
    if (live.voices > MAX_VOICES) return;
    if ((sfxFaults[name] | 0) >= SFX_FAULT_LIMIT) return;      // this sound keeps failing on this engine: leave it out
    opts = opts || {};
    const now = ctx.currentTime;
    const list = groups[name] || (groups[name] = []);
    while (list.length >= def.max) {                       // voice limit: steal the oldest instance
      const old = list.shift();
      if (old.counted) { old.counted = false; live.groups--; }
      try { old.gain.gain.cancelScheduledValues(now); old.gain.gain.setTargetAtTime(0, now, 0.004); } catch (e) { /* ignore */ }
      old.reg.stopAll(now + 0.03);
    }
    let g = null, grp = null;
    try {
      g = ctx.createGain();
      g.connect(chain.sfx);
      grp = { gain: g, reg: null, counted: true };
      grp.reg = makeRegistry(() => {
        const i = list.indexOf(grp); if (i >= 0) list.splice(i, 1);
        try { g.disconnect(); } catch (e) { /* ignore */ }
        if (grp.counted) { grp.counted = false; live.groups--; }
      });
      live.groups++;
      list.push(grp);
      const P = sfxParams(def, opts);
      REG = grp.reg;
      def.fn(kit(ctx, g, now + 0.003, P));
    } catch (e) {
      sfxFaults[name] = (sfxFaults[name] | 0) + 1;
      if (sfxFaults[name] >= SFX_FAULT_LIMIT) warnFault('sfx:' + name, 'sfx "' + name + '" keeps failing (' + (e && e.message ? e.message : e) + ') -- disabled');
    } finally { REG = null; }
    if (grp && !grp.reg.set.size) grp.reg.onIdle();
  }

  function setMuted(b) {
    muted = !!b;
    U.store.set('muted', muted);
    if (chain) {
      try { chain.mute.gain.cancelScheduledValues(ctx.currentTime); chain.mute.gain.setTargetAtTime(muted ? 0 : 1, ctx.currentTime, 0.012); } catch (e) { /* ignore */ }
    }
  }
  function toggleMuted() { setMuted(!muted); return muted; }
  const isMuted = () => muted;

  // pause({suspend}):  the music ducks out at once and the sequencer stops.
  //   suspend:true (default; blur / hidden tab): the context is suspended PAUSE_SUSPEND_MS later, so a "pause" blip played
  //     right before/after the call is still heard.
  //   suspend:false (manual pause screen): the context keeps running so menu sfx still play.
  // resume() undoes either, keeps jingles / loops on their own timeline (pause time is not counted against them) and
  // recovers a context that was suspended from outside.
  let pauseTimer = null;
  function pause(opts) {
    const hard = !(opts && opts.suspend === false);
    if (!paused) {
      paused = true;
      pausedWall = performance.now();
      pausedCtx = ctx ? ctx.currentTime : 0;
      if (chain) duckMusic(0);
    }
    pauseKind = hard ? 'hard' : 'soft';
    if (!ctx) return;
    if (hard) {
      if (ctx.state === 'running' && pauseTimer === null) {
        pauseTimer = setTimeout(() => {
          pauseTimer = null;
          if (paused && pauseKind === 'hard' && ctx && ctx.state === 'running') { try { const p = ctx.suspend(); if (p && p.catch) p.catch(noop); } catch (e) { /* ignore */ } }
        }, PAUSE_SUSPEND_MS);
      }
    } else {
      if (pauseTimer !== null) { clearTimeout(pauseTimer); pauseTimer = null; }
      if (ctx.state !== 'running') { try { const p = ctx.resume(); if (p && p.catch) p.catch(noop); } catch (e) { /* ignore */ } }
    }
  }
  function resume() {
    const was = paused;
    paused = false; pauseKind = null;
    if (pauseTimer !== null) { clearTimeout(pauseTimer); pauseTimer = null; }
    if (chain) duckMusic(1);
    if (was && ctx) {
      // the audio clock kept running for (part of) the pause while nothing was scheduled: shift every timeline by that much
      const d = Math.max(0, ctx.currentTime - pausedCtx), wall = performance.now() - pausedWall;
      for (const tr of active) {
        if (tr.nextTime !== null) tr.nextTime += d;
        if (tr.done) tr.endTime += d;
        if (tr.startAt) tr.startAt += d;
        if (tr.kind === 'jingle') tr.wallDeadline += wall + 400;         // pause time does not count against a jingle (QA A3)
      }
    }
    if (ctx && ctx.state !== 'running') { try { const p = ctx.resume(); if (p && p.catch) p.catch(noop); } catch (e) { /* ignore */ } }
  }
  function duckMusic(on) {
    try {
      const g = chain.music.gain, now = ctx.currentTime;
      g.cancelScheduledValues(now);
      g.setTargetAtTime(on ? MUSIC_LEVEL : 0, now, 0.02);
    } catch (e) { /* ignore */ }
  }

  const trackNames = () => LOOPS.concat(JINGLES);
  const sfxNames = () => SFX_NAMES.slice();

  // ---- offline rendering (debug / tests): the very same synth code into an OfflineAudioContext ----
  async function renderOffline(name, seconds, opts) {
    opts = opts || {};
    const OC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    const frames = Math.max(1, Math.ceil(seconds * OFFLINE_RATE));
    const oc = new OC(2, frames, OFFLINE_RATE);
    const ch = buildChain(oc, false);
    if (opts.noComp) ch.comp.ratio.value = 1;          // debug: bypass compression
    nzReset();
    if (sfxDef(name)) {
      const def = sfxDef(name);
      const g = oc.createGain(); g.connect(ch.sfx);
      const P = sfxParams(def, opts);
      if (opts.noTrim) P.v /= (def.trim === undefined ? 1 : def.trim);           // debug: raw, un-calibrated level
      def.fn(kit(oc, g, 0.0, P));
    } else if (LOOPS.indexOf(name) >= 0 || JINGLES.indexOf(name) >= 0) {
      const prog = getProg(name);
      const tr = makeTrack(oc, ch, prog, prog.kind === 'jingle' ? 'jingle' : 'loop', false);
      tr.tempoFixed = opts.tempo || 1;
      tr.skip = opts.skip || null;                    // debug: voices to leave out
      tr.pass = opts.pass | 0;                        // debug: which loop pass to render (odd = key-lifted for stage1/stage2)

      tr.nextTime = 0;
      ch.setEchoTime(prog.echo * (60 / (prog.bpm * tr.tempoFixed)) / 4);
      // Schedule in OFFLINE_CHUNK-second slices from suspend() callbacks (like the live look-ahead) -- creating every
      // node up front makes the render time quadratic in the length.
      const chunk = opts.chunk || OFFLINE_CHUNK;
      advanceTrack(tr, Math.min(seconds, chunk) + 0.001, false);
      for (let at = chunk; at < seconds; at += chunk) {
        oc.suspend(at).then(() => { advanceTrack(tr, Math.min(seconds, at + chunk) + 0.001, false); oc.resume(); });
      }
    } else {
      throw new Error('AUDIO._renderOffline: unknown name ' + name);
    }
    // debug: extra SFX layered over the render, [[sfxName, atSeconds], ...] (mix / clipping stress tests)
    for (const [sn, at] of opts.sfx || []) {
      const def = sfxDef(sn);
      if (!def) continue;
      const g = oc.createGain(); g.connect(ch.sfx);
      def.fn(kit(oc, g, at, { f: 1, v: def.trim === undefined ? 1 : def.trim }));
    }
    const buf = await oc.startRendering();
    return { sampleRate: OFFLINE_RATE, channels: [buf.getChannelData(0).slice(), buf.getChannelData(1).slice()] };
  }

  // ---- debug / test extras (not part of the contract) ---------------------------------------------
  function info(name) {
    if (sfxDef(name)) return { kind: 'sfx', max: SFX[name].max, quiet: !!SFX[name].quiet, quietDb: SFX[name].quiet ? (SFX[name].quiet === true ? 9 : SFX[name].quiet) : 0, lvl: SFX[name].lvl || 0 };
    const prog = getProg(name);
    const beat = 60 / prog.bpm;
    return {
      kind: prog.kind, bpm: prog.bpm, swing: prog.swing, steps: prog.steps, loopStart: prog.loopStart,
      bars: prog.steps / STEPS_PER_BAR, seconds: prog.steps / 4 * beat, lift: prog.lift, maxTempo: prog.maxTempo,
      loopSeconds: (prog.steps - prog.loopStart) / 4 * beat, introSeconds: prog.loopStart / 4 * beat,
    };
  }
  function dump(name) {
    const p = getProg(name);
    const notes = [];
    p.events.forEach((list, s) => { if (list) for (const e of list) if (e.v !== 'drum') notes.push({ s, n: e.n, m: e.m, v: e.v }); });
    return { name, bpm: p.bpm, swing: p.swing, key: p.key, mode: p.mode, steps: p.steps, loopStart: p.loopStart,
      lead: p.meta.lead, chords: p.meta.chords, sections: p.meta.sections, notes, issues: p.meta.issues.slice(), kind: p.kind };
  }
  function validate() {
    const issues = [];
    for (const n of trackNames()) for (const s of getProg(n).meta.issues) issues.push(s);
    return issues;
  }
  function stats() {
    return { voices: live.voices, tracks: live.tracks, groups: live.groups, resyncs: live.resyncs, active: active.length,
      ctxState: ctx ? ctx.state : 'none', time: ctx ? ctx.currentTime : 0, current: cur ? cur.name : null,
      currentKind: cur ? cur.kind : null, curPos: cur ? cur.pos : null, curCount: cur ? cur.count : 0, curNext: cur ? cur.nextTime : null, curPass: cur ? cur.pass : 0, curStartAt: cur ? cur.startAt : null, lastJingleEnd,
      switching: !!(cur && cur.sw), lastSwitch, faults, pendingLoop };
  }
  /** debug: record the final output for `sec` seconds (ScriptProcessor tapped after the mute gain) -> {sampleRate, t0, channels}; t0 = audio-clock time of sample 0 */
  function capture(sec) {
    return new Promise((resolve) => {
      if (!ctx || !chain || !ctx.createScriptProcessor) { resolve(null); return; }
      const sp = ctx.createScriptProcessor(2048, 2, 2), parts = [[], []], need = Math.ceil(sec * ctx.sampleRate);
      let t0 = null, n = 0;
      sp.onaudioprocess = (e) => {
        if (t0 === null) t0 = e.playbackTime;
        for (let c = 0; c < 2; c++) parts[c].push(Float32Array.from(e.inputBuffer.getChannelData(c)));
        n += e.inputBuffer.length;
        if (n < need) return;
        sp.onaudioprocess = null;
        try { chain.mute.disconnect(sp); sp.disconnect(); } catch (err) { /* ignore */ }
        resolve({ sampleRate: ctx.sampleRate, t0, channels: parts.map((list) => { const out = new Float32Array(n); let o = 0; for (const b of list) { out.set(b, o); o += b.length; } return out; }) });
      };
      chain.mute.connect(sp); sp.connect(ctx.destination);
    });
  }
  /** debug: move the current loop's read position (e.g. just before its end to test the loop wrap / pass counter) */
  function seek(step) {
    if (cur && cur.kind === 'loop' && !cur.stopped) cur.pos = clamp(step | 0, 0, cur.prog.steps - 1);
  }
  function state() {
    const c = cur && !cur.stopped ? cur : null;
    const sw = c && c.sw ? c.sw : null;                                // a bar-aligned switch counts as already requested
    return { music: c && c.kind === 'loop' ? (sw ? sw.name : c.name) : (pendingLoop || null),
      jingle: c && c.kind === 'jingle' ? c.name : null,
      switching: !!sw, tempo, inited: !!ctx, paused, pauseKind, muted, disabled, faults, ctxState: ctx ? ctx.state : 'none' };
  }
  /** AnalyserNode on the final output (post mute), created on demand. */
  function tap() {
    if (!ctx || !chain) return null;
    if (!tapNode) {
      tapNode = ctx.createAnalyser(); tapNode.fftSize = 2048;
      chain.mute.connect(tapNode);
    }
    return tapNode;
  }

  return { init, ready, music: playMusic, jingle, stopMusic, setTempo, sfx, setMuted, toggleMuted, isMuted,
    pause, resume, trackNames, sfxNames, _renderOffline: renderOffline,
    _info: info, _dump: dump, _validate: validate, _stats: stats, _state: state, _tap: tap, _seek: seek, _capture: capture };
})();

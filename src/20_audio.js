/* FIZZ & POP — 20_audio.js        v2.0 "Abyss Glow" soundtrack: 80s dark wave x modern EDM x industrial  (SPEC_V2 §6)
 * AUDIO: pure WebAudio procedural synth + look-ahead sequencer + SFX bank.  No samples, no network; every sound is computed in code.
 *
 * ================================================================================================================================
 * 1. ARCHITECTURE
 * ================================================================================================================================
 *  - Everything audible is built by voice functions that take (ctx, bus, time, ...), so the very same code runs on the live AudioContext and on an
 *    OfflineAudioContext (AUDIO._renderOffline).  The context runs at ENGINE_RATE = 24 kHz (12 kHz bandwidth; every DSP cost scales with the
 *    rate, the browser resamples to the device; engines that ignore the option fall back to their default rate and just cost more).
 *  - Signal path:
 *      lane buses (one mixer strip per instrument lane) -> track out -> musicIn --> glue compressor -> music gain -> duck --+
 *      reverb / delay returns --------------------------> musicIn                                                          +-> master -> limiter ->
 *      sfx groups -> sfx gain ------------------------------------------------------------------------------------------- +   soft ceiling -> mute -> out
 *    `duck` is the priority duck of the music bed under the critical cues (SFX_DUCK, FIXPLAN_V3 A4); the limiter is soft and slow (-1 dB, knee 6, 10:1, 3 ms / 160 ms) so an
 *    everyday sound never pumps the bed (A3: the music dips <= 1.5 dB under any single pop / jump / kill).
 *    Lane strip: in -> [drive] -> [crush] -> [lpf] -> [hpf] -> [chorus] -> [tremolo] -> vol -> (sends: rev / hall / spr / dly) -> [sidechain duck]
 *    -> [pan] -> track out.  Only the stages a lane asks for are created (every silent node still costs CPU).
 *  - Reverbs: `hall` (2.5 s) and `room` (0.4 s) are ConvolverNodes with procedurally generated MONO impulse responses fed by a mono down-mix (one
 *    convolution; a stereo IR doubles the live cost), widened after the convolver by a delayed copy on the other channel (ChannelMerger).  `spr` = spring tank (allpass-
 *    dispersion feedback loop, the "boing" of a twang guitar amp).  `dly` = tempo-synced ping-pong delay (song `echo` steps, `fb` feedback).
 *    SFX send into the `room` reverb too.  The sidechain is gain automation per kick on the lane's `duck` gain (see §3.6).
 *  - Instruments (INST table): supersaw / stab / pad (pre-baked unison-saw buffers: ONE looping buffer source per chord note), choir (baked saws + formant
 *    band-passes), chorus pick bass / upright (one combined-wave oscillator), 808 sub, distorted riff bass, cold arp, lead, alarm lead, Karplus-Strong twang
 *    (computed in JS, played from a buffer), FM bell / vibes, a full drum kit (machine kick, EDM kick, 808 boom, gated-reverb snare, hard / crushed snare, clap,
 *    finger snap, rim, toms, closed / open / metallic hats, ride, crash), industrial hits (ring-modulated clangs, noise hits) and FX (riser, down-sweep,
 *    reverse swell, impact, zap).
 *  - Sequencer: songs are compiled lazily to a per-16th-step event table.  A setInterval (25 ms) pump schedules events HORIZON (0.28 s) ahead on
 *    AudioContext time.  The step clock is advanced one step at a time using the *current* tempo, so AUDIO.setTempo() takes effect on the next
 *    unscheduled step with no glitch.  Swing is a per-beat duration pattern (steps 0,1 long / 2,3 short; swing 0.5 = straight).
 *  - Every playing track owns its lane buses and a registry of its source nodes; stopping a track fades it, stops its sources and disconnects it,
 *    so rapid switching never stacks tracks.  Counters in `live` (voices / tracks / groups) are exposed through AUDIO._stats() for leak tests.
 *
 * ================================================================================================================================
 * 2. PUBLIC API SEMANTICS  (unchanged from v1; SPEC §3.2 + FIXPLAN §0/§3 + FIXPLAN2 K7)
 * ================================================================================================================================
 *  - Calls before init(): sfx are dropped silently; music()/jingle() are remembered (a requested loop starts as soon as init() has created the
 *    context; a jingle called before init() just fires onEnd after its nominal length so game flow never stalls).  A jingle whose context never
 *    starts running (autoplay blocked) is force-finished by a wall-clock watchdog (paused time is not counted against it).
 *  - jingle(): onEnd fires when the jingle's timeline ends (once; JINGLE_END_LEAD = 40 ms early, so a loop requested from onEnd is still chained
 *    sample-accurately on the jingle's end line).  If the jingle is interrupted by another music()/jingle()/stopMusic() call its onEnd is dropped.
 *    With {resume:true} the previous loop continues sample-accurately at the beginning of the bar it was in.  Jingles ignore setTempo().  A jingle
 *    starts at once; a loop it replaces is faded out over 150 ms under its attack.
 *  - music(name) while a jingle is playing does not cut the jingle: the requested loop is queued and starts sample-accurately when the jingle
 *    ends.  The `start` jingle is 2.25 s (FIXPLAN2 K7: over before the 2.5 s round-1 intro; it MUST stay <= 2.4 s).  music(name) while another LOOP is
 *    sounding is bar-aligned: the old loop plays to the end of its bar (a half bar / beat when a bar would take more than 1.6 s), then fades out over
 *    0.2 s while the new loop starts sample-accurately on that line.  Asking for the sounding loop again cancels a pending switch.
 *    music(name, {restart:true}) and stopMusic() act immediately.
 *  - setTempo is global state and persists across tracks (Game resets it to 1.0 at round start; HURRY UP = 1.3, boss 1.15).  A song's `maxTempo` caps it.
 *  - Mute is a master gain at the end of the chain plus "don't create nodes" in the scheduler; the timeline keeps running.
 *  - pause({suspend}): the scheduler stops at once and the music ducks out in ~60 ms.  suspend:true (default): ready() turns false and the context is
 *    suspended 320 ms later (so a 'pause' blip played around the call is still heard: keep the pause sfx < 250 ms).  suspend:false (manual pause
 *    screen): the context keeps running so menu sfx still play.  resume() undoes either and shifts every timeline by the time that passed.
 *  - Failures: every scheduled event, the scheduler tick and every sfx are wrapped in try/catch.  After FAULT_LIMIT (20) failing scheduler steps the music
 *    is switched off with a single console.warn; an sfx that fails 6 times is disabled.  Nothing ever throws into game code.
 *  - SFX voice limits steal the oldest instance of the same sound (pop x3, shoot x2 ...); a global source-node budget (MAX_VOICES / MAX_SFX_VOICES)
 *    drops new SFX when exceeded.  Music is never dropped.  sfx options: {pitch: semitones, vol}.  `kill` is designed for pitch 0..+12.
 *  - Non-contract debug extras (tests / board / composer scratch pad): _info(name), _dump(name), _events(name), _validate(), _stats(), _state(), _tap(),  _seek(step, pass),
 *    _skip([lane|'drum']) (live ablation), _capture(sec); demos: _demoNames(), _demo(name), _define('demo_x', songDef) (register a scratch song and get its compile issues,
 *    then _demo('demo_x')), _note(inst, [midi], dur, {vel, lane, cfg}), _hit(char), _fxNow(name, seconds); tables: _instruments(), _kit(), _pats();
 *    _renderOffline(name, seconds, opts) accepts {tempo, skip:[lane|'drum'], sfx:[[name, at, polarity?, pitch?]], noComp, noTrim, chunk, pitch, pass, alternate, vol, mg} (tests only).
 *
 * ================================================================================================================================
 * 3. COMPOSITION NOTATION  (what the composer writes: songDefs() below)
 * ================================================================================================================================
 *  A song is a JS object under D.<trackName>.  Time is counted in 16th STEPS, 16 steps = 1 bar (4/4 only); swing is a song option.
 *
 *    D.stage1 = {
 *      bpm: 122, swing: 0.5,            // swing 0.5 = straight; 0.58 = shuffled 8ths.  (jingles: nominal length = steps/4 * 60/bpm)
 *      key: 4, mode: [0,2,3,5,7,8,10],  // tonic pitch class + scale (lint: chord / scale tone statistics)
 *      kind: 'loop' | 'jingle',         // default 'loop'; a jingle plays once (steps may be any length) and may resume a loop afterwards
 *      echo: 3, fb: 0.38,               // ping-pong delay time in 16ths (3 = dotted 8th) and feedback; used by lanes with `dly`
 *      gain: 1,                         // track trim (linear): the loudness fit, `node test/audio_analyze.mjs --fit-music` suggests it
 *      lift: 0, maxTempo: 0,            // optional: semitones added on every 2nd pass of the loop / cap for setTempo (boss: 1.2)
 *      duckRel: 0.55,                   // sidechain release in beats (default); lane `duckRel` overrides;  duckOn: 'kKbq' = which drum chars trigger it
 *      placeholder: true,               // lint: placeholder songs are exempt from the form-length gates; the composer deletes this line
 *      lanes: { ... },                  // the mixer strips (instrument + bus settings): §3.1
 *      pats: { name: 'grid' },          // optional named patterns (also global ones: _pats())
 *      sections: { A: {...}, B: {...} },// the material: §3.2
 *      intro: ['I'],                    // sections played once before the loop
 *      order: ['A','B','A'],            // the loop: section names in order (a name may repeat)
 *    };
 *
 *  3.1 LANES   lanes: { pad: { inst:'pad', vol:0.7, hall:0.3 }, bass: { inst:'pick', chorus:{...} }, ... }     (lane name = anything; the four drum
 *      lanes `kick snare hats perc` and `fx` need no declaration unless you want to change their bus settings)
 *      Bus settings (all optional):
 *        vol 1          fader (linear; also automatable)           pan -1..1           rev 0..1  send to the `room` reverb (short, tight)
 *        hall 0..1      send to the `hall` reverb (long, lush)     spr 0..1 spring     dly 0..1  send to the ping-pong delay
 *        duck 0..1      sidechain depth (0.6 = the lane drops 60 % at every kick); duckRel (beats)
 *        lpf / hpf Hz   static filters (also automatable)          lq  Q of the lpf
 *        drive k        tanh saturation k (1.5 warm .. 8 heavy), dgain = level after it (default 0.3/(1+0.42k)), bias, os ('none'|'2x')
 *        crush bits     bit-crusher (4 = very lo-fi)               chorus {rate Hz, depth s, base s, mix, hp Hz}   (mono sources: bass / arp / lead; only the part above `hp` 160 Hz is chorused)
 *        trem {rate Hz, depth 0..1}                                 vib [Hz, cents]  detune LFO that chord voices (pad / super / choir) follow
 *      Everything else in the lane object is an INSTRUMENT parameter (table in §4), e.g. { inst:'super', n:7, spread:22, cut:6000, a:0.02 }.
 *      Section `cfg: { lane: {...} }` overrides instrument parameters for that section only.
 *
 *  3.2 SECTIONS   A: { chords: '| Em | C | G | D |',  p: { lane: 'pattern', ... },  mix: {...}, auto: {...}, duck: ..., cfg: {...}, fx: '...' }
 *      chords   one bar per `|`; `.` splits a bar equally (`Em.Am7`), `/n` = explicit length in steps (jingles: `Em/18`), `@X` = slash bass (`Am7@E`).
 *               Qualities: (none) m 7 m7 maj7 m7b5 dim dim7 sus sus2 sus4 7sus 6 m6 5 add9 madd9 maj9 m9 9 m11 aug 7b9 7#9 mmaj7 69 maj7#11 m7b9.
 *               The chords define the section length (every bar must have 16 steps, except in jingles) and the harmony of the chord-relative patterns.
 *      p        pattern per lane (below).  The lane's instrument decides the default FORMAT; prefix `n:` `r:` `c:` forces notes / relative / chord.
 *      mix      per-section velocity multipliers per lane name ({ pad: 0.5, drums: 0 }), 0 = lane tacet (builds, breakdowns); `drums` = all four kit lanes, `all`.
 *      auto     automation over the section (§3.5).      duck     sidechain override (§3.6).      pats    section-local named patterns.
 *      alt      SECOND-PASS version of a LOOP section (FIXPLAN_V3 A8, composer addition):  alt: { p: { lane: 'pattern', drums3: '...' }, mix: { bell: 2 }, dbl: { lead: 12 }, dblVel: 0.55 }
 *               On every odd pass of the loop (the 2nd, 4th ... time it plays; the first pass is always the original) the section plays with `alt.p` patterns replacing the same-named ones
 *               (or adding a lane that is silent in the original: counter-melody, fills) and `alt.mix` merged over `mix`.  `dbl` adds a transposed copy of a lane's notes:
 *               `lead: 12` (same lane, +1 octave) or `lead: { semi: -12, to: 'twang', vel: 0.6, bars: [1, 4] }` (other lane, velocity, bars 1-based inclusive).  The engine compiles both versions and keeps
 *               only the differences as events flagged for odd / even passes, so drums, sidechain triggers and fx follow along.  Not for intro sections, jingles or `auto`.
 *
 *  3.3 PATTERN FORMATS
 *   (a) NOTES  (lead, alarm, twang, bell, vibes; also usable on any lane with `n:`):   `| e5/2 g5/2 b5/4 r/8 |`
 *       token = pitch + optional `/length` (steps, default 2) + optional modifiers.  Pitch = letter [# or b] octave (c4 = middle C = MIDI 60).  `r/n` = rest.
 *       `[c4,e4,g4]/8` = a chord token.  Modifiers after the token: `'` accent (x1.28), `,` soft (x0.6).  Bar lines `|` are checked: every bar must add up to the
 *       chord bar.  Mono instruments cut a note at the start of the next one.
 *   (b) GRIDS  one character per 16th step; a space separates BAR CELLS that are cycled bar by bar.  A cell of 16 chars = one bar; of 8 / 4 / 2 chars it tiles inside the
 *       bar; of 32 / 48 chars it spans 2 / 3 bars.  `name*3` repeats a cell or named pattern; names resolve through song `pats`, section `pats`, then the global library (_pats(): four,
 *       backbeat, half, hat8, hat16, offhat, roll, hold, stab, sync, root, root2, root8, oct8, gal, pump, arp16, arp8 ...).
 *       Modifiers after a char: `'` accent, `,` soft, `^` octave up, `_` octave down.
 *       - CHORD lanes (super, stab, pad, choir):  `x` = play the chord (voice-led, 3-4 notes), `-` = hold, `.` = rest.   `x---------------` = a whole-bar pad;
 *         `..x...x...x...x.` = off-beat stabs.  A held note re-triggers on a chord change.  Voicing: lane param voicing {lo, hi, n, open}.
 *       - RELATIVE lanes (pick, wood, sub, riff, arp):  digits / letters are chord tones above the chord ROOT (bass register `lo`: pick 40, wood 36, sub 28, riff 33, arp 57):
 *         1 root, 2, 3 third, 4, 5 fifth, 6, 7 seventh, 8 octave, 9 ninth, a third+oct, c fifth+oct, e seventh+oct, b = fifth, 0 = root an octave down, f = minor 2nd (b2), g = minor 6th (b6), h = tritone (b5; composer additions);  `-` hold, `.` rest.
 *         `1-1-1-1-1-1-1-1-` eighth-note root pump;  `1181118111811181` gallop;  `1358a853c8531358` 16th arpeggio.  With a slash-bass chord (`Am7@E`) `1` plays the slash bass on bass lanes.
 *       - DRUM grid (key `drums`; routes to the lanes kick snare hats perc).  ONE hit per 16th step per grid: the extra keys `drums2` / `drums3` (composer addition, v2.0) are further
 *         grids that LAYER on the same steps (kick + hat on one step, snare + clap, ghost snares under a backbeat); all follow `mix.drums`, `R` rolls and the sidechain triggers alike:
 *           k machine kick   K EDM kick   b 808 boom (long)        s gated-reverb snare   S hard snare   y bit-crushed snare   n ghost snare   B brushed snare   p clap
 *           f finger snap   r rimshot   t / u / v hi / mid / low tom                    h closed hat   o open hat   m metallic 808 hat   M open metallic   d ride   c crash
 *           x low clang   X high clang   z noise hit   w noise blast  (industrial; lane `perc`)           R = SNARE ROLL: the run of consecutive R steps ramps in velocity
 *           q = silent sidechain trigger (a "ghost kick" so the pumping continues in a breakdown)                         . = rest
 *       - FX lane (`fx`):  tokens `name@start/length:velocity`, start / length in steps or bars (`4b` = 4 bars).  riser (noise + saw sweep up), down, swell (reverse-reverb bloom, cut at its
 *         end), impact (sub drop + noise + crash), zap.   `riser@0/4b impact@4b down@4b/1b`
 *
 *  3.4 DYNAMICS WITHOUT AUTOMATION:  `mix: { drums: 0 }` drum drop-out, `mix: { super: 0.6 }`, snare rolls with `R`, `fx` risers / swells / impacts, fills in the last bar of a cell
 *      (`K...s...K...s... K...s...K.s.ssSs`).  Loudness arc of a loop = sections with different `mix`; the analyzer prints it.
 *
 *  3.5 AUTOMATION   auto: { 'super.lpf': [400, 9000, 'exp'], 'master.hpf': [20, 800, 'exp', 1, 4], 'arp.dly': [0, 0.6] }
 *      key = lane.param; params: vol lpf hpf rev hall spr dly pan (a lane needs no static setting; automating creates the stage).  Lane `drums` = all four kit lanes; `master` has
 *      vol / lpf / hpf (the whole track).  value = [from, to, curve?, startBar?, endBar?]  curve 'lin' | 'exp' (default for lpf / hpf) | 'in' | 'out'; before startBar the
 *      value is `from`, after endBar it stays at `to`.  Or breakpoints [[bar, value], [bar, value], ...].  One linear segment per step (tempo-accurate).  A param automated in ANY section
 *      is reset to its lane default at the start of every section that does not automate it, so a build (filter sweep up) is followed by a clean drop.
 *
 *  3.6 SIDECHAIN   lanes with `duck: depth` pump at every kick: the drum chars k K b (and the silent q) trigger it; recovery is exponential (`duckRel` beats).  Per section
 *      `duck: false` switches it off (breakdowns), `duck: 0.5` scales the depth, `duck: { pad: 0.2, super: false }` overrides single lanes.
 *
 *  3.7 BUILDS AND DROPS  = sections: BUILD (riser fx, master.hpf / super.lpf sweeps, rising `R` snare roll in the last bar, kick thinning out) then DROP (impact, sidechained supersaw
 *      stabs + 808 sub + kick + hats, duck on).  demo_build (AUDIO._demo('demo_build')) is the reference.  Halftime / industrial sections: snare on beat 3 only (`........S.......`),
 *      riff lane with drive, clangs `x X`.  Dreamy breakdown: duck false, pads + twang + choir, `mix: { drums: 0 }`, `q` pulse optional.
 *
 *  3.8 LEVELS  every instrument is calibrated so that its demo at lane vol 1 sits at about -24 LUFS (drums -21, fx -22; the cold arp -11.5: FIXPLAN_V3 A5 raised its level 21 dB so that the arp
 *      lanes at their authored 0.3 are audible); a full arrangement at lane vols 0.5-0.9 lands at about
 *      -18 LUFS after the song `gain` fit.  Music target: K-weighted integrated -18 +-2 LUFS, true peak <= -1 dBFS (test/audio_analyze.mjs checks, --fit-music suggests `gain`).
 *
 *  3.9 CPU BUDGET (this reference VM, % of one core, live): empty running context ~3, glue + limiter 1, hall reverb 3, room reverb 1.3, delay / spring / ping-pong < 1,
 *      every simultaneous source node ~0.04, every silent lane stage ~0.03.  A chord note = ONE looping buffer source (not 5-9 oscillators): use 4-note chords freely, but keep a loop's
 *      peak simultaneous sources <= 60 (lint reports `peakSources`), prefer `n: 5` to `n: 7`, and one chorus lane per song.  The dense demo (AUDIO._demo('demo_dense')) is the budget reference.
 *
 *  3.10 JINGLES  kind:'jingle', one section `J`; chords with explicit lengths (`Em/18`); `start` = 18 steps @ 120 bpm = 2.25 s, `extend` 30 @ 150 = 3.0 s, `gameover` 24 @ 90 = 4.0 s,
 *      `clear_boss` 28 @ 140 = 3.0 s.  Grids in a jingle are written in 16-char cells (a 18-step jingle = 2 cells; the second one is cut).
 *
 * ================================================================================================================================
 * 4. INSTRUMENT PARAMETERS  (defaults in the INST table; lane / section cfg override)   lv = level (calibrated, leave it), a d s r = envelope (s), gate = held fraction of the written length
 * ================================================================================================================================
 *  super  chord  n 5 (saws 1..9)  spread 16 (cents)  cut 5600  q 0.7  fst 1.7 (filter starts at cut*fst and relaxes in ft 0.35 s)  a 0.012 d 0.4 s 0.85 r 0.3  sub 0  voicing {lo 55,hi 79,n 4}
 *  stab   chord  short plucked supersaw: fst 3.2 ft 0.16 a 0.004 d 0.22 s 0.25 r 0.14
 *  pad    chord  n 3 spread 11 cut 1500 fst 0.35 (the dark filter OPENS over ft 1.4 s) a 0.9 r 1.1
 *  choir  chord  vowel ah | oh | oo | eh | ee, spread 9, fm 6 (formant level), a 0.7 r 1.0; use lane vib [5.2, 14]
 *  pick   rel    chorus pick bass: wave {saw, pulse, duty, tri, sub, sin} (relative levels of one combined wave), cut 900 fst 3.6 ft 0.14 q 2.2; give the lane `chorus`
 *  wood   rel    upright / walking bass (triangle + sub)
 *  sub    rel    808 sub: drop 2.2 (pitch drop factor) dt 0.035 d 1.0 s 0.55; give the lane `drive 2.5` + `lpf 700` so phones hear the harmonics
 *  riff   rel    distorted riff bass: wave {saw, sub}, det 11, cut 1400 q 4; give the lane `drive 6..9` + `lpf 3600`
 *  arp    rel    cold arp: wave 0.25 (pulse duty) | 'sawtooth', n 1..5, spread, cut 2600 fst 2.4 ft 0.13, gate 0.7, pw2 (2nd layer one octave down)
 *  lead   notes  2 detuned saws, scoop 25 cents, cut 3600;     alarm  notes  square + saw, q 6, scoop 60 (boss siren)
 *  twang  notes  Karplus-Strong string: bend 0.35 (semitone scoop), ring 0.45 s after note-off, cut 6500; give the lane `trem`, `spr` and `hpf 140`
 *  bell / vibes  notes  2-op FM: mr (modulator ratio) idx / ie / id (index, end factor, time) d (decay) p2 / p2g (shimmer partial) mallet damp
 *  kit    drums  fixed voices; kick lane `drive 1.5` adds weight; hats / perc lanes take pan / rev;     fx  riser down swell impact zap
 *
 * ================================================================================================================================
 * 5. DESIGN CHOICES where the SPEC is silent / tests
 * ================================================================================================================================
 *  - SFX are calibrated PERCEPTUALLY: every non-quiet SFX sits on the same K-weighted (ITU-R BS.1770) active level, quiet ones (menu_move -9 dB, land -12 dB)
 *    below it, clearly above the music.  The per-SFX `trim` constants come from `node test/audio_analyze.mjs --apply-trims` (repeat until flat); every SFX is measured WARM (started 1 s into
 *    a running chain -- a sound at t=0 meets a cold limiter and reads up to 14 dB low, which is what mis-fitted the v2.0 table).  The critical cues (hurry, death, ghost, 1UP, EXTEND letter,
 *    round clear, power-up) carry an `lvl` bonus and pull the music bed down by SFX_DUCK while they sound, so they stay >= 8 dB over the loudest drop (test/audio_v3_mix.mjs).
 *  - COMPOSER ADDITIONS (v2.0, additive): (1) `drums2` / `drums3` section keys = extra drum grids that layer on the same steps (§3.3); (2) rel symbols `f` (b2), `g` (b6), `h` (b5) and
 *    power chords ('B5' = [0, 7]) no longer yield NaN for the fifth ('5', 'c', 'b' fall back to the last chord tone) -- a NaN pitch used to throw inside the scheduler and count toward the
 *    20-fault shutdown; the compiler now reports a non-finite symbol; (3) voiceChord() avoids muddy voicings: a semitone below MIDI 72 costs 40, minor 9th 14, low second / 9th 3-6, an
 *    extension (9th / 11th) is never the lowest voice (so Em9 / Gm9 pads are rootless 3-5-7-9 stacks, Bbmaj7 sits in root position and never puts the 7th a semitone under the root).
 *    (3) `alt` second-pass versions (§3.2); (4) kicks on beats 2 and 4 of the drops through a third drum grid (four-on-the-floor, FIXPLAN_V3 A7).
 *    Song arrangement conventions: quiet sections use `mix: { all: 0.5-0.7 }`, builds ramp `auto: { 'master.vol': [0.7, 1, 'in'] }` plus `master.hpf` / `super.lpf` sweeps, drops reset to full.
 *  - Tests: test/audio_lint.mjs (composition rules), test/audio_analyze.mjs (loudness / peaks / seams / SFX table), test/audio_runtime.mjs --strict (API),
 *    test/audio_cpu.mjs (CPU), test/audio_v2_board.html (listening board).  Spectrogram tools: test/audio_spectro.mjs, test/audio_sfxsheet.mjs.
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
  const ENGINE_RATE = 24000;     // AudioContext sample rate: every DSP cost scales with it (12 kHz bandwidth is plenty for this soundtrack; the browser resamples to the device)
  const OFFLINE_RATE = ENGINE_RATE;
  const OFFLINE_CHUNK = 2;       // seconds of music scheduled per slice in _renderOffline
  const MAX_VOICES = 190;        // global source-node budget (music + sfx); new SFX are dropped above this
  const MAX_SFX_VOICES = 64;     // source nodes alive in SFX groups; new SFX are dropped above this
  const MUSIC_LEVEL = 0.6, SFX_LEVEL = 1.0, MASTER_LEVEL = 0.95;     // MUSIC_LEVEL 0.5 -> 0.6 with the softer limiter (FIXPLAN_V3 A3: it adds ~1.6 dB less automatic make-up; the loop gains stay as fitted)
  const DELAY_SEND_FB = 0.38;    // ping-pong feedback
  const KS_RATE = ENGINE_RATE;   // sample rate of the generated Karplus-Strong plucks
  const BAKE_T = 1.5;            // loop length (s) of the pre-baked unison-saw buffers (supersaw / pad / choir)
  const BAKE_CACHE_MAX = 96, KS_CACHE_MAX = 64;   // cached stacks / plucks per sample rate (memory bound)

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
  const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
  const dbToLin = (db) => Math.pow(10, db / 20);

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
  const live = { voices: 0, tracks: 0, groups: 0, resyncs: 0, sfxv: 0 };
  let REG = null;                 // registry that receives every source node created right now

  /**
   * Registry of the source nodes (oscillators / buffer sources) of one track or one sfx instance.  `persist` sources (LFOs of a track's
   * lane buses) do not keep the track alive: onIdle fires when the last NON-persistent source has ended.
   */
  function makeRegistry(onIdle, isSfx) {
    const set = new Set();
    let np = 0;
    const r = {
      set, onIdle,
      n() { return np; },
      add(src, persist) {
        set.add(src); live.voices++; if (isSfx) live.sfxv++;
        if (persist) src.__p = 1; else np++;
        src.onended = () => r.drop(src);
      },
      drop(src) {
        if (!set.delete(src)) return;
        live.voices--; if (isSfx) live.sfxv--;
        if (!src.__p) np--;
        if (np <= 0 && r.onIdle) { np = 0; r.onIdle(); }
      },
      stopAll(when) { for (const s of set) { try { s.stop(when); } catch (e) { /* not started / already stopped */ } } },
      clear() {
        r.onIdle = null;
        for (const s of Array.from(set)) { try { s.stop(); } catch (e) { /* ignore */ } r.drop(s); }
      },
    };
    return r;
  }
  function reg(src, persist) { if (REG) REG.add(src, persist); return src; }

  // ================================================================================================
  // shared curves (WaveShaper tables)
  // ================================================================================================
  const curves = {};
  /** safety ceiling: transparent to KNEE, then a tanh shoulder that never exceeds LIM (the true-peak guard) */
  function softClipCurve() {
    if (curves.soft) return curves.soft;
    const N = 4097, LIM = 0.78, KNEE = 0.56;
    const c = curves.soft = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const x = (i / (N - 1)) * 2 - 1, ax = Math.abs(x);
      const y = ax <= KNEE ? ax : KNEE + (LIM - KNEE) * Math.tanh((ax - KNEE) / (LIM - KNEE));
      c[i] = x < 0 ? -y : y;
    }
    return c;
  }
  /** tanh drive: y = tanh(k x) / tanh(k) (unity at full scale), asymmetric bias for even harmonics when `bias` > 0 */
  function driveCurve(k, bias) {
    const key = 'd' + k + '_' + (bias || 0);
    if (curves[key]) return curves[key];
    const N = 2049, c = curves[key] = new Float32Array(N), b = bias || 0, t = Math.tanh(k);
    const off = Math.tanh(k * b);
    for (let i = 0; i < N; i++) {
      const x = (i / (N - 1)) * 2 - 1;
      c[i] = (Math.tanh(k * (x + b)) - off) / t;
    }
    return c;
  }
  /** bit-crusher: amplitude quantiser with 2^bits levels */
  function crushCurve(bits) {
    const key = 'c' + bits;
    if (curves[key]) return curves[key];
    const N = 4097, c = curves[key] = new Float32Array(N), L = Math.pow(2, Math.max(2, bits) - 1);
    for (let i = 0; i < N; i++) {
      const x = (i / (N - 1)) * 2 - 1;
      c[i] = Math.round(x * L) / L;
    }
    return c;
  }

  // ================================================================================================
  // assets.  AudioBuffers (noise, impulse responses, plucks, baked saw stacks, metallic hat) are cached GLOBALLY per sample rate -- an
  // AudioBuffer may be used by any context -- so a live context and the offline renders of the tests share them.  PeriodicWaves are per context.
  // ================================================================================================
  const shared = {};                                   // sampleRate -> {noise, ks, bake, metal, ir}
  function sh(ctx) {
    const sr = ctx.sampleRate;
    let e = shared[sr];
    if (!e) {
      const len = Math.floor(sr * 2);
      const buf = ctx.createBuffer(1, len, sr), d = buf.getChannelData(0), rnd = U.rng(20240607);
      for (let i = 0; i < len; i++) d[i] = rnd.next() * 2 - 1;
      e = shared[sr] = { noise: buf, ks: {}, bake: {}, metal: null, ir: {} };
    }
    return e;
  }
  const envs = new WeakMap();
  function env(ctx) {
    let e = envs.get(ctx);
    if (!e) { e = { pulse: {}, combo: {}, noise: sh(ctx).noise }; envs.set(ctx, e); }
    return e;
  }
  /** Pulse wave with the given duty (fraction of the period spent high). Fourier series of a rectangular pulse. */
  function pulseWave(ctx, duty) {
    const e = env(ctx);
    const key = String(duty);
    if (!e.pulse[key]) {
      const N = 64;
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
   * One oscillator for a whole bass voice: a PeriodicWave that sums a sawtooth, a pulse, a triangle and a sub sine (an octave below, so the
   * wave's fundamental is f/2 when `sub` > 0 and the oscillator must run at f/2).  o: {saw, pulse, duty, tri, sin, sub} (levels)
   */
  function comboWave(ctx, o) {
    const e = env(ctx), key = [o.saw || 0, o.pulse || 0, o.duty || 0.5, o.tri || 0, o.sub || 0, o.sin || 0].join('_');
    if (e.combo[key]) return e.combo[key];
    const N = 64, re = new Float32Array(N + 1), im = new Float32Array(N + 1), half = o.sub ? 2 : 1;
    for (let h = 1; h * half <= N; h++) {                // h = harmonic of the note frequency
      const i = h * half;
      if (o.saw) im[i] += o.saw * (2 / Math.PI) * (h % 2 ? 1 : -1) / h;
      if (o.pulse) { re[i] += o.pulse * Math.sin(2 * Math.PI * h * o.duty) / (h * Math.PI); im[i] += o.pulse * (1 - Math.cos(2 * Math.PI * h * o.duty)) / (h * Math.PI); }
      if (o.tri && h % 2) im[i] += o.tri * (8 / (Math.PI * Math.PI)) * ((h - 1) / 2 % 2 ? -1 : 1) / (h * h);
    }
    if (o.sub) im[1] += o.sub;
    if (o.sin) im[half] += o.sin;
    return (e.combo[key] = ctx.createPeriodicWave(re, im));
  }
  function setWave(ctx, osc, w) {
    if (typeof w === 'number') osc.setPeriodicWave(pulseWave(ctx, w));
    else if (w && typeof w === 'object') osc.setPeriodicWave(comboWave(ctx, w));
    else osc.type = w === 'saw' ? 'sawtooth' : w === 'tri' ? 'triangle' : (w || 'sine');
  }

  // ---- impulse responses: MONO (a stereo IR doubles the live CPU cost of a ConvolverNode); the width is added after the convolver ----
  /** o: {len, rt (-60 dB time), pre, f0, f1 (lowpass start / end Hz), build (fade-in s), er: [[t, amp], ...], seed} */
  function genIR(ctx, o) {
    const sr = ctx.sampleRate, n = Math.floor(o.len * sr), pre = Math.floor((o.pre || 0) * sr);
    const buf = ctx.createBuffer(1, n, sr), d = buf.getChannelData(0), rnd = U.rng((o.seed || 1) * 7);
    const dec = Math.pow(10, -3 / (o.rt * sr));              // amplitude factor per sample (-60 dB after rt)
    let amp = 1, lp = 0, lp2 = 0;
    for (let i = pre; i < n; i++) {
      const t = (i - pre) / sr;
      amp *= dec;
      const ramp = Math.min(1, t / (o.build || 0.02));
      const fc = o.f1 + (o.f0 - o.f1) * Math.exp(-t / (o.rt * 0.33));
      const k = 1 - Math.exp(-2 * Math.PI * fc / sr);
      lp += k * ((rnd.next() * 2 - 1) - lp); lp2 += k * (lp - lp2);
      d[i] = lp2 * amp * ramp * 3;
    }
    for (const [t, a] of o.er || []) {                        // sparse early reflections
      const idx = pre + Math.floor(t * sr);
      if (idx < n) d[idx] += a * (rnd.next() < 0.5 ? -1 : 1);
    }
    const fade = Math.floor(n * 0.12);
    for (let i = 0; i < fade; i++) d[n - 1 - i] *= i / fade;  // no click at the end of the tail
    return buf;
  }
  function irFor(ctx, kind) {
    const e = sh(ctx);
    if (e.ir[kind]) return e.ir[kind];
    let b;
    if (kind === 'room') b = genIR(ctx, { len: 0.42, rt: 0.34, pre: 0.002, f0: 7200, f1: 2800, build: 0.006, seed: 3, er: [[0.006, 0.55], [0.011, -0.45], [0.017, 0.38], [0.025, -0.3], [0.036, 0.22]] });
    else if (kind === 'hall') b = genIR(ctx, { len: 2.5, rt: 2.1, pre: 0.016, f0: 5200, f1: 1100, build: 0.04, seed: 5, er: [[0.009, 0.3], [0.021, -0.28], [0.037, 0.22], [0.055, -0.18]] });
    else throw new Error('unknown IR ' + kind);
    return (e.ir[kind] = b);
  }

  // ---- Karplus-Strong plucked string, computed in JS (a WebAudio feedback loop cannot go below 128 samples = 344 Hz) ----
  const ksCache = new Map();
  /**
   * Extended Karplus-Strong: noise burst (pick-position comb + soft lowpass) circulating in a delay line with a 2-point averaging
   * loss filter and a first-order allpass for exact tuning.  Deterministic per MIDI note.  -> Float32Array at KS_RATE
   */
  function ksData(midi) {
    let out = ksCache.get(midi);
    if (out) return out;
    const f = mtof(midi), N = KS_RATE / f;
    const L = Math.max(3, Math.floor(N - 1.0)), D = N - 0.5 - L, C = (1 - D) / (1 + D);
    const t60 = clamp(2.5 - (midi - 38) * 0.03, 0.8, 2.4);               // low strings ring longer
    const rho = Math.min(0.9995, Math.pow(10, -3 / (f * t60)));
    const len = Math.floor(KS_RATE * Math.min(2.2, t60 * 0.85 + 0.25));
    const rnd = U.rng(9100 + midi * 17);
    const ex = new Float32Array(L);
    for (let i = 0; i < L; i++) ex[i] = rnd.next() * 2 - 1;
    const pp = Math.max(1, Math.round(L * 0.16));                         // pick position: comb notch -> nasal, twangy
    const buf = new Float32Array(L);
    let lp = 0, mean = 0;
    for (let i = 0; i < L; i++) {
      const v = ex[i] - (i >= pp ? ex[i - pp] : 0);
      lp += 0.62 * (v - lp);                                              // pluck brightness
      buf[i] = lp; mean += lp;
    }
    mean /= L; let pk = 1e-6;
    for (let i = 0; i < L; i++) { buf[i] -= mean; pk = Math.max(pk, Math.abs(buf[i])); }
    for (let i = 0; i < L; i++) buf[i] /= pk;
    out = new Float32Array(len);
    let idx = 0, prev = 0, apx = 0, apy = 0, peak = 1e-6;
    for (let n = 0; n < len; n++) {
      const x = buf[idx];
      out[n] = x;
      const l = rho * 0.5 * (x + prev); prev = x;
      const y = C * (l - apy) + apx; apx = l; apy = y;
      buf[idx] = y; if (++idx >= L) idx = 0;
      const a = x < 0 ? -x : x; if (a > peak) peak = a;
    }
    const fin = Math.floor(KS_RATE * 0.04);
    for (let i = 0; i < len; i++) {
      let g = 0.9 / peak;
      if (i < 24) g *= i / 24;                                            // 1 ms de-click
      if (len - i < fin) g *= (len - i) / fin;
      out[i] *= g;
    }
    ksCache.set(midi, out);
    return out;
  }
  function ksBuffer(ctx, midi) {
    const e = sh(ctx);
    let b = e.ks[midi];
    if (!b) {
      const data = ksData(midi);
      b = ctx.createBuffer(1, data.length, KS_RATE);
      if (b.copyToChannel) b.copyToChannel(data, 0); else b.getChannelData(0).set(data);
      e.ks[midi] = b;
      e.ksKeys = e.ksKeys || [];
      e.ksKeys.push(midi);
      if (e.ksKeys.length > KS_CACHE_MAX) { const old = e.ksKeys.shift(); delete e.ks[old]; ksCache.delete(old); }
    }
    return b;
  }

  /**
   * Baked unison-saw stack: N detuned band-limited (polyBLEP) saws summed into a seamlessly looping buffer of BAKE_T seconds (every saw has an
   * integer number of cycles in the loop).  Stereo: the detuned saws below the centre go left, above go right, the centre goes to both.
   * One looping BufferSource per chord note replaces 5-9 oscillators; the playbackRate trims the (<0.5 %) quantisation of the pitch.
   * -> {buf, rate}
   */
  function sawBake(ctx, midi, N, spread, mono) {
    const e = sh(ctx), key = midi + '_' + N + '_' + spread + (mono ? 'm' : '');
    let r = e.bake[key];
    if (r) return r;
    const sr = ctx.sampleRate, f0 = mtof(midi);
    const c0 = Math.max(2, Math.round(f0 * BAKE_T)), L = Math.round(c0 * sr / f0), fAct = c0 * sr / L;   // loop = c0 cycles of the note, a whole number of samples (pitch error < 0.03 cent)
    const offs = sawOffsets(N), cyc = [];
    for (let i = 0; i < N; i++) {                            // integer cycle counts, distinct from each other (>= 1 cycle apart)
      let c = Math.max(1, Math.round(c0 * Math.pow(2, offs[i] * spread / 1200)));
      if (i > 0 && c <= cyc[i - 1]) c = cyc[i - 1] + 1;
      cyc.push(c);
    }
    const mid = cyc.reduce((a, b) => a + b, 0) / N, shift = Math.round(c0 - mid);   // keep the stack centred on the note
    const buf = ctx.createBuffer(mono ? 1 : 2, L, sr), dl = buf.getChannelData(0), dr = mono ? dl : buf.getChannelData(1);
    const rnd = U.rng(31 * midi + 7 * N + 1);
    let cl = 0, cr = 0;
    for (let i = 0; i < N; i++) {
      const dp = (cyc[i] + shift) / L, toL = offs[i] <= 0.05, toR = offs[i] >= -0.05;
      let ph = rnd.next();
      if (toL) cl++; if (toR) cr++;
      for (let n = 0; n < L; n++) {
        let v = 2 * ph - 1;
        if (ph < dp) { const t = ph / dp; v -= t + t - t * t - 1; } else if (ph > 1 - dp) { const t = (ph - 1) / dp; v -= t * t + t + t + 1; }
        ph += dp; if (ph >= 1) ph -= 1;
        if (mono) dl[n] += v; else { if (toL) dl[n] += v; if (toR) dr[n] += v; }
      }
    }
    const sl = 0.5 / Math.sqrt(mono ? N : Math.max(1, cl)), sr2 = 0.5 / Math.sqrt(Math.max(1, cr));
    for (let n = 0; n < L; n++) { dl[n] *= sl; if (!mono) dr[n] *= sr2; }
    r = e.bake[key] = { buf, rate: f0 / fAct };
    e.bakeKeys = e.bakeKeys || [];
    e.bakeKeys.push(key);
    if (e.bakeKeys.length > BAKE_CACHE_MAX) delete e.bake[e.bakeKeys.shift()];     // bounded memory: ~290 KB per stack at 24 kHz
    return r;
  }
  /** 808-style metallic hat source: six detuned square waves (205..800 Hz), 0.45 s, normalised; filtered by the voice */
  function metalBuffer(ctx) {
    const e = sh(ctx);
    if (e.metal) return e.metal;
    const sr = ctx.sampleRate, n = Math.floor(0.45 * sr), b = ctx.createBuffer(1, n, sr), d = b.getChannelData(0);
    const fr = [205.3, 304.4, 369.6, 522.7, 540.0, 800.0];
    let pk = 1e-6;
    for (let i = 0; i < n; i++) {
      let s = 0;
      for (let k = 0; k < fr.length; k++) s += ((i * fr[k] / sr) % 1) < 0.5 ? 1 : -1;
      d[i] = s; pk = Math.max(pk, Math.abs(s));
    }
    for (let i = 0; i < n; i++) d[i] /= pk;
    return (e.metal = b);
  }

  // ================================================================================================
  // node helpers
  // ================================================================================================
  function gn(ctx, v) { const g = ctx.createGain(); g.gain.value = v; return g; }
  /** biquad with k-rate parameters (coefficients are recomputed once per 128 frames, not per sample: ~10x cheaper while a cutoff is swept) */
  function bq(ctx, type, f, q) {
    const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = Math.min(f, ctx.sampleRate * 0.49);       // composer fix v2.0: never above Nyquist (Chrome logged a warning per note otherwise)
    if (q !== undefined) b.Q.value = q;
    try { b.frequency.automationRate = 'k-rate'; b.Q.automationRate = 'k-rate'; } catch (e) { /* engines without settable rates */ }
    return b;
  }
  /**
   * Buffer sources MUST start on a whole sample frame and read from a whole-sample offset: a fractional position makes the engine linearly
   * interpolate the buffer, which low-passes it (up to -7 dB of everything near Nyquist: hats, noise bursts, saw stacks) by an amount that depends on
   * where the hit happens to fall.  Every start time / offset is snapped to the frame grid (error <= 21 us at 24 kHz).
   */
  const frame = (ctx, t) => Math.round(t * ctx.sampleRate) / ctx.sampleRate;
  /** oscillator that is started AND stopped at creation (a throwing call can never leave a running orphan behind) */
  function mkOsc(ctx, w, f, t0, t1) {
    const o = reg(ctx.createOscillator());
    try { setWave(ctx, o, w); o.frequency.value = Math.min(f, ctx.sampleRate / 2); /* integrator v2.0: Nyquist (12 kHz at the 24 kHz engine rate) is the nominal range; Chrome clamped silently but logged a console warning per note */ o.start(frame(ctx, t0)); o.stop(t1); } catch (e) { if (REG) REG.drop(o); throw e; }
    return o;
  }
  function mkNoise(ctx, t0, t1) {
    const s = reg(ctx.createBufferSource());
    try { s.buffer = env(ctx).noise; s.loop = true; s.start(frame(ctx, t0), frame(ctx, nzOffset() * 1.5)); s.stop(t1); } catch (e) { if (REG) REG.drop(s); throw e; }
    return s;
  }
  function mkBuf(ctx, buf, t0, t1, loop) {
    const s = reg(ctx.createBufferSource());
    try { s.buffer = buf; if (loop) s.loop = true; s.start(frame(ctx, t0)); if (t1) s.stop(t1); } catch (e) { if (REG) REG.drop(s); throw e; }
    return s;
  }
  /** amplitude envelope node connected to dest: linear attack, decay-to-sustain and release as exponential approaches (tau = time/3) */
  function adsr(ctx, dest, t, hold, a, d, s, r, vol) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + a);
    g.gain.setTargetAtTime(vol * s, t + a, Math.max(0.004, d / 3));
    g.gain.setTargetAtTime(0, t + hold, Math.max(0.004, r / 3));
    g.connect(dest);
    return g;
  }
  /** one-shot exponential decay envelope (percussive): attack a, then decays by `tau` */
  function decayEnv(ctx, dest, t, a, tau, vol) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + a);
    g.gain.setTargetAtTime(0, t + a, tau);
    g.connect(dest);
    return g;
  }
  /** lowpass whose cutoff starts at cut*start and relaxes to cut with time constant ft/3 */
  function envLP(ctx, t, cut, start, ft, q) {
    const f = bq(ctx, 'lowpass', cut, q);
    const ny = ctx.sampleRate * 0.49, top = clamp(cut * start, 30, ny);
    f.frequency.setValueAtTime(top, t);
    if (top !== cut) f.frequency.setTargetAtTime(clamp(cut, 30, ny), t, Math.max(0.004, ft / 3));
    return f;
  }
  function sawOffsets(n) {
    n = clamp(n | 0, 1, 9);
    if (n === 1) return [0];
    const o = [];
    for (let i = 0; i < n; i++) { const x = -1 + 2 * i / (n - 1); o.push(Math.sign(x) * Math.pow(Math.abs(x), 1.15)); }
    return o;
  }
  function viber(bus, src) { if (bus.vib && src.detune) { try { bus.vib.connect(src.detune); } catch (e) { /* ignore */ } } }

  // ================================================================================================
  // INSTRUMENT LIBRARY.  play(ctx, bus, t, dur, notes[], vel, cfg): one note / chord at ctx time t, written length dur (s).
  //   bus = the lane bus: bus.in (input; mono or stereo), bus.vib (detune LFO or null)
  //   Each voice creates its own sources with explicit start/stop times (REG accounting) and never holds state: it is safe to run on any context.
  //   CPU rule of thumb (this machine, per source node alive): oscillator ~0.04 %, looping buffer ~0.02 %, biquad ~0.05 %, gain ~0.01 %.
  // ================================================================================================
  const INST = {};

  /** chord of baked unison saws (one looping stereo buffer per note) -> one stereo lowpass -> one envelope.  super / stab / pad. */
  function chordVoice(ctx, bus, t, dur, notes, vel, c) {
    const a = c.a, hold = Math.max(a + 0.012, dur * c.gate), r = c.r, tEnd = t + hold + r * 2.6 + 0.04;
    const N = clamp(c.n | 0 || 5, 1, 9), K = notes.length;
    const f = envLP(ctx, t, c.cut, c.fst, c.ft, c.q);
    const g = adsr(ctx, bus.in, t, hold, a, c.d, c.s, r, vel * c.lv / Math.sqrt(K));
    f.connect(g);
    for (let k = 0; k < K; k++) {
      const b = sawBake(ctx, notes[k], N, c.spread, false), s = mkBuf(ctx, b.buf, t, tEnd, true);
      if (Math.abs(b.rate - 1) > 4e-5) s.playbackRate.value = b.rate; viber(bus, s); s.connect(f);
    }
    if (c.sub) {
      const so = mkOsc(ctx, 'sine', mtof(Math.min.apply(null, notes) - 12), t, tEnd), sg = gn(ctx, c.sub * 0.5);
      so.connect(sg); sg.connect(g);
    }
  }

  /** "ah" choir: baked mono saw stacks -> parallel formant band-passes (+ a little dry) -> slow envelope */
  const VOWELS = {
    ah: [[730, 9, 1], [1090, 10, 0.8], [2440, 12, 0.5], [3400, 14, 0.25]],
    oh: [[570, 9, 1], [840, 10, 0.7], [2410, 12, 0.35], [3300, 14, 0.2]],
    oo: [[300, 8, 1], [870, 10, 0.4], [2240, 12, 0.25], [3300, 14, 0.15]],
    eh: [[530, 9, 1], [1840, 10, 0.7], [2480, 12, 0.45], [3500, 14, 0.25]],
    ee: [[270, 8, 1], [2290, 10, 0.55], [3010, 12, 0.4], [3700, 14, 0.2]],
  };
  function choirVoice(ctx, bus, t, dur, notes, vel, c) {
    const a = c.a, hold = Math.max(a + 0.02, dur * c.gate), r = c.r, tEnd = t + hold + r * 2.6 + 0.04;
    const K = notes.length, lvl = vel * c.lv / Math.sqrt(K);
    const mix = ctx.createGain();
    for (let k = 0; k < K; k++) {
      const b = sawBake(ctx, notes[k], 3, c.spread, true), s = mkBuf(ctx, b.buf, t, tEnd, true);
      if (Math.abs(b.rate - 1) > 4e-5) s.playbackRate.value = b.rate; viber(bus, s); s.connect(mix);
    }
    const g = adsr(ctx, bus.in, t, hold, a, c.d, c.s, r, lvl);
    for (const [f, q, gain] of (VOWELS[c.vowel] || VOWELS.ah).slice(0, 3)) {
      const b = bq(ctx, 'bandpass', f, q), bg = gn(ctx, gain * c.fm);
      mix.connect(b); b.connect(bg); bg.connect(g);
    }
  }

  /** chorus pick bass / upright: ONE oscillator carrying a saw + pulse (+ triangle) + sub-sine wave -> enveloped lowpass -> amp */
  function pickVoice(ctx, bus, t, dur, notes, vel, c) {
    const fq = mtof(notes[0]), hold = Math.max(c.a + 0.006, dur * c.gate), r = c.r, tEnd = t + hold + r * 2.6 + 0.03;
    const f = envLP(ctx, t, c.cut, c.fst, c.ft, c.q);
    const g = adsr(ctx, bus.in, t, hold, c.a, c.d, c.s, r, vel * c.lv);
    f.connect(g);
    const o = mkOsc(ctx, c.wave, c.wave.sub ? fq / 2 : fq, t, tEnd);
    o.connect(f);
    if (c.click) {
      const n = mkNoise(ctx, t, t + 0.02), hp = bq(ctx, 'highpass', 2400, 0.7), cg = decayEnv(ctx, bus.in, t, 0.0004, 0.005, vel * c.click * c.lv);
      n.connect(hp); hp.connect(cg);
    }
  }

  /** 808 sub: sine (+ a little triangle so the note still speaks on small speakers) with a quick pitch drop and a long decay */
  function subVoice(ctx, bus, t, dur, notes, vel, c) {
    const fq = mtof(notes[0]), hold = Math.max(0.05, dur * c.gate), r = c.r, tEnd = t + hold + r * 2.6 + 0.05;
    const o = mkOsc(ctx, c.wave, fq, t, tEnd);
    o.frequency.setValueAtTime(fq * c.drop, t);
    o.frequency.exponentialRampToValueAtTime(fq, t + c.dt);
    const g = adsr(ctx, bus.in, t, hold, 0.004, c.d, c.s, r, vel * c.lv);
    o.connect(g);
  }

  /** distorted riff bass: a sub-weighted saw + a detuned saw -> resonant lowpass (the lane's drive / cab stages do the rest) */
  function riffVoice(ctx, bus, t, dur, notes, vel, c) {
    const fq = mtof(notes[0]), hold = Math.max(c.a + 0.006, dur * c.gate), r = c.r, tEnd = t + hold + r * 2.6 + 0.03;
    const f = envLP(ctx, t, c.cut, c.fst, c.ft, c.q);
    const g = adsr(ctx, bus.in, t, hold, c.a, c.d, c.s, r, vel * c.lv);
    f.connect(g);
    const o1 = mkOsc(ctx, c.wave, c.wave.sub ? fq / 2 : fq, t, tEnd), o2 = mkOsc(ctx, 'sawtooth', fq, t, tEnd);
    o2.detune.value = c.det;
    o1.connect(f); o2.connect(f);
  }

  /** cold arp / lead / alarm: pulse or saw (n detuned copies) through an enveloped lowpass, optional vibrato + pitch scoop + 2nd layer */
  function arpVoice(ctx, bus, t, dur, notes, vel, c) {
    const fq = mtof(notes[0]), hold = Math.max(c.a + 0.005, dur * c.gate), r = c.r, tEnd = t + hold + r * 2.6 + 0.03;
    const f = envLP(ctx, t, c.cut, c.fst, c.ft, c.q);
    const g = adsr(ctx, bus.in, t, hold, c.a, c.d, c.s, r, vel * c.lv);
    f.connect(g);
    const N = clamp(c.n | 0 || 1, 1, 5), offs = sawOffsets(N), lv = 1 / Math.sqrt(N);
    for (let i = 0; i < N; i++) {
      const o = mkOsc(ctx, c.wave, fq, t, tEnd);
      o.detune.value = offs[i] * c.spread;
      if (c.scoop && hold > 0.12) { o.detune.setValueAtTime(offs[i] * c.spread - c.scoop, t); o.detune.linearRampToValueAtTime(offs[i] * c.spread, t + 0.035); }
      viber(bus, o);
      if (N > 1) { const og = gn(ctx, lv); o.connect(og); og.connect(f); } else o.connect(f);
    }
    if (c.pw2) { const o = mkOsc(ctx, c.pw2, fq / 2, t, tEnd), og = gn(ctx, c.pwl); o.connect(og); og.connect(f); }
  }

  /** Karplus-Strong twang (generated buffer) with a quick pitch scoop.  Tremolo / spring reverb live on the lane. */
  function twangVoice(ctx, bus, t, dur, notes, vel, c) {
    const m = notes[0], buf = ksBuffer(ctx, m), hold = Math.max(0.03, dur * c.gate);
    const rate0 = c.bend ? Math.pow(2, -c.bend / 12) : 1;
    const tEnd = Math.min(t + buf.duration / Math.min(rate0, 1) + 0.05, t + hold + c.ring + 0.75);   // the string is stopped once its release fade (tau 0.1 s) is inaudible
    const s = mkBuf(ctx, buf, t, tEnd);
    if (c.bend) { s.playbackRate.setValueAtTime(rate0, t); s.playbackRate.exponentialRampToValueAtTime(1, t + 0.07); }
    if (c.detune) s.detune.value = c.detune;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vel * c.lv, t);
    g.gain.setTargetAtTime(0, t + hold + c.ring, 0.1);
    const f = bq(ctx, 'lowpass', clamp(c.cut * (0.55 + 0.6 * vel), 800, 16000), 0.6);
    s.connect(f); f.connect(g); g.connect(bus.in);
  }

  /** 2-operator FM bell / vibes.  mr = modulator ratio, idx = modulation index at the attack (decays with id), p2 = second carrier ratio */
  function bellVoice(ctx, bus, t, dur, notes, vel, c) {
    const fq = mtof(notes[0]), tEnd = t + c.d * 1.6 + 0.1, hold = Math.max(0.05, dur * c.gate);
    const car = mkOsc(ctx, 'sine', fq, t, tEnd), mod = mkOsc(ctx, 'sine', fq * c.mr, t, tEnd);
    const mg = ctx.createGain();
    mg.gain.setValueAtTime(fq * c.idx, t);
    mg.gain.setTargetAtTime(fq * c.idx * c.ie, t, c.id / 3);
    mod.connect(mg); mg.connect(car.frequency);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vel * c.lv, t + 0.0015);
    g.gain.setTargetAtTime(0, t + 0.0015, c.d / 5);
    if (c.damp) g.gain.setTargetAtTime(0, t + hold, 0.05);
    car.connect(g); g.connect(bus.in);
    if (c.p2g) {
      const c2 = mkOsc(ctx, 'sine', fq * c.p2, t, tEnd), g2 = ctx.createGain();
      g2.gain.setValueAtTime(vel * c.lv * c.p2g, t); g2.gain.setTargetAtTime(0, t, c.d / 9);
      c2.connect(g2); g2.connect(bus.in);
    }
    if (c.mallet) {
      const n = mkNoise(ctx, t, t + 0.03), bp = bq(ctx, 'bandpass', fq * 3, 2), ng = decayEnv(ctx, bus.in, t, 0.0004, 0.006, vel * c.mallet * c.lv);
      n.connect(bp); bp.connect(ng);
    }
  }

  // ---- instrument table: fmt = default pattern format of a lane, mono = notes are cut at the next one, lo = default register of the chord root
  //      (rel patterns), src = number of source nodes a note needs (compile-time budget estimate), d = parameter defaults (lane / section `cfg` override) ----
  INST.super = { fmt: 'chord', play: chordVoice, src: (c, k) => k + (c.sub ? 1 : 0), cost: 0.12,
    d: { n: 5, spread: 16, cut: 5600, q: 0.7, fst: 1.7, ft: 0.35, a: 0.012, d: 0.4, s: 0.85, r: 0.3, gate: 0.97, lv: 0.215, sub: 0, voicing: { lo: 55, hi: 79, n: 4 } } };
  INST.stab = { fmt: 'chord', play: chordVoice, src: (c, k) => k, cost: 0.1,
    d: { n: 5, spread: 20, cut: 4200, q: 0.9, fst: 3.2, ft: 0.16, a: 0.004, d: 0.22, s: 0.25, r: 0.14, gate: 0.9, lv: 0.276, sub: 0, voicing: { lo: 55, hi: 79, n: 4 } } };
  INST.pad = { fmt: 'chord', play: chordVoice, src: (c, k) => k, cost: 0.1,
    d: { n: 3, spread: 11, cut: 1500, q: 0.6, fst: 0.35, ft: 1.4, a: 0.9, d: 1.2, s: 0.9, r: 1.1, gate: 1.0, lv: 0.218, sub: 0, voicing: { lo: 50, hi: 74, n: 4 } } };
  INST.choir = { fmt: 'chord', play: choirVoice, src: (c, k) => k, cost: 0.2,
    d: { spread: 9, vowel: 'ah', a: 0.7, d: 1.0, s: 0.9, r: 1.0, gate: 1.0, lv: 0.137, fm: 6.0, voicing: { lo: 55, hi: 76, n: 3 } } };
  INST.pick = { fmt: 'rel', mono: true, play: pickVoice, src: () => 1, lo: 40, cost: 0.08,
    d: { wave: { saw: 0.7, pulse: 0.45, duty: 0.3, sub: 0.45 }, cut: 900, fst: 3.6, ft: 0.14, q: 2.2, a: 0.003, d: 0.35, s: 0.3, r: 0.07, gate: 0.9, lv: 0.20, click: 0 } };
  INST.wood = { fmt: 'rel', mono: true, play: pickVoice, src: () => 1, lo: 36, cost: 0.08,
    d: { wave: { tri: 0.5, saw: 0.7, sub: 0.45 }, cut: 900, fst: 3.5, ft: 0.1, q: 1.0, a: 0.004, d: 0.5, s: 0.12, r: 0.1, gate: 0.85, lv: 0.8, click: 0 } };
  INST.sub = { fmt: 'rel', mono: true, play: subVoice, src: () => 1, lo: 28, cost: 0.05,
    d: { wave: { sin: 1, tri: 0.22 }, drop: 2.2, dt: 0.035, d: 1.0, s: 0.55, r: 0.09, gate: 0.96, lv: 1.0 } };
  INST.riff = { fmt: 'rel', mono: true, play: riffVoice, src: () => 2, lo: 33, cost: 0.1,
    d: { wave: { saw: 1, sub: 0.7 }, cut: 1400, fst: 2.2, ft: 0.1, q: 4, a: 0.003, d: 0.25, s: 0.7, r: 0.05, gate: 0.82, lv: 0.9, det: 11 } };
  INST.arp = { fmt: 'rel', mono: true, play: arpVoice, src: (c) => (c.n | 0 || 1) + (c.pw2 ? 1 : 0), lo: 57, cost: 0.08,
    d: { wave: 0.25, n: 1, spread: 8, cut: 2600, fst: 2.4, ft: 0.13, q: 3, a: 0.003, d: 0.14, s: 0.18, r: 0.06, gate: 0.7, lv: 1.9, pw2: 0, pwl: 0.4 } };      // lv 1.9 (was 0.17): FIXPLAN_V3 A5, the cold arp sat 20-37 dB under its band and could not be heard (lane vols stay as authored)
  INST.lead = { fmt: 'notes', mono: true, play: arpVoice, src: (c) => (c.n | 0 || 2), cost: 0.1,
    d: { wave: 'sawtooth', n: 2, spread: 9, cut: 3600, fst: 1.8, ft: 0.25, q: 1.2, a: 0.008, d: 0.2, s: 0.8, r: 0.1, gate: 0.94, lv: 0.112, scoop: 25 } };
  INST.alarm = { fmt: 'notes', mono: true, play: arpVoice, src: (c) => (c.n | 0 || 2) + 1, cost: 0.12,
    d: { wave: 0.5, n: 2, spread: 14, cut: 3000, fst: 2.4, ft: 0.2, q: 6, a: 0.004, d: 0.15, s: 0.85, r: 0.05, gate: 0.95, lv: 0.16, pw2: 'sawtooth', pwl: 0.5, scoop: 60 } };
  INST.twang = { fmt: 'notes', play: twangVoice, src: () => 1, cost: 0.05,
    d: { cut: 6500, lv: 0.767, gate: 0.9, ring: 0.45, bend: 0.35, detune: 0 } };
  INST.bell = { fmt: 'notes', play: bellVoice, src: () => 3, cost: 0.12,
    d: { mr: 3.5, idx: 1.4, ie: 0.05, id: 0.18, d: 1.6, gate: 1.0, lv: 0.122, p2: 2.76, p2g: 0.22, mallet: 0.1, damp: false } };
  INST.vibes = { fmt: 'notes', play: bellVoice, src: () => 3, cost: 0.12,
    d: { mr: 4.0, idx: 0.7, ie: 0.04, id: 0.1, d: 1.1, gate: 1.0, lv: 0.227, p2: 3.99, p2g: 0.12, mallet: 0.22, damp: true } };

  // ================================================================================================
  // DRUM KIT.  fn(ctx, bus, t, v): one hit into bus.in at time t, velocity v (0..1.3)
  // ================================================================================================
  function nzHit(ctx, dest, t, type, f, q, tau, v, a, len) {          // enveloped filtered noise burst (the building block of snares / hats / claps)
    const n = mkNoise(ctx, t, t + (len || tau * 7) + 0.02), fl = bq(ctx, type, f, q), g = decayEnv(ctx, dest, t, a === undefined ? 0.0008 : a, tau, v);
    n.connect(fl); fl.connect(g);
    return g;
  }
  function sineHit(ctx, dest, t, f0, f1, sweep, tau, v, type) {        // pitched drop: kicks, toms, thuds
    const life = tau * 8, dur = Math.min(life, 3.2);                    // composer fix v2.0: a long boom (impact tau 0.75 s) no longer keeps its oscillator alive for 6 s (a finished jingle track
    const o = mkOsc(ctx, type || 'sine', f1, t, t + dur + 0.05);        // used to linger ~4.5 s after its end): the tail is faded out from 2.9 s on, at -37 dB and 31 Hz, inaudible
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + sweep);
    const g = decayEnv(ctx, dest, t, 0.0008, tau, v);
    if (life > dur) g.gain.setTargetAtTime(0, t + dur - 0.3, 0.07);
    o.connect(g);
    return g;
  }
  function kMachine(ctx, bus, t, v) {                     // 80s drum-machine kick: short, round, mid-heavy with a soft beater
    sineHit(ctx, bus.in, t, 150, 58, 0.055, 0.075, v * 1.0);
    sineHit(ctx, bus.in, t, 320, 100, 0.02, 0.02, v * 0.35, 'triangle');
    nzHit(ctx, bus.in, t, 'highpass', 1800, 0.7, 0.005, v * 0.3, 0.0005, 0.03);
  }
  function kEdm(ctx, bus, t, v) {                      // modern EDM kick: fast sweep, click, long sub tail (the lane's drive adds harmonics)
    sineHit(ctx, bus.in, t, 235, 47, 0.05, 0.14, v * 1.0);
    sineHit(ctx, bus.in, t, 130, 56, 0.018, 0.035, v * 0.55, 'triangle');
    nzHit(ctx, bus.in, t, 'bandpass', 3600, 0.9, 0.004, v * 0.45, 0.0004, 0.025);
  }
  function kBoom(ctx, bus, t, v) {                     // long 808 kick
    sineHit(ctx, bus.in, t, 120, 38, 0.16, 0.38, v * 1.0);
    sineHit(ctx, bus.in, t, 240, 80, 0.02, 0.03, v * 0.4, 'triangle');
    nzHit(ctx, bus.in, t, 'bandpass', 2400, 0.8, 0.004, v * 0.3, 0.0004, 0.02);
  }
  function snGate(ctx, bus, t, v) {                    // 80s gated-reverb snare: crack + body + a flat noise wash that is cut dead after ~120 ms
    nzHit(ctx, bus.in, t, 'bandpass', 2300, 0.55, 0.04, v * 0.95, 0.0006, 0.2);
    sineHit(ctx, bus.in, t, 215, 165, 0.03, 0.03, v * 0.55, 'triangle');
    const n = mkNoise(ctx, t, t + 0.2), hp = bq(ctx, 'highpass', 650, 0.6), lp = bq(ctx, 'lowpass', 6800, 0.5), g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(v * 0.5, t + 0.005);
    g.gain.linearRampToValueAtTime(v * 0.38, t + 0.105);
    g.gain.linearRampToValueAtTime(0, t + 0.124);              // the gate
    n.connect(hp); hp.connect(lp); lp.connect(g); g.connect(bus.in);
  }
  function snHard(ctx, bus, t, v, crush) {             // tight modern snare
    let dest = bus.in;
    if (crush) { const sh = ctx.createWaveShaper(); sh.curve = crushCurve(crush); sh.connect(dest); dest = sh; }
    nzHit(ctx, dest, t, 'highpass', 1100, 0.6, 0.075, v * 1.0, 0.0005, 0.27);
    nzHit(ctx, dest, t, 'bandpass', 4200, 0.8, 0.02, v * 0.5, 0.0005, 0.1);
    sineHit(ctx, dest, t, 235, 175, 0.025, 0.035, v * 0.7, 'triangle');
  }
  const snCrush = (ctx, bus, t, v) => snHard(ctx, bus, t, v * 1.05, 4);
  function snGhost(ctx, bus, t, v) {
    nzHit(ctx, bus.in, t, 'bandpass', 2800, 0.7, 0.03, v * 0.55, 0.0008, 0.2);
    sineHit(ctx, bus.in, t, 200, 170, 0.02, 0.02, v * 0.25, 'triangle');
  }
  function snBrush(ctx, bus, t, v) {                   // brushed snare: a soft swish with a slow attack
    nzHit(ctx, bus.in, t, 'bandpass', 4300, 0.45, 0.07, v * 0.45, 0.018, 0.55);
    nzHit(ctx, bus.in, t, 'highpass', 6000, 0.5, 0.05, v * 0.2, 0.012, 0.4);
  }
  function clap(ctx, bus, t, v) {                      // hand clap: four staggered bursts + a tail
    [0, 0.0105, 0.0215, 0.032].forEach((at, i) => nzHit(ctx, bus.in, t + at, 'bandpass', 1500 + i * 100, 1.1, 0.009, v * 0.7, 0.0005, 0.04));
    nzHit(ctx, bus.in, t + 0.032, 'bandpass', 1350, 0.9, 0.06, v * 0.6, 0.001, 0.4);
  }
  function snap(ctx, bus, t, v) {                      // finger snap: a dry "tick" with a hollow body (FIXPLAN_V3 A6: x3.5, the snaps are the only percussion of the title / ending intro and were 13 dB under the twang band)
    nzHit(ctx, bus.in, t, 'bandpass', 2700, 3.2, 0.014, v * 3.5, 0.0004, 0.12);
    nzHit(ctx, bus.in, t, 'highpass', 5200, 0.7, 0.004, v * 1.2, 0.0003, 0.03);
    sineHit(ctx, bus.in, t, 1300, 520, 0.02, 0.012, v * 1.4);
  }
  function rim(ctx, bus, t, v) {
    sineHit(ctx, bus.in, t, 1750, 1600, 0.01, 0.008, v * 0.6, 'square');
    sineHit(ctx, bus.in, t, 480, 440, 0.01, 0.02, v * 0.5, 'triangle');
    nzHit(ctx, bus.in, t, 'bandpass', 3200, 1.5, 0.006, v * 0.4, 0.0003, 0.04);
  }
  const tomAt = (f) => (ctx, bus, t, v) => {
    sineHit(ctx, bus.in, t, f * 1.7, f, 0.05, 0.11, v * 1.0);
    nzHit(ctx, bus.in, t, 'bandpass', f * 6, 1, 0.006, v * 0.3, 0.0004, 0.04);
  };
  const hatC = (ctx, bus, t, v) => { const g = nzHit(ctx, bus.in, t, 'highpass', 7600, 0.7, 0.0125, v * 0.9, 0.0004, 0.12); return g; };
  const hatO = (ctx, bus, t, v) => { nzHit(ctx, bus.in, t, 'highpass', 6800, 0.6, 0.075, v * 0.8, 0.0006, 0.6); };
  function metal(ctx, bus, t, v, tau, lenS, bpF, hpF, loop) {  // 808 metallic hat / ride from the generated six-square buffer
    const len = lenS || tau * 8, s = mkBuf(ctx, metalBuffer(ctx), t, t + len + 0.02);
    if (loop) s.loop = true;
    const bp = bq(ctx, 'bandpass', bpF, 0.6), hp = bq(ctx, 'highpass', hpF, 0.7), g = decayEnv(ctx, bus.in, t, 0.0005, tau, v);
    s.connect(bp); bp.connect(hp); hp.connect(g);
  }
  // FIXPLAN_V3 A2: the six-square source is ~15 dB under noise hats after the 6.5 kHz high-pass, so the metal hats carry a make-up of x7.3 / x6.75 (K-active m / M = h / o, was -17 dB)
  const metC = (ctx, bus, t, v) => metal(ctx, bus, t, v * 6.2, 0.02, 0.2, 9500, 6500);
  const metO = (ctx, bus, t, v) => metal(ctx, bus, t, v * 5.4, 0.13, 0.9, 9000, 6000, true);
  const ride = (ctx, bus, t, v) => { metal(ctx, bus, t, v * 0.55, 0.32, 1.6, 6200, 3500, true); nzHit(ctx, bus.in, t, 'highpass', 8000, 0.7, 0.02, v * 0.18, 0.0004, 0.15); };
  function crash(ctx, bus, t, v) {
    nzHit(ctx, bus.in, t, 'highpass', 3600, 0.5, 0.5, v * 0.7, 0.002, 3.4);
    metal(ctx, bus, t, v * 0.5, 0.4, 2.4, 7200, 4500, true);
  }
  // industrial: ring-modulated inharmonic clangs, noise bursts
  function clang(ctx, bus, t, v, f, tau, dest) {
    const tEnd = t + tau * 9 + 0.05, out = decayEnv(ctx, dest || bus.in, t, 0.0006, tau, v), hp = bq(ctx, 'highpass', f * 0.6, 0.7);
    hp.connect(out);
    [[f, f * 1.4142, 1], [f * 2.76, f * 3.51, 0.6]].forEach(([fc, fm, amp]) => {
      const c = mkOsc(ctx, 'sine', fc, t, tEnd), m = mkOsc(ctx, 'square', fm, t, tEnd), rm = ctx.createGain(), lv = gn(ctx, amp);
      rm.gain.value = 0; m.connect(rm.gain); c.connect(rm); rm.connect(lv); lv.connect(hp);
    });
    nzHit(ctx, dest || bus.in, t, 'bandpass', f * 4, 1.2, 0.006, v * 0.5, 0.0003, 0.04);
  }
  const clangLo = (ctx, bus, t, v) => clang(ctx, bus, t, v * 0.9, 190, 0.28);
  const clangHi = (ctx, bus, t, v) => clang(ctx, bus, t, v * 0.8, 560, 0.2);
  function noiseHit(ctx, bus, t, v) {
    const sh = ctx.createWaveShaper(); sh.curve = crushCurve(5); sh.connect(bus.in);
    nzHit(ctx, sh, t, 'bandpass', 900, 0.8, 0.07, v * 1.0, 0.0004, 0.5);
    sineHit(ctx, sh, t, 170, 48, 0.07, 0.07, v * 0.8);
  }
  function blast(ctx, bus, t, v) { nzHit(ctx, bus.in, t, 'highpass', 450, 0.5, 0.04, v * 0.9, 0.0005, 0.3); }

  /** drum grid char -> [kit lane, voice, triggers the sidechain] */
  const KIT = {
    k: ['kick', kMachine, true], K: ['kick', kEdm, true], b: ['kick', kBoom, true],
    s: ['snare', snGate], S: ['snare', snHard], y: ['snare', snCrush], n: ['snare', snGhost], B: ['snare', snBrush], p: ['snare', clap],
    f: ['perc', snap], r: ['perc', rim], t: ['perc', tomAt(200)], u: ['perc', tomAt(145)], v: ['perc', tomAt(100)],
    h: ['hats', hatC], o: ['hats', hatO], m: ['hats', metC], M: ['hats', metO], d: ['hats', ride], c: ['hats', crash],
    x: ['perc', clangLo], X: ['perc', clangHi], z: ['perc', noiseHit], w: ['perc', blast],
  };
  const KIT_LANES = ['kick', 'snare', 'hats', 'perc'];
  const KIT_LV = 0.47, FX_LV = 0.23;               // calibration: a full kit pattern / the fx family at lane vol 1 sit at about -21 / -22 LUFS
  const KIT_DUCK_DEFAULT = 'kKbq';                  // chars that trigger the sidechain (q = silent trigger)

  // ================================================================================================
  // FX voices: fn(ctx, bus, t, D seconds, v)
  // ================================================================================================
  function fxRiser(ctx, bus, t, D, v) {
    const e = t + D;
    const n = mkNoise(ctx, t, e + 0.06), bp = bq(ctx, 'bandpass', 250, 1.3), g = ctx.createGain();
    bp.frequency.setValueAtTime(250, t); bp.frequency.exponentialRampToValueAtTime(9500, e);
    g.gain.setValueAtTime(0.02 * v, t); g.gain.exponentialRampToValueAtTime(v * 0.9, e); g.gain.linearRampToValueAtTime(0, e + 0.035);
    n.connect(bp); bp.connect(g); g.connect(bus.in);
    const o = mkOsc(ctx, 'sawtooth', 90, t, e + 0.06), lp = bq(ctx, 'lowpass', 600, 2), g2 = ctx.createGain();
    o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(1300, e);
    lp.frequency.setValueAtTime(500, t); lp.frequency.exponentialRampToValueAtTime(7000, e);
    g2.gain.setValueAtTime(0.01 * v, t); g2.gain.exponentialRampToValueAtTime(v * 0.28, e); g2.gain.linearRampToValueAtTime(0, e + 0.035);
    o.connect(lp); lp.connect(g2); g2.connect(bus.in);
  }
  function fxDown(ctx, bus, t, D, v) {
    const e = t + D;
    const n = mkNoise(ctx, t, e + 0.05), bp = bq(ctx, 'bandpass', 9000, 1.1), g = ctx.createGain();
    bp.frequency.setValueAtTime(9000, t); bp.frequency.exponentialRampToValueAtTime(220, e);
    g.gain.setValueAtTime(v * 0.9, t); g.gain.exponentialRampToValueAtTime(0.001, e);
    n.connect(bp); bp.connect(g); g.connect(bus.in);
    const o = mkOsc(ctx, 'sawtooth', 1100, t, e + 0.05), lp = bq(ctx, 'lowpass', 5000, 2), g2 = ctx.createGain();
    o.frequency.setValueAtTime(1100, t); o.frequency.exponentialRampToValueAtTime(70, e);
    lp.frequency.setValueAtTime(5000, t); lp.frequency.exponentialRampToValueAtTime(300, e);
    g2.gain.setValueAtTime(v * 0.25, t); g2.gain.exponentialRampToValueAtTime(0.001, e);
    o.connect(lp); lp.connect(g2); g2.connect(bus.in);
  }
  function fxSwell(ctx, bus, t, D, v) {                // reverse-reverb swell: dark noise that blooms and is cut at the downbeat
    const e = t + D;
    const n = mkNoise(ctx, t, e + 0.03), lp = bq(ctx, 'lowpass', 500, 0.8), hp = bq(ctx, 'highpass', 250, 0.6), g = ctx.createGain();
    lp.frequency.setValueAtTime(500, t); lp.frequency.exponentialRampToValueAtTime(7500, e);
    g.gain.setValueAtTime(0.0006, t); g.gain.exponentialRampToValueAtTime(v, e - 0.004); g.gain.setValueAtTime(0, e);
    n.connect(lp); lp.connect(hp); hp.connect(g); g.connect(bus.in);
  }
  function fxImpact(ctx, bus, t, D, v) {               // cinematic hit: sub drop, noise burst that closes down, shimmering crash
    sineHit(ctx, bus.in, t, 92, 31, 0.5, 0.75, v * 1.0);
    sineHit(ctx, bus.in, t, 190, 62, 0.08, 0.1, v * 0.5, 'triangle');
    const n = mkNoise(ctx, t, t + 2.2), lp = bq(ctx, 'lowpass', 7000, 0.7), g = decayEnv(ctx, bus.in, t, 0.001, 0.32, v * 0.8);
    lp.frequency.setValueAtTime(7000, t); lp.frequency.exponentialRampToValueAtTime(180, t + 1.4);
    n.connect(lp); lp.connect(g);
    nzHit(ctx, bus.in, t, 'highpass', 4200, 0.6, 0.35, v * 0.3, 0.001, 2.6);
  }
  function fxZap(ctx, bus, t, D, v) {
    const e = t + Math.min(D, 0.3);
    const o = mkOsc(ctx, 'sawtooth', 3400, t, e + 0.05), lp = bq(ctx, 'lowpass', 5000, 3), g = ctx.createGain();
    o.frequency.setValueAtTime(3400, t); o.frequency.exponentialRampToValueAtTime(160, e);
    lp.frequency.setValueAtTime(7000, t); lp.frequency.exponentialRampToValueAtTime(400, e);
    g.gain.setValueAtTime(v * 0.6, t); g.gain.exponentialRampToValueAtTime(0.001, e);
    o.connect(lp); lp.connect(g); g.connect(bus.in);
  }
  const FXV = { riser: fxRiser, down: fxDown, swell: fxSwell, impact: fxImpact, zap: fxZap };
  INST.fx = { fmt: 'fx', play: null, src: () => 4, cap: 4, d: { lv: 1 } };

  // ================================================================================================
  // SFX synth primitives.  All take (ctx, dest, t, o, P): P = {f: pitch factor, v: volume factor} from the sfx() options.
  // ================================================================================================
  function outStage(ctx, node, dest, o) {               // optional pan / bit-crush stage shared by every primitive
    let out = node;
    if (o.crush) { const sh = ctx.createWaveShaper(); sh.curve = crushCurve(o.crush); out.connect(sh); out = sh; }
    if (o.pan) { const p = ctx.createStereoPanner(); p.pan.value = o.pan; out.connect(p); out = p; }
    out.connect(dest);
  }
  /**
   * tone: oscillator with an optional exponential pitch path, lowpass sweep and amplitude envelope.
   *  o.w   'sine'|'tri'|'saw'|'square'|number (pulse duty)    o.f / o.f2   start / end Hz    o.pts [[seconds, Hz], ...] explicit pitch path
   *  o.d   duration (s)    o.v peak gain    o.a attack (s)    o.sh 'exp' (default) | 'hold' (flat, then release o.r)    o.at start offset
   *  o.vib [Hz, cents, delay s]    o.lp [f0, f1, q] lowpass sweep over the duration    o.fix true = ignore the sfx pitch option
   *  o.pan -1..1    o.crush bits
   */
  function sTone(ctx, dest, t, o, P) {
    const pf = P && !o.fix ? P.f : 1, pv = P ? P.v : 1;
    t += o.at || 0;
    const d = o.d, osc = mkOsc(ctx, o.w || 'sine', 100, t, t + d + 0.03);
    const pts = o.pts || [[0, o.f], [d, o.f2 || o.f]];
    osc.frequency.setValueAtTime(pts[0][1] * pf, t);
    for (let i = 1; i < pts.length; i++) osc.frequency.exponentialRampToValueAtTime(pts[i][1] * pf, t + pts[i][0]);
    if (o.vib && d > o.vib[2] + 0.04) vibrato(osc, t + o.vib[2], d - o.vib[2], o.vib[0], o.vib[1]);
    let node = osc;
    if (o.lp) {
      const f = bq(ctx, 'lowpass', o.lp[0], o.lp[2] === undefined ? 1 : o.lp[2]);
      f.frequency.setValueAtTime(o.lp[0], t); f.frequency.exponentialRampToValueAtTime(o.lp[1], t + d);
      osc.connect(f); node = f;
    }
    const g = ctx.createGain(), v = o.v * pv, a = Math.min(o.a === undefined ? 0.004 : o.a, d * 0.5);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(v, t + a);
    if (o.sh === 'hold') {
      const r = Math.min(o.r === undefined ? 0.03 : o.r, d - a);
      g.gain.setValueAtTime(v, t + d - r); g.gain.linearRampToValueAtTime(0, t + d);
    } else g.gain.exponentialRampToValueAtTime(0.0008, t + d);
    node.connect(g);
    outStage(ctx, g, dest, o);
  }
  /** Sine vibrato on osc.detune via one value curve (cheap, no LFO nodes). Depth ramps in over ~0.15 s. */
  function vibrato(osc, t0, dur, hz, cents) {
    if (!osc.detune) return;
    const n = Math.max(16, Math.ceil(dur * 60)), curve = new Float32Array(n);
    for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * dur; curve[i] = Math.sin(2 * Math.PI * hz * x) * cents * Math.min(1, x / 0.15); }
    osc.detune.setValueCurveAtTime(curve, t0, dur);
  }
  /** noise: filtered white noise burst.  o.ft filter type, o.f / o.f2 centre/cutoff sweep, o.q, o.d, o.v, o.a, o.at, o.pan, o.crush */
  function sNoise(ctx, dest, t, o, P) {
    const pf = P && !o.fix ? P.f : 1, pv = P ? P.v : 1;
    t += o.at || 0;
    const d = o.d, src = mkNoise(ctx, t, t + d + 0.03), f = bq(ctx, o.ft || 'bandpass', o.f * pf, o.q === undefined ? 0.8 : o.q);
    if (o.f2) { f.frequency.setValueAtTime(o.f * pf, t); f.frequency.exponentialRampToValueAtTime(o.f2 * pf, t + d); }      // anchored at the start (FIXPLAN_V3 A1): an exponential ramp without a start event runs from context time 0, so in the live game (t >> d) every noise sweep sat on its end frequency
    const g = ctx.createGain(), v = o.v * pv, a = Math.min(o.a === undefined ? 0.003 : o.a, d * 0.5);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + a); g.gain.exponentialRampToValueAtTime(0.0008, t + d);
    src.connect(f); f.connect(g);
    outStage(ctx, g, dest, o);
  }
  /** FM bell: carrier f, modulator f*mr with an index that decays from `idx` to idx*ie (time constant id/3 s); amplitude exp decay over d */
  function sBell(ctx, dest, t, o, P) {
    const pf = P && !o.fix ? P.f : 1, pv = P ? P.v : 1;
    t += o.at || 0;
    const f = o.f * pf, d = o.d, mr = o.mr || 3.5, idx = o.idx === undefined ? 0.9 : o.idx;
    const car = mkOsc(ctx, 'sine', f, t, t + d + 0.04), mod = mkOsc(ctx, 'sine', f * mr, t, t + d + 0.04), mg = ctx.createGain();
    mg.gain.setValueAtTime(f * idx, t); mg.gain.setTargetAtTime(f * idx * (o.ie === undefined ? 0.05 : o.ie), t, (o.id || 0.06) / 3);
    mod.connect(mg); mg.connect(car.frequency);
    const g = ctx.createGain(), v = o.v * pv;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + 0.0015); g.gain.exponentialRampToValueAtTime(0.0008, t + d);
    car.connect(g);
    outStage(ctx, g, dest, o);
    if (o.p2) {                                             // inharmonic shimmer partial
      const c2 = mkOsc(ctx, 'sine', f * o.p2, t, t + d * 0.6 + 0.04), g2 = ctx.createGain();
      g2.gain.setValueAtTime(v * 0.28, t); g2.gain.exponentialRampToValueAtTime(0.0008, t + d * 0.6);
      c2.connect(g2); outStage(ctx, g2, dest, o);
    }
  }
  /** ring-modulated clang: two carrier/modulator pairs with irrational ratios, exp decay, optional highpass */
  function sRing(ctx, dest, t, o, P) {
    const pf = P && !o.fix ? P.f : 1, pv = P ? P.v : 1;
    t += o.at || 0;
    const f = o.f * pf, d = o.d, e = t + d + 0.04, hp = bq(ctx, 'highpass', f * 0.55, 0.7), g = ctx.createGain(), v = o.v * pv;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + 0.0007); g.gain.exponentialRampToValueAtTime(0.0008, t + d);
    hp.connect(g);
    [[f, f * (o.r || 1.4142), 1], [f * 2.76, f * 3.51, 0.55]].forEach(([fc, fm, amp]) => {
      const c = mkOsc(ctx, 'sine', fc, t, e), m = mkOsc(ctx, 'square', fm, t, e), rm = ctx.createGain(), lv = gn(ctx, amp);
      rm.gain.value = 0; m.connect(rm.gain); c.connect(rm); rm.connect(lv); lv.connect(hp);
    });
    outStage(ctx, g, dest, o);
  }
  /** mini supersaw stab / swell: o.f = Hz or [Hz...], n saws each, cutoff sweep o.cut [c0, c1] */
  function sSaws(ctx, dest, t, o, P) {
    const pf = P && !o.fix ? P.f : 1, pv = P ? P.v : 1;
    t += o.at || 0;
    const fs = Array.isArray(o.f) ? o.f : [o.f], N = o.n || 5, offs = sawOffsets(N), d = o.d, e = t + d + 0.04;
    const f = bq(ctx, 'lowpass', o.cut[0], o.q || 1);
    f.frequency.setValueAtTime(o.cut[0], t); f.frequency.exponentialRampToValueAtTime(o.cut[1], t + d * 0.8);
    const g = ctx.createGain(), v = o.v * pv / Math.sqrt(N * fs.length), a = Math.min(o.a === undefined ? 0.01 : o.a, d * 0.5);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + a); g.gain.exponentialRampToValueAtTime(0.0008, t + d);
    for (const fr of fs) for (let i = 0; i < N; i++) { const s = mkOsc(ctx, 'sawtooth', fr * pf, t, e); s.detune.value = offs[i] * (o.spread || 16); s.connect(f); }
    f.connect(g);
    outStage(ctx, g, dest, o);
  }
  /** Kit handed to sfx definitions: all calls are relative to the sfx start time.  k.semi = the pitch option (semitones). */
  function sfxKit(ctx, dest, t, P) {
    return {
      semi: P ? Math.round(12 * Math.log2(P.f)) : 0,
      tone: (o) => sTone(ctx, dest, t, o, P),
      noise: (o) => sNoise(ctx, dest, t, o, P),
      bell: (o) => sBell(ctx, dest, t, o, P),
      ring: (o) => sRing(ctx, dest, t, o, P),
      saws: (o) => sSaws(ctx, dest, t, o, P),
      /** run of equal-length tones: freqs[], spacing `step`, template o */
      seq: (freqs, step, o) => freqs.forEach((f, i) => sTone(ctx, dest, t, Object.assign({}, o, { f, f2: f, at: (o.at || 0) + i * step, d: o.d || step * 1.4 }), P)),
      /** run of FM bells */
      bells: (freqs, step, o) => freqs.forEach((f, i) => sBell(ctx, dest, t, Object.assign({}, o, { f, at: (o.at || 0) + i * step }), P)),
    };
  }

  // ================================================================================================
  // SFX bank  (glassy / digital / neon; every sound feeds a short shared reverb: `rev` = send level)
  // ================================================================================================
  // trim: per-sfx loudness calibration -- fitted on the K-WEIGHTED active level (ITU-R BS.1770 K filter, 10 ms windows within 25 dB of the
  //   loudest) by `node test/audio_analyze.mjs --apply-trims`, so a thud and a bell of the same fitted level are equally loud (SPEC_V2 §6).
  // max: concurrent instances.  quiet: true = 9 dB below the target, a number = that many dB below (land: 12).  lvl: dB ABOVE the target for
  // very short, fast-decaying sounds (the ear integrates over ~100-200 ms: boss_hit +3, enemy_shot +1.5, jump / pop +1).
  // Energy plan: the heavy sounds (thunder / bomb / boss_hit / boss_die / land) keep their weight in a 200-2500 Hz band plus a short sub
  // tail, so they survive laptop and phone speakers.
  const SFX = {
    jump: { max: 2, rev: 0.14, trim: 1.336, lvl: 1, fn(k) {            // rubbery digital blip up
      k.tone({ w: 'tri', pts: [[0, 330], [0.05, 520], [0.13, 800]], d: 0.14, v: 0.5, lp: [1900, 4600, 1.5] });
      k.tone({ w: 0.25, pts: [[0, 660], [0.12, 1500]], d: 0.12, v: 0.2, lp: [2600, 5200, 1] });
      k.bell({ f: 1320, mr: 2, idx: 0.7, id: 0.05, d: 0.1, v: 0.2, at: 0.03 });
      k.noise({ ft: 'bandpass', f: 3000, q: 1.5, d: 0.025, v: 0.1 });
    } },
    shoot: { max: 2, rev: 0.2, trim: 1.101, fn(k) {                     // soap-bubble blow: glassy rising plinks + airy puff
      k.tone({ w: 'sine', pts: [[0, 480], [0.09, 1180]], d: 0.1, v: 0.5 });
      k.bell({ f: 1500, mr: 1.5, idx: 0.5, id: 0.05, d: 0.1, v: 0.32, at: 0.045 });
      k.tone({ w: 'sine', pts: [[0, 760], [0.08, 1700]], d: 0.09, v: 0.22, at: 0.05 });
      k.noise({ ft: 'bandpass', f: 2400, f2: 4400, q: 1.3, d: 0.08, v: 0.13 });
    } },
    pop: { max: 3, rev: 0.16, trim: 0.59, lvl: 1, fn(k) {              // crisp pop with a tiny sub thump
      k.noise({ ft: 'highpass', f: 3600, d: 0.05, v: 0.5 });
      k.tone({ w: 'sine', pts: [[0, 1900], [0.07, 430]], d: 0.08, v: 0.5 });
      k.tone({ w: 'sine', pts: [[0, 125], [0.05, 52]], d: 0.1, v: 0.7, fix: true });
      k.bell({ f: 2600, mr: 2.4, idx: 0.5, id: 0.03, d: 0.07, v: 0.16 });
    } },
    trap: { max: 2, rev: 0.28, trim: 0.952, fn(k) {                     // enemy sealed in: shimmering upward chime
      k.bells([784, 1047, 1319, 1760], 0.05, { d: 0.32, v: 0.34, mr: 3.5, idx: 0.8, id: 0.07 });
      k.tone({ w: 'sine', pts: [[0, 700], [0.25, 2900]], d: 0.28, v: 0.14 });
      k.noise({ ft: 'bandpass', f: 1500, f2: 7200, q: 2, d: 0.26, v: 0.1, a: 0.05 });
    } },
    kill: { max: 3, rev: 0.16, trim: 0.75, fn(k) {                     // punchy digital zap with a metallic transient; the pitch option climbs with the chain
      const sm = Math.max(0, k.semi), vs = (1 - 0.018 * sm) * (sm >= 6 ? 1.45 : 1);     // the +6.. variants carry a bell tail (more quiet frames in the K-active mean): +3.2 dB keeps the ladder flat (FIXPLAN_V3 A1, warm fit)
      k.ring({ f: 2200, r: 1.41, d: 0.06, v: 0.5 * vs });
      k.tone({ w: 'saw', pts: [[0, 2600], [0.13, 320]], d: 0.16, v: 0.55 * vs, lp: [7000, 1000, 2] });
      k.tone({ w: 0.25, pts: [[0, 1040], [0.1, 520]], d: 0.1, v: 0.3 * vs, at: 0.02 });
      k.tone({ w: 'sine', pts: [[0, 190], [0.18, 62]], d: 0.24, v: 0.32 * (1 - 0.035 * sm), fix: true });   // the thump keeps its pitch (a little less of it as the chain climbs, so the climb is heard)
      if (sm >= 6) k.bell({ f: 2093, at: 0.11, d: 0.26, v: 0.2 * vs });
    } },
    bounce: { max: 2, rev: 0.12, trim: 1.022, fn(k) {                   // rubbery synth blip
      k.tone({ w: 'tri', pts: [[0, 200], [0.04, 640], [0.12, 330], [0.2, 430], [0.26, 370]], d: 0.27, v: 0.62, vib: [26, 90, 0.03], lp: [2800, 1300, 3] });
      k.bell({ f: 440, mr: 1, idx: 2, ie: 0.1, id: 0.05, d: 0.13, v: 0.18 });
    } },
    food: { max: 3, rev: 0.26, trim: 0.8, fn(k) {                     // sparkle chime
      k.bell({ f: 1568, d: 0.2, v: 0.42, p2: 2.76 });
      k.bell({ f: 2349, at: 0.06, d: 0.3, v: 0.42, p2: 2.76 });
      k.bell({ f: 3136, at: 0.11, d: 0.3, v: 0.24 });
      k.noise({ ft: 'highpass', f: 9000, d: 0.2, v: 0.05, at: 0.06 });
    } },
    powerup: { max: 1, rev: 0.26, trim: 2.137, lvl: 2.5, fn(k) {                  // rising supersaw arp into a swelling chord
      k.seq([659, 784, 988, 1175, 1319, 1568, 1976], 0.04, { w: 'saw', v: 0.28, d: 0.07, lp: [3000, 5200, 1] });
      k.saws({ f: [659, 988, 1319], n: 5, at: 0.3, d: 0.44, v: 0.55, cut: [1400, 7500], a: 0.04 });
      k.bell({ f: 2637, at: 0.3, d: 0.4, v: 0.2 });
    } },
    item_appear: { max: 1, rev: 0.3, trim: 1.041, fn(k) {               // bloop + three twinkles
      k.tone({ w: 'sine', pts: [[0, 520], [0.07, 1300]], d: 0.09, v: 0.34 });
      k.bell({ f: 2093, at: 0.07, d: 0.24, v: 0.3 });
      k.bell({ f: 2637, at: 0.12, d: 0.24, v: 0.3 });
      k.bell({ f: 3136, at: 0.17, d: 0.28, v: 0.27 });
      k.noise({ ft: 'highpass', f: 8000, d: 0.2, v: 0.05, at: 0.07 });
    } },
    letter: { max: 2, rev: 0.3, trim: 1.129, lvl: 3.0, fn(k) {                    // bright bell triad
      k.bells([784, 988, 1175], 0.08, { d: 0.42, v: 0.46, mr: 3.5, idx: 0.7, id: 0.08, p2: 2.76 });
      k.noise({ ft: 'highpass', f: 7500, d: 0.15, v: 0.04, at: 0.16 });
    } },
    oneup: { max: 1, rev: 0.3, trim: 1.318, lvl: 0.5, fn(k) {                     // triumphant arp + supersaw chord + bell
      k.seq([392, 494, 587, 784, 988, 1175, 1568], 0.055, { w: 'saw', v: 0.28, d: 0.09, lp: [2600, 5000, 1] });
      k.saws({ f: [784, 988, 1175], n: 5, at: 0.39, d: 0.5, v: 0.55, cut: [2000, 8000], a: 0.02 });
      k.bell({ f: 1568, at: 0.39, d: 0.5, v: 0.28 });
      k.bell({ f: 2349, at: 0.45, d: 0.4, v: 0.2 });
    } },
    death: { max: 1, rev: 0.22, trim: 1.121, lvl: 1.5, fn(k) {                    // descending glitch + boom
      k.tone({ w: 'saw', pts: [[0, 880], [0.15, 600], [0.3, 360], [0.62, 90]], d: 0.66, v: 0.4, lp: [5200, 320, 2], vib: [16, 180, 0.05] });
      [0, 1, 2, 3, 4, 5].forEach((i) => k.tone({ w: 0.25, f: 760 - i * 90, f2: 700 - i * 95, d: 0.04, v: 0.22, at: i * 0.05, crush: 4 }));
      k.tone({ w: 'sine', pts: [[0, 150], [0.55, 32]], d: 0.65, v: 0.6, at: 0.14, fix: true });
      k.noise({ ft: 'lowpass', f: 3200, f2: 260, q: 0.7, d: 0.5, v: 0.26, at: 0.12 });
    } },
    hurry: { max: 1, rev: 0.16, trim: 2.002, lvl: 3.0, fn(k) {                    // dark synth alarm
      [0, 0.12, 0.24, 0.36, 0.48, 0.6].forEach((at, i) => k.tone({ w: 'saw', f: i % 2 ? 494 : 659, f2: i % 2 ? 480 : 640, d: 0.1, v: 0.34, at, lp: [2600, 1500, 4] }));
      k.tone({ w: 'square', f: 165, d: 0.7, v: 0.12, sh: 'hold', lp: [900, 700, 1] });
    } },
    ghost: { max: 1, rev: 0.4, trim: 1.068, lvl: 1.5, fn(k) {                     // eerie detuned whisper
      k.tone({ w: 'sine', pts: [[0, 392], [0.4, 470], [0.9, 372]], d: 0.95, v: 0.3, a: 0.22, vib: [5, 70, 0.1] });
      k.tone({ w: 'sine', pts: [[0, 397], [0.4, 476], [0.9, 377]], d: 0.95, v: 0.3, a: 0.25, vib: [6.2, 90, 0.12] });
      k.tone({ w: 'tri', pts: [[0, 196], [0.9, 186]], d: 0.95, v: 0.16, a: 0.3 });
      k.noise({ ft: 'bandpass', f: 1700, f2: 900, q: 6, d: 0.9, v: 0.26, a: 0.28 });
    } },
    thunder: { max: 1, rev: 0.2, trim: 0.61, fn(k) {                   // electric crack + rumble (energy above 200 Hz)
      k.noise({ ft: 'highpass', f: 2600, d: 0.08, v: 0.9, a: 0.0006 });
      k.tone({ w: 'saw', pts: [[0, 3400], [0.11, 190]], d: 0.15, v: 0.45, lp: [7000, 500, 2] });
      k.noise({ ft: 'bandpass', f: 1600, f2: 260, q: 0.6, d: 0.55, v: 0.85 });
      k.tone({ w: 'square', pts: [[0, 96], [0.4, 58]], d: 0.42, v: 0.22, lp: [900, 300, 1] });
      [0.05, 0.12, 0.2, 0.29].forEach((at, i) => k.noise({ ft: 'highpass', f: 3000 + i * 900, d: 0.025, v: 0.35, at }));
    } },
    fire: { max: 1, rev: 0.16, trim: 1.767, fn(k) {                     // whoosh + crackle
      k.noise({ ft: 'bandpass', f: 420, f2: 2200, q: 0.9, d: 0.44, v: 0.85, a: 0.08 });
      k.tone({ w: 'saw', pts: [[0, 130], [0.36, 300]], d: 0.4, v: 0.14, a: 0.06, lp: [800, 2000, 1] });
      [0.06, 0.13, 0.2, 0.26, 0.33].forEach((at, i) => k.noise({ ft: 'highpass', f: 2600 + i * 650, d: 0.02, v: 0.22, at }));
    } },
    water: { max: 1, rev: 0.3, trim: 1.678, fn(k) {                     // bubbly swoosh
      k.noise({ ft: 'bandpass', f: 650, f2: 1700, q: 2.5, d: 0.46, v: 0.28, a: 0.06 });
      [[620, 0], [880, 0.06], [740, 0.11], [1040, 0.17], [820, 0.23], [1200, 0.3]].forEach(([f, at]) =>
        k.tone({ w: 'sine', f, f2: f * 1.9, d: 0.075, v: 0.34, at }));
      k.bell({ f: 1760, at: 0.2, d: 0.25, v: 0.12, mr: 2 });
    } },
    freeze: { max: 1, rev: 0.34, trim: 0.865, fn(k) {                   // crystalline down-shimmer
      k.bells([3136, 2637, 2349, 1976, 1568, 1319], 0.055, { d: 0.26, v: 0.3, mr: 3.5, idx: 0.6, id: 0.05 });
      k.tone({ w: 'sine', pts: [[0, 2300], [0.4, 520]], d: 0.45, v: 0.15, vib: [22, 120, 0] });
      k.noise({ ft: 'highpass', f: 7000, d: 0.36, v: 0.07 });
    } },
    bomb: { max: 1, rev: 0.24, trim: 0.505, fn(k) {                     // industrial impact + sub drop
      k.ring({ f: 170, r: 1.41, d: 0.55, v: 0.55 });
      k.noise({ ft: 'bandpass', f: 2600, f2: 280, q: 0.5, d: 0.75, v: 0.95, crush: 6 });
      k.tone({ w: 'saw', pts: [[0, 320], [0.5, 60]], d: 0.55, v: 0.28, lp: [3000, 300, 1] });
      k.tone({ w: 'sine', pts: [[0, 150], [0.6, 30]], d: 0.7, v: 0.5, fix: true });
      k.noise({ ft: 'highpass', f: 2200, d: 0.07, v: 0.5 });
    } },
    menu_move: { max: 2, rev: 0.1, trim: 0.426, quiet: true, fn(k) {    // soft clean tick
      k.tone({ w: 'sine', f: 1760, d: 0.05, v: 0.4, a: 0.002 });
      k.noise({ ft: 'highpass', f: 6000, d: 0.012, v: 0.07 });
    } },
    menu_select: { max: 1, rev: 0.22, trim: 0.954, fn(k) {              // soft chime up
      k.bell({ f: 880, d: 0.18, v: 0.45, mr: 2, idx: 0.5 });
      k.bell({ f: 1320, at: 0.055, d: 0.34, v: 0.45, mr: 2, idx: 0.5, p2: 2.76 });
    } },
    pause: { max: 1, rev: 0.06, trim: 1.194, fn(k) {                    // soft chime down (must be over, with its stop padding, within the 320 ms before a hard pause suspends the context)
      k.bell({ f: 988, d: 0.1, v: 0.45, mr: 2, idx: 0.5 });
      k.bell({ f: 659, at: 0.07, d: 0.14, v: 0.45, mr: 2, idx: 0.5 });
    } },
    boss_hit: { max: 2, rev: 0.2, trim: 1.091, lvl: 3, fn(k) {          // metallic clang + thud (mid-heavy: survives small speakers)
      k.ring({ f: 420, r: 1.47, d: 0.3, v: 0.62 });
      k.ring({ f: 1130, r: 1.22, d: 0.18, v: 0.34 });
      k.noise({ ft: 'bandpass', f: 2200, f2: 700, q: 0.9, d: 0.2, v: 0.75 });
      k.tone({ w: 'sine', pts: [[0, 280], [0.1, 70]], d: 0.28, v: 0.35, fix: true });
    } },
    boss_die: { max: 1, rev: 0.3, trim: 0.685, fn(k) {                  // cascading explosions, reverse swell, one big industrial boom (~1.2 s, no chime tail)
      k.noise({ ft: 'lowpass', f: 250, f2: 7000, q: 0.7, d: 0.62, v: 0.5, a: 0.5, at: 0.05 });                // reverse swell into the boom
      for (let i = 0; i < 4; i++) {
        const at = i * 0.12;
        k.noise({ ft: 'bandpass', f: 3000 - i * 330, f2: 280, q: 0.6, d: 0.3, v: 0.85 - i * 0.05, at, crush: 6 });
        k.tone({ w: 'saw', pts: [[0, 300 - i * 25], [0.26, 60]], d: 0.28, v: 0.28, at, lp: [3000, 300, 1] });
        k.tone({ w: 'sine', pts: [[0, 120 - i * 8], [0.28, 30]], d: 0.3, v: 0.35, at, fix: true });
      }
      k.ring({ f: 150, r: 1.41, d: 0.7, v: 0.45, at: 0.68 });
      k.noise({ ft: 'bandpass', f: 2200, f2: 190, q: 0.5, d: 0.55, v: 1.0, at: 0.68, crush: 7 });
      k.tone({ w: 'saw', pts: [[0, 260], [0.45, 45]], d: 0.5, v: 0.32, at: 0.68, lp: [2500, 250, 1] });
      k.tone({ w: 'sine', pts: [[0, 110], [0.5, 26]], d: 0.58, v: 0.5, at: 0.68, fix: true });
    } },
    enemy_shot: { max: 3, rev: 0.12, trim: 1.388, lvl: 1.5, fn(k) {      // digital pew
      k.tone({ w: 'saw', pts: [[0, 1100], [0.1, 330]], d: 0.12, v: 0.5, lp: [4200, 900, 2] });
      k.tone({ w: 0.25, pts: [[0, 2200], [0.06, 800]], d: 0.07, v: 0.2 });
      k.noise({ ft: 'bandpass', f: 2200, q: 1, d: 0.04, v: 0.15 });
    } },
    spawn: { max: 3, rev: 0.34, trim: 1.731, fn(k) {                    // materialise: swelling shimmer into a glass ping
      k.noise({ ft: 'bandpass', f: 600, f2: 4200, q: 2, d: 0.22, v: 0.25, a: 0.05 });
      k.tone({ w: 'sine', pts: [[0, 390], [0.1, 780], [0.2, 1170]], d: 0.22, v: 0.3, vib: [18, 80, 0] });
      k.bell({ f: 2349, at: 0.16, d: 0.2, v: 0.22 });
    } },
    land: { max: 2, rev: 0.06, trim: 0.313, quiet: 12, fn(k) {          // soft tick + thump
      k.noise({ ft: 'bandpass', f: 1100, q: 1.2, d: 0.045, v: 0.35 });
      k.tone({ w: 'tri', pts: [[0, 360], [0.05, 160]], d: 0.07, v: 0.4 });
      k.tone({ w: 'sine', pts: [[0, 130], [0.06, 70]], d: 0.08, v: 0.3 });
    } },
    clear: { max: 1, rev: 0.34, trim: 0.902, fn(k) {                    // round-clear stinger (~0.7 s): bright ping run into a sparkling bell chord
      k.seq([784, 988, 1175, 1568], 0.075, { w: 'saw', v: 0.28, d: 0.1, lp: [3000, 5500, 1] });
      k.bells([1568, 1175, 988], 0, { at: 0.3, d: 0.4, v: 0.34, mr: 3.5, idx: 0.6, id: 0.07, p2: 2.76 });
      k.saws({ f: [784, 1175], n: 5, at: 0.3, d: 0.36, v: 0.3, cut: [3000, 8000], a: 0.02 });
      k.noise({ ft: 'highpass', f: 8000, d: 0.3, v: 0.05, at: 0.3 });
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
  // NOTATION: parsing + compilation  (song def -> program {events[step]})
  // ================================================================================================
  const PC = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
  const NOTE_RE = /^([a-g])([#b]?)(-?\d)(?:\/(\d+))?([',]*)$/;
  const REST_RE = /^r(?:\/(\d+))?$/;
  const CHORDN_RE = /^\[([^\]]+)\](?:\/(\d+))?([',]*)$/;
  const CHORD_RE = /^([A-G])([#b]?)([^/@]*)(?:@([A-G][#b]?))?(?:\/(\d+))?$/;
  const QUAL = {
    '': [0, 4, 7], m: [0, 3, 7], '7': [0, 4, 7, 10], m7: [0, 3, 7, 10], maj7: [0, 4, 7, 11], m7b5: [0, 3, 6, 10], dim: [0, 3, 6],
    sus: [0, 5, 7], sus4: [0, 5, 7], sus2: [0, 2, 7], '7sus': [0, 5, 7, 10], '6': [0, 4, 7, 9], m6: [0, 3, 7, 9], '5': [0, 7],
    add9: [0, 4, 7, 14], madd9: [0, 3, 7, 14], maj9: [0, 4, 7, 11, 14], m9: [0, 3, 7, 10, 14], '9': [0, 4, 7, 10, 14], m11: [0, 3, 7, 10, 14, 17],
    dim7: [0, 3, 6, 9], aug: [0, 4, 8], '7b9': [0, 4, 7, 10, 13], mmaj7: [0, 3, 7, 11], '69': [0, 4, 7, 9, 14], '7#9': [0, 4, 7, 10, 15],
    'maj7#11': [0, 4, 7, 11, 18], m7b9: [0, 3, 7, 10, 13],
  };
  const NOTE_PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const ACC_MARK = { "'": 1.28, ',': 0.6 };

  /** `c5/2 d5'/1 r/4 [e4,g4,b4]/8 ...` -> {ev:[{s,n,m:[midi],vel}], steps, bars:[stepsPerBar]}.  `|` = bar line (validated). */
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
      if (m) {
        const n = m[4] ? +m[4] : 2, midi = 12 * (+m[3] + 1) + PC[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
        let vel = 1; for (const ch of m[5]) vel *= ACC_MARK[ch];
        ev.push({ s: step, n, m: [midi], vel });
        step += n;
        continue;
      }
      m = CHORDN_RE.exec(tok);
      if (m) {
        const ms = m[1].split(',').map((x) => NOTE_RE.exec(x.trim()));
        if (ms.some((x) => !x)) { issues.push(tag + ': bad chord token "' + tok + '"'); continue; }
        const n = m[2] ? +m[2] : 2;
        let vel = 1; for (const ch of m[3]) vel *= ACC_MARK[ch];
        ev.push({ s: step, n, m: ms.map((x) => 12 * (+x[3] + 1) + PC[x[1]] + (x[2] === '#' ? 1 : x[2] === 'b' ? -1 : 0)), vel });
        step += n;
        continue;
      }
      issues.push(tag + ': bad token "' + tok + '"');
    }
    if (step !== barStart) bars.push(step - barStart);
    return { ev, steps: step, bars };
  }

  /** `| G | Em.Am7 | C/8 | Am7@E |` -> {list:[{s,n,root,ints,name,bass}], steps, bars}.  `.` splits a bar, `/n` explicit length, `@X` slash bass. */
  function parseChords(str, issues, tag) {
    const list = [], bars = [];
    let step = 0;
    for (const barStr of String(str || '').split('|')) {
      const b = barStr.trim();
      if (!b) continue;
      const parsed = b.split(/\s*\.\s*/).map((tk) => {
        const m = CHORD_RE.exec(tk.trim());
        if (!m || !QUAL[m[3]]) { issues.push(tag + ': bad chord "' + tk + '"'); return null; }
        const root = (NOTE_PC[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + 12) % 12;
        const bass = m[4] ? (NOTE_PC[m[4][0]] + (m[4][1] === '#' ? 1 : m[4][1] === 'b' ? -1 : 0) + 12) % 12 : null;
        return { root, ints: QUAL[m[3]], name: tk.trim(), n: m[5] ? +m[5] : 0, bass };
      }).filter(Boolean);
      if (!parsed.length) continue;
      // a bar with some explicit lengths (`Em/12.D`): the chords without one share the rest of the 16 steps
      const explicitSum = parsed.reduce((a, c) => a + c.n, 0), free = parsed.filter((c) => !c.n).length;
      const share = free ? Math.max(1, Math.floor((explicitSum ? Math.max(0, STEPS_PER_BAR - explicitSum) : STEPS_PER_BAR) / free)) : 0;
      const barStart = step;
      for (const c of parsed) {
        const n = c.n || share;
        list.push({ s: step, n, root: c.root, ints: c.ints, name: c.name, bass: c.bass });
        step += n;
      }
      bars.push(step - barStart);
    }
    return { list, steps: step, bars };
  }

  // chord-relative symbol -> semitones above the chord root
  function symbolOffset(sym, ints) {
    switch (sym) {
      case '0': return -12;
      case '1': return 0;
      case '2': return 2;
      case '3': return ints[1];
      case '4': return 5;
      case '5': return ints.length > 2 ? ints[2] : ints[ints.length - 1];      // composer fix v2.0: power chords ('B5' = [0, 7]) have no third: the fifth is the last tone (was NaN)
      case '6': return 9;
      case '7': return ints[3] !== undefined && ints[3] < 12 ? ints[3] : 11;
      case '8': return 12;
      case '9': return 14;
      case 'a': return ints[1] + 12;
      case 'c': return (ints.length > 2 ? ints[2] : ints[ints.length - 1]) + 12;
      case 'e': return (ints[3] !== undefined && ints[3] < 12 ? ints[3] : 11) + 12;
      case 'b': return ints.length > 2 ? ints[2] : ints[ints.length - 1];                 // fifth (alias of 5)
      case 'f': return 1;                       // composer addition v2.0: minor second above the root (b2, the Phrygian colour)
      case 'g': return 8;                       // minor sixth (b6)
      case 'h': return 6;                       // tritone (b5)
      default: return null;
    }
  }
  const rootMidi = (pc, lo) => lo + ((pc - lo) % 12 + 12) % 12;

  // ---- pattern grids: one char per 16th step, modifiers ' (accent) , (soft) ^ (+oct) _ (-oct) attach to the preceding char -----------
  const PATS = {
    // drums
    four: 'K...K...K...K...', fourk: 'k...k...k...k...', pulse: 'q...q...q...q...',
    backbeat: '....s.......s...', half: '........s.......', hat8: 'h.h.h.h.h.h.h.h.', hat16: 'hhhhhhhhhhhhhhhh', offhat: '..o...o...o...o.',
    roll: 'RRRRRRRRRRRRRRRR', roll8: '........RRRRRRRR', none: '................', snaps: '....f.......f...',
    // chord lanes
    hold: 'x---------------', hold2: 'x-------x-------', stab: '..x...x...x...x.', stabs8: 'x.x.x.x.x.x.x.x.', sync: 'x..x..x.x..x..x.',
    // bass / arp (chord-relative)
    root: '1---------------', root2: '1-------1-------', root8: '1-1-1-1-1-1-1-1-', oct8: '1-8-1-8-1-8-1-8-', gal: '1181118111811181', pump: '1-1-8-1-1-1-8-1-',
    arp16: '1358a853c8531358', arp8: '1.3.5.8.a.8.5.3.', arpup: '135813581358135a',
  };
  /** one cell -> tokens [{c, acc, oct}] (one token per step) */
  function tokenizeCell(cell) {
    const toks = [];
    for (const ch of cell) {
      if (ch === "'" || ch === ',') { if (toks.length) toks[toks.length - 1].acc *= ACC_MARK[ch]; continue; }
      if (ch === '^' || ch === '_') { if (toks.length) toks[toks.length - 1].oct += ch === '^' ? 12 : -12; continue; }
      toks.push({ c: ch, acc: 1, oct: 0 });
    }
    return toks;
  }
  /** pattern string -> {bars: [16 tokens each]} ; names resolve through song pats, then PATS; `name*3` repeats; cells tile (len | 16) or span bars (len % 16 = 0) */
  function buildGrid(str, pats, issues, tag) {
    const bars = [];
    const words = String(str || '').replace(/\|/g, ' ').split(/\s+/).filter(Boolean);
    for (const w of words) {
      const m = /^(.*?)(?:\*(\d+))?$/.exec(w);
      let body = m[1];
      const rep = m[2] ? +m[2] : 1;
      if (pats && Object.prototype.hasOwnProperty.call(pats, body)) body = pats[body];
      else if (Object.prototype.hasOwnProperty.call(PATS, body)) body = PATS[body];
      for (const cell of String(body).split(/\s+/).filter(Boolean)) {
        const toks = tokenizeCell(cell);
        if (!toks.length) continue;
        if (toks.length < STEPS_PER_BAR && STEPS_PER_BAR % toks.length === 0) {
          const t16 = []; for (let i = 0; i < STEPS_PER_BAR; i++) t16.push(toks[i % toks.length]);
          for (let r = 0; r < rep; r++) bars.push(t16);
        } else if (toks.length % STEPS_PER_BAR === 0) {
          for (let r = 0; r < rep; r++) for (let b = 0; b < toks.length / STEPS_PER_BAR; b++) bars.push(toks.slice(b * STEPS_PER_BAR, (b + 1) * STEPS_PER_BAR));
        } else issues.push(tag + ': pattern cell "' + cell + '" has ' + toks.length + ' steps (must divide 16 or be a multiple of 16)');
      }
    }
    return bars;
  }

  // ---- voicing: chord -> MIDI notes with smooth voice leading ---------------------------------------------------------------------------
  function voiceChord(chord, v, prev) {
    const lo = v.lo, hi = v.hi, n = v.n || 4;
    const pcs = [];
    for (const i of chord.ints) { const pc = (chord.root + i) % 12; if (pcs.indexOf(pc) < 0) pcs.push(pc); }
    let best = null, bestScore = 1e9;
    for (let r = 0; r < pcs.length; r++) {
      const order = [];
      for (let i = 0; i < n; i++) order.push(pcs[(r + i) % pcs.length]);
      let cur = lo + ((order[0] - lo) % 12 + 12) % 12;
      const notes = [cur];
      for (let i = 1; i < n; i++) { let nx = cur + (((order[i] - cur) % 12) + 12) % 12; if (nx === cur) nx += 12; notes.push(nx); cur = nx; }
      while (notes[notes.length - 1] > hi && notes[0] - 12 >= lo - 2) for (let i = 0; i < notes.length; i++) notes[i] -= 12;
      const top = notes[notes.length - 1];
      let score = (top > hi ? (top - hi) * 3 : 0) + (notes[0] < lo - 2 ? 20 : 0);
      for (const i of chord.ints) if (i >= 12 && notes[0] % 12 === (chord.root + i) % 12) score += 12;      // composer fix v2.0: an extension (9th / 11th) is never the lowest voice
      for (let i = 1; i < notes.length; i++) {            // composer fix v2.0: no muddy clusters (adjacent semitones, minor 9ths, low seconds / 9ths) in the voicing
        const dv = notes[i] - notes[i - 1];
        if (dv === 1) score += notes[i - 1] < 72 ? 40 : 10; else if (dv === 13) score += 14; else if (dv === 14 && notes[i - 1] < 58) score += 6; else if (dv === 2 && notes[i - 1] < 55) score += 3;
      }
      if (prev) { for (let i = 0; i < Math.min(prev.length, notes.length); i++) score += Math.abs(notes[i] - prev[i]); }
      else score += Math.abs((notes[0] + top) / 2 - (lo + hi) / 2);
      if (score < bestScore) { bestScore = score; best = notes; }
    }
    if (v.open && best.length >= 4) { best = best.slice(); best[best.length - 2] -= 12; best.sort((a, b) => a - b); }
    return best;
  }

  // lane-bus keys (everything else in a lane config belongs to the instrument)
  const BUS_KEYS = ['vol', 'pan', 'rev', 'hall', 'spr', 'dly', 'duck', 'duckRel', 'lpf', 'lq', 'hpf', 'drive', 'crush', 'chorus', 'trem', 'vib', 'width', 'inst', 'fmt', 'slash'];
  const KIT_DEFAULT = {
    kick: { vol: 1.0 }, snare: { vol: 1.0, hall: 0.1 }, hats: { vol: 0.7 }, perc: { vol: 0.9 },
  };
  const DEFAULT_AUTO = { vol: 1, lpf: 20000, hpf: 10, rev: 0, hall: 0, spr: 0, dly: 0, pan: 0 };
  const AUTO_HZ = { lpf: 1, hpf: 1 };

  function parsePos(tok) { const m = /^(\d+(?:\.\d+)?)(b?)$/.exec(tok); return m ? Math.round(+m[1] * (m[2] ? STEPS_PER_BAR : 1)) : NaN; }

  function compileSong(name) {
    const def = songDefs()[name];
    const issues = [];
    const prog = {
      name, kind: def.kind || 'loop', bpm: def.bpm, swing: def.swing === undefined ? 0.5 : def.swing, echo: def.echo || 0, fb: def.fb === undefined ? DELAY_SEND_FB : def.fb,
      key: def.key, mode: def.mode, steps: 0, loopStart: 0, events: [], placeholder: !!def.placeholder, gain: def.gain === undefined ? 1 : def.gain,
      meta: { lead: [], notes: [], chords: [], issues, sections: [] },
      lift: def.lift || 0,                  // semitones added to every pitched voice on every second pass of a loop
      maxTempo: def.maxTempo || 0,          // cap for AUDIO.setTempo() on this track (0 = none)
      lanes: [], laneMap: {}, master: { lpf: false, hpf: false, vol: false }, autoKeys: new Set(),
      duckOn: def.duckOn || KIT_DUCK_DEFAULT, duckRel: def.duckRel === undefined ? 0.55 : def.duckRel,
    };
    // ---- declare lanes ----
    const declare = (ln, cfg) => {
      if (prog.laneMap[ln]) return prog.laneMap[ln];
      const base = Object.assign({}, KIT_DEFAULT[ln] || {}, cfg || {});
      if (!base.inst) base.inst = KIT_LANES.indexOf(ln) >= 0 ? 'kit' : (ln === 'fx' ? 'fx' : null);
      if (!base.inst || (base.inst !== 'kit' && !INST[base.inst])) { issues.push(name + ': lane "' + ln + '" has no valid instrument ("' + base.inst + '")'); base.inst = 'lead'; }
      const L = { name: ln, cfg: base, inst: base.inst, needs: {}, duckAny: !!base.duck, used: false };
      prog.lanes.push(L); prog.laneMap[ln] = L;
      return L;
    };
    for (const ln of Object.keys(def.lanes || {})) declare(ln, def.lanes[ln]);
    const laneOf = (ln, tag) => {
      if (prog.laneMap[ln]) return prog.laneMap[ln];
      if (KIT_LANES.indexOf(ln) >= 0 || ln === 'fx') return declare(ln, null);
      issues.push(tag + ': undeclared lane "' + ln + '"');
      return null;
    };
    const seq = (def.intro || []).concat(def.order);
    const loopIdx = (def.intro || []).length;
    let off = 0;
    seq.forEach((sn, i) => {
      if (i === loopIdx) prog.loopStart = off;
      const sec = def.sections[sn];
      if (!sec) { issues.push(name + ': unknown section "' + sn + '"'); return; }
      off += compileSection(prog, def, sec, sn, off, issues, laneOf);
    });
    prog.steps = off;
    finishSong(prog);
    return prog;
  }

  function addEv(prog, step, ev) {
    if (step < 0 || step >= 1e5) return;
    (prog.events[step] || (prog.events[step] = [])).push(ev);
  }

  /**
   * Compile one section.  FIXPLAN_V3 A8: a loop section may carry `alt: { p, mix, dbl, dblVel }` -- the SECOND-PASS version of the section (every odd pass of the loop: counter-melody,
   * octave doubling, fills, a different lane balance).  The section is compiled twice (the second time with the `alt` patterns / mix merged over the original ones) and the two event lists
   * are diffed per step: events that are identical stay unflagged (they sound in every pass), events only in the first version get `o: 0` (even passes only), events only in the second
   * `o: 1` (odd passes only) -- so drums, sidechain triggers, fx and the chord lanes need no special handling.  `dbl: { lane: semitones }` adds a transposed copy of that lane's
   * notes (velocity x dblVel, default 0.55) to the second version.  The first pass of a stage is always the original composition.  Only the lanes the alt version touches (its `p`
   * keys, `mix` keys and `dbl` sources; the drum grids + sidechain count as one unit) are recompiled and diffed, so a song with a few alt sections compiles ~1.5x as fast as a full double compile.
   */
  function compileSection(prog, def, sec, sn, off, issues, laneOf) {
    const mem0 = sec.alt && prog.voiceMem ? JSON.parse(JSON.stringify(prog.voiceMem)) : null;
    const steps = compileSectionOnce(prog, def, sec, sn, off, issues, laneOf);
    if (!sec.alt) return steps;
    if (prog.kind !== 'loop' || (def.intro || []).indexOf(sn) >= 0) { issues.push(prog.name + '.' + sn + ': alt only makes sense in a loop section (not in the intro / a jingle)'); return steps; }
    const A = sec.alt, tag = prog.name + '.' + sn + '.alt';
    for (const k of Object.keys(A)) if (['p', 'mix', 'dbl', 'dblVel'].indexOf(k) < 0) issues.push(tag + ': unknown key "' + k + '" (p mix dbl dblVel)');
    // shadow program: shares lanes / lane map / master flags, owns events, notes and the voice-leading memory
    const sh2 = Object.create(prog);
    sh2.events = []; sh2.meta = { lead: [], notes: [], chords: [], issues, sections: [] }; sh2.voiceMem = mem0 || {}; sh2.sectionsForReset = []; sh2.autoKeys = new Set();
    const sec2 = Object.assign({}, sec, { p: Object.assign({}, sec.p || {}, A.p || {}), mix: Object.assign({}, sec.mix || {}, A.mix || {}), alt: null });
    // scope: only the lanes (and the drum grids + sidechain as one 'drums' unit) the alt version touches are recompiled and diffed; a section-wide `mix: { all }` recompiles everything
    let only = new Set();
    for (const k of Object.keys(A.p || {})) only.add(k === 'drums' || k === 'drums2' || k === 'drums3' ? 'drums' : k);
    for (const k of Object.keys(A.mix || {})) { if (k === 'all') only = null; else if (only) only.add(k === 'drums' || KIT_LANES.indexOf(k) >= 0 ? 'drums' : k); }
    if (only) for (const k of Object.keys(A.dbl || {})) only.add(k);
    compileSectionOnce(sh2, def, sec2, sn, off, issues, laneOf, only);
    // doublings: dbl: { lead: 12 } (a transposed copy of the lane's notes) or { lead: { semi: -12, to: 'twang', vel: 0.6, bars: [1, 4] } } (other lane / bar range, 1-based, inclusive)
    for (const ln of Object.keys(A.dbl || {})) {
      const spec = typeof A.dbl[ln] === 'number' ? { semi: A.dbl[ln] } : (A.dbl[ln] || {});
      const semi = +spec.semi, to = spec.to || ln, vel = spec.vel === undefined ? (A.dblVel === undefined ? 0.55 : A.dblVel) : spec.vel;
      const Lt = laneOf(to, tag);
      if (!Lt || !Number.isFinite(semi) || !INST[Lt.inst] || !INST[Lt.inst].play) { issues.push(tag + '.dbl: bad lane / interval for "' + ln + '"'); continue; }
      Lt.used = true;
      const instT = INST[Lt.inst], cfgT = Object.assign({}, instT.d, Lt.cfg, (sec.cfg && sec.cfg[to]) || {});
      const b0 = spec.bars ? (spec.bars[0] - 1) * STEPS_PER_BAR : 0, b1 = spec.bars ? spec.bars[1] * STEPS_PER_BAR : steps;
      for (let s = off + b0; s < Math.min(off + steps, off + b1); s++) for (const e of (sh2.events[s] || []).slice()) {
        if (e.k !== 'n' || e.lane !== ln) continue;
        addEv(sh2, s, { k: 'n', lane: to, play: instT.play, n: e.n, m: e.m.map((x) => x + semi), vel: e.vel * vel, c: to === ln ? e.c : cfgT, dbl: 1 });
        for (const m of e.m) sh2.meta.notes.push({ s, n: e.n, m: m + semi, v: to });
      }
    }
    // diff the two versions per step
    const cfgKey = new Map(), keyOf = (e) => {
      switch (e.k) {
        case 'n': { let ck = cfgKey.get(e.c); if (ck === undefined) { ck = JSON.stringify(e.c); cfgKey.set(e.c, ck); } return 'n|' + e.lane + '|' + e.n + '|' + e.m.join(',') + '|' + e.vel.toFixed(4) + '|' + ck; }
        case 'd': return 'd|' + e.lane + '|' + (e.fn && e.fn.name) + '|' + e.vel.toFixed(4);
        case 'f': return 'f|' + e.lane + '|' + e.name + '|' + e.n + '|' + e.vel.toFixed(4);
        case 'u': return 'u|' + e.lane + '|' + e.depth.toFixed(4) + '|' + e.rel;
        default: return 'a|' + e.lane + '|' + e.p + '|' + e.v0 + '|' + e.v1;
      }
    };
    const inScope = !only ? () => true : (e) => (e.k === 'n' || e.k === 'f' ? only.has(e.lane) : (e.k === 'd' || e.k === 'u') && only.has('drums'));
    let nOdd = 0, nEven = 0;
    for (let s = off; s < off + steps; s++) {
      const base = (prog.events[s] || []).filter(inScope), alt = (sh2.events[s] || []).slice(), pool = new Map();
      for (const e of alt) { const k = keyOf(e); (pool.get(k) || pool.set(k, []).get(k)).push(e); }
      for (const e of base) {
        const list = pool.get(keyOf(e));
        if (list && list.length) list.pop(); else { e.o = 0; nEven++; }          // only in the original version: even passes
      }
      const left = new Set(); for (const list of pool.values()) for (const e of list) left.add(e);
      for (const e of alt) if (left.has(e)) { e.o = 1; nOdd++; (prog.events[s] || (prog.events[s] = [])).push(e); }   // only in the second version: odd passes
    }
    const seen = new Set(prog.meta.notes.map((x) => x.s + '|' + x.m + '|' + x.v));
    prog.meta.altNotes = (prog.meta.altNotes || []).concat(sh2.meta.notes.filter((x) => !seen.has(x.s + '|' + x.m + '|' + x.v)));
    (prog.meta.altSections || (prog.meta.altSections = [])).push({ name: sn, start: off, steps, odd: nOdd, even: nEven });
    if (!nOdd && !nEven) issues.push(tag + ': the alt version is identical to the original');
    return steps;
  }

  function compileSectionOnce(prog, def, sec, sn, off, issues, laneOf, only) {          // only: Set of lane names (+ 'drums') to compile -- the second-pass version of a section recompiles just what its `alt` touches
    const tag = prog.name + '.' + sn;
    const ch = parseChords(sec.chords, issues, tag + '.chords');
    const steps = ch.steps;
    ch.bars.forEach((b, i) => { if (b !== STEPS_PER_BAR && prog.kind !== 'jingle') issues.push(tag + '.chords: bar ' + (i + 1) + ' has ' + b + ' steps'); });
    prog.meta.sections.push({ name: sn, start: off, steps });
    for (const c of ch.list) prog.meta.chords.push({ s: off + c.s, n: c.n, root: c.root, ints: c.ints, name: c.name, bass: c.bass });
    const chordAt = (s) => { for (let i = ch.list.length - 1; i >= 0; i--) if (s >= ch.list[i].s) return ch.list[i]; return ch.list[0]; };
    const pats = Object.assign({}, def.pats || {}, sec.pats || {});
    const mixOf = (ln) => {
      let m = 1;
      const x = sec.mix || {};
      if (x[ln] !== undefined) m *= x[ln];
      if (x.all !== undefined) m *= x.all;
      if (KIT_LANES.indexOf(ln) >= 0 && x.drums !== undefined) m *= x.drums;
      return m;
    };
    const P = Object.assign({}, sec.p || {});
    if (sec.fx) P.fx = sec.fx;

    // ---------- pitched lanes ----------
    const DRUM_KEYS = ['drums', 'drums2', 'drums3'];            // drum grids: one hit per 16th per grid; extra grids LAYER (kick + hat on one step, snare + clap)
    const drumGrids = only && !only.has('drums') ? [] : DRUM_KEYS.filter((k) => P[k]).map((k) => [k, P[k]]);
    for (const k of DRUM_KEYS) delete P[k];
    for (const ln of Object.keys(P)) {
      if (only && !only.has(ln)) continue;
      const L = laneOf(ln, tag); if (!L) continue;
      L.used = true;
      if (L.inst === 'kit') { issues.push(tag + ': lane "' + ln + '" is a drum-kit lane -- write the grid into p.drums (or drums2 / drums3)'); continue; }
      const inst = INST[L.inst];
      const fmt = (L.cfg.fmt || (L.inst === 'kit' ? 'drums' : inst.fmt));
      const mx = mixOf(ln);
      const cfg = Object.assign({}, inst.d, L.cfg, (sec.cfg && sec.cfg[ln]) || {});
      const pre = /^\s*([nrc]):/.exec(P[ln]);
      const str = pre ? P[ln].slice(pre[0].length) : P[ln];
      const fm = pre ? { n: 'notes', r: 'rel', c: 'chord' }[pre[1]] : fmt;
      const play = inst.play;
      let evs = [];
      if (fm === 'fx') {
        for (const tok of String(str).split(/\s+/).filter(Boolean)) {
          const m = /^([a-z]+)@([0-9.]+b?)(?:\/([0-9.]+b?))?(?::([0-9.]+))?$/.exec(tok);
          if (!m || !FXV[m[1]]) { issues.push(tag + '.fx: bad token "' + tok + '"'); continue; }
          const s = parsePos(m[2]), n = m[3] ? parsePos(m[3]) : 4;
          if (!(s >= 0 && n > 0)) { issues.push(tag + '.fx: bad position in "' + tok + '"'); continue; }
          if (s >= steps) { issues.push(tag + '.fx: "' + tok + '" starts after the section'); continue; }
          if (mx > 0) addEv(prog, off + s, { k: 'f', lane: ln, name: m[1], n, vel: (m[4] ? +m[4] : 1) * mx });
        }
        continue;
      }
      if (fm === 'notes') {
        const nt = parseNotes(str, issues, tag + '.' + ln);
        nt.bars.forEach((b, i) => { if (ch.bars[i] !== undefined && b !== ch.bars[i]) issues.push(tag + '.' + ln + ': bar ' + (i + 1) + ' has ' + b + ' steps, chords have ' + ch.bars[i]); });
        if (nt.steps !== steps) issues.push(tag + '.' + ln + ': ' + nt.steps + ' steps vs chords ' + steps);
        evs = nt.ev.map((e) => ({ s: e.s, n: e.n, m: e.m, vel: e.vel }));
      } else if (fm === 'rel' || fm === 'chord') {
        const grid = buildGrid(str, pats, issues, tag + '.' + ln);
        if (!grid.length) { issues.push(tag + '.' + ln + ': empty pattern'); continue; }
        const v = cfg.voicing || { lo: 55, hi: 76, n: 4 };
        const lo = cfg.lo !== undefined ? cfg.lo : (inst.lo || 48);
        const slash = cfg.slash !== undefined ? cfg.slash : (fm === 'rel' && !!inst.mono && L.inst !== 'arp');
        let cur = null;
        const mem = prog.voiceMem || (prog.voiceMem = {});
        const flush = (endStep) => { if (cur) { cur.n = Math.max(1, endStep - cur.s); evs.push(cur); cur = null; } };
        const start = (s, tk, hold) => {
          const c = chordAt(s);
          let ms;
          if (fm === 'chord') { mem[ln] = voiceChord(c, v, mem[ln]); ms = mem[ln].slice(); }
          else {
            const off12 = symbolOffset(tk.c, c.ints);
            if (off12 === null || !Number.isFinite(off12)) { issues.push(tag + '.' + ln + ': bad symbol "' + tk.c + '"'); return; }
            const rootPc = slash && c.bass !== null && tk.c === '1' ? c.bass : c.root;
            ms = [rootMidi(rootPc, lo) + off12 + tk.oct];
          }
          cur = { s, n: 1, m: ms, vel: tk.acc, tk, chord: c };
        };
        for (let s = 0; s < steps; s++) {
          const tk = grid[Math.floor(s / STEPS_PER_BAR) % grid.length][s % STEPS_PER_BAR];
          const c = tk.c;
          if (c === '.') { flush(s); continue; }
          if (c === '-') {
            if (cur && chordAt(s) !== cur.chord) { const t0 = cur.tk; flush(s); start(s, t0); }   // a held note re-triggers on a chord change
            continue;
          }
          flush(s);
          if (fm === 'chord' && c !== 'x') { issues.push(tag + '.' + ln + ': bad chord-trigger "' + c + '" (use x - .)'); continue; }
          start(s, tk);
        }
        flush(steps);
      } else { issues.push(tag + '.' + ln + ': unknown pattern format "' + fm + '"'); continue; }
      evs.sort((a, b) => a.s - b.s);
      if (inst.mono) for (let i = 0; i + 1 < evs.length; i++) if (evs[i].s + evs[i].n > evs[i + 1].s) evs[i].n = Math.max(1, evs[i + 1].s - evs[i].s);
      for (const e of evs) {
        if (mx > 0) addEv(prog, off + e.s, { k: 'n', lane: ln, play, n: e.n, m: e.m, vel: e.vel * mx, c: cfg });
        for (const m of e.m) prog.meta.notes.push({ s: off + e.s, n: e.n, m, v: ln });
        if (fm === 'notes') prog.meta.lead.push({ s: off + e.s, n: e.n, m: e.m[0], lane: ln });
      }
    }

    // ---------- drums ----------
    const duckOn = sec.duckOn || prog.duckOn;
    const triggers = [];                            // steps that fire the sidechain
    for (const [dkey, drumsStr] of drumGrids) {
      const grid = buildGrid(drumsStr, pats, issues, tag + '.' + dkey);
      if (!grid.length) issues.push(tag + '.' + dkey + ': empty pattern');
      for (let s = 0; s < steps && grid.length; s++) {
        const tk = grid[Math.floor(s / STEPS_PER_BAR) % grid.length][s % STEPS_PER_BAR];
        let c = tk.c, vel = tk.acc;
        if (c === '.' || c === '-') continue;
        if (c === 'R') {                            // snare roll: velocity ramps up over the run of consecutive R steps
          let a = s, b = s;
          while (a > 0 && grid[Math.floor((a - 1) / STEPS_PER_BAR) % grid.length][(a - 1) % STEPS_PER_BAR].c === 'R') a--;
          while (b + 1 < steps && grid[Math.floor((b + 1) / STEPS_PER_BAR) % grid.length][(b + 1) % STEPS_PER_BAR].c === 'R') b++;
          vel *= 0.3 + 0.85 * ((s - a) / Math.max(1, b - a));
          c = 'S';
        }
        if (duckOn.indexOf(c) >= 0) triggers.push(s);
        if (c === 'q') continue;                    // silent sidechain trigger
        const k = KIT[c];
        if (!k) { issues.push(tag + '.' + dkey + ': unknown drum char "' + c + '"'); continue; }
        const L = laneOf(k[0], tag); if (!L) continue;
        L.used = true;
        const mx = mixOf(k[0]);
        if (mx > 0) addEv(prog, off + s, { k: 'd', lane: k[0], fn: k[1], vel: vel * mx });
      }
    }
    // ---------- sidechain ----------
    const dk = sec.duck;
    for (const L of only && !only.has('drums') ? [] : prog.lanes) {
      if (L.inst === 'kit') continue;
      let depth = L.cfg.duck || 0;
      if (dk === false) depth = 0;
      else if (typeof dk === 'number') depth *= dk;
      else if (dk && typeof dk === 'object') { if (dk[L.name] !== undefined) depth = dk[L.name] === false ? 0 : +dk[L.name]; else if (dk.all !== undefined) depth *= dk.all; }
      if (depth > 0) {
        L.duckAny = true;
        for (const s of triggers) addEv(prog, off + s, { k: 'u', lane: L.name, depth: Math.min(0.97, depth), rel: L.cfg.duckRel === undefined ? prog.duckRel : L.cfg.duckRel });
      }
    }
    // ---------- automation ----------
    for (const key of only ? [] : Object.keys(sec.auto || {})) {
      const [ln, param] = key.split('.');
      const targets = ln === 'master' ? ['master'] : ln === 'drums' ? KIT_LANES : [ln];
      for (const tn of targets) {
        let L = null;
        if (tn === 'master') {
          if (['lpf', 'hpf', 'vol'].indexOf(param) < 0) { issues.push(tag + '.auto: master has no param "' + param + '"'); continue; }
          prog.master[param] = true;
        } else {
          L = laneOf(tn, tag + '.auto'); if (!L) continue;
          if (!(param in DEFAULT_AUTO)) { issues.push(tag + '.auto: unknown param "' + param + '" (vol lpf hpf rev hall spr dly pan)'); continue; }
          L.needs[param] = true;
        }
        prog.autoKeys.add(tn + '.' + param);
        const spec = sec.auto[key], hz = !!AUTO_HZ[param];
        const bp = autoCurve(spec, hz, steps, issues, tag + '.auto.' + key);
        if (!bp) continue;
        for (let s = 0; s < steps; s++) addEv(prog, off + s, { k: 'a', lane: tn, p: param, v0: bp(s), v1: bp(s + 1) });
      }
    }
    // params automated in ANOTHER section but not here fall back to their lane default at the section start (finishSong)
    if (!only) (prog.sectionsForReset || (prog.sectionsForReset = [])).push({ off, steps, have: new Set(Object.keys(sec.auto || {})) });
    return steps;
  }

  /** automation spec -> function(step) -> value.  [v0, v1, curve?, startBar?, endBar?] or [[bar, v], ...] */
  function autoCurve(spec, hz, steps, issues, tag) {
    if (!Array.isArray(spec) || spec.length < 2) { issues.push(tag + ': bad automation spec'); return null; }
    let pts;
    let curve = hz ? 'exp' : 'lin';
    if (Array.isArray(spec[0])) pts = spec.map(([b, v]) => [b * STEPS_PER_BAR, v]);
    else {
      if (typeof spec[2] === 'string') curve = spec[2];
      const sb = isNum(spec[3]) ? spec[3] * STEPS_PER_BAR : 0, eb = isNum(spec[4]) ? spec[4] * STEPS_PER_BAR : steps;
      pts = [[sb, spec[0]], [Math.max(sb + 1, eb), spec[1]]];
    }
    const ease = (x) => (curve === 'in' ? x * x : curve === 'out' ? 1 - (1 - x) * (1 - x) : x);
    return (s) => {
      if (s <= pts[0][0]) return pts[0][1];
      for (let i = 1; i < pts.length; i++) {
        if (s <= pts[i][0]) {
          const [a, va] = pts[i - 1], [b, vb] = pts[i], x = ease((s - a) / (b - a));
          return hz && va > 0 && vb > 0 ? va * Math.pow(vb / va, x) : va + (vb - va) * x;
        }
      }
      return pts[pts.length - 1][1];
    };
  }

  /** after all sections are compiled: baseline resets for params that are automated somewhere in the song */
  function finishSong(prog) {
    for (const key of prog.autoKeys) {
      const [tn, param] = key.split('.');
      const L = tn === 'master' ? null : prog.laneMap[tn];
      const dflt = tn === 'master' ? (param === 'vol' ? 1 : DEFAULT_AUTO[param]) : (L.cfg[param] !== undefined ? L.cfg[param] : DEFAULT_AUTO[param]);
      for (const sr of prog.sectionsForReset) {
        const done = sr.have.has(key) || (KIT_LANES.indexOf(tn) >= 0 && sr.have.has('drums.' + param));
        if (!done) addEv(prog, sr.off, { k: 'a', lane: tn, p: param, v0: dflt, v1: dflt });
      }
    }
    delete prog.sectionsForReset;
    prog.autoKeys = null;
    // estimate: highest number of simultaneously sounding source nodes (lint / budget)
    let peak = 0;
    for (const par of [0, 1]) {                       // even / odd loop pass (a section's `alt` version only sounds on odd passes)
      const ends = [];
      for (let s = 0; s < prog.steps; s++) {
        for (let i = ends.length - 1; i >= 0; i--) if (ends[i][0] <= s) ends.splice(i, 1);
        for (const e of prog.events[s] || []) {
          if (e.o !== undefined && e.o !== par) continue;
          if (e.k === 'n') { const L = prog.laneMap[e.lane], inst = INST[L.inst]; ends.push([s + e.n + 2, inst.src ? inst.src(e.c, e.m.length) : 2]); }
          else if (e.k === 'd') ends.push([s + 2, 3]);
          else if (e.k === 'f') ends.push([s + e.n + 1, 4]);
        }
        const tot = ends.reduce((a, b) => a + b[1], 0);
        if (tot > peak) peak = tot;
      }
    }
    prog.peakSources = peak;
  }

  // ================================================================================================
  // SONGS (v2.0, composed): title "Neon Abyss", stage1 "Sunken Pulse", stage2 "Iron Tide", boss "Crown of the Deep", entry "Midnight Diner", ending "Return of the Light",
  //   jingles start / extend / gameover / clear_boss.  Each song carries its own chord chart, form map and hook (note names) in the comment above its definition; the same
  //   information is in out/v2/audio/tracklist.md.  Authored in out/v2/audio/songs/*.js and spliced between the COMPOSER markers below by out/v2/audio/compose_assemble.mjs.
  //   Keep the names, bpm, key and the K7 length of `start` (<= 2.4 s).  See the NOTATION block in the file header.
  // ================================================================================================
  const MINOR = [0, 2, 3, 5, 7, 8, 10], MAJOR = [0, 2, 4, 5, 7, 9, 11];
  const PICK_CHORUS = { rate: 0.38, depth: 0.003, base: 0.015, mix: 0.75 };
  let defsCache = null;
  function songDefs() {
    if (defsCache) return defsCache;
    const D = {};

    // <<COMPOSER:BEGIN>> (authored in out/v2/audio/songs/*.js, spliced by out/v2/audio/compose_assemble.mjs)
    // ---- composer helpers: plain string builders for the notation documented in the file header -------------------------------------------
    const hold = (bars) => 'x' + '-'.repeat(16 * bars - 1);      // ONE chord trigger that sustains `bars` bars (it re-triggers by itself on every chord change)
    const rest = (bars) => '.'.repeat(16 * (bars === undefined ? 1 : bars));      // `bars` bars of rest (grid lanes)
    const rep = (s, n) => Array(n).fill(s).join(' ');             // n copies of a bar cell / bar of notes
    const cells = (...a) => a.join(' ');                          // bar cells in order
    const NN12 = ['c', 'c#', 'd', 'd#', 'e', 'f', 'f#', 'g', 'g#', 'a', 'a#', 'b'];
    const tr = (str, semi) => str.replace(/\b([a-g])([#b]?)(\d)\b/g, (m, l, a, o) => {      // transpose every note name of a note string by `semi` semitones
      const midi = 12 * (+o + 1) + { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 }[l] + (a === '#' ? 1 : a === 'b' ? -1 : 0) + semi;
      return NN12[((midi % 12) + 12) % 12] + (Math.floor(midi / 12) - 1);
    });

    // ============================================================================================================================================
    // STAGE 1 "Sunken Pulse"  (rounds 1-15)   122 bpm   E minor   80 bars = intro 8 (once) + loop 72   ~ 2:37 per pass, loop 2:22
    //
    //   Concept: a sonar ping in a dark, cold sea.  Dark wave machinery (chorus pick bass, cold pulse arp, gated snares) in the verses, EDM builds and
    //   side-chained supersaw drops, a dreamy twang/choir breakdown in the light of a distant vent, and a light industrial edge (metal hats, clangs,
    //   crushed snares, a distorted riff bass) that grows toward drop 2.  Everything is built on "pings" (the repeated high E of the hook).
    //
    //   FORM MAP (bars)          chords (one bar each unless dotted)                                   what enters / leaves
    //   I   intro      8  once   Em9 Em9 Cmaj7 Cmaj7 Am9 Am9 B7sus B7sus                               pad swell, 8th arp fades in, ghost-kick pump (q), bell pings 1..3,
    //                                                                                                   choir + sub + soft kick + hats from bar 5, reverse swell + riser into V
    //   V   verse     16  A: Em9 Em9 Cmaj7 Cmaj7 Am9 Am9 B7sus B7b9                                  machine kick + gated snare + 8th hats, chorus pick bass (8ths), cold arp,
    //                      B: Em9 Gmaj7 Cmaj7 Am9.B7sus Em9 Gmaj7 Am9 B7b9                              twang verse tune (A low and sparse, B higher), choir joins in B, 16th hats in B
    //   B1  build      8  Am9 Am9 Cmaj7 Cmaj7 Gmaj7 Gmaj7 B7sus B7sus                                 EDM kick 4/4, supersaw stabs under a rising lpf, master hp-sweep, riser,
    //                                                                                                   snare roll bars 5-8, everything cuts for the last beat
    //   D1  drop      16  Em Cmaj7 Am9 B7sus.B7b9 (x2) | Em Cmaj7 G D Am9 Bm7 Cmaj7 B7b9             impact; sidechained supersaw + 808 sub + pick bass + clap; HOOK (lead pings) x2,
    //                                                                                                   answer phrase (falling) bars 9-12, rising ladder bars 13-15, down-sweep bar 16
    //   K   breakdown  8  Em9 Cmaj7 Gmaj9 D6 Em9 Cmaj7 Am9 B7sus.B7b9                                 no kick (heartbeat pulse only), choir + pad + glassy arp, twang tune,
    //                                                                                                   reverse swell on the last bar
    //   B2  build      8  Cmaj7 Am9 Cmaj7 Am9 Gmaj7 Bm7 B7sus B7sus                                   like B1 but darker and harder: 16th hats earlier, clangs, distorted riff from bar 5,
    //                                                                                                   two-bar snare roll
    //   D2  drop      16  Em Cmaj7 Am9 B7sus.B7b9 (x2) | Am9 Cmaj7 Gmaj7 D6 Am9 Cmaj7 B7sus B7b9      hook doubled by the twang an octave lower, metal hats, crushed snares, riff + sub;
    //                                                                                                   bars 9-12 HALF-TIME (snare on 3, chugging riff) under the singing second hook,
    //                                                                                                   bars 13-16 full drive again, fill into the verse
    //
    //   HOOK (lead saw, over Em | Cmaj7 | Am9 | B7sus.B7b9):  bar1  E5 . E5 . E5 G5 B5---   (three "pings", then up a minor third twice, long B)
    //                                                          bar2  D5 . D5 . D5 E5 G5---
    //                                                          bar3  E5 . E5 . E5 A5 C6---   bar4  B5 A5 G5 F#5 D#5 (falls into the dominant)
    //   SECOND HOOK (drop 2, bars 9-16): A5 C6 E6--- | D6 C6 B5--- | G5 B5 D6 F#6 | E6 D6 A5--- ... a slow singing line against the half-time riff.
    //   VERSE TUNE (twang):  E4 G4 B4 A4 G4 E4 | G4 C5 E5 D5 C5 B4(maj7) | A4 C5 E5 B4 A4 E4 | E5 F#5 A5 G5 F#5 D#5.
    //   Bass: the chorus pick bass SINGS in the verse (8th-note lines through the chord: E E E E' D B G B, E E B E G B D B ...), rolls 8ths in the drops, 808 sub on the off-beats,
    //   distorted riff gallop in B2 / D2; the choir joins the singing second hook (D2 bars 9-16).
    //   Mix intent (section loudness): I -23, V -20, B1 -19, D1 -16, K -24, B2 -19, D2 -15 LUFS (quiet verse / loud drop contrast, spread >= 6 dB).
    // ============================================================================================================================================
    // the twang line of drop 2, bars 1-8 (the hook an octave under the lead) -- shared by the original and the second-pass version of D2
    const s1d2tw = `| e4/1 r/1 e4/1 r/1 e4/2 g4/2 b4/8 | d4/1 r/1 d4/1 r/1 d4/2 e4/2 g4/8 | e4/1 r/1 e4/1 r/1 e4/2 a4/2 c5/8 | b4/4 a4/4 g4/2 f#4/2 d#4/4 |
                    | e4/1 r/1 e4/1 r/1 e4/2 g4/2 b4/4 d5/4 | d4/1 r/1 d4/1 r/1 d4/2 e4/2 g4/4 c5/4 | e4/1 r/1 e4/1 r/1 e4/2 a4/2 c5/4 e5/4 | f#5/4 e5/4 d#5/4 b4/4 |`;
    D.stage1 = {
      bpm: 122, swing: 0.5, echo: 3, fb: 0.38, key: 4, mode: MINOR, gain: 1.222, duckRel: 0.55,
      lanes: {
        pad: { inst: 'pad', vol: 0.5, hall: 0.35, duck: 0.5 },
        choir: { inst: 'choir', vol: 0.6, hall: 0.55, vib: [5.2, 14], duck: 0.35 },
        super: { inst: 'super', vol: 0.85, hall: 0.22, duck: 0.75, lpf: 8500 },
        stab: { inst: 'stab', vol: 0.5, hall: 0.2, duck: 0.7, spread: 22 },
        arp: { inst: 'arp', vol: 0.3, dly: 0.4, hall: 0.15, pan: -0.25, hpf: 300, duck: 0.5 },
        bass: { inst: 'pick', vol: 0.78, chorus: PICK_CHORUS, duck: 0.45 },
        sub: { inst: 'sub', vol: 0.55, drive: 2.5, duck: 0.92, lpf: 700 },
        riff: { inst: 'riff', vol: 0.7, drive: 7, lpf: 3600, lq: 0.8, duck: 0.4 },
        twang: { inst: 'twang', vol: 0.95, trem: { rate: 4.6, depth: 0.5 }, spr: 0.4, hall: 0.3, dly: 0.3, hpf: 150 },
        lead: { inst: 'lead', vol: 1.5, dly: 0.34, hall: 0.25, hpf: 220 },
        bell: { inst: 'bell', vol: 0.55, hall: 0.5, dly: 0.25 },
        fx: { inst: 'fx', vol: 0.45, hall: 0.3 },
        kick: { vol: 1.2, drive: 1.6 }, snare: { vol: 0.5, hall: 0.12 }, hats: { vol: 0.4 }, perc: { vol: 0.3 },
      },
      pats: {
        // drums: kick+snare grid (drums), hats (drums2), extras (drums3).  One hit per step per grid, grids layer.
        vg: 'k...s...k.k.s...', vgf: 'k...s...k.k.s.ss',                         // verse groove / with the ghost-snare fill
        hh8: "h,.h'.h,.h'.h,.h'.h,.h'.", hh16: "h'h,h,h,h'h,h,h,h'h,h,h,h'h,h,h,",  // 8th hats (accented off-beats) / 16ths
        pf: '..........t.u.v.',                                                  // tom fill on the last beat
        f4: 'K...K...K...K...', bk: 'K...p...K...p...', bkf: 'K...p...K...p.pp', bky: 'K...p...K...p.yy',  // EDM four-on-floor / drop groove (kick + clap) / with a fill
        off: '..o...o...o...o.', mh: 'm,m,m,m,m,m,m,m,m,m,m,m,m,m,m,m,',          // off-beat open hat / metallic 16ths
        mhc: 'cm,m,m,m,m,m,m,m,m,m,m,m,m,m,m,',                                // metallic 16ths with a crash on the downbeat
        mhc8: 'c.m.m.m.m.m.m.m.', st2: '......x.......x.',
        mhk8: 'm.m.K.m.m.m.K.m.', mhck8: 'c.m.K.m.m.m.K.m.', mhf: 'm.m.K.m.m.m.t.uv',                           // FIXPLAN_V3 A7: the same metallic 8ths with a kick on beats 2 and 4 (drops are four-on-the-floor; the kick lane / sidechain trigger from any grid)                          // metallic 8ths with a crash / two off-beat stabs per bar (CPU budget: the 16ths are kept for builds and fills)
        // bass
        b8: '1-1-1-1-1-1-1-1-', b8o: '1-1-1-1-1-1-8-1-', b8f: '1-1-1-1-1-8-7-5-',
        off808: '..1-..1-..1-..1-',
        // melodic chorus-bass lines (80s dark wave: the bass sings): 1 root, 3 / 5 / 7 chord tones, 8 octave
        m1: '1-1-1-8-7-5-3-5-', m2: '1-1-5-1-3-5-7-5-', m3: '1-1-8-1-5-1-3-5-', m4: '1-1-1-1-3-5-7-8-',
        // riff (distorted saw bass): 16th chugs
        ht: 'K.....K.S.......', ht2: 'K.....K.S.....SS', mh8: 'm.m.m.m.m.m.m.m.',
        rf1: "1'.11.1..1'.11.1..", rf2: "1'.11.1.1'.11.1.1.", rf3: "1'..1...1'.1.1....",
      },
      sections: {
        // ------------------------------------------------------------------------------------------------ INTRO (8 bars, once)
        I: {
          chords: '| Em9 | Em9 | Cmaj7 | Cmaj7 | Am9 | Am9 | B7sus | B7sus |',
          p: {
            pad: hold(8),
            choir: rest(4) + hold(4),
            arp: 'arp8*8',
            bell: `| r/16 | r/16 | e6/2 r/14 | r/16 | e6/2 r/2 e6/2 r/10 | r/16 | e6/2 r/2 e6/2 r/2 e6/2 r/6 | r/16 |`,
            sub: 'root*8',
            drums: cells(rep('q...q...q...q...', 4), rep('k.......k.......', 3), 'k.......k.k.s.s.'),
            drums2: cells(rest(4), rep('..h...h...h...h.', 3), '..h...h...h.hhhh'),
            fx: 'swell@4b/4b riser@6b/2b',
          },
          mix: { choir: 0.75, sub: 0.6, pad: 2.0, all: 0.8 },
          auto: { 'arp.vol': [0.14, 0.3] },
        },
        // ------------------------------------------------------------------------------------------------ VERSE (16 bars)
        V: {
          chords: '| Em9 | Em9 | Cmaj7 | Cmaj7 | Am9 | Am9 | B7sus | B7b9 | Em9 | Gmaj7 | Cmaj7 | Am9.B7sus | Em9 | Gmaj7 | Am9 | B7b9 |',
          p: {
            pad: hold(16),
            choir: rest(8) + hold(8),
            bass: cells('m1 m2 m1 m2 m1 m2 m1 m4', 'm3 m2 m3 m2 m3 m2 m3 m4'),
            arp: 'arp8*16',
            twang: `| r/2 e4/4 g4/4 b4/6 | a4/4 g4/4 e4/8 | r/2 g4/4 c5/4 e5/6 | d5/4 c5/4 b4/8 | r/2 a4/4 c5/4 e5/6 | b4/4 a4/4 e4/8 | e5/8 f#5/4 a5/4 | g5/4 f#5/4 d#5/8 |
                    | b4/6 e5/2 g5/4 b5/4 | a5/4 g5/4 f#5/8 | e5/6 d5/2 c5/4 e5/4 | c5/4 e5/4 f#5/4 b4/4 | g5/6 e5/2 b4/4 e5/4 | d5/4 g5/4 b5/8 | c6/4 b5/4 a5/4 e5/4 | d#5/6 f#5/2 a5/4 c6/4 |`,
            drums: 'vg*3 vgf vg*3 vgf vg*3 vgf vg*3 vgf',
            drums2: cells('hh8*8', 'hh16*8'),
            drums3: 'none*3 pf none*3 pf none*3 pf none*3 pf',
            fx: 'impact@0:0.5 down@15b/1b',
          },
          mix: { arp: 0.9, snare: 0.5, perc: 0.5, twang: 0.8, all: 0.7 },
          // SECOND PASS (A8): a soft bell counter-line answers the verse tune (bars 1-8), the choir and the 16th hats come in four bars earlier, the arp runs 16ths in the last four bars
          alt: {
            p: {
              bell: `| r/8 g5/2, b5/2, e6/4, | b5/6, g5/2, e5/8, | r/8 e5/2, g5/2, b5/4, | g5/6, e5/2, r/8 | r/8 a5/2, c6/2, e6/4, | e6/6, c6/2, a5/8, | r/8 f#5/2, a5/2, b5/4, | a5/6, f#5/2, d#5/8, |
                      | r/16 | r/16 | r/16 | r/16 | r/16 | r/16 | r/16 | r/16 |`,
              choir: rest(4) + hold(12),
              drums2: cells('hh8*4', 'hh16*12'),
              arp: cells('arp8*12', 'arp16*4'),
            },
          },
        },
        // ------------------------------------------------------------------------------------------------ BUILD 1 (8 bars)
        B1: {
          chords: '| Am9 | Am9 | Cmaj7 | Cmaj7 | Gmaj7 | Gmaj7 | B7sus | B7sus |',
          p: {
            pad: hold(8),
            super: 'stab*7 ..x...x...x.....',
            bass: cells('b8 b8o b8 b8o oct8 oct8 oct8', '1-1-1-1-........'),
            arp: cells('arp8*4', 'arp16*3', '1358a853........'),
            drums: cells('f4*6', 'K.K.K.K.K.K.K.K.', rest(1)),
            drums2: cells('..h...h...h...h.*2', 'hh8*2', "S,...S,...S...S...", "S.S.S.S.S'.S'.S'.S'.", 'RRRRRRRRRRRRRRRR', 'RRRRRRRRRRRR....'),
            fx: 'riser@0/124 swell@4b/3b',
          },
          mix: { super: 0.85, snare: 0.6 },
          auto: { 'super.lpf': [500, 9000, 'exp'], 'master.hpf': [[0, 20], [2, 20], [7.75, 600], [7.8125, 10]], 'arp.vol': [0.08, 0.18], 'master.vol': [0.8, 1.0, 'in'] },
          // SECOND PASS (A8): the build already carries the distorted riff and the clangs of build 2 (bars 5-8)
          alt: {
            p: {
              riff: cells(rest(4), 'rf1 rf2 rf1', 'rf3'),
              drums3: cells('................', '................', '..........x.....', '................', '..X...x...X...x.', 'x...x...x...x...', 'zzzzzzzz........', '................'),
            },
          },
        },
        // ------------------------------------------------------------------------------------------------ DROP 1 (16 bars)
        D1: {
          chords: '| Em | Cmaj7 | Am9 | B7sus.B7b9 | Em | Cmaj7 | Am9 | B7sus.B7b9 | Em | Cmaj7 | G | D | Am9 | Bm7 | Cmaj7 | B7b9 |',
          p: {
            super: hold(16),
            bass: cells('pump*3 b8f', 'pump*3 b8f', 'pump*3 b8f', 'pump*3 1-1-1-1-........'),
            sub: cells('root*4', 'off808*12'),
            arp: cells('arp8*8', 'arp16*7', '1358a853........'),
            lead: `| e5/1 r/1 e5/1 r/1 e5/2 g5/2 b5/8 | d5/1 r/1 d5/1 r/1 d5/2 e5/2 g5/8 | e5/1 r/1 e5/1 r/1 e5/2 a5/2 c6/8 | b5/4 a5/4 g5/2 f#5/2 d#5/4 |
                    | e5/1 r/1 e5/1 r/1 e5/2 g5/2 b5/4 d6/4 | d5/1 r/1 d5/1 r/1 d5/2 e5/2 g5/4 c6/4 | e5/1 r/1 e5/1 r/1 e5/2 a5/2 c6/4 e6/4 | f#6/4 e6/4 d#6/4 b5/4 |
                    | e6/1 r/1 e6/1 r/1 e6/2 d6/2 b5/8 | c6/1 r/1 c6/1 r/1 c6/2 b5/2 g5/8 | d6/1 r/1 d6/1 r/1 d6/2 b5/2 g5/8 | a5/1 r/1 a5/1 r/1 a5/2 f#5/2 d5/8 |
                    | e5/1 r/1 e5/1 r/1 e5/2 a5/2 c6/8 | f#5/1 r/1 f#5/1 r/1 f#5/2 b5/2 d6/8 | g5/1 r/1 g5/1 r/1 g5/2 c6/2 e6/8 | f#6/4 d#6/4 b5/4 r/4 |`,
            drums: cells('bk*3 bkf', 'bk*3 bkf', 'bk*3 bkf', 'bk*3 K...p...K.......'),
            drums2: cells(rep('off', 15), 'RRRRRRRR........'),
            drums3: cells('mhck8', 'mhk8*7', 'mhck8', 'mhk8*6', 'mh8'),        // A7: kicks on 2 and 4 (every bar but the roll bar 16)
            fx: 'impact@0 swell@7b/1b down@15b/1b',
          },
          mix: { arp: 1.6 },                                                 // A5: the cold arp stays audible in the drops (+4 dB)
          // SECOND PASS (A8): the first hook statement is doubled an octave up, a soft twang tenor line moves under the second statement and the last phrase, tom fills close bars 4 / 8 / 12
          alt: {
            dbl: { lead: { semi: 12, bars: [1, 4], vel: 0.5 } },
            p: {
              twang: `| r/16 | r/16 | r/16 | r/16 | e4/8, g4/8, | g4/8, e4/8, | e4/8, c5/8, | f#4/8, d#4/8, | r/16 | r/16 | r/16 | r/16 | a4/8, c5/8, | b4/8, d5/8, | e4/8, g4/8, | f#4/8, d#4/8, |`,
              drums3: cells('mhck8', 'mhk8*2', 'mhf', 'mhk8*3', 'mhf', 'mhck8', 'mhk8*2', 'mhf', 'mhk8*3', 'mh8'),
            },
          },
        },
        // ------------------------------------------------------------------------------------------------ BREAKDOWN (8 bars)
        K: {
          chords: '| Em9 | Cmaj7 | Gmaj9 | D6 | Em9 | Cmaj7 | Am9 | B7sus.B7b9 |',
          p: {
            pad: hold(8),
            choir: hold(8),
            arp: 'arp8*8',
            twang: `| b4/6 e5/2 g5/8 | e5/6 d5/2 c5/8 | d5/6 g5/2 b5/8 | a5/6 f#5/2 d5/8 | b4/4 e5/4 g5/4 a5/4 | b5/6 g5/2 e5/8 | c6/6 b5/2 a5/8 | e5/4 f#5/4 g5/4 f#5/4 |`,
            bell: `| r/16 | r/16 | e6/4 r/12 | r/16 | r/16 | r/16 | r/8 e6/4 r/4 | b5/2 r/14 |`,
            drums: 'q...q...q...q...*8',
            fx: 'down@0/1b swell@7b/1b',
          },
          mix: { drums: 0, arp: 0.55, pad: 1.1, choir: 1.0, all: 0.55 },
          duck: 0.45,
          cfg: { arp: { cut: 4200, d: 0.3, s: 0.1 } },
        },
        // ------------------------------------------------------------------------------------------------ BUILD 2 (8 bars)
        B2: {
          chords: '| Cmaj7 | Am9 | Cmaj7 | Am9 | Gmaj7 | Bm7 | B7sus | B7sus |',
          p: {
            pad: hold(8),
            super: 'stab*7 ..x...x...x.....',
            bass: cells('b8o*4', rest(4)),
            riff: cells(rest(4), 'rf1 rf2 rf1', 'rf3'),
            arp: cells('arp16*7', '1358a853........'),
            drums: cells('f4*6', 'K.K.K.K.K.K.K.K.', rest(1)),
            drums2: cells('hh16*2', "hh16*2", "S,...S,...S...S...", "S.S.S.S.S'.S'.S'.S'.", 'RRRRRRRRRRRRRRRR', 'RRRRRRRRRRRR....'),
            drums3: cells('..........x.....', '................', '..........x...X.', '................', '..X...x...X...x.', 'x...x...x...x...', 'zzzzzzzz........', '................'),
            fx: 'riser@0/124 swell@3b/4b',
          },
          mix: { super: 0.85, riff: 0.8, snare: 0.6 },
          auto: { 'super.lpf': [400, 9000, 'exp'], 'master.hpf': [[0, 20], [2, 20], [7.75, 1200], [7.8125, 10]], 'arp.vol': [0.09, 0.2], 'pad.hall': [0.35, 0.85], 'master.vol': [0.75, 1.0, 'in'] },
        },
        // ------------------------------------------------------------------------------------------------ DROP 2 (16 bars)
        D2: {
          chords: '| Em | Cmaj7 | Am9 | B7sus.B7b9 | Em | Cmaj7 | Am9 | B7sus.B7b9 | Am9 | Cmaj7 | Gmaj7 | D6 | Am9 | Cmaj7 | B7sus | B7b9 |',
          p: {
            super: hold(16),
            choir: rest(8) + hold(8),
            stab: cells(rest(12), 'st2*4'),
            bass: cells('pump*3 b8f', 'pump*3 b8f', rest(4), 'pump*3 1-1-1-1-........'),
            riff: cells(rest(4), 'rf1 rf2 rf1 rf3', 'rf1 rf2 rf1 rf3', 'rf1 rf2 rf1 rf3'),
            sub: cells('root*4', 'off808*4', 'root*4', 'off808*4'),
            arp: cells('arp8*8', rest(4), 'arp8*3', '1358a853........'),
            lead: `| e5/1 r/1 e5/1 r/1 e5/2 g5/2 b5/8 | d5/1 r/1 d5/1 r/1 d5/2 e5/2 g5/8 | e5/1 r/1 e5/1 r/1 e5/2 a5/2 c6/8 | b5/4 a5/4 g5/2 f#5/2 d#5/4 |
                    | e6/1 r/1 e6/1 r/1 e6/2 g6/2 b6/4 g6/4 | d6/1 r/1 d6/1 r/1 d6/2 e6/2 g6/4 e6/4 | e6/1 r/1 e6/1 r/1 e6/2 a6/2 c7/4 a6/4 | f#6/4 e6/4 d#6/4 b5/4 |
                    | a5/4 c6/4 e6/8 | d6/6 c6/2 b5/8 | g5/4 b5/4 d6/4 f#6/4 | e6/6 d6/2 a5/8 |
                    | a5/4 c6/4 e6/4 g6/4 | e6/6 d6/2 c6/8 | b5/4 e6/4 f#6/8 | g6/4 f#6/4 d#6/4 b5/4 |`,
            twang: `${s1d2tw} | r/16 | r/16 | r/16 | r/16 | r/16 | r/16 | r/16 | r/16 |`,
            drums: cells('bk*3 bky', 'bk*3 bky', 'ht*3 ht2', 'bk*3 K...p...RRRRRRRR'),
            drums2: cells('off*8', 'mh8*4', 'off*4'),
            drums3: cells('mhck8', 'mhk8*7', 'mhc8', 'mh8*3', 'mhk8*3', 'mh8'),   // A7: four-on-the-floor in bars 1-8 and 13-15; the half-time bars 9-12 and the roll bar 16 keep their feel
            fx: 'impact@0 impact@8b:0.7 swell@15b/1b',
          },
          mix: { twang: 0.55, choir: 0.8, arp: 1.6 },
          cfg: { super: { n: 7, spread: 24 }, lead: { cut: 4600 } },
          // SECOND PASS (A8): hook statement 1 doubled an octave up, a twang tenor counter-line under the singing second hook (bars 9-16), tom fills at bars 4 / 8
          alt: {
            dbl: { lead: { semi: 12, bars: [1, 4], vel: 0.5 } },
            p: {
              twang: `${s1d2tw} | a4/8, c5/8, | g4/8, e5/8, | d5/8, b4/8, | f#4/8, a4/8, | c5/8, e5/8, | g4/8, c5/8, | f#4/8, a4/8, | d#5/8, f#5/8, |`,
              drums3: cells('mhck8', 'mhk8*2', 'mhf', 'mhk8*3', 'mhf', 'mhc8', 'mh8*3', 'mhk8*3', 'mh8'),
            },
          },
        },
      },
      intro: ['I'],
      order: ['V', 'B1', 'D1', 'K', 'B2', 'D2'],
    };

    // ============================================================================================================================================
    // TITLE "Neon Abyss"   92 bpm   D minor   36 bars = intro 4 (once) + loop 32   ~ 1:34 per pass, loop 1:23
    //
    //   Concept: a lonely synth-noir theme under neon lights.  The first 10 s are pure cold noir atmosphere (a cold pad that opens up, a tremolo twang line
    //   with spring reverb, finger snaps); then the beat and the chorus bass walk in under the same tune (A), the tune is promoted to a big saw lead over
    //   a side-chained supersaw pad (B, the "hook"), a distorted half-time industrial bridge (C, nu-metal weight, metal clangs) and a final chorus (B').
    //
    //   FORM MAP (bars)          chords                                                                 what enters / leaves
    //   I   intro      4  once   Dm9 Bbmaj7 Gm9 A7sus.A7                                                pad (opening filter), choir bars 3-4, twang states the tune, snaps from bar 3
    //   A   verse + tune 8       Dm9 Bbmaj7 Gm9 A7sus.A7 | Dm9 Bbmaj7 Gm9 Em7b5.A7                     machine kick + gated snare + snaps + 8th hats, chorus pick bass, cold arp, twang tune
    //   B   hook       8         Bbmaj7 Fmaj7 Gm9 Dm9 | Bbmaj7 Fmaj7 Gm9.Em7b5 A7                      EDM kick + clap, sidechained supersaw, 808 sub, pick bass, LEAD hook, choir
    //   C   bridge     8         Dm Dm Bbmaj7 Bbmaj7 Gm7 Gm7 A7sus A7                                   half-time: distorted riff with b2 (Eb) bite, clangs, boom kick, crushed snare, choir + twang
    //   B'  final hook 8         as B                                                                   everything + twang doubles the lead one octave down, bell sparkle, snare roll out
    //
    //   HOOK A (twang, bars 1-4 of the verse):  A4  F5. E5 D5  |  Bb4 G5. F5 D5  |  D5 Bb5. A5 G5  |  E5. D5 C#5 E5      (up a minor 6th, sigh down; sequence a 4th higher in bar 3)
    //   HOOK B (lead, the chorus):  D5 F5 A5 G5 F5 | E5 A5 C6 A5 G5 | D5 G5 Bb5 A5 G5 | F5 A5 D6 C6 A5     every bar in a 3-3-2-4-4 rhythm: tresillo "run-up" then two falling steps
    //   Bass: a singing chorus pick bass in the verse (D D D D' C A F A ...: dark-wave melodic bass), rolling 8ths + 808 sub in the hook, riff chugs (with the Eb b2) in the bridge.
    //   Mix intent (section loudness): I -25, A -20, B -16, C -17, B' -15 LUFS.
    // ============================================================================================================================================
    D.title = {
      bpm: 92, swing: 0.5, echo: 3, fb: 0.4, key: 2, mode: MINOR, gain: 1.102, duckRel: 0.6,
      lanes: {
        pad: { inst: 'pad', vol: 0.55, hall: 0.4, duck: 0.4 },
        choir: { inst: 'choir', vol: 0.6, hall: 0.55, vib: [5.2, 14], duck: 0.3 },
        super: { inst: 'super', vol: 0.9, hall: 0.3, duck: 0.7, lpf: 7500 },
        twang: { inst: 'twang', vol: 0.95, trem: { rate: 4.4, depth: 0.55 }, spr: 0.45, hall: 0.3, dly: 0.28, hpf: 140 },
        lead: { inst: 'lead', vol: 1.1, dly: 0.35, hall: 0.3, hpf: 200 },
        bass: { inst: 'pick', vol: 0.78, chorus: PICK_CHORUS, duck: 0.4 },
        riff: { inst: 'riff', vol: 0.7, drive: 7, lpf: 3600, lq: 0.8, duck: 0.3 },
        sub: { inst: 'sub', vol: 0.55, drive: 2.5, duck: 0.92, lpf: 700 },
        arp: { inst: 'arp', vol: 0.3, dly: 0.45, hall: 0.2, pan: 0.2, hpf: 250, duck: 0.4 },
        bell: { inst: 'bell', vol: 0.55, hall: 0.55, dly: 0.25 },
        fx: { inst: 'fx', vol: 0.45, hall: 0.35 },
        kick: { vol: 1.2, drive: 1.5 }, snare: { vol: 0.5, hall: 0.12 }, hats: { vol: 0.4 }, perc: { vol: 0.35 },
      },
      pats: {
        vg: 'k...s...k.k.s...', vgf: 'k...s...k.k.s.nn', vgs: 'k...s...k.k.....',      // verse groove / ghost-snare fill / open last beat (before the hook)
        sn: '....f.......f...', pf: '..........t.u.v.',                                  // snaps on 2 and 4 / tom fill
        hh8: "h,.h'.h,.h'.h,.h'.h,.h'.",
        bg: 'K...s...K...s...', bgf: 'K...s...K...s.ss', cl: '....p.......p...', oh: '..o...o...o...o.', ohk: '..o.K.o...o.K.o.', ohf: '..o.K.o...o.t.uv',   // ohk: A7, open hats with the beat-2 / beat-4 kick
        ht: 'K.....b.y.......', ht2: 'K.....b.y.....yy', hx: '..x.......x.....',     // half-time bridge: kick, boom, crushed snare, clangs
        b8: '1-1-1-1-1-1-1-1-', b8o: '1-1-1-1-1-1-8-1-', b8f: '1-1-1-1-1-8-7-5-',
        pump: '1-1-8-1-1-1-8-1-', off808: '..1-..1-..1-..1-',
        // melodic chorus-bass lines (80s dark wave: the bass sings): 1 root, 3 / 5 / 7 chord tones, 8 octave
        m1: '1-1-1-8-7-5-3-5-', m2: '1-1-5-1-3-5-7-5-', m3: '1-1-8-1-5-1-3-5-', m4: '1-1-1-1-3-5-7-8-',

        // riff: 1 root, f = b2 (Eb), 3 = F, 5 = A, g = b6 (Bb)
        r1: "1'..1.1.1...1.f..", r2: "1'..1.1.1...1.1..", r3: "1'..1.1.1.1.1.5.f", r4: "1'..1.g.1'..1.1...",
        arp1: '1.3.5.8.a.8.5.3.',
      },
      sections: {
        // ------------------------------------------------------------------------------------------------ INTRO (4 bars, once): the noir opening
        I: {
          chords: '| Dm9 | Bbmaj7 | Gm9 | A7sus.A7 |',
          p: {
            pad: hold(4),
            choir: rest(2) + hold(2),
            twang: `| a4/4 f5/6 e5/2 d5/4 | bb4/4 g5/6 f5/2 d5/4 | d5/4 bb5/6 a5/2 g5/4 | e5/6 d5/2 c#5/4 e5/4 |`,
            bell: `| r/16 | r/16 | r/16 | r/8 a6/2 r/6 |`,
            drums: cells(rest(2), 'sn*2'),
            fx: 'swell@2b/2b',
          },
          mix: { choir: 0.8, drums: 1.2, pad: 1.4, all: 0.8 },
        },
        // ------------------------------------------------------------------------------------------------ A: beat + chorus bass join, the tune on the twang
        A: {
          chords: '| Dm9 | Bbmaj7 | Gm9 | A7sus.A7 | Dm9 | Bbmaj7 | Gm9 | Em7b5.A7 |',
          p: {
            pad: hold(8),
            choir: rest(4) + hold(4),
            bass: cells('m1 m2 m1 m4', 'm1 m2 m3 m4'),
            arp: cells(rest(2), 'arp1*6'),
            twang: `| a4/4 f5/6 e5/2 d5/4 | bb4/4 g5/6 f5/2 d5/4 | d5/4 bb5/6 a5/2 g5/4 | e5/6 d5/2 c#5/4 e5/4 | a4/4 f5/6 e5/2 f5/4 | bb4/4 g5/6 f5/2 a5/4 | bb5/4 a5/6 g5/2 d5/4 | g5/4 e5/4 c#5/4 a4/4 |`,
            drums: 'vg*3 vgf vg*3 vgs',
            drums2: 'hh8*8',
            drums3: cells('sn*3', 'pf', 'sn*3', '..........t.u.vv'),
            fx: 'swell@7b/1b',
          },
          mix: { choir: 0.8, arp: 0.8, all: 0.75 },
          auto: { 'arp.vol': [0.15, 0.32, 'lin', 0, 8] },
          // SECOND PASS (A8): the choir holds the whole section and a soft bell counter-line answers the second tune statement (bars 5-8)
          alt: {
            p: {
              choir: hold(8),
              bell: `| r/16 | r/16 | r/16 | r/16 | r/8 a5/2, d6/2, f6/4, | r/8 f5/2, a5/2, d6/4, | r/12 d6/2, g6/2, | g5/4, d6/4, c#6/4, e6/4, |`,
            },
          },
        },
        // ------------------------------------------------------------------------------------------------ B: the hook (lead), supersaw pump
        B: {
          chords: '| Bbmaj7 | Fmaj7 | Gm9 | Dm9 | Bbmaj7 | Fmaj7 | Gm9.Em7b5 | A7 |',
          p: {
            super: hold(8),
            choir: hold(8),
            bass: cells('pump*3 b8f', 'pump*3 b8o'),
            sub: cells('root*4', 'off808*4'),
            arp: 'arp1*8',
            lead: `| d5/3 f5/3 a5/2 g5/4 f5/4 | e5/3 a5/3 c6/2 a5/4 g5/4 | d5/3 g5/3 bb5/2 a5/4 g5/4 | f5/3 a5/3 d6/2 c6/4 a5/4 |
                    | d5/3 f5/3 a5/2 g5/4 f5/4 | e5/3 a5/3 c6/2 e6/4 d6/4 | d6/4 bb5/4 g5/4 e5/4 | c#6/4 a5/8 r/4 |`,
            bell: `| r/16 | r/16 | r/16 | r/12 a6/2 r/2 | r/16 | r/16 | r/16 | r/12 e6/2 r/2 |`,
            drums: cells('bg*3 bgf', 'bg*3 K...s...RRRRRRRR'),
            drums2: 'cl*8',
            drums3: cells('ohk*7', 'oh'),
            fx: 'impact@0 down@7b/1b',
          },
          mix: { arp: 2.0 },                                                 // A5: the cold arp stays audible in the hook (+6 dB)
          // SECOND PASS (A8): the hook is doubled by a plucked twang an octave below (as in the final hook), a tom fill closes bar 4
          alt: { dbl: { lead: { semi: -12, to: 'twang', vel: 1.4 } }, p: { drums3: cells('ohk*3', 'ohf', 'ohk*3', 'oh') } },
        },
        // ------------------------------------------------------------------------------------------------ C: half-time industrial bridge
        C: {
          chords: '| Dm | Dm | Bbmaj7 | Bbmaj7 | Gm7 | Gm7 | A7sus | A7 |',
          p: {
            pad: hold(8),
            choir: hold(8),
            sub: 'root*8',
            riff: cells('r1 r2 r2 r2', 'r3 r4 r1 r3'),
            twang: `| a3/6 f4/2 e4/4 d4/4 | a3/6 f4/2 e4/4 f4/4 | bb3/6 g4/2 f4/4 d4/4 | bb3/6 g4/2 f4/4 a4/4 | d4/6 bb4/2 a4/4 g4/4 | d4/6 bb4/2 a4/4 bb4/4 | e4/8 d4/8 | c#4/8 e4/4 a4/4 |`,
            drums: cells('ht*3 ht2', 'ht*3 K...b...RRRRRRRR'),
            drums2: 'hx*8',
            drums3: cells(rest(3), '..........z.z.z.', rest(3), '..z...z...z...zz'),
            fx: 'impact@0 swell@7b/1b',
          },
          mix: { choir: 1.1, all: 0.9 },
          duck: 0.5,
        },
        // ------------------------------------------------------------------------------------------------ B': final hook
        Bf: {
          chords: '| Bbmaj7 | Fmaj7 | Gm9 | Dm9 | Bbmaj7 | Fmaj7 | Gm9.Em7b5 | A7 |',
          p: {
            super: hold(8),
            choir: hold(8),
            bass: cells('pump*3 b8f', 'pump*3 b8o'),
            sub: cells('off808*8'),
            arp: 'arp1*8',
            lead: `| d5/3 f5/3 a5/2 g5/4 f5/4 | e5/3 a5/3 c6/2 a5/4 g5/4 | d5/3 g5/3 bb5/2 a5/4 g5/4 | f5/3 a5/3 d6/2 c6/4 a5/4 |
                    | d6/3 f6/3 a6/2 g6/4 f6/4 | e6/3 a6/3 c7/2 a6/4 g6/4 | d6/4 bb5/4 g5/4 e5/4 | c#6/4 a5/4 e5/4 a4/4 |`,
            twang: `| d4/3 f4/3 a4/2 g4/4 f4/4 | e4/3 a4/3 c5/2 a4/4 g4/4 | d4/3 g4/3 bb4/2 a4/4 g4/4 | f4/3 a4/3 d5/2 c5/4 a4/4 |
                    | d4/3 f4/3 a4/2 g4/4 f4/4 | e4/3 a4/3 c5/2 e5/4 d5/4 | d5/4 bb4/4 g4/4 e4/4 | c#5/4 a4/8 r/4 |`,
            bell: `| r/16 | r/16 | r/16 | r/12 a6/2 r/2 | r/16 | r/16 | r/16 | r/12 e6/2 r/2 |`,
            drums: cells('bg*3 bgf', 'bg*3 K...s...RRRRRRRR'),
            drums2: cells('cl*7', '................'),
            drums3: cells('ohk*7', 'oh'),
            fx: 'impact@0 riser@6b/2b',
          },
          mix: { twang: 0.9, arp: 2.0 },
        },
      },
      intro: ['I'],
      order: ['A', 'B', 'C', 'Bf'],
    };

    // ============================================================================================================================================
    // STAGE 2 "Iron Tide"  (rounds 16-29)   126 bpm   C# minor / Phrygian b2   80 bars = intro 8 (once) + loop 72   ~ 2:32 per pass, loop 2:17
    //
    //   Concept: the tide turns to iron.  Heavier than stage 1: a distorted saw riff bass plays the tune's rhythm section, metal percussion (clangs, noise hits,
    //   metallic hats, crushed snares), hard supersaw drops and a HALF-TIME breakdown.  The colour is C# PHRYGIAN: the b2 (D) leans on the tonic everywhere
    //   (riff, lead, bII chord).  The hook is built on OFF-BEATS (stomping 8th stabs), the opposite of stage 1's on-beat ping run.
    //
    //   FORM MAP (bars)          chords                                                                     what enters / leaves
    //   I   intro      8  once   C#m C#m D D C#m C#m B5 B5                                                   drone pad, ghost-kick pump, clangs + noise hits, bell pings, riff from bar 5, riser
    //   A   verse     16         C#m C#m D C#m | C#m C#m D E | F#m F#m D D | A B5 G#7sus G#7              riff + sub, K / S groove with metal hats, cold saw arp, twang tune (bars 1-12);
    //                                                                                                       bars 13-16 = pre-drop BUILD (riser, hp-sweep, snare roll, everything cuts the last beat)
    //   C   drop 1    16         C#m D C#m B5 | C#m D A B5 | F#m D C#m B5 | A B5 G#7sus G#7              impact; sidechained supersaw + stabs, 808 sub, riff, K four-on-floor + S/clap, LEAD hook
    //   H   half-time  8         C#m C#m D D C#m C#m B5 G#7                                              HALF-TIME: boom kick, snare on 3, clangs, slow riff, choir, tremolo twang line; reverse swell
    //   V2  bridge     8         F#m F#m E E D D G#7sus G#7                                              the singing lead (long notes), riff in 8ths, K 4/4, rising arp; filter-sweep into build
    //   B2  build      8         A A B5 B5 F#m F#m G#7sus G#7sus                                         hats 16ths, clangs, noise hits, two-bar snare roll, riser + swell, everything cuts
    //   D2  drop 2    16         C#m D C#m B5 | C#m D A B5 | F#m D C#m B5 | A B5 G#7sus G#7              as C but harder: crushed snares, X clangs, twang doubles the lead, stab layer, extra riff
    //
    //   HOOK (lead, over C#m | D | C#m | B5):  offbeat 8ths "  . C# . C# E D C#- " = C#5 C#5 E5 D5 C#5   |  D5 D5 F#5 E5 D5   |  C#5 E5 G#5 B5 G#5 E5  |  F#5 D5 B4
    //   second half (C#m | D | A | B5):  C#5 C#5 E5 G#5 B5-  |  A5 A5 F#5 E5 D5-  |  C#6 B5 A5 E5  |  F#5 E5 D5-   (the final D5 = b2 resolves down into the C# of the next pass)
    //   RIFF (distorted saw, 3-3-2): C# . . C# . . C# . C# . . C# . . D .   (b2 on the last 16th of the bar), on D the last note is E.
    //   Mix intent (section loudness): I -23, A -18, C -15, H -19, V2 -19, B2 -17, D2 -14.5 LUFS.
    // ============================================================================================================================================
    // the twang line of drop 2, bars 1-8 (the hook an octave under the lead) -- shared by the original and the second-pass version of D2
    const s2d2tw = `| r/2 c#4/2 r/2 c#4/2 e4/2 d4/2 c#4/4 | r/2 d4/2 r/2 d4/2 f#4/2 e4/2 d4/4 | r/2 c#4/2 e4/2 g#4/2 b4/2 g#4/4 e4/2 | f#4/4 d4/4 b3/8 |
                    | r/2 c#4/2 r/2 c#4/2 e4/2 g#4/2 b4/4 | r/2 a4/2 r/2 a4/2 f#4/2 e4/2 d4/4 | c#5/4 b4/4 a4/4 e4/4 | f#4/4 e4/4 d4/8 |`;
    D.stage2 = {
      bpm: 126, swing: 0.5, echo: 3, fb: 0.36, key: 1, mode: [0, 1, 3, 5, 7, 8, 10], gain: 1.184, duckRel: 0.5,
      lanes: {
        riff: { inst: 'riff', vol: 1.5, drive: 7, lpf: 3800, lq: 0.8, duck: 0.3 },
        sub: { inst: 'sub', vol: 0.55, drive: 2.5, duck: 0.92, lpf: 700 },
        pad: { inst: 'pad', vol: 0.5, hall: 0.35, duck: 0.4, cut: 1100 },
        choir: { inst: 'choir', vol: 0.6, hall: 0.55, vib: [4.8, 16], vowel: 'oh', duck: 0.3 },
        super: { inst: 'super', vol: 1.0, hall: 0.2, duck: 0.75, lpf: 7000, spread: 24 },
        stab: { inst: 'stab', vol: 0.55, hall: 0.2, duck: 0.6, spread: 26, voicing: { lo: 55, hi: 79, n: 3 } },
        arp: { inst: 'arp', vol: 0.3, wave: 'sawtooth', dly: 0.35, hall: 0.15, pan: 0.25, hpf: 300, duck: 0.4 },
        lead: { inst: 'lead', vol: 1.1, drive: 2.5, dgain: 0.4, lpf: 5200, dly: 0.3, hall: 0.2, hpf: 200 },
        twang: { inst: 'twang', vol: 0.95, trem: { rate: 5.2, depth: 0.5 }, spr: 0.4, hall: 0.3, dly: 0.28, hpf: 140 },
        bell: { inst: 'bell', vol: 0.5, hall: 0.5, dly: 0.2 },
        fx: { inst: 'fx', vol: 0.45, hall: 0.3 },
        kick: { vol: 1.2, drive: 2 }, snare: { vol: 0.45, hall: 0.12 }, hats: { vol: 0.4 }, perc: { vol: 0.3 },
      },
      pats: {
        // drums.  grid 1 = kick + snare, grid 2 = metal hats, grid 3 = clangs / noise / extra
        vg: 'K...S.K.K...S...', vgf: 'K...S.K.K..KS.SS', vgo: 'K...S.K.K.......',      // verse groove / fill / open end
        mh: 'm.m.m.m.m.m.m.M.', mh8: 'm.m.m.m.m.m.m.m.', mq: '..m...m...m...m.',
        f4: 'K...K...K...K...', bk: 'K...S...K...S...', bkf: 'K...S...K...S.SS',        // four-on-floor / drop groove / fill
        cl: '....p.......p...', m16: "m,m,m,m,m,m,m,m,m,m,m,m,m,m,m,m,", m16c: 'cm,m,m,m,m,m,m,m,m,m,m,m,m,m,m,',
        ht: 'K.....b.S.......', ht2: 'K.....b.S.....SS', hx: '..x...........x.',        // half-time: kick, boom, snare on 3, clangs
        xb: 'x...............', xo: '........x.......', xX: 'x.......X.......', zz: '..............z.',
        k24: '....K.......K...', xbk: 'x...K.......K...', xXk: 'x...K...X...K...', xXf: 'x...K...X...t.uv', k24f: '....K.......t.uv',      // FIXPLAN_V3 A7: kicks on beats 2 and 4 (alone / under the clangs) = four-on-the-floor with the 'bk' kicks on 1 and 3
        // bass: 1 root, f = b2, 2 = 2nd, 3 = minor third, 5 = fifth, g = b6, 7 = b7
        rA: "1'..1..1'.1..1..f.", rB: "1'..1..1'.1..1..2.", rC: "1'..1..1'.1..1.5.f", rD: "1'.11.1.11'.11.1.1", rDc: "1'.11.1.11'.11....", rootc: '1-----------....',
        rH: '1.......1.1.f...', rH2: '1.......1.1.1.f.',
        r8: "1'-1-1-1'-1-1-1-1-",
        off808: '..1-..1-..1-..1-', pump: '1-1-8-1-1-1-8-1-',
        arp1: '1.3.5.8.a.8.5.3.', st2: '......x.......x.',
      },
      sections: {
        // ------------------------------------------------------------------------------------------------ INTRO (8 bars, once)
        I: {
          chords: '| C#m | C#m | D | D | C#m | C#m | B5 | B5 |',
          p: {
            pad: hold(8),
            choir: rest(4) + hold(4),
            riff: cells(rest(4), 'rA rA rB rB'),
            sub: 'root*8',
            arp: cells(rest(4), 'arp1*4'),
            bell: `| r/16 | r/8 c#6/2 r/6 | r/16 | r/8 d6/2 r/6 | r/16 | r/8 c#6/2 r/2 c#6/2 r/2 | r/16 | r/16 |`,
            drums: cells(rep('q...q...q...q...', 4), rep('K.......K.......', 3), 'K.......K.K.S.S.'),
            drums2: cells('mq*4', 'mh8*4'),
            drums3: cells('xb', rest(1), 'xo', 'xb', 'xb', 'xo', 'xX', 'zz'),
            fx: 'riser@4b/4b swell@6b/2b',
          },
          mix: { choir: 0.8, sub: 0.6, pad: 2.0, bell: 1.4, all: 0.8 },
          auto: { 'arp.vol': [0.12, 0.3, 'lin', 4, 8] },
        },
        // ------------------------------------------------------------------------------------------------ A: verse (12 bars) + pre-drop build (4 bars)
        A: {
          chords: '| C#m | C#m | D | C#m | C#m | C#m | D | E | F#m | F#m | D | D | A | B5 | G#7sus | G#7 |',
          p: {
            pad: hold(16),
            riff: cells('rA rA rB rA', 'rA rA rB rB', 'rA rA rB rB', 'rD rD rD rDc'),
            sub: cells('root*12', 'root*3', 'rootc'),
            arp: cells('arp1*12', 'arp1*4'),
            twang: `| r/2 g#4/2 c#5/6 d5/2 c#5/4 | e5/6 d5/2 c#5/8 | d5/4 f#5/4 a5/4 f#5/4 | g#4/4 b4/4 c#5/8 |
                    | r/2 g#4/2 c#5/6 d5/2 e5/4 | g#5/6 e5/2 c#5/8 | d5/4 a5/4 f#5/4 d5/4 | g#5/4 e5/4 b4/8 |
                    | f#5/6 c#5/2 a4/4 c#5/4 | a5/4 c#6/4 b5/4 a5/4 | a5/6 f#5/2 d5/8 | e5/4 f#5/4 a5/8 |
                    | r/16 | r/16 | r/16 | r/16 |`,
            drums: cells('vg*3 vgf', 'vg*3 vgf', 'vg*3 vgo', 'f4*2', "S,...S,...S...S...", 'RRRRRRRRRRRR....'),
            drums2: cells('mh*12', 'mh8*2', 'mh8*2'),
            drums3: cells(rep(rest(1), 3), 'zz', rest(3), 'zz', rest(3), 'zz', 'xb', rest(1), 'xX', rest(1)),
            fx: 'riser@12b/60 impact@0:0.5 swell@14b/2b',
          },
          mix: { arp: 0.8, snare: 0.7 },
          auto: { 'master.hpf': [[0, 20], [12, 20], [15.75, 600], [15.8125, 10]], 'master.vol': [[0, 0.6], [12, 0.6], [16, 1.0]] },
          // SECOND PASS (A8): a bell counter-line over the verse tune (bars 1-12)
          alt: {
            mix: { bell: 2.4 },
            p: {
              bell: `| r/12 g#5/2, c#6/2, | g#5/6, e5/2, c#5/8, | r/8 f#5/2, a5/2, d6/4, | g#5/6, e5/2, c#5/8, | r/12 g#5/2, c#6/2, | c#6/6, g#5/2, e5/8, | r/8 a5/2, d6/2, f#6/4, | g#5/6, e5/2, b4/8, |
                      | r/8 a5/2, c#6/2, f#6/4, | c#6/6, a5/2, f#5/8, | d6/8, a5/8, | f#5/8, a5/8, | r/16 | r/16 | r/16 | r/16 |`,
            },
          },
        },
        // ------------------------------------------------------------------------------------------------ C: drop 1 (16 bars)
        C: {
          chords: '| C#m | D | C#m | B5 | C#m | D | A | B5 | F#m | D | C#m | B5 | A | B5 | G#7sus | G#7 |',
          p: {
            super: hold(16),
            stab: cells(rest(4), 'st2*12'),
            pad: hold(16),
            riff: cells('rA rB rA rA', 'rA rB rC rB', 'rA rB rA rC', 'rA rB rD rD'),
            sub: cells('root*4', 'off808*12'),
            arp: cells('arp1*16'),
            lead: `| r/2 c#5/2 r/2 c#5/2 e5/2 d5/2 c#5/4 | r/2 d5/2 r/2 d5/2 f#5/2 e5/2 d5/4 | r/2 c#5/2 e5/2 g#5/2 b5/2 g#5/4 e5/2 | f#5/4 d5/4 b4/8 |
                    | r/2 c#5/2 r/2 c#5/2 e5/2 g#5/2 b5/4 | r/2 a5/2 r/2 a5/2 f#5/2 e5/2 d5/4 | c#6/4 b5/4 a5/4 e5/4 | f#5/4 e5/4 d5/8 |
                    | r/2 f#5/2 r/2 f#5/2 a5/2 g#5/2 f#5/4 | r/2 a5/2 r/2 a5/2 f#5/2 e5/2 d5/4 | r/2 c#6/2 r/2 c#6/2 e6/2 d6/2 c#6/4 | f#6/4 d6/4 b5/8 |
                    | c#6/4 e6/4 a6/8 | b6/4 f#6/4 d6/8 | g#6/6 f#6/2 d6/4 b5/4 | c#6/4 g#5/4 d#5/4 r/4 |`,
            drums: cells('bk*3 bkf', 'bk*3 bkf', 'bk*3 bkf', 'bk*3 K...S...RRRRRRRR'),
            drums2: cells('m16c', 'mh*5', 'm16*2', 'm16c', 'mh*5', 'm16*2'),
            drums3: cells(rep('k24', 3), 'xXk', rep('k24', 3), 'xXk', rep('k24', 3), 'xXk', rep('k24', 3), 'x.......X.z.z.z.'),
            fx: 'impact@0 swell@7b/1b impact@8b:0.6 down@15b/1b',
          },
          mix: { arp: 1.6 },                                                 // A5: the cold arp stays audible in the drops (+4 dB)
          // SECOND PASS (A8): the hook's first statement doubled an octave up, tom fills close bars 4 / 8 / 12
          alt: {
            dbl: { lead: { semi: 12, bars: [1, 4], vel: 0.5 } },
            p: { drums3: cells(rep('k24', 3), 'xXf', rep('k24', 3), 'xXf', rep('k24', 3), 'xXf', rep('k24', 3), 'x.......X.z.z.z.') },
          },
        },
        // ------------------------------------------------------------------------------------------------ H: half-time breakdown (8 bars)
        H: {
          chords: '| C#m | C#m | D | D | C#m | C#m | B5 | G#7 |',
          p: {
            pad: hold(8),
            choir: hold(8),
            riff: cells('rH rH2 rH rH2', 'rH rH2 rH rH2'),
            sub: 'root*8',
            twang: `| c#5/8 d5/4 c#5/4 | e5/8 d5/4 c#5/4 | d5/8 f#5/4 a5/4 | a5/6 f#5/2 d5/8 | c#5/8 e5/4 g#5/4 | b5/6 g#5/2 e5/8 | f#5/8 d5/4 b4/4 | d#5/6 f#5/2 g#5/4 d#5/4 |`,
            bell: `| c#6/2 r/14 | r/16 | d6/2 r/14 | r/16 | c#6/2 r/14 | r/16 | b5/2 r/14 | r/16 |`,
            drums: cells('ht*3 ht2', 'ht*3 K...b...RRRRRRRR'),
            drums2: 'hx*8',
            drums3: cells(rest(3), 'zz', rest(3), '..z...z...z...zz'),
            fx: 'impact@0 down@0/1b swell@7b/1b',
          },
          mix: { choir: 1.1, all: 0.45 },
          duck: 0.5,
        },
        // ------------------------------------------------------------------------------------------------ V2: singing bridge (8 bars)
        V2: {
          chords: '| F#m | F#m | E | E | D | D | G#7sus | G#7 |',
          p: {
            pad: hold(8),
            choir: hold(8),
            riff: cells('r8*8'),
            sub: 'root*8',
            arp: 'arp1*8',
            lead: `| f#5/6 a5/2 c#6/8 | b5/6 a5/2 f#5/8 | e5/6 g#5/2 b5/8 | c#6/6 b5/2 g#5/8 | d5/4 f#5/4 a5/8 | b5/6 a5/2 f#5/8 | g#5/4 c#6/4 d6/8 | b5/4 g#5/4 d#5/4 g#5/4 |`,
            drums: cells('f4*7', 'K...K...K...K.RR'),
            drums2: cells('mh8*7', 'mh8'),
            drums3: cells(rest(3), 'zz', rest(3), 'xX'),
            fx: 'swell@0/1b riser@4b/4b',
          },
          mix: { riff: 0.8, snare: 0.6, all: 0.6, arp: 1.6 },
          auto: { 'arp.vol': [0.2, 0.4], 'master.hpf': [20, 300, 'exp', 4, 8] },
          // SECOND PASS (A8): the singing line is doubled by the twang an octave below
          alt: { dbl: { lead: { semi: -12, to: 'twang', vel: 1.1 } } },
        },
        // ------------------------------------------------------------------------------------------------ B2: build (8 bars)
        B2: {
          chords: '| A | A | B5 | B5 | F#m | F#m | G#7sus | G#7sus |',
          p: {
            pad: hold(8),
            super: 'stab*7 ..x...x...x.....',
            riff: cells('rD*7', rest(1)),
            arp: cells('arp1*3', 'arp16*4', '1358a853........'),
            drums: cells('f4*6', 'K.K.K.K.K.K.K.K.', rest(1)),
            drums2: cells('mh*2', 'm16*2', "S,...S,...S...S...", "S.S.S.S.S'.S'.S'.S'.", 'RRRRRRRRRRRRRRRR', 'RRRRRRRRRRRR....'),
            drums3: cells('xb', rest(1), 'xo', rest(1), 'xX', 'x...x...x...x...', 'zzzzzzzz........', rest(1)),
            fx: 'riser@0/124 swell@4b/3b',
          },
          mix: { super: 0.85, snare: 0.6 },
          cfg: { super: { voicing: { lo: 55, hi: 79, n: 3 } } },
          auto: { 'super.lpf': [400, 9000, 'exp'], 'master.hpf': [[0, 20], [2, 20], [7.75, 1200], [7.8125, 10]], 'arp.vol': [0.09, 0.2], 'master.vol': [0.65, 1.0, 'in'] },
        },
        // ------------------------------------------------------------------------------------------------ D2: drop 2 (16 bars)
        D2: {
          chords: '| C#m | D | C#m | B5 | C#m | D | A | B5 | F#m | D | C#m | B5 | A | B5 | G#7sus | G#7 |',
          p: {
            super: hold(16),
            stab: cells('st2*16'),
            riff: cells('rA rB rC rB', 'rA rB rC rB', 'rA rB rA rC', 'rD rD rD rD'),
            sub: cells('off808*16'),
            arp: cells('arp1*16'),
            lead: `| r/2 c#5/2 r/2 c#5/2 e5/2 d5/2 c#5/4 | r/2 d5/2 r/2 d5/2 f#5/2 e5/2 d5/4 | r/2 c#5/2 e5/2 g#5/2 b5/2 g#5/4 e5/2 | f#5/4 d5/4 b4/8 |
                    | r/2 c#6/2 r/2 c#6/2 e6/2 d6/2 c#6/4 | r/2 d6/2 r/2 d6/2 f#6/2 e6/2 d6/4 | r/2 c#6/2 e6/2 g#6/2 b6/2 g#6/4 e6/2 | f#6/4 d6/4 b5/8 |
                    | r/2 f#5/2 r/2 f#5/2 a5/2 g#5/2 f#5/4 | r/2 a5/2 r/2 a5/2 f#5/2 e5/2 d5/4 | r/2 c#6/2 r/2 c#6/2 e6/2 d6/2 c#6/4 | f#6/4 d6/4 b5/8 |
                    | c#6/4 e6/4 a6/8 | b6/4 f#6/4 d6/8 | g#6/6 f#6/2 d6/4 b5/4 | c#6/4 g#5/4 d#5/4 r/4 |`,
            twang: `${s2d2tw} | r/16 | r/16 | r/16 | r/16 | r/16 | r/16 | r/16 | r/16 |`,
            drums: cells('bk*3 bkf', 'bk*3 bkf', 'bk*3 bkf', 'bk*3 K...S...RRRRRRRR'),
            drums2: cells('m16c', 'mh*5', 'm16*2', 'm16c', 'mh*5', 'm16*2'),
            drums3: cells(rep('xbk xXk', 7), 'xbk', 'x.......X.z.z.z.'),
            fx: 'impact@0 swell@7b/1b impact@8b:0.6 swell@15b/1b',
          },
          cfg: { super: { n: 7, spread: 28 } },
          mix: { arp: 1.6 },
          // SECOND PASS (A8): hook statement 1 doubled an octave up, a twang tenor counter-line under the second half (bars 9-16), tom fills at bars 4 / 8 / 12
          alt: {
            dbl: { lead: { semi: 12, bars: [1, 4], vel: 0.5 } },
            p: {
              twang: `${s2d2tw} | a4/8, c#5/8, | f#4/8, a4/8, | g#4/8, e4/8, | f#4/16, | e5/8, c#5/8, | f#5/8, b4/8, | r/16 | r/16 |`,
              drums3: cells('xbk xXk', 'xbk xXf', 'xbk xXk', 'xbk xXf', 'xbk xXk', 'xbk xXf', 'xbk xXk', 'xbk', 'x.......X.z.z.z.'),
            },
          },
        },
      },
      intro: ['I'],
      order: ['A', 'C', 'H', 'V2', 'B2', 'D2'],
    };

    // ============================================================================================================================================
    // BOSS "Crown of the Deep"   140 bpm   F minor (+ b2 Gb)   52 bars = intro 4 (once) + loop 48   ~ 1:34 per pass, loop 1:22 (1:11 at the 1.15 boss-hurry tempo)
    //
    //   Concept: the Kraken rises.  Aggressive industrial EDM: a KLAXON (the alarm lead trilling F / Gb in 16ths = the b2 neighbour) over a galloping distorted
    //   riff, double-time metal hats, a regal "crown" fanfare on a saw lead, a HALF-TIME drop (snare on 3, boom kick, slow chugs) and a final fury.
    //   Plays up to tempo x1.2 (maxTempo): every pattern is 16th-grid based and the delay is tempo-synced, so the hurry tempo only makes it faster.
    //
    //   FORM MAP (bars)           chords                                                                       what enters / leaves
    //   I   intro      4  once    Fm Fm Gb C7                                                                  pad, klaxon pings, riser, impact (the boss appears), snare roll
    //   A   alarm      8          Fm Fm Db C7 | Fm Fm Bbm C7                                                   gallop riff + sub, klaxon trills + wails, K / S metal groove, 16th metal hats, clangs
    //   B   crown      8          Fm Db Bbm C7 | Fm Db Eb C7                                                   CROWN HOOK (saw lead), sidechained supersaw, K 4/4 + S / clap, riff 8ths, arp
    //   C   half-time  8          Fm Fm Gb Gb | Fm Fm Eb Eb                                                    HALF-TIME DROP: boom kick, snare on 3, slow riff with b2, slow klaxon wails, noise hits
    //   D   break      4          Db Eb Fm C7sus                                                               kick out: choir + pad + bell pings + klaxon pings, reverse swell
    //   E   build      4          Bbm Bbm C7sus C7sus                                                          riser, hp-sweep, snare roll 16ths, everything cuts the last beat
    //   F   drop 2     8          Fm Db Bbm C7 | Fm Db Eb C7                                                   hook an octave up + riff gallop + stabs + crash, crushed snares
    //   G   fury       8          Fm Gb Fm Gb | Db Eb C7 C7                                                    klaxon trills + hook fragments + gallop, every bar a fill; C7 turns around into A
    //
    //   KLAXON (alarm lead):  F5 Gb5 F5 Gb5 F5 Gb5 F5 Gb5 C6--  (16th trill on the b2 neighbour, then a wailing fifth)
    //   CROWN HOOK (lead, over Fm | Db | Bbm | C7):  C5 F5 Ab5 C6-- | Bb5 Db6 F6 Eb6-- | Db6 Bb5 F5 Ab5-- | G5 Bb5 E6 C6     (a rising fanfare, a falling answer)
    //   Mix intent (section loudness): I -22, A -16, B -16, C -15, D -22, E -18, F -14.5, G -14.5 LUFS.
    // ============================================================================================================================================
    // klaxon ostinato cell: a b a c in 16ths (b = neighbour, c = the leap), one bar = 4 cells; kx2 = 2 cells (8 steps) + a tail of 8 steps
    const kx4 = (a, b, c) => rep(`${a}/1 ${b}/1 ${a}/1 ${c}/1`, 4);
    const kx2 = (a, b, c, tail) => rep(`${a}/1 ${b}/1 ${a}/1 ${c}/1`, 2) + ' ' + tail;
    D.boss = {
      bpm: 140, swing: 0.5, echo: 3, fb: 0.34, key: 5, mode: [0, 2, 3, 5, 7, 8, 10], gain: 0.985, maxTempo: 1.2, duckRel: 0.45,
      lanes: {
        riff: { inst: 'riff', vol: 1.4, drive: 9, lpf: 3600, lq: 0.8, duck: 0.3 },
        sub: { inst: 'sub', vol: 0.55, drive: 2.5, duck: 0.92, lpf: 700 },
        alarm: { inst: 'alarm', vol: 0.6, drive: 2, dgain: 0.4, lpf: 6000, dly: 0.25, hall: 0.2, hpf: 300 },
        lead: { inst: 'lead', vol: 1.2, dly: 0.3, hall: 0.25, hpf: 220 },
        super: { inst: 'super', vol: 1.0, hall: 0.2, duck: 0.75, lpf: 7500, spread: 26 },
        stab: { inst: 'stab', vol: 0.55, hall: 0.2, duck: 0.6, spread: 26, voicing: { lo: 55, hi: 79, n: 3 } },
        pad: { inst: 'pad', vol: 0.5, hall: 0.35, duck: 0.4, cut: 1100 },
        choir: { inst: 'choir', vol: 0.6, hall: 0.55, vib: [5, 16], vowel: 'oh', duck: 0.3 },
        arp: { inst: 'arp', vol: 0.28, wave: 'sawtooth', dly: 0.3, pan: -0.25, hpf: 350, duck: 0.4 },
        bell: { inst: 'bell', vol: 0.5, hall: 0.5, dly: 0.2 },
        twang: { inst: 'twang', vol: 0.95, trem: { rate: 5.2, depth: 0.5 }, spr: 0.4, hall: 0.3, dly: 0.28, hpf: 140 },
        fx: { inst: 'fx', vol: 0.45, hall: 0.3 },
        kick: { vol: 1.2, drive: 2.2 }, snare: { vol: 0.45, hall: 0.12 }, hats: { vol: 0.4 }, perc: { vol: 0.3 },
      },
      pats: {
        // drums
        ag: 'K...S..KK.K.S...', agf: 'K...S..KK.K.S.SS', ago: 'K...S..KK.K.....',      // alarm groove / fill / open
        f4: 'K...K...K...K...', bk: 'K...S...K...S...', bkf: 'K...S...K...S.SS',
        m16: "m,m,m,m,m,m,m,m,m,m,m,m,m,m,m,m,", m16a: "m'm,m,m,m'm,m,m,m'm,m,m,m'm,m,M,", m16c: 'cm,m,m,m,m,m,m,m,m,m,m,m,m,m,m,', mh8: 'm.m.m.m.m.m.m.m.',
        cl: '....p.......p...',
        ht: 'K.K...b.S.......', ht2: 'K.K...b.S.....SS', hx: '..x...X...x...x.',
        xb: 'x...............', xo: '........x.......', xX: 'x.......X.......', zz: '..............z.',
        k24: '....K.......K...', xXk: 'x...K...X...K...', xXf: 'x...K...X...t.uv',                         // FIXPLAN_V3 A7: kicks on beats 2 and 4 (four-on-the-floor in the drops)
        mhk: 'mhmhKhmhmhmhKhmh', mhf: 'mhmhKhmhmhmhtuvv', m16k: "m,m,m,m,K" + "m,m,m,m,m,m,m," + "K" + "m,m,m,",       // the double-time metal hats with the beat-2 / beat-4 kick in place of the hat
        // bass: 1 root, f = b2, 3 = minor third, 5, g = b6, 7 = b7
        gal: '1181118111811181', galf: '1181118111811f81', gal5: '1181118111811581',
        galx: '1.111.111.111.11', galxf: '1.111.111.111.1f', galx5: '1.111.111.111.15',            // the gallop with 12 notes per bar (1 . x x per beat): the 16th gallop above costs a third more CPU
        st2: '......x.......x.', arp8: '1.3.5.8.a.8.5.3.',
        rH: '1.......1.1.f...', rH2: '1.......1.1.1.f.', r8: "1'-1-1-1'-1-1-1-1-",
        rD: "1'.11.1.11'.11.1.1",
        off808: '..1-..1-..1-..1-', root2: '1-------1-------',
        arp1: '1358a853c8531358',
      },
      sections: {
        // ------------------------------------------------------------------------------------------------ INTRO (4 bars, once): the boss appears
        I: {
          chords: '| Fm | Fm | Gb | C7 |',
          p: {
            pad: hold(4),
            alarm: `| r/16 | r/8 c6/2 r/2 c6/2 r/2 | ${kx2('f5', 'gb5', 'c6', 'c6/8')} | ${kx4('f5', 'gb5', 'c6')} |`,
            sub: cells(rest(2), 'root', rest(1)),
            drums: cells(rep('q...q...q...q...', 2), 'K...K...K...K...', 'RRRRRRRRRRRRRRRR'),
            drums3: cells('xb', rest(1), 'xX', rest(1)),
            fx: 'riser@0/4b swell@3b/1b',
          },
          mix: { alarm: 0.9, all: 0.65 },
        },
        // ------------------------------------------------------------------------------------------------ A: alarm (8 bars)
        A: {
          chords: '| Fm | Fm | Db | C7 | Fm | Fm | Bbm | C7 |',
          p: {
            riff: cells('galx galxf galx galxf', 'galx galxf galx galx5'),
            sub: cells('root*8'),
            arp: cells(rest(4), 'arp1*4'),
            alarm: `| ${kx2('f5', 'gb5', 'c6', 'c6/8')} | ${kx2('f5', 'gb5', 'c6', 'ab5/4 c6/4')} | ${kx2('db6', 'c6', 'ab5', 'ab5/8')} | ${kx2('c6', 'db6', 'g5', 'g5/4 e5/4')} |
                    | ${kx2('f5', 'gb5', 'c6', 'c6/8')} | f5/2 ab5/2 c6/2 db6/2 c6/4 ab5/4 | ${kx2('bb5', 'c6', 'f5', 'f6/8')} | g5/4 bb5/4 e6/4 db6/4 |`,
            drums: cells('ag*3 agf', 'ag*3 agf'),
            drums2: cells('m16a*8'),
            drums3: cells('xb', rest(2), 'zz', 'xb', rest(2), 'zz'),
            fx: 'impact@0:0.6 swell@7b/1b',
          },
          mix: { arp: 0.8, all: 0.82 },
          // SECOND PASS (A8): the supersaw stabs and the choir join for the second half of the alarm
          alt: { mix: { stab: 3, choir: 1.2 }, p: { stab: cells(rest(4), 'stab*4'), choir: rest(4) + hold(4) } },
        },
        // ------------------------------------------------------------------------------------------------ B: crown (8 bars)
        B: {
          chords: '| Fm | Db | Bbm | C7 | Fm | Db | Eb | C7 |',
          p: {
            super: hold(8),
            pad: hold(8),
            riff: cells('r8*8'),
            sub: cells('root*4', 'off808*4'),
            arp: 'arp8*8',
            lead: `| c5/2 f5/2 ab5/4 c6/8 | bb5/2 db6/2 f6/4 eb6/8 | db6/2 bb5/2 f5/4 ab5/8 | g5/4 bb5/4 e6/4 c6/4 |
                    | c5/2 f5/2 ab5/4 c6/4 db6/4 | bb5/2 db6/2 f6/4 ab6/4 g6/4 | g5/2 bb5/2 eb6/4 g6/8 | e6/4 c6/4 bb5/4 g5/4 |`,
            drums: cells('bk*3 bkf', 'bk*3 K...S...RRRRRRRR'),
            drums2: cells('mhk*6', 'm16k', 'm16'),
            drums3: cells('cl*8'),
            fx: 'impact@0 swell@7b/1b',
          },
          mix: { arp: 1.6 },                                                 // A5: the cold arp stays audible in the drops (+4 dB)
          // SECOND PASS (A8): the crown hook is doubled by a plucked twang an octave below, a tom fill closes bar 4
          alt: { dbl: { lead: { semi: -12, to: 'twang', vel: 1.4 } }, p: { drums2: cells('mhk*3', 'mhf', 'mhk*2', 'm16k', 'm16') } },
        },
        // ------------------------------------------------------------------------------------------------ C: half-time drop (8 bars)
        C: {
          chords: '| Fm | Fm | Gb | Gb | Fm | Fm | Eb | Eb |',
          p: {
            pad: hold(8),
            riff: cells('rH rH2 rH rH2', 'rH rH2 rH rH2'),
            sub: 'root*8',
            alarm: `| f5/8 gb5/4 f5/4 | c6/12 r/4 | gb5/8 ab5/4 gb5/4 | db6/12 r/4 | f5/8 gb5/4 f5/4 | ab5/12 r/4 | g5/8 bb5/4 g5/4 | eb6/8 bb5/4 g5/4 |`,
            drums: cells('ht*3 ht2', 'ht*3 K...b...RRRRRRRR'),
            drums2: 'hx*8',
            drums3: cells(rest(3), 'zz', rest(3), '..z...z...z...zz'),
            fx: 'impact@0 swell@7b/1b',
          },
          mix: { alarm: 0.9 },
          duck: 0.5,
        },
        // ------------------------------------------------------------------------------------------------ D: break (4 bars)
        D: {
          chords: '| Db | Eb | Fm | C7sus |',
          p: {
            pad: hold(4),
            choir: hold(4),
            bell: `| f6/2 r/14 | g6/2 r/14 | ab6/2 r/2 f6/2 r/10 | c6/2 r/2 c6/2 r/2 c6/2 r/6 |`,
            alarm: `| r/16 | r/16 | r/16 | r/8 ${kx2('f5', 'gb5', 'c6', '').trim()} |`,
            drums: 'q...q...q...q...*4',
            fx: 'down@0/1b swell@3b/1b',
          },
          mix: { drums: 0, pad: 1.1, choir: 1.0, all: 0.6 },
          duck: 0.4,
        },
        // ------------------------------------------------------------------------------------------------ E: build (4 bars)
        E: {
          chords: '| Bbm | Bbm | C7sus | C7sus |',
          p: {
            pad: hold(4),
            super: 'stab*3 ..x...x...x.....',
            riff: cells('rD*3', rest(1)),
            arp: cells('arp1*3', '1358a853........'),
            drums: cells('f4*2', 'K.K.K.K.K.K.K.K.', rest(1)),
            drums2: cells('m16*2', 'RRRRRRRRRRRRRRRR', 'RRRRRRRRRRRR....'),
            drums3: cells('xb', 'xo', 'x...x...x...x...', 'zzzzzzzz........'),
            fx: 'riser@0/60 swell@2b/2b',
          },
          mix: { super: 0.85, snare: 0.6 },
          auto: { 'super.lpf': [400, 9000, 'exp'], 'master.hpf': [[0, 20], [1, 20], [3.75, 1200], [3.8125, 10]], 'arp.vol': [0.09, 0.2], 'master.vol': [0.72, 1.0, 'in'] },
        },
        // ------------------------------------------------------------------------------------------------ F: drop 2 (8 bars)
        F: {
          chords: '| Fm | Db | Bbm | C7 | Fm | Db | Eb | C7 |',
          p: {
            super: hold(8),
            stab: 'st2*8',
            riff: cells('galx galxf galx galxf', 'galx galxf galx galx5'),
            sub: cells('off808*8'),
            arp: 'arp8*8',
            lead: `| c5/2 f5/2 ab5/4 c6/8 | bb5/2 db6/2 f6/4 eb6/8 | db6/2 bb5/2 f5/4 ab5/8 | g5/4 bb5/4 e6/4 c6/4 |
                    | c5/2 f5/2 ab5/4 c6/4 db6/4 | bb5/2 db6/2 f6/4 ab6/4 g6/4 | g5/2 bb5/2 eb6/4 g6/8 | e6/2 g6/2 bb6/4 c7/8 |`,
            drums: cells('bk*3 bkf', 'bk*3 K...S...RRRRRRRR'),
            drums2: cells('m16c', 'mh*5', 'm16*2'),
            drums3: cells('k24', 'xXk', 'k24', 'xXk', 'k24', 'xXk', 'k24', 'x.......X.z.z.z.'),
            fx: 'impact@0 swell@7b/1b',
          },
          cfg: { super: { n: 7, spread: 28 } },
          mix: { arp: 1.6 },
          // SECOND PASS (A8): the choir crowns the second half, the hook doubles on the twang (octave below) there, tom fills at bars 4 / 6
          alt: {
            dbl: { lead: { semi: -12, to: 'twang', vel: 1.1, bars: [5, 8] } },
            p: {
              choir: rest(4) + hold(4),
              drums3: cells('k24', 'xXk', 'k24', 'xXf', 'k24', 'xXf', 'k24', 'x.......X.z.z.z.'),
            },
          },
        },
        // ------------------------------------------------------------------------------------------------ G: fury (8 bars)
        G: {
          chords: '| Fm | Gb | Fm | Gb | Db | Eb | C7 | C7 |',
          p: {
            super: hold(8),
            stab: 'st2*8',
            riff: cells('galx galxf galx galxf', 'galx galxf galx galx5'),
            sub: cells('off808*8'),
            arp: 'arp8*8',
            alarm: `| ${kx2('f5', 'gb5', 'c6', 'c6/8')} | ${kx2('gb5', 'ab5', 'db6', 'db6/8')} | ${kx2('f5', 'gb5', 'c6', 'c6/4 f6/4')} | ${kx2('gb5', 'ab5', 'db6', 'db6/4 gb6/4')} |
                    | r/16 | r/16 | r/16 | g5/2 bb5/2 e6/2 g6/2 c7/8 |`,
            lead: `| r/16 | r/16 | r/16 | r/16 | db6/2 bb5/2 f5/4 ab5/8 | eb6/2 g5/2 bb5/4 eb6/8 | e6/4 c6/4 bb5/4 g5/4 | r/16 |`,
            drums: cells('ag*3 agf', 'ag*3 K...S...RRRRRRRR'),
            drums2: cells('m16c', 'mh*5', 'm16*2'),
            drums3: cells('xb', rest(1), 'xX', rest(1), 'xb', rest(1), 'xX', 'x.......X.z.z.z.'),
            fx: 'impact@0 swell@7b/1b',
          },
          cfg: { super: { n: 7, spread: 30 }, alarm: { n: 1 } },
          mix: { arp: 1.6 },
        },
      },
      intro: ['I'],
      order: ['A', 'B', 'C', 'D', 'E', 'F', 'G'],
    };

    // ============================================================================================================================================
    // ENTRY "Midnight Diner"   76 bpm (swung 8ths)   A minor, maj7 colours   16 bars (one jazz chorus, AABA of 4 bars), loop ~ 50 s
    //
    //   Concept: the high-score screen as an all-night diner: a slow noir ballad.  Walking upright bass, a brushed snare on 2 and 4, a lazy swung ride, a vibraphone
    //   (with tremolo) singing a low-key tune, a dark pad, and a lonely tremolo-twang answering at the ends of the phrases (an all-original late-night mood).
    //   Deliberately quiet: no kick drum, no side-chain, no build.  Contrast to the arcade tracks is the point.
    //
    //   CHORD CHART (one bar each)
    //     A1  Am9    Ammaj7   Am7     D9                 (the minor-major seventh = the noir chord)
    //     A2  Gmaj7  Cmaj7#11 F#m7b5  B7b9               (down to the dominant of E)
    //     B   Em9    Em7      Am9     D9                 (the bridge: a step of light)
    //     A3  Fmaj7  Dm9      Bm7b5.E7b9   Am9           (iv - ii/o - V7 - i cadence home)
    //
    //   MAIN TUNE (vibes):  E5. C5 A4 E5 | G#5. E5 C5 (the maj7 on top) | A4 C5 E5 G5 | F#5. D5 C5 A4 ...     long-short-short-medium phrases, nothing hurried
    //   Walking bass: quarter notes, chord tones with chromatic approach to the next root (F#3 -> G3, B2 -> C3, C#3 -> D3 ...).
    //   Mix intent: one flat, quiet arc, section loudness within 2 dB (-18 LUFS integrated after the gain fit).
    // ============================================================================================================================================
    D.entry = {
      bpm: 76, swing: 0.6, echo: 3, fb: 0.32, key: 9, mode: MINOR, gain: 1.85,
      lanes: {
        pad: { inst: 'pad', vol: 0.5, hall: 0.4, cut: 1300 },
        vibes: { inst: 'vibes', vol: 1.0, trem: { rate: 5.2, depth: 0.35 }, hall: 0.35, dly: 0.2 },
        bass: { inst: 'wood', vol: 0.9, drive: 1.8, dgain: 0.2 },
        twang: { inst: 'twang', vol: 0.55, trem: { rate: 4.2, depth: 0.5 }, spr: 0.5, hall: 0.35, dly: 0.22, hpf: 140 },
        bell: { inst: 'bell', vol: 0.4, hall: 0.55 },
        snare: { vol: 0.7 }, hats: { vol: 0.5 }, perc: { vol: 0.5 },
      },
      pats: {
        br: '....B.......B...', brg: '....B.......B.n.',                     // brushed snare on 2 and 4 (+ a ghost brush)
        rd: 'd...d.d.d...d.d.', rdf: 'd...d.d.d...d.dd',                      // swung ride (1, 2, and-of-2, 3, 4, and-of-4)
        rm: '..........r.....', hp: '....h.......h...', sn: '....f,.......f,...', brr: '....B.......BnBn',    // rim click, foot hat on 2 and 4, finger snaps on 2 and 4 (second half; soft: the snap voice is x3.5 louder since FIXPLAN_V3 A6, in this quiet ballad they now sit ~6 dB above the rest)
      },
      sections: {
        E: {
          chords: '| Am9 | Ammaj7 | Am7 | D9 | Gmaj7 | Cmaj7#11 | F#m7b5 | B7b9 | Em9 | Em7 | Am9 | D9 | Fmaj7 | Dm9 | Bm7b5.E7b9 | Am9 |',
          p: {
            pad: hold(16),
            bass: `n: | a2/4 c3/4 e3/4 c3/4 | a2/4 e3/4 g#3/4 e3/4 | a2/4 c3/4 e3/4 g3/4 | d3/4 a2/4 c3/4 f#3/4 |
                      | g2/4 b2/4 d3/4 b2/4 | c3/4 g2/4 e3/4 f3/4 | f#2/4 a2/4 c3/4 a#2/4 | b2/4 d#3/4 f#3/4 d#3/4 |
                      | e2/4 g2/4 b2/4 g2/4 | e2/4 g2/4 b2/4 g#2/4 | a2/4 e3/4 c3/4 c#3/4 | d3/4 f#3/4 a3/4 f#3/4 |
                      | f2/4 a2/4 c3/4 e3/4 | d3/4 f3/4 a2/4 c3/4 | b2/4 f3/4 e2/4 g#2/4 | a2/4 c3/4 e3/4 a3/4 |`,
            vibes: `| e5/6 c5/2 a4/4 e5/4 | g#5/6 e5/2 c5/8 | a4/4 c5/4 e5/4 g5/4 | f#5/6 d5/2 c5/4 a4/4 |
                    | b4/6 d5/2 g5/8 | f#5/6 e5/2 c5/8 | a5/4 c6/4 e6/4 c6/4 | d#5/6 c5/2 b4/8 |
                    | g5/6 e5/2 b4/8 | d5/4 e5/4 g5/4 b5/4 | c6/6 a5/2 e5/8 | f#5/4 a5/4 c6/4 a5/4 |
                    | a5/6 g5/2 f5/8 | f5/4 a5/4 e5/4 d5/4 | d5/4 f5/4 g#5/4 b5/4 | a5/16 |`,
            twang: `| r/16 | r/16 | r/8 e4/4 a4/4 | r/16 | r/16 | r/16 | r/8 e4/4 f#4/4 | r/16 |
                    | r/16 | r/16 | r/8 c5/4 a4/4 | r/16 | r/16 | r/16 | r/16 | r/8 c5/6 a4/2 |`,
            bell: `| r/16 | r/16 | r/16 | r/16 | r/16 | r/16 | r/16 | r/12 e6/4 | r/16 | r/16 | r/16 | r/16 | r/16 | r/16 | r/16 | r/12 a6/4 |`,
            drums: cells('br*3 brg', 'br*3 brg', 'br*3 brg', 'br*3 brg'),
            drums2: cells('rd*3 rdf', 'rd*3 rdf', 'rd*3 rdf', 'rd*3 rdf'),
            drums3: cells('hp*3 rm', 'hp*3 rm', 'sn*3 rm', 'sn*3 rm'),
          },
          mix: { pad: 1.0, twang: 1.0 },
          // SECOND PASS (A8): the vibraphone tune is doubled an octave up in the bridge (bars 9-12) and the brushes fill the end of every phrase
          alt: {
            dbl: { vibes: { semi: 12, vel: 0.35, bars: [9, 12] } },
            p: { drums: cells('br*3 brr', 'br*3 brr', 'br*3 brr', 'br*3 brr') },
          },
        },
      },
      order: ['E'],
    };

    // ============================================================================================================================================
    // ENDING "Return of the Light"   100 bpm   D minor -> D MAJOR (Picardy)   40 bars, loop ~ 1:36 (no intro: the credits can roll as long as they like)
    //
    //   Concept: the answer to the title.  Same opening motif as "Neon Abyss" (A F E D, the leap up a minor sixth and the sigh back down) but now slow and tender
    //   over a dreamy pad, then in the finale the same tune with ONE note raised (F -> F#): minor turns major and a huge side-chained supersaw wall carries it.
    //   The loop runs finale -> quiet outro -> minor dream again (the Picardy cycles back into the night).
    //
    //   FORM MAP (bars)           chords                                                                 what enters / leaves
    //   M   dream      8          Dm9 Dm9 Bbmaj7 Bbmaj7 Fmaj7 Fmaj7 Gm9 A7sus                              pad, choir, twang tune in half speed (A4 F5 | E5 D5 ...), snaps from bar 5
    //   M2  memory     8          Dm9 Bbmaj7 Fmaj7 Gm9 | Dm9 Bbmaj7 Gm9 A7                                  machine kick + gated snare, chorus bass, cold arp, the tune at original speed, bell
    //   BU  build      8          Bb Bb F F Gm Gm A7sus A7sus                                               riser, snare roll, hp-sweep, supersaw rises, chords brighten toward the dominant
    //   FI  finale    12          D A Bm G | D A G A | Bm G A A                                            D MAJOR: supersaw wall + 808 sub + EDM kick + clap, LEAD theme (F#), choir, twang an octave down
    //   OU  outro      4          D Dmaj9 D6 D                                                              everything dissolves into pad + choir + bell sparkles; the D major rings into the Dm9 of the next pass
    //
    //   THEME in the finale (lead, over D | A | Bm | G):  A4 F#5. E5 D5 | E5 C#6. B5 A5 | D5 B5. A5 F#5 | G5 E5 D5---     (title: A4 F5 E5 D5 -- one note raised)
    //   Mix intent (section loudness): M -25, M2 -21, BU -19, FI -14.5, OU -25 LUFS  (the biggest dynamic arc of the soundtrack, spread >= 8 dB).
    // ============================================================================================================================================
    D.ending = {
      bpm: 100, swing: 0.5, echo: 3, fb: 0.4, key: 2, mode: MINOR, gain: 1.548, duckRel: 0.55,
      lanes: {
        pad: { inst: 'pad', vol: 0.6, hall: 0.4, duck: 0.4 },
        choir: { inst: 'choir', vol: 0.6, hall: 0.55, vib: [5, 14], duck: 0.3 },
        super: { inst: 'super', vol: 1.0, hall: 0.3, duck: 0.75, n: 7, spread: 20, lpf: 8500 },
        twang: { inst: 'twang', vol: 0.9, trem: { rate: 4.4, depth: 0.5 }, spr: 0.4, hall: 0.35, dly: 0.3, hpf: 140 },
        lead: { inst: 'lead', vol: 1.2, hall: 0.35, dly: 0.3, hpf: 200 },
        bass: { inst: 'pick', vol: 0.78, chorus: PICK_CHORUS, duck: 0.4 },
        sub: { inst: 'sub', vol: 0.55, drive: 2.5, duck: 0.92, lpf: 700 },
        arp: { inst: 'arp', vol: 0.3, dly: 0.4, hall: 0.2, pan: -0.2, hpf: 250, duck: 0.4 },
        bell: { inst: 'bell', vol: 0.55, hall: 0.55, dly: 0.25 },
        fx: { inst: 'fx', vol: 0.45, hall: 0.35 },
        kick: { vol: 1.2, drive: 1.5 }, snare: { vol: 0.45, hall: 0.12 }, hats: { vol: 0.4 }, perc: { vol: 0.35 },
      },
      pats: {
        sn: '....f.......f...', vg: 'k...s...k.k.s...', vgf: 'k...s...k.k.s.nn', vgo: 'k...s...k.k.....',
        hh8: "h,.h'.h,.h'.h,.h'.h,.h'.", pf: '..........t.u.v.',
        f4: 'K...K...K...K...', bk: 'K...s...K...s...', bkf: 'K...s...K...s.ss', cl: '....p.......p...', oh: '..o...o...o...o.', ohk: '..o.K.o...o.K.o.', ck: 'c...K.......K...',   // ohk / ck: A7, the beat-2 / beat-4 kick of the finale
        m16: "h,h,h,h,h,h,h,h,h,h,h,h,h,h,h,h,",
        b8: '1-1-1-1-1-1-1-1-', b8o: '1-1-1-1-1-1-8-1-', pump: '1-1-8-1-1-1-8-1-', off808: '..1-..1-..1-..1-',
        // melodic chorus-bass lines (80s dark wave: the bass sings): 1 root, 3 / 5 / 7 chord tones, 8 octave
        m1: '1-1-1-8-7-5-3-5-', m2: '1-1-5-1-3-5-7-5-', m3: '1-1-8-1-5-1-3-5-', m4: '1-1-1-1-3-5-7-8-',

        arp1: '1.3.5.8.a.8.5.3.',
      },
      sections: {
        // ------------------------------------------------------------------------------------------------ M: dream (8 bars)
        M: {
          chords: '| Dm9 | Dm9 | Bbmaj7 | Bbmaj7 | Fmaj7 | Fmaj7 | Gm9 | A7sus |',
          p: {
            pad: hold(8),
            choir: rest(2) + hold(6),
            twang: `| a4/6 f5/10 | e5/6 d5/10 | bb4/6 g5/10 | f5/6 d5/10 | c5/6 a5/10 | g5/6 f5/10 | d5/6 bb5/10 | a5/8 g5/4 e5/4 |`,
            bell: `| r/16 | r/16 | r/16 | r/16 | r/16 | r/16 | r/16 | r/12 e6/4 |`,
            drums: cells(rest(4), 'sn*4'),
            fx: 'swell@6b/2b',
          },
          mix: { choir: 0.8, pad: 1.3, all: 0.75 },
        },
        // ------------------------------------------------------------------------------------------------ M2: memory (8 bars)
        M2: {
          chords: '| Dm9 | Bbmaj7 | Fmaj7 | Gm9 | Dm9 | Bbmaj7 | Gm9 | A7 |',
          p: {
            pad: hold(8),
            choir: hold(8),
            bass: cells('m1 m2 m1 m4', 'm1 m2 m3 pump'),
            arp: 'arp1*8',
            twang: `| a4/4 f5/6 e5/2 d5/4 | bb4/4 g5/6 f5/2 d5/4 | c5/4 a5/6 g5/2 f5/4 | d5/4 bb5/6 a5/2 g5/4 | a4/4 f5/6 e5/2 f5/4 | bb4/4 g5/6 f5/2 a5/4 | bb5/4 a5/6 g5/2 d5/4 | e5/4 c#5/4 a4/8 |`,
            bell: `| r/16 | r/16 | r/16 | r/16 | r/16 | r/16 | r/16 | r/12 a6/4 |`,
            drums: 'vg*3 vgf vg*3 vgo',
            drums2: 'hh8*8',
            drums3: cells('sn*3', 'pf', 'sn*3', '..........t.u.vv'),
            fx: 'swell@7b/1b',
          },
          mix: { arp: 0.8, choir: 0.8, all: 0.72 },
          auto: { 'arp.vol': [0.15, 0.3, 'lin', 0, 8] },
        },
        // ------------------------------------------------------------------------------------------------ BU: build (8 bars)
        BU: {
          chords: '| Bb | Bb | F | F | Gm | Gm | A7sus | A7sus |',
          p: {
            pad: hold(8),
            super: 'stab*7 ..x...x...x.....',
            bass: cells('b8o*4', 'oct8*3', '1-1-1-1-........'),
            arp: cells('arp1*4', 'arp16*3', '1358a853........'),
            drums: cells('f4*6', 'K.K.K.K.K.K.K.K.', rest(1)),
            drums2: cells('..h...h...h...h.*2', 'hh8*2', "S,...S,...S...S...", "S.S.S.S.S'.S'.S'.S'.", 'RRRRRRRRRRRRRRRR', 'RRRRRRRRRRRR....'),
            fx: 'riser@0/124 swell@4b/3b',
          },
          mix: { super: 0.85, snare: 0.6 },
          auto: { 'super.lpf': [500, 9000, 'exp'], 'master.hpf': [[0, 20], [2, 20], [7.75, 600], [7.8125, 10]], 'arp.vol': [0.08, 0.18], 'master.vol': [0.72, 1.0, 'in'] },
        },
        // ------------------------------------------------------------------------------------------------ FI: finale (12 bars, D major)
        FI: {
          chords: '| D | A | Bm | G | D | A | G | A | Bm | G | A | A |',
          p: {
            super: hold(12),
            pad: hold(12),
            choir: hold(12),
            bass: cells('pump*3 b8o', 'pump*3 b8o', 'pump*3 1-1-1-1-1-1-8-1-'),
            sub: cells('root*4', 'off808*8'),
            arp: cells('arp1*8', 'arp16*4'),
            lead: `| a4/4 f#5/6 e5/2 d5/4 | e5/4 c#6/6 b5/2 a5/4 | d5/4 b5/6 a5/2 f#5/4 | g5/4 e5/4 d5/8 |
                    | a4/4 f#5/6 e5/2 f#5/4 | e5/4 c#6/6 b5/2 e6/4 | d6/4 b5/6 a5/2 g5/4 | e5/6 f#5/2 e5/4 c#5/4 |
                    | d6/4 f#6/4 b6/8 | b5/4 d6/4 g6/8 | a5/4 c#6/4 e6/8 | e6/6 c#6/2 a5/8 |`,
            twang: `| a3/4 f#4/6 e4/2 d4/4 | e4/4 c#5/6 b4/2 a4/4 | d4/4 b4/6 a4/2 f#4/4 | g4/4 e4/4 d4/8 |
                    | a3/4 f#4/6 e4/2 f#4/4 | e4/4 c#5/6 b4/2 e5/4 | d5/4 b4/6 a4/2 g4/4 | e4/6 f#4/2 e4/4 c#4/4 |
                    | r/16 | r/16 | r/16 | r/16 |`,
            bell: `| r/16 | r/16 | r/16 | r/16 | r/16 | r/16 | r/16 | r/16 | r/16 | r/16 | r/16 | a6/2 e6/2 c#6/2 a5/2 r/8 |`,
            drums: cells('bk*3 bkf', 'bk*3 bkf', 'bk*3 K...s...RRRRRRRR'),
            drums2: cells('cl*11', '................'),
            drums3: cells('ck', 'ohk*7', 'ck', 'ohk*2', 'oh'),
            fx: 'impact@0 impact@8b:0.7 swell@11b/1b',
          },
        },
        // ------------------------------------------------------------------------------------------------ OU: outro (4 bars)
        OU: {
          chords: '| D | Dmaj9 | D6 | D |',
          p: {
            pad: hold(4),
            choir: hold(4),
            lead: `| a5/8 f#5/8 | e5/8 d5/8 | a5/8 f#5/8 | d5/12 r/4 |`,
            bell: `| r/16 | d6/2 f#6/2 a6/2 f#6/2 r/8 | r/16 | a6/2 e6/2 c#6/2 a5/2 r/8 |`,
            fx: 'down@0/1b',
          },
          mix: { choir: 0.9, lead: 0.7, all: 0.62 },
        },
      },
      order: ['M', 'M2', 'BU', 'FI', 'OU'],
    };

    // ============================================================================================================================================
    // JINGLES (one-shots; Grids in a jingle are written in 16-char cells, a 30-step jingle = 2 cells, the second one is cut)
    //
    //   start      120 bpm, 18 steps = 2.25 s (FIXPLAN2 K7: over before the 2.5 s round-1 intro; MUST stay <= 2.4 s).  E minor (stage 1 follows on its downbeat).
    //              riser + reverse swell (steps 0-8), IMPACT + boom + supersaw stab at step 8, then the 3-note motif E5 G5 B5 (the first notes of the stage-1 hook's
    //              long tail) on lead + bell.
    //   extend     150 bpm, 30 steps = 3.0 s.  E MAJOR (parallel major of stage 1, relative major of stage 2 -> fits both loops it interrupts).  A bright rising
    //              spiral of arpeggios (bell + cold arp) landing on a huge supersaw Eadd9 with a bell chord on top.
    //   gameover    90 bpm, 24 steps = 4.0 s.  A minor.  reverse swell, a low boom, a dark pad that slides down (Am9 -> Fmaj7), a lonely bell lament E5 C5 A4.
    //   clear_boss 140 bpm, 28 steps = 3.0 s.  F MAJOR = the Picardy of the boss's F minor and the relative major of the ending's D minor.  Rising IV - V - I
    //              (Bb - C - F) lift: riser under the line, supersaw on every chord, the crown fanfare (C5 F5 A5 C6: the boss hook with the third raised), big hall.
    // ============================================================================================================================================
    D.start = {
      kind: 'jingle', bpm: 120, swing: 0.5, echo: 3, fb: 0.3, key: 4, mode: MINOR, gain: 1.225,
      lanes: {
        fx: { inst: 'fx', vol: 0.8, hall: 0.35 },
        super: { inst: 'super', vol: 0.8, hall: 0.35, n: 7, spread: 22, a: 0.02, r: 0.7 },
        stab: { inst: 'stab', vol: 0.6, hall: 0.3, spread: 24, cut: 3800 },
        bell: { inst: 'bell', vol: 0.8, hall: 0.4 },
        lead: { inst: 'lead', vol: 1.1, hall: 0.3, dly: 0.2, hpf: 200 },
        kick: { vol: 1.0, drive: 1.5 },
      },
      sections: {
        J: {
          chords: '| Em/18 |',
          p: {
            fx: 'swell@0/8 riser@2/6 impact@8',
            super: '........x------- --..............',
            stab: '........x....... ................',
            bell: 'r/8 e5/3 g5/3 b5/4',
            lead: 'r/8 e5/3 g5/3 b5/4',
            drums: 'RRRRRRRRb.......',
          },
        },
      },
      order: ['J'],
    };

    D.extend = {
      kind: 'jingle', bpm: 150, swing: 0.5, echo: 3, fb: 0.3, key: 4, mode: MAJOR, gain: 1.914,
      lanes: {
        bell: { inst: 'bell', vol: 0.9, hall: 0.4, dly: 0.2 },
        arp: { inst: 'arp', vol: 0.045, dly: 0.3, hall: 0.2, hpf: 250 },       // vol x0.09 = the arp make-up of INST.arp (lv 0.17 -> 1.9): the jingle keeps its level
        super: { inst: 'super', vol: 0.9, hall: 0.4, n: 7, spread: 20, a: 0.02, r: 0.6 },
        fx: { inst: 'fx', vol: 0.7, hall: 0.35 },
        kick: { vol: 0.9 },
      },
      sections: {
        J: {
          chords: '| Eadd9/30 |',
          p: {
            bell: 'n: e5/1 g#5/1 b5/1 e6/1 g#5/1 b5/1 e6/1 g#6/1 b5/1 e6/1 g#6/1 b6/1 r/2 [e6,g#6,b6]/16',
            arp: 'n: e4/1 g#4/1 b4/1 e5/1 g#4/1 b4/1 e5/1 g#5/1 b4/1 e5/1 g#5/1 b5/1 r/18',
            super: '..............x- ----------------',
            fx: 'riser@0/12 impact@14:0.6',
            drums: '..............b.',
          },
        },
      },
      order: ['J'],
    };

    D.gameover = {
      kind: 'jingle', bpm: 90, swing: 0.5, echo: 3, fb: 0.3, key: 9, mode: MINOR, gain: 2.136,
      lanes: {
        fx: { inst: 'fx', vol: 0.9, hall: 0.5 },
        pad: { inst: 'pad', vol: 0.8, hall: 0.5, a: 0.3, r: 1.6, cut: 900 },
        sub: { inst: 'sub', vol: 0.6, drive: 2.5, lpf: 700 },
        bell: { inst: 'bell', vol: 0.6, hall: 0.55 },
      },
      sections: {
        J: {
          chords: '| Am9/14.Fmaj7/10 |',
          p: {
            fx: 'swell@0/6 impact@6',
            pad: '......x.......x- ----------------',
            sub: 'r:......1-------1- ----------------',
            bell: 'r/6 e5/4 c5/4 a4/10',
          },
        },
      },
      order: ['J'],
    };

    D.clear_boss = {
      kind: 'jingle', bpm: 140, swing: 0.5, echo: 3, fb: 0.3, key: 5, mode: MAJOR, gain: 2.002,
      lanes: {
        super: { inst: 'super', vol: 0.9, hall: 0.5, n: 7, spread: 20, a: 0.02, r: 0.9 },
        bell: { inst: 'bell', vol: 0.9, hall: 0.5 },
        lead: { inst: 'lead', vol: 1.0, hall: 0.45, dly: 0.2, hpf: 200 },
        fx: { inst: 'fx', vol: 0.8, hall: 0.4 },
        kick: { vol: 0.9 },
      },
      sections: {
        J: {
          chords: '| Bb/8.C/8.F/12 |',
          p: {
            super: 'x-------x------- x-----------....',
            lead: 'n: bb4/2 d5/2 f5/2 bb5/2 c5/2 e5/2 g5/2 c6/2 f5/2 a5/2 c6/2 f6/6',
            bell: 'n: bb5/2 d6/2 f6/2 bb6/2 c6/2 e6/2 g6/2 c7/2 [f5,a5,c6,f6]/12',
            fx: 'riser@0/16 impact@16',
            drums: 'b.......b....... b...............',
          },
        },
      },
      order: ['J'],
    };
    // <<COMPOSER:END>>

    Object.assign(D, demoDefs());
    defsCache = D;
    return D;
  }

  // ================================================================================================
  // INSTRUMENT DEMOS (test/audio_v2_board.html, test/audio_analyze.mjs): one short 'demo_*' one-shot per instrument / sound family
  // ================================================================================================
  let demoCache = null;
  function demoDefs() {
    if (demoCache) return demoCache;
    const out = {};
    const ch4 = '| Em | C | G | D |', ch8 = '| Em | C | G | D | Em | C | Am | B7 |';
    const mk = (lanes, p, o) => {
      o = o || {};
      return Object.assign({
        kind: 'jingle', bpm: o.bpm || 120, swing: 0.5, echo: 3, fb: 0.38, key: 4, mode: MINOR, gain: 1,
        lanes, sections: { D: Object.assign({ chords: o.chords || ch4, p }, o.sec) }, order: ['D'],
      }, o.song);
    };
    const KICK = { kick: { vol: 0.9, drive: 1.5 } };
    out.demo_super = mk({ super: { inst: 'super', hall: 0.3 } }, { super: 'hold' });
    out.demo_super7 = mk({ super: { inst: 'super', n: 7, spread: 22, hall: 0.3 } }, { super: 'hold' });
    out.demo_stab = mk(Object.assign({ stab: { inst: 'stab', hall: 0.2, duck: 0.8 } }, KICK), { stab: 'sync', drums: 'four' });
    out.demo_pad = mk({ pad: { inst: 'pad', hall: 0.4 } }, { pad: 'hold' });
    out.demo_choir = mk({ choir: { inst: 'choir', hall: 0.5, vib: [5.2, 14] } }, { choir: 'hold' });
    out.demo_pick = mk({ pick: { inst: 'pick', chorus: PICK_CHORUS } }, { pick: 'root8 root8 root8 oct8' });
    out.demo_wood = mk({ wood: { inst: 'wood', drive: 1.8, dgain: 0.2 } }, { wood: '1---3---5---6---' }, { bpm: 90 });
    out.demo_sub = mk(Object.assign({ sub: { inst: 'sub', drive: 2.5, lpf: 700, duck: 0.9 } }, KICK), { sub: 'root2', drums: 'four' });
    out.demo_riff = mk({ riff: { inst: 'riff', drive: 8, lpf: 3600 } }, { riff: 'gal' }, { bpm: 130 });
    out.demo_arp = mk({ arp: { inst: 'arp', dly: 0.4, hall: 0.2 } }, { arp: 'arp16' });
    out.demo_lead = mk({ lead: { inst: 'lead', hall: 0.3, dly: 0.3 } }, { lead: `| e5/4 g5/4 b5/4 e6/4 | e6/8 c6/4 g5/4 | d5/4 g5/4 b5/4 d6/4 | f#6/6 d6/2 a5/8 |` });
    out.demo_alarm = mk({ alarm: { inst: 'alarm', drive: 2, lpf: 6000, dly: 0.2 } }, { alarm: `| e5/2 b5/2 e5/2 b5/2 e5/2 b5/2 e5/2 b5/2 | c5/2 g5/2 c5/2 g5/2 c5/2 g5/2 c5/2 g5/2 | g5/2 d6/2 g5/2 d6/2 g5/2 d6/2 g5/2 d6/2 | f#5/2 c6/2 f#5/2 c6/2 f#5/2 c6/2 f#5/2 c6/2 |` });
    out.demo_twang = mk({ twang: { inst: 'twang', trem: { rate: 4.4, depth: 0.55 }, spr: 0.5, hall: 0.3, dly: 0.28, hpf: 140 } }, { twang: `| e4/6 g4/2 b4/4 a4/4 | g4/8 e4/4 c5/4 | b4/6 d5/2 g5/4 f#5/4 | a4/8 f#4/4 d5/4 |` }, { bpm: 88 });
    out.demo_bell = mk({ bell: { inst: 'bell', hall: 0.4 } }, { bell: `| e5/4 g5/4 b5/4 e6/4 | c6/4 g5/4 e5/4 c5/4 | g5/4 b5/4 d6/4 g6/4 | f#6/8 d6/8 |` });
    out.demo_vibes = mk({ vibes: { inst: 'vibes', trem: { rate: 5.2, depth: 0.35 }, hall: 0.35 } }, { vibes: `| e5/6 b4/2 g4/4 b4/4 | e5/6 c5/2 g4/8 | d5/6 b4/2 g4/4 b4/4 | f#5/8 a5/4 d6/4 |` }, { bpm: 84 });
    out.demo_kit = mk({ kick: {}, snare: {}, hats: {}, perc: {} },
      { drums: 'k...K...b...s... S...y...n...p... f...r...t.u.v... h.o.m.M.d...c...' }, { bpm: 100, chords: '| Em | Em | Em | Em |' });
    out.demo_industrial = mk({ perc: { hall: 0.2 }, kick: { drive: 2 }, snare: {} },
      { drums: 'K...x...K...X... K...z...K...w... S.y.S.y.RRRRRRRR' }, { bpm: 110, chords: '| Em | Em | Em |' });
    out.demo_fx = mk({ fx: { inst: 'fx', hall: 0.35 } }, { fx: 'riser@0/2b impact@2b down@2b/1b swell@3b/1b zap@4b impact@5b' }, { bpm: 120, chords: '| Em | Em | Em | Em | Em | Em | Em | Em |' });
    out.demo_build = Object.assign(mk({
      pad: { inst: 'pad', vol: 0.55, hall: 0.3, duck: 0.5 }, super: { inst: 'super', n: 7, vol: 0.7, hall: 0.2, duck: 0.75, lpf: 9000 },
      arp: { inst: 'arp', vol: 0.35, dly: 0.4, hall: 0.15, hpf: 300, duck: 0.5 }, bass: { inst: 'pick', vol: 0.8, chorus: PICK_CHORUS, duck: 0.4 },
      sub: { inst: 'sub', vol: 0.85, drive: 2.5, duck: 0.9, lpf: 700 }, fx: { inst: 'fx', vol: 0.7, hall: 0.3 }, kick: { vol: 0.95, drive: 1.6 }, snare: { vol: 0.8 }, hats: { vol: 0.55 },
    }, {}, { bpm: 124 }), {
      sections: {
        B: { chords: '| Em | C | G | D |', p: { super: 'stab', pad: 'hold', arp: 'arp16', fx: 'riser@0/4b', drums: 'K...h.h.K...h.h. K...h.h.K...h.h. K...h.hhK...h.hh RRRRRRRRRRRRRRRR' },
          auto: { 'super.lpf': [400, 9000, 'exp'], 'master.hpf': [20, 800, 'exp'] } },
        D: { chords: '| Em | C | G | D |', p: { super: 'stab', pad: 'hold', arp: 'arp16', bass: 'root8', sub: 'root2', fx: 'impact@0', drums: 'K...h.h.K...h.h.' } },
      },
      order: ['B', 'D'],
    });
    // CPU: demo_dense = the densest realistic drop (what the composer may build at most); demo_stress = every voice family at once (informational)
    out.demo_dense = mk({
      super: { inst: 'super', n: 5, spread: 20, vol: 0.7, hall: 0.3, duck: 0.7 }, bass: { inst: 'pick', vol: 0.7, chorus: PICK_CHORUS, duck: 0.4 },
      sub: { inst: 'sub', vol: 0.8, drive: 2.5, lpf: 700, duck: 0.9 }, arp: { inst: 'arp', vol: 0.4, dly: 0.45, hall: 0.2, duck: 0.5 },
      twang: { inst: 'twang', vol: 0.8, trem: { rate: 4.4, depth: 0.5 }, hall: 0.3, dly: 0.3 },
      kick: { vol: 0.9, drive: 1.5 }, snare: { vol: 0.8 }, hats: { vol: 0.5 },
    }, {
      super: 'sync', bass: 'oct8', sub: 'root2', arp: 'arp16',
      twang: `| e4/2 g4/2 b4/2 e5/2 e4/2 g4/2 b4/2 e5/2 | c4/2 e4/2 g4/2 c5/2 c4/2 e4/2 g4/2 c5/2 | g4/2 b4/2 d5/2 g5/2 g4/2 b4/2 d5/2 g5/2 | d4/2 f#4/2 a4/2 d5/2 d4/2 f#4/2 a4/2 d5/2 |`,
      drums: 'KhhhShhhKhhoShhh KhhhShhhKhhoShhh KmhhSmhhKhhoSmhh KhhhShhhKhhhShSS',
    }, { bpm: 124 });
    out.demo_stress = mk({
      super: { inst: 'super', n: 7, spread: 22, vol: 0.6, hall: 0.3, duck: 0.7 }, pad: { inst: 'pad', n: 3, vol: 0.4, hall: 0.3, duck: 0.4 },
      choir: { inst: 'choir', vol: 0.4, hall: 0.4, vib: [5.2, 14] }, bass: { inst: 'pick', vol: 0.7, chorus: PICK_CHORUS },
      riff: { inst: 'riff', vol: 0.5, drive: 7, lpf: 3600 }, sub: { inst: 'sub', vol: 0.7, drive: 2.5, lpf: 700 },
      arp: { inst: 'arp', n: 3, vol: 0.4, dly: 0.45, hall: 0.2 }, lead: { inst: 'lead', vol: 0.4, hall: 0.3, dly: 0.3 },
      twang: { inst: 'twang', vol: 0.8, trem: { rate: 4.4, depth: 0.5 }, spr: 0.4, hall: 0.3, dly: 0.3 }, bell: { inst: 'bell', vol: 0.5, hall: 0.4 },
      fx: { inst: 'fx', vol: 0.6, hall: 0.3 }, kick: { vol: 0.9, drive: 1.5 }, snare: { vol: 0.8 }, hats: { vol: 0.5 }, perc: { vol: 0.7 },
    }, {
      super: 'sync', pad: 'hold', choir: 'hold', bass: 'oct8', riff: 'gal', sub: 'root2', arp: 'arp16',
      lead: `| e5/1 g5/1 b5/1 e6/1 e5/1 g5/1 b5/1 e6/1 e5/1 g5/1 b5/1 e6/1 e5/1 g5/1 b5/1 e6/1 | e5/1 g5/1 b5/1 e6/1 e5/1 g5/1 b5/1 e6/1 e5/1 g5/1 b5/1 e6/1 e5/1 g5/1 b5/1 e6/1 | e5/1 g5/1 b5/1 e6/1 e5/1 g5/1 b5/1 e6/1 e5/1 g5/1 b5/1 e6/1 e5/1 g5/1 b5/1 e6/1 | e5/1 g5/1 b5/1 e6/1 e5/1 g5/1 b5/1 e6/1 e5/1 g5/1 b5/1 e6/1 e5/1 g5/1 b5/1 e6/1 |`,
      twang: `| e4/2 g4/2 b4/2 e5/2 e4/2 g4/2 b4/2 e5/2 | c4/2 e4/2 g4/2 c5/2 c4/2 e4/2 g4/2 c5/2 | g4/2 b4/2 d5/2 g5/2 g4/2 b4/2 d5/2 g5/2 | d4/2 f#4/2 a4/2 d5/2 d4/2 f#4/2 a4/2 d5/2 |`,
      bell: `| e6/2 g6/2 b6/2 e6/2 e6/2 g6/2 b6/2 e6/2 | c6/2 e6/2 g6/2 c6/2 c6/2 e6/2 g6/2 c6/2 | g6/2 b6/2 d7/2 g6/2 g6/2 b6/2 d7/2 g6/2 | d6/2 f#6/2 a6/2 d6/2 d6/2 f#6/2 a6/2 d6/2 |`,
      fx: 'riser@0/4b', drums: 'KhhhShhhKhhoShhh KhhhShhhKhhoShxh KmhhSmhhKhhoSmhz KhhhShhhKhhhSXXX',
    }, { bpm: 124 });
    demoCache = out;
    return out;
  }
  const isDemo = (n) => typeof n === 'string' && /^demo_/.test(n) && Object.prototype.hasOwnProperty.call(demoDefs(), n);
  const demoNames = () => Object.keys(demoDefs());

  // ================================================================================================
  // compiled programs
  // ================================================================================================
  const progs = {};
  function getProg(name) { return progs[name] || (progs[name] = compileSong(name)); }

  // ================================================================================================
  // audio chain (shared by live + offline contexts)
  //   lane buses ─> track out ─┬─> musicIn ─> glue compressor ─> music gain ─┐
  //   reverb / delay returns ──┘                                             ├─> master ─> limiter ─> soft ceiling ─> mute ─> destination
  //   sfx groups ─> sfx gain ─────────────────────────────────────────────────┘ (SFX send into the short `room` reverb, so they share it with the music)
  // Reverbs: ConvolverNodes with generated MONO impulse responses fed by a mono down-mix (one convolution per bus: a stereo IR would double
  // the live CPU cost); the width is made after the convolver with a delayed, panned copy.  Spring = allpass-dispersion feedback loop.
  // ================================================================================================
  function monoIn(ctx) { const g = ctx.createGain(); g.channelCount = 1; g.channelCountMode = 'explicit'; return g; }
  /** mono signal -> stereo: the direct copy on the left channel + a delayed copy on the right (Haas widening); a ChannelMerger is far cheaper than two panners */
  function widen(ctx, src, ret, dest, delay) {
    const g = gn(ctx, ret), d = ctx.createDelay(0.05), m = ctx.createChannelMerger(2);
    d.delayTime.value = delay;
    src.connect(g); g.connect(m, 0, 0);
    g.connect(d); d.connect(m, 0, 1);
    m.connect(dest);
  }
  function mkVerb(ctx, kind, ret, dest, hpf, wid) {
    const inp = monoIn(ctx), conv = ctx.createConvolver(), hp = bq(ctx, 'highpass', hpf, 0.7);
    conv.buffer = irFor(ctx, kind);
    inp.connect(hp); hp.connect(conv);
    widen(ctx, conv, ret, dest, wid);
    return { in: inp, conv };
  }
  function mkSpring(ctx, ret, dest) {
    const inp = monoIn(ctx), sum = ctx.createGain(), d = ctx.createDelay(0.2), lp = bq(ctx, 'lowpass', 3600, 0.7), fb = gn(ctx, 0.74), out = gn(ctx, ret);
    d.delayTime.value = 0.034;
    inp.connect(sum);
    let node = sum;
    for (const f of [2300, 1500, 950]) { const ap = bq(ctx, 'allpass', f, 0.55); node.connect(ap); node = ap; }   // dispersion: the "boing"
    node.connect(d); d.connect(lp); lp.connect(fb); fb.connect(sum);
    d.connect(out); out.connect(dest);
    return { in: inp };
  }

  function buildChain(ctx, startMuted) {
    const musicIn = gn(ctx, 1);
    const glue = ctx.createDynamicsCompressor();
    // gentle glue: high threshold + low ratio so section dynamics survive; the limiter / ceiling after it are the actual guard
    glue.threshold.value = -19; glue.knee.value = 14; glue.ratio.value = 2.2; glue.attack.value = 0.012; glue.release.value = 0.2;
    const music = gn(ctx, MUSIC_LEVEL), duck = gn(ctx, 1), sfx = gn(ctx, SFX_LEVEL), master = gn(ctx, MASTER_LEVEL);
    const limiter = ctx.createDynamicsCompressor();
    // FIXPLAN_V3 A3: a SOFT, slow master limiter (the old -3 dB / 20:1 / 2 ms / 80 ms brick pushed the music down 4-6 dB under every pop).  The SFX trims keep the SFX peaks
    // below it, so it only catches coincident peaks; the one deliberate music duck is the per-cue duck on the `duck` gain (SFX_DUCK, A4).
    limiter.threshold.value = -1; limiter.knee.value = 6; limiter.ratio.value = 10; limiter.attack.value = 0.003; limiter.release.value = 0.16;
    const shaper = ctx.createWaveShaper();
    shaper.curve = softClipCurve(); shaper.oversample = '2x';       // 2x oversampled: a flat-topped, aliased ceiling would overshoot the 4x true peak by 2 dB
    const mute = gn(ctx, startMuted ? 0 : 1);
    musicIn.connect(glue); glue.connect(music); music.connect(duck); duck.connect(master); sfx.connect(master);
    master.connect(limiter); limiter.connect(shaper); shaper.connect(mute); mute.connect(ctx.destination);

    // effect buses are created on first use (every silent node costs CPU): `room` (SFX use it from the first sound on), `hall`, `spring`, ping-pong `echo`
    const parts = {}, st = { echoTime: 0.3, echoFb: DELAY_SEND_FB };
    const make = {
      room: () => mkVerb(ctx, 'room', 0.5, musicIn, 160, 0.011),
      hall: () => mkVerb(ctx, 'hall', 0.5, musicIn, 200, 0.019),
      spring: () => mkSpring(ctx, 0.5, musicIn),
      echo: () => {                                          // tempo-synced ping-pong delay, returns into the music bus
        const inp = gn(ctx, 1), dL = ctx.createDelay(1.5), dR = ctx.createDelay(1.5);
        dL.delayTime.value = st.echoTime; dR.delayTime.value = st.echoTime;
        const fb1 = gn(ctx, st.echoFb), fb2 = gn(ctx, st.echoFb), lp = bq(ctx, 'lowpass', 3400, 0.7), hp = bq(ctx, 'highpass', 220, 0.7);
        const m = ctx.createChannelMerger(2), out = gn(ctx, 0.85);
        inp.connect(hp); hp.connect(dL); dL.connect(m, 0, 0);
        dL.connect(fb1); fb1.connect(dR); dR.connect(m, 0, 1);
        dR.connect(fb2); fb2.connect(lp); lp.connect(dL);
        m.connect(out); out.connect(musicIn);
        return { in: inp, dL, dR, fb1, fb2 };
      },
    };
    return {
      musicIn, music, duck, sfx, master, glue, limiter, shaper, mute, ctx, parts,
      /** input node of an effect bus (created on first use) */
      send(kind) { return (parts[kind] || (parts[kind] = make[kind]())).in; },
      setEchoTime(sec) {
        st.echoTime = sec;
        const e = parts.echo;
        if (e) { const t = ctx.currentTime; e.dL.delayTime.setTargetAtTime(sec, t, 0.08); e.dR.delayTime.setTargetAtTime(sec, t, 0.08); }
      },
      setEchoFb(v) {
        st.echoFb = v;
        const e = parts.echo;
        if (e) { e.fb1.gain.setTargetAtTime(v, ctx.currentTime, 0.05); e.fb2.gain.setTargetAtTime(v, ctx.currentTime, 0.05); }
      },
    };
  }

  // ================================================================================================
  // lane buses + tracks (sequencer instances)
  // ================================================================================================
  let trackSeq = 0;

  /** persistent sine LFO of a lane bus (never throws: a lane without its modulation is better than a failed track) */
  function lfoOsc(ctx, hz, lockSec) {
    const o = ctx.createOscillator();
    if (lockSec > 0.5) hz = Math.max(1, Math.round(hz * lockSec)) / lockSec;          // a whole number of LFO cycles per loop: the loop is exactly periodic
    try { o.type = 'sine'; o.frequency.value = hz; o.start(); reg(o, true); } catch (e) { warnFault('lfo', 'lane LFO failed (' + (e && e.message ? e.message : e) + ')'); noteFault(e); return { connect() {}, disconnect() {} }; }
    return o;
  }

  /** one mixer strip: in -> [drive] -> [crush] -> [lpf] -> [hpf] -> [chorus] -> [tremolo] -> vol -> sends -> [duck] -> [pan] -> dest */
  function buildLane(ctx, chain, L, dest, lockSec) {
    const c = L.cfg, nodes = [], lane = { name: L.name, inst: L.inst, p: {}, vib: null, duck: null, nodes };
    const add = (n) => { nodes.push(n); return n; };
    const pre = !!(c.drive || c.crush || L.needs.lpf || c.lpf || L.needs.hpf || c.hpf || c.chorus || c.trem);   // is there anything between the input and the fader?
    lane.in = add(gn(ctx, pre ? 1 : (c.vol === undefined ? 1 : c.vol)));
    let node = lane.in;
    if (c.drive) {
      const sh = add(ctx.createWaveShaper()); sh.curve = driveCurve(c.drive, c.bias || 0); sh.oversample = c.os || 'none';
      const mk = add(gn(ctx, c.dgain !== undefined ? c.dgain : 0.3 / (1 + c.drive * 0.42)));
      node.connect(sh); sh.connect(mk); node = mk;
    }
    if (c.crush) { const sh = add(ctx.createWaveShaper()); sh.curve = crushCurve(c.crush); node.connect(sh); node = sh; }
    if (L.needs.lpf || c.lpf) { const f = add(bq(ctx, 'lowpass', c.lpf || 20000, c.lq || 0.707)); lane.p.lpf = f.frequency; node.connect(f); node = f; }
    if (L.needs.hpf || c.hpf) { const f = add(bq(ctx, 'highpass', c.hpf || 10, 0.707)); lane.p.hpf = f.frequency; node.connect(f); node = f; }
    if (c.chorus) {                                  // mono in -> dry + two modulated delays, one per channel (stereo ensemble)
      const ch = c.chorus, dry = add(gn(ctx, 1)), out = add(gn(ctx, 1)), lfo = lfoOsc(ctx, ch.rate || 0.5, lockSec), m = add(ctx.createChannelMerger(2));
      const hp = add(bq(ctx, 'highpass', ch.hp || 160, 0.7));          // only the part above ~160 Hz is chorused: the bass fundamental stays dry (mono-safe, phone-safe)
      node.connect(dry); dry.connect(out); m.connect(out); node.connect(hp);
      [-1, 1].forEach((sg, i) => {
        const d = add(ctx.createDelay(0.1)), dg = add(gn(ctx, sg * (ch.depth || 0.003))), wet = add(gn(ctx, ch.mix === undefined ? 0.6 : ch.mix));
        d.delayTime.value = (ch.base || 0.016) * (sg < 0 ? 1 : 1.12);
        lfo.connect(dg); dg.connect(d.delayTime); hp.connect(d); d.connect(wet); wet.connect(m, 0, i);
      });
      nodes.push(lfo); node = out;
    }
    if (c.trem) {
      const tg = add(gn(ctx, 1 - c.trem.depth / 2)), lfo = lfoOsc(ctx, c.trem.rate || 4, lockSec), dg = add(gn(ctx, c.trem.depth / 2));
      lfo.connect(dg); dg.connect(tg.gain); node.connect(tg); node = tg; nodes.push(lfo);
    }
    let vol = lane.in;
    if (pre) { vol = add(gn(ctx, c.vol === undefined ? 1 : c.vol)); node.connect(vol); }
    lane.p.vol = vol.gain;
    const send = (key, bus) => {
      const v = c[key] || 0;
      if (v > 0 || L.needs[key]) { const g = add(gn(ctx, v)); vol.connect(g); g.connect(chain.send(bus)); lane.p[key] = g.gain; }
    };
    send('rev', 'room'); send('hall', 'hall'); send('spr', 'spring'); send('dly', 'echo');
    let out = vol;
    if (L.duckAny) { const d = add(gn(ctx, 1)); out.connect(d); lane.duck = d.gain; out = d; }
    if (c.pan || L.needs.pan) { const p = add(ctx.createStereoPanner()); p.pan.value = c.pan || 0; lane.p.pan = p.pan; out.connect(p); out = p; }
    out.connect(dest);
    if (c.vib) {                                     // shared pitch-LFO (detune in cents) that pad / choir / lead voices connect to
      const lfo = lfoOsc(ctx, c.vib[0], lockSec), vg = add(gn(ctx, c.vib[1]));
      lfo.connect(vg); lane.vib = vg; nodes.push(lfo);
    }
    return lane;
  }

  function makeTrack(ctx, chain, prog, kind, realtime, tempoScale) {
    const out = gn(ctx, prog.gain);
    const tr = {
      id: ++trackSeq, ctx, chain, prog, name: prog.name, kind, out, lanes: {}, master: {}, nodes: [],
      pos: 0, count: 0, nextTime: null, done: false, endTime: 0, stopped: false, finished: false, chained: false,
      onEnd: null, resume: null, tempoFixed: null, wallDeadline: 0,
      pass: 0, passLocked: !realtime,        // loop pass counter (key lift on every second pass); offline renders stay periodic
      sw: null,                              // pending bar-aligned loop switch {name, left, make}
      startAt: 0,                            // ctx time of the first step (echo timing)
      reg: realtime ? makeRegistry() : null,
    };
    const saved = REG; REG = tr.reg;
    try {
      let dest = chain.musicIn;
      const m = prog.master;
      if (m.vol || m.hpf || m.lpf) {
        const mv = gn(ctx, 1), hp = bq(ctx, 'highpass', 10, 0.707), lp = bq(ctx, 'lowpass', 20000, 0.707);
        out.connect(hp); hp.connect(lp); lp.connect(mv); mv.connect(dest);
        tr.master = { vol: mv.gain, hpf: hp.frequency, lpf: lp.frequency };
        tr.nodes.push(hp, lp, mv);
      } else out.connect(dest);
      for (const L of prog.lanes) {
        const lane = buildLane(ctx, chain, L, out, kind === 'loop' ? (prog.steps - prog.loopStart) / 4 * 60 / (prog.bpm * (tempoScale || 1)) : 0);
        tr.lanes[L.name] = lane;
      }
    } finally { REG = saved; }
    if (realtime) live.tracks++;
    return tr;
  }

  function disposeTrack(tr) {
    if (tr.disposed) return;
    tr.disposed = true;
    if (tr.reg) { tr.reg.clear(); live.tracks--; }
    const kill = (n) => { try { n.disconnect(); } catch (e) { /* already gone */ } };
    kill(tr.out);
    for (const n of tr.nodes) kill(n);
    for (const k of Object.keys(tr.lanes)) for (const n of tr.lanes[k].nodes) kill(n);
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

  // ---- fault accounting: audio must never throw into the game or freeze on a repeating exception ----
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

  const skipHit = (tr, lane) => !!tr.skip && (tr.skip.indexOf(lane) >= 0 || (tr.skip.indexOf('drum') >= 0 && KIT_LANES.indexOf(lane) >= 0));

  /** Schedule all events of one step at time t. Step duration is added by the caller. */
  function scheduleStep(tr, step, t, beat, silent) {
    const evs = tr.prog.events[step];
    if (!evs || silent) return;
    const fr = stepFractions(tr.prog.swing);
    const ctx = tr.ctx;
    const odd = tr.pass & 1, lift = tr.prog.lift && odd ? tr.prog.lift : 0;
    const dtStep = beat * fr[step & 3];
    let failure = null;
    REG = tr.reg;
    try {
      for (const e of evs) {
        if (e.o !== undefined && e.o !== odd) continue;                // second-pass version of a section (`alt`, FIXPLAN_V3 A8): o 0 = even passes only, o 1 = odd passes only
        if (e.lane !== 'master' && skipHit(tr, e.lane)) continue;
        try {                                                 // one bad event must not take the others (or the clock) down
          const lane = tr.lanes[e.lane];
          switch (e.k) {
            case 'n': {
              let dur = 0;
              for (let k = 0; k < e.n; k++) dur += fr[(step + k) & 3];
              const ms = lift ? e.m.map((x) => x + lift) : e.m;
              e.play(ctx, lane, t, dur * beat, ms, e.vel, e.c);
              break;
            }
            case 'd': e.fn(ctx, lane, t, e.vel * KIT_LV); break;
            case 'f': {
              let dur = 0;
              for (let k = 0; k < e.n; k++) dur += fr[(step + k) & 3];
              FXV[e.name](ctx, lane, t, dur * beat, e.vel * FX_LV);
              break;
            }
            case 'u': {                                       // sidechain: duck the lane at the kick, recover exponentially
              if (!lane || !lane.duck) break;
              const g = lane.duck, rel = Math.max(0.06, e.rel * beat);
              g.setTargetAtTime(1 - e.depth, Math.max(0, t - 0.004), 0.0018);
              g.setTargetAtTime(1, t + 0.016, rel / 3);
              break;
            }
            case 'a': {                                       // automation: one linear segment per step
              const prm = e.lane === 'master' ? tr.master[e.p] : (lane && lane.p[e.p]);
              if (!prm) break;
              prm.setValueAtTime(e.v0, t);
              if (e.v1 !== e.v0) prm.linearRampToValueAtTime(e.v1, t + dtStep);
              break;
            }
            default: break;
          }
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
  let lastEcho = -1, lastFb = -1;
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
    const tr = makeTrack(ctx, chain, getProg(name), 'loop', true, trackTempoFor(getProg(name)));
    tr.pos = pos || 0;
    tr.pass = pass | 0;
    tr.nextTime = startAt === undefined ? null : startAt;
    tr.startAt = tr.nextTime === null ? 0 : tr.nextTime;
    active.push(tr);
    cur = tr;
    return tr;
  }
  const trackTempoFor = (prog) => (prog.maxTempo ? Math.min(tempo, prog.maxTempo) : tempo);
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
    if (tr.reg && tr.reg.n()) tr.reg.onIdle = () => disposeTrack(tr); else disposeTrack(tr);
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
        if (cur && !cur.stopped && cur.startAt <= now + 0.05) {
          if (cur.prog.echo) {
            const sec = cur.prog.echo * beatSeconds(cur) / 4;
            if (Math.abs(sec - lastEcho) > 0.002) { lastEcho = sec; chain.setEchoTime(sec); }
          }
          if (cur.prog.fb !== lastFb) { lastFb = cur.prog.fb; chain.setEchoFb(lastFb); }
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
  /**
   * Idle-time warm-up (a few ms per slice): the impulse responses and the baked / plucked buffers of the first tracks (title, start jingle, stage1) are built
   * ahead of the first music change, so starting a track in the middle of the game does not hitch the main thread.
   */
  function warmUp() {
    const jobs = [], seen = new Set();
    const job = (key, fn) => { if (!seen.has(key)) { seen.add(key); jobs.push(fn); } };
    job('ir:room', () => irFor(ctx, 'room')); job('ir:hall', () => irFor(ctx, 'hall'));
    for (const name of ['title', 'start', 'stage1']) {
      let p = null;
      try { p = getProg(name); } catch (e) { continue; }
      p.events.forEach((list) => { if (list) for (const e of list) {
        if (e.k !== 'n') continue;
        if (e.play === chordVoice) { const N = clamp(e.c.n | 0 || 5, 1, 9); for (const m of e.m) job('s' + m + '_' + N + '_' + e.c.spread, () => sawBake(ctx, m, N, e.c.spread, false)); }
        else if (e.play === choirVoice) { for (const m of e.m) job('c' + m + '_' + e.c.spread, () => sawBake(ctx, m, 3, e.c.spread, true)); }
        else if (e.play === twangVoice) job('k' + e.m[0], () => ksBuffer(ctx, e.m[0]));
      } });
    }
    // the other tracks are compiled in idle slices too (stage 2 / boss / ending / entry / jingles; one compile per slice, 10-45 ms with the second-pass versions), so no round change compiles on the spot
    for (const name of ['stage2', 'boss', 'entry', 'ending', 'extend', 'gameover', 'clear_boss']) job('prog:' + name, () => getProg(name));
    const slice = () => {
      if (!ctx || disabled) return;
      const t0 = performance.now();
      try { while (jobs.length && performance.now() - t0 < 4) jobs.shift()(); } catch (e) { jobs.length = 0; }
      if (jobs.length) setTimeout(slice, 10);
    };
    setTimeout(slice, 400);
  }

  function init() {
    if (!ctx) {
      let AC = null;
      try { AC = window.AudioContext || window.webkitAudioContext; } catch (e) { AC = null; }
      if (!AC) return;
      try { ctx = new AC({ latencyHint: "interactive", sampleRate: ENGINE_RATE }); } catch (e) {
        try { ctx = new AC(); } catch (e2) { ctx = null; return; }
      }
      try { chain = buildChain(ctx, muted); } catch (e) { ctx = null; chain = null; return; }
      timer = setInterval(tick, TICK_MS);
      warmUp();
      if (pendingLoop) { const n = pendingLoop; pendingLoop = null; playMusic(n); }
    }
    if ((!paused || pauseKind === 'soft') && ctx.state !== 'running') {
      try { const p = ctx.resume(); if (p && p.catch) p.catch(noop); } catch (e) { /* ignore */ }
    }
  }
  const ready = () => isRunning();

  function playMusic(name, opts) { try { playMusicImpl(name, opts); } catch (e) { noteFault(e); } }
  function playMusicImpl(name, opts) {
    opts = opts || {};
    if (LOOPS.indexOf(name) < 0 && !isDemo(name)) { warnOnce('music', name); return; }
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

  function jingle(name, opts) { try { jingleImpl(name, opts); } catch (e) { noteFault(e); const cb = opts && opts.onEnd; if (cb) setTimeout(() => safeCall(cb), 0); } }
  function jingleImpl(name, opts) {
    opts = opts || {};
    if (JINGLES.indexOf(name) < 0 && !isDemo(name)) { warnOnce('jingle', name); if (opts.onEnd) setTimeout(() => safeCall(opts.onEnd), 0); return; }
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
    releaseDuck();                                          // a fanfare is the main event itself: it never plays under a cue's duck
  }

  function stopMusic(fadeSec) {
    pendingLoop = null;
    if (ctx) stopAll(Math.max(0, +fadeSec || 0));
  }

  function setTempo(scale) {
    tempo = clamp(+scale || 1, 0.5, 2);
  }

  // FIXPLAN_V3 A4: PRIORITY DUCK.  The cues the player must not miss (HURRY alarm, death, ghost, 1UP, EXTEND letter, round clear, power-up, boss kill) pull the music bed down by
  // [dB, hold s] on the `duck` gain (smooth: tau 15 ms down, tau 0.2 s back), the controlled replacement for the accidental limiter pumping.  Everyday sounds (jump, shoot, pop, kill,
  // bounce, enemy_shot, land, menus) do not duck at all; mid-priority ones stay <= 3 dB and short.
  const SFX_DUCK = { death: [4, 0.7], hurry: [4.5, 0.7], ghost: [3.5, 0.9], oneup: [4, 0.9], letter: [3.5, 0.5], clear: [4.5, 0.7], powerup: [3.8, 0.8], boss_die: [4, 1.3],
    trap: [1.5, 0.25], item_appear: [2.5, 0.25], freeze: [2.5, 0.4], bomb: [3, 0.5], thunder: [2, 0.3], food: [1, 0.2], fire: [1.5, 0.3], water: [1.5, 0.3], boss_hit: [1.5, 0.15], spawn: [1, 0.2] };
  function releaseDuck() {
    try { if (chain && chain.duck) { const g = chain.duck.gain, now = ctx.currentTime; g.cancelScheduledValues(now); g.setTargetAtTime(1, now, 0.04); } } catch (e) { /* ignore */ }
  }
  function duckMusicFor(ch, at, name) {
    const d = SFX_DUCK[name];
    if (!d || !ch.duck) return;
    try {
      const g = ch.duck.gain;
      g.cancelScheduledValues(at);
      g.setTargetAtTime(dbToLin(-d[0]), at, 0.015);
      g.setTargetAtTime(1, at + d[1], 0.2);
    } catch (e) { /* ignore */ }
  }

  function sfxGroup(c, ch, def) {                          // dry gain + short shared reverb send
    const g = c.createGain(), sg = c.createGain();
    g.connect(ch.sfx); sg.gain.value = def.rev === undefined ? 0.2 : def.rev;
    g.connect(sg); sg.connect(ch.send('room'));
    return { g, sg };
  }

  function sfx(name, opts) {
    const def = sfxDef(name);
    if (!def) { warnOnce('sfx', name); return; }
    if (!ctx || ctx.state !== 'running' || muted) return;
    if (live.voices > MAX_VOICES || live.sfxv > MAX_SFX_VOICES) return;
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
    let nodes = null, grp = null;
    try {
      nodes = sfxGroup(ctx, chain, def);
      grp = { gain: nodes.g, reg: null, counted: true };
      grp.reg = makeRegistry(() => {
        const i = list.indexOf(grp); if (i >= 0) list.splice(i, 1);
        try { nodes.g.disconnect(); nodes.sg.disconnect(); } catch (e) { /* ignore */ }
        if (grp.counted) { grp.counted = false; live.groups--; }
      }, true);
      live.groups++;
      list.push(grp);
      const P = sfxParams(def, opts);
      REG = grp.reg;
      def.fn(sfxKit(ctx, nodes.g, now + 0.003, P));
      if (!paused && !(cur && cur.kind === 'jingle' && !cur.stopped)) duckMusicFor(chain, now + 0.003, name);      // not under a fanfare (extend / clear_boss / game over)
    } catch (e) {
      sfxFaults[name] = (sfxFaults[name] | 0) + 1;
      if (sfxFaults[name] >= SFX_FAULT_LIMIT) warnFault('sfx:' + name, 'sfx "' + name + '" keeps failing (' + (e && e.message ? e.message : e) + ') -- disabled');
    } finally { REG = null; }
    if (grp && !grp.reg.n()) grp.reg.onIdle();
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
        if (tr.kind === 'jingle') tr.wallDeadline += wall + 400;         // pause time does not count against a jingle
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
  const isTrackName = (n) => LOOPS.indexOf(n) >= 0 || JINGLES.indexOf(n) >= 0 || isDemo(n);

  // ---- offline rendering (debug / tests): the very same synth code into an OfflineAudioContext ----
  async function renderOffline(name, seconds, opts) {
    opts = opts || {};
    const OC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    const frames = Math.max(1, Math.ceil(seconds * OFFLINE_RATE));
    const oc = new OC(2, frames, OFFLINE_RATE);
    const ch = buildChain(oc, false);
    if (opts.noComp) { ch.glue.ratio.value = 1; ch.limiter.ratio.value = 1; }          // debug: bypass compression
    if (opts.mg) ch.music.gain.value = opts.mg;                                       // debug: music bus gain override (calibration at a level below the ceiling)
    nzReset();
    if (sfxDef(name)) {
      const def = sfxDef(name);
      const nodes = sfxGroup(oc, ch, def);
      const P = sfxParams(def, opts);
      if (opts.noTrim) P.v /= (def.trim === undefined ? 1 : def.trim);           // debug: raw, un-calibrated level
      def.fn(sfxKit(oc, nodes.g, 0.0, P));
    } else if (isTrackName(name)) {
      const prog = getProg(name);
      const tr = makeTrack(oc, ch, prog, prog.kind === 'jingle' ? 'jingle' : 'loop', false, opts.tempo || 1);
      tr.tempoFixed = opts.tempo || 1;
      tr.skip = opts.skip || null;                    // debug: lanes to leave out ('drum' = the kit)
      tr.pass = opts.pass | 0;                        // debug: which loop pass to render (odd = key-lifted when the song has a lift, and plays the `alt` version of the sections that have one)
      if (opts.alternate) tr.passLocked = false;      // debug: let the pass counter run (0, 1, 0 ... at every loop wrap) to test the seams between a pass and its variation
      tr.nextTime = 0;
      ch.setEchoTime(prog.echo * (60 / (prog.bpm * tr.tempoFixed)) / 4);
      ch.setEchoFb(prog.fb);
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
    // debug: extra SFX layered over the render, [[sfxName, atSeconds, polarity?, pitch?], ...] (mix / clipping / warm-level tests)
    for (const [sn, at, pol, pitch] of opts.sfx || []) {       // [name, at s, polarity (+1 / -1), pitch in semitones]
      const def = sfxDef(sn);
      if (!def) continue;
      const nodes = sfxGroup(oc, ch, def);
      if (pol) nodes.g.gain.value = pol;                    // measurement hook: polarity of the whole SFX (+1 / -1), so (mix + inverted mix) / 2 isolates the music as the chain left it
      def.fn(sfxKit(oc, nodes.g, at, { f: Math.pow(2, (+pitch || 0) / 12), v: def.trim === undefined ? 1 : def.trim }));
      duckMusicFor(ch, at, sn);                                // the inverted-polarity twin of a measurement pair ducks identically (the duck is part of "the music as the chain left it")
    }
    const t0 = performance.now();
    const buf = await oc.startRendering();
    renderOffline.lastMs = performance.now() - t0;
    return { sampleRate: OFFLINE_RATE, channels: [buf.getChannelData(0).slice(), buf.getChannelData(1).slice()] };
  }

  // ---- debug / test extras (not part of the contract) ---------------------------------------------
  function info(name) {
    if (sfxDef(name)) return { kind: 'sfx', max: SFX[name].max, quiet: !!SFX[name].quiet, quietDb: SFX[name].quiet ? (SFX[name].quiet === true ? 9 : SFX[name].quiet) : 0, lvl: SFX[name].lvl || 0, rev: SFX[name].rev };
    const prog = getProg(name);
    const beat = 60 / prog.bpm;
    return {
      kind: prog.kind, bpm: prog.bpm, swing: prog.swing, steps: prog.steps, loopStart: prog.loopStart,
      bars: prog.steps / STEPS_PER_BAR, seconds: prog.steps / 4 * beat, lift: prog.lift, maxTempo: prog.maxTempo,
      loopSeconds: (prog.steps - prog.loopStart) / 4 * beat, introSeconds: prog.loopStart / 4 * beat,
      placeholder: prog.placeholder, gain: prog.gain, peakSources: prog.peakSources, lanes: prog.lanes.map((L) => L.name),
      altSections: (prog.meta.altSections || []).map((a) => Object.assign({}, a)),       // sections that have a second-pass version (FIXPLAN_V3 A8)
    };
  }
  function dump(name) {
    const p = getProg(name);
    const notes = p.meta.notes.slice().sort((a, b) => a.s - b.s);
    return { name, bpm: p.bpm, swing: p.swing, key: p.key, mode: p.mode, steps: p.steps, loopStart: p.loopStart,
      lead: p.meta.lead, chords: p.meta.chords, sections: p.meta.sections, notes, altNotes: (p.meta.altNotes || []).slice().sort((a, b) => a.s - b.s), issues: p.meta.issues.slice(), kind: p.kind,
      lanes: p.lanes.map((L) => ({ name: L.name, inst: L.inst, cfg: L.cfg })), placeholder: p.placeholder, peakSources: p.peakSources };
  }
  function validate() {
    const issues = [];
    for (const n of trackNames()) for (const s of getProg(n).meta.issues) issues.push(s);
    for (const n of demoNames()) for (const s of getProg(n).meta.issues) issues.push(s);
    return issues;
  }
  function stats() {
    return { voices: live.voices, tracks: live.tracks, groups: live.groups, resyncs: live.resyncs, active: active.length, sfxVoices: live.sfxv,
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
  /** debug: leave these lanes out of the current track (['drum'] = the kit) -- live CPU ablation */
  function skipLanes(list) { if (cur) cur.skip = list && list.length ? list.slice() : null; }
  /** debug: move the current loop's read position (e.g. just before its end to test the loop wrap / pass counter) */
  function seek(step, pass) {
    if (cur && cur.kind === 'loop' && !cur.stopped) { cur.pos = clamp(step | 0, 0, cur.prog.steps - 1); if (pass !== undefined) cur.pass = pass | 0; }       // pass 1 = the second-pass (`alt`) version of the sections
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
  /** debug: compiled events of a track, [{step, k, lane, ...}] (k: n note, d drum, f fx, u duck, a automation) -- for the notation tests */
  function eventsOf(name, pass) {
    const p = getProg(name), out = [], par = (pass | 0) & 1;
    p.events.forEach((list, step) => { if (list) for (const e of list) { if (e.o !== undefined && e.o !== par) continue; out.push({ step, k: e.k, lane: e.lane, n: e.n, m: e.m, vel: e.vel, name: e.name, depth: e.depth, p: e.p, v0: e.v0, v1: e.v1, fn: e.fn && e.fn.name, o: e.o }); } });
    return out;
  }
  /** debug: register / replace a 'demo_*' song def (composer scratch pad and notation tests); returns the compile issues */
  function defineDemo(name, def) {
    if (!/^demo_[a-z0-9_]+$/.test(name)) throw new Error('AUDIO._define: name must match demo_[a-z0-9_]+');
    demoDefs()[name] = def; delete progs[name]; defsCache = null;
    return getProg(name).meta.issues.slice();
  }
  /** debug (instrument board): play a demo track ('demo_*') at once, loops repeat, one-shots end by themselves */
  function playDemo(name) {
    if (!isDemo(name) || !ctx) return false;
    const prog = getProg(name);
    if (prog.kind === 'loop') { playMusic(name, { restart: true }); return true; }
    jingle(name, {});
    return true;
  }

  // ---- debug (instrument board): single notes / hits / fx on a throw-away lane bus --------------------------------------------------------
  /** _note('pad', [57, 60, 64], 2, { vel, lane: {hall: .3}, cfg: {cut: 2000} })   instrument note / chord      _hit('K', vel)  one drum char      _fxNow('riser', 3)  one fx */
  function scratchLane(inst, laneCfg, play) {
    if (!ctx || !chain || disabled) return false;
    const cfg = Object.assign({}, INST[inst] ? INST[inst].d : {}, KIT_DEFAULT[inst] || {}, laneCfg || {});
    cfg.inst = inst;
    const L = { name: '_scratch', inst, cfg, needs: {}, duckAny: false };
    const rg = makeRegistry();
    const saved = REG; REG = rg;
    let lane = null;
    try {
      lane = buildLane(ctx, chain, L, chain.musicIn, 0);
      play(lane, ctx.currentTime + 0.03, cfg);
    } catch (e) { noteFault(e); } finally { REG = saved; }
    const done = () => { rg.clear(); if (lane) for (const n of lane.nodes) { try { n.disconnect(); } catch (e) { /* gone */ } } };
    if (!lane) { done(); return false; }
    rg.onIdle = () => setTimeout(done, 200);
    setTimeout(done, 12000);
    return true;
  }
  function noteOn(inst, midis, dur, o) {
    o = o || {};
    if (!INST[inst] || !INST[inst].play) return false;
    const ms = Array.isArray(midis) ? midis : [midis];
    return scratchLane(inst, o.lane, (lane, t, cfg) => INST[inst].play(ctx, lane, t, dur || 1, ms, o.vel === undefined ? 1 : o.vel, Object.assign(cfg, o.cfg || {})));
  }
  function hitNow(ch, vel) {
    const k = KIT[ch];
    if (!k) return false;
    return scratchLane(k[0], null, (lane, t) => k[1](ctx, lane, t, (vel === undefined ? 1 : vel) * KIT_LV));
  }
  function fxNow(name, seconds, vel) {
    if (!FXV[name]) return false;
    return scratchLane('fx', { hall: 0.3 }, (lane, t) => FXV[name](ctx, lane, t, seconds || 2, (vel === undefined ? 1 : vel) * FX_LV));
  }

  return { init, ready, music: playMusic, jingle, stopMusic, setTempo, sfx, setMuted, toggleMuted, isMuted,
    pause, resume, trackNames, sfxNames, _renderOffline: renderOffline,
    _info: info, _dump: dump, _validate: validate, _stats: stats, _state: state, _tap: tap, _seek: seek, _skip: skipLanes, _capture: capture,
    _demoNames: () => demoNames(), _demo: playDemo, _events: eventsOf, _define: defineDemo, _note: noteOn, _hit: hitNow, _fxNow: fxNow, _instruments: () => Object.keys(INST), _kit: () => Object.keys(KIT), _pats: () => Object.keys(PATS) };
})();

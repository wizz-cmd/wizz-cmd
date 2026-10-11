# FIZZ & POP — The Sunken Tower

Original Bubble Bobble-style arcade game (1–2 players, 30 rounds + boss) in ONE self-contained HTML file.
All graphics, music and sound are generated in code: v2.0 "Abyss Glow" is a resolution-independent neon look (vector art baked into a
sprite cache at the screen's own resolution, bloom + vignette post pass) with a procedural WebAudio soundtrack
(80s dark wave x modern EDM x industrial; Karplus-Strong twang, supersaw, 808, convolution reverb).

- Play: `dist/fizzpop.html` (standalone) — `dist/fizzpop.artifact.html` is the claude.ai Artifact fragment.
- Build: `flock /tmp/fizzpop.build.lock ./build.sh` (concatenates `src/NN_*.js` into `src/template.html`):
  `09_neon` drawing primitives, `10_gfx` core + world, `11_gfx_cast` every sprite, `20_audio`, `30_levels`, `40_game`, `50_main`.
- Test: `test/e2e_all.sh` (release gate, ~40 min; `--quick` skips the slow audio renders) = build, validators, GFX / audio / game / main suites
  (`gfx_all.sh`, `audio_all.sh`, `game_all.sh`, `main_all.sh --quick`), the e2e smoke test with the runtime-contract recorder, the SPEC_V2 §5 budgets
  and §1 photosensitivity / reduced-motion gates (`test/e2e_budgets.mjs`), the Artifact fragment test and the QA regression scripts.
  Review shots for the designer: `node test/e2e_review_shots.mjs` -> `out/v2/review/`.
- Auto quality: Main drops post-FX quality (2 -> 1 -> 0) and then the render scale k (resolution lever) when frames get slow, and raises them again
  when calm (`__fizzpop._main.autoQuality()`); `prefers-reduced-motion` is honoured.
- Design docs: `SPEC_V2.md` (binding for v2.0), `SPEC.md` (contract), `FIXPLAN.md`, `FIXPLAN2.md`, `QA_FINDINGS.md`.

Versions: v1.0-8bit (the pixel look, git branch `fizzpop-v1.0-8bit`), v2.0 Abyss Glow + new soundtrack (this tree).

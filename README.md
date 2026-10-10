# FIZZ & POP — The Sunken Tower

Original Bubble Bobble-style arcade game (1–2 players, 30 rounds + boss) in ONE self-contained HTML file.
All graphics, music and sound are generated in code (pixel art from palette strings, WebAudio chiptune).

- Play: `dist/fizzpop.html` (standalone) — `dist/fizzpop.artifact.html` is the claude.ai Artifact fragment.
- Build: `./build.sh` (concatenates `src/NN_*.js` into `src/template.html`).
- Test: `test/e2e_all.sh` (Playwright + Chromium).
- Design docs: `SPEC.md` (contract), `FIXPLAN.md`, `FIXPLAN2.md`, `QA_FINDINGS.md`.

Version v1.0-8bit: the 8-bit pixel look.

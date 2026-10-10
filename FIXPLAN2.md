# FIXPLAN2 — wave 3 (final polish; decisions by the lead designer)

Amends SPEC.md and FIXPLAN.md. Wave 3 = (a) the known leftovers below, (b) verified findings from the
wave-3 reviewers (handed to each fixer separately). Scope rule: fix what is listed; **no redesigns, no
new features**; every change must keep `test/e2e_all.sh` ALL GREEN.

## Known leftovers (from the wave-2 regression report)
- **K1 main — ambient bubbles over text:** title, howto and scores bubbles must never cross text or
  panels (exclusion rects for every text block incl. the HI SCORE header, or draw them behind panels at
  alpha ≤ 0.35).
- **K2 main/template — phone portrait layout:** controls anchored to the bottom thumb zone (bottom of the
  viewport, respecting safe-area/root padding); the canvas centred in the space above them; no empty
  band below the controls. Landscape unchanged. Keep 16 px side gutters and no horizontal scroll.
- **K3 main — ending credits overlap:** credits scroll inside a clipped band that never overlaps the hero
  tableau; the "ENTER: FASTER / ESC: SKIP" hint sits on its own dark plate outside the scroll band.
- **K4 game — angry readability on red tiles:** angry enemies get a pulsing warm aura: their white
  silhouette tinted yellow-orange drawn at ±1 px offsets behind the sprite, alpha pulsing 0.35–0.7.
- **K5 gfx — camouflage:** no enemy body colour within ΔE 14 of the dominant colours of the tiles it is
  shown on (Crabbit on R22–25 lava seams, angry crimson on R1–5/R21–25). Prefer shifting the *tile*
  variant colours (darker/desaturated seams) over changing the cast. Gate: qa_visual_camo ≤ 0.15 for
  every enemy × theme.
- **K6 levels:** open the R16 sealed room (cols 19–24, rows 1–4) and the R19 springle corners; fix the R27
  ceiling clusters if possible; soften the late hurry ramp: rounds 22–29 hurry 36–42 s (never below 36).
- **K7 audio:** the `start` jingle must end before the round-1 intro ends (≤ 2.4 s), and the stage loop
  starts on the downbeat right after it; title→start switch with a short fade is fine.

## Process
Same rules as FIXPLAN §6, but backups go to `backup/wave3/` and progress to `out/fix3/<module>_progress.md`.

# QA findings (wave 1) — full evidence
Generated from the six QA lenses. IDs are referenced by FIXPLAN.md.

## module: game

### M1 [major] Boss fight is far too long and the thunder bolt rarely hits (hit rate 14-31%, minimum 45 s, hurry/Bonefin guaranteed)  _(lens: mechanics)_
- **evidence:** Constants BOSS_HP_1P=60, BOSS_HP_2P=90, BOSS_THUNDER_PERIOD=45, max 6 thunder bubbles (src/40_game.js:122-125). Only thunder bolts hurt the boss, one HP per bolt, and the bolt flies only in the popper's facing direction (triggerSpecial, :716-719). Supply is 1.33 bubbles/s, so the theoretical minimum is 60/1.33=45 s (1P) and 67.5 s (2P). test/qa_mechanics_boss.mjs: a bot that teleports to the best bubble, pops with perfect aim and has no travel time needed 54.0 s, 58.5 s and 66.0 s (1P seeds 2, 1, 3) and 85.8 s (2P). test/qa_mechanics_bosshit.mjs: popping a thunder bubble at a random time, with the player already facing the boss side, hits only 31% (attractor 1 at (48,128)), 14% (attractor 2 at (172,96)) and 17% (mid). The boss overlaps a given bolt row only 24-41% of the time. At about 20% hit rate, 60 hits needs roughly 150-250 s (2P roughly 4+ min). level.hurry for round 30 is 60 s, so HURRY UP and Bonefin (at 70 s) are certain in practice. Bolts also miss when the player faces away, and zero-length bolts happen at walls.
- **expected:** A climactic boss that a competent player can finish in about 60-90 s (2P not much longer) without hurry/Bonefin being guaranteed.
- **actual:** The fight is bound by the thunder spawn rate and by low per-bolt hit probability. Even perfect play needs at least 45 s (1P) or 67 s (2P), and average play 2.5-4 min with Bonefin always arriving.
- **suggestedFix:** src/40_game.js: BOSS_HP_1P 60->36, BOSS_HP_2P 90->54, BOSS_THUNDER_PERIOD 45->30 (BOSS_THUNDER_MAX 6->8). In triggerSpecial for thunder, when the boss round is active (or always) fire bolts toward the boss, or in both directions, instead of owner.face: dir = boss ? sign(bossCenterX - b.x) : owner.face. Optionally let risePoint() pick the gap closest to the boss, or add a small vertical homing window so the bolt row tracks the boss centre. Optionally raise round-30 hurry to 90 s.

### M2 [major] Walkers/springles stay permanently confined in pockets on 7 of 29 levels (L11, 12, 13, 20, 23, 25, 28); L12 has 4 of 6 enemies frozen in place  _(lens: mechanics)_
- **evidence:** test/qa_mechanics_stuck2.mjs (idle god player, 3000 frames, seeds 3/11/29): L12 nibbler spawns at (56,24) and (176,24) plus a crabbit at (85,24) stay inside a 28 px box for 2999/2999/2721 frames. L25 springles are stuck in both bottom corners for 2785 frames (apex 168.1 vs a 2-tile block top at 168: the hop apex of exactly 32.0 px cannot clear the floating block). Others: L11, L13, L20, L23, L28 (screenshot out/qa/mechanics/l12_stuck.png). test/qa_mechanics_l12.mjs and a frame trace show a 28-frame limit cycle: x oscillates 78<->82 at y=32 in a 16 px-wide, 1-tile-deep notch under the ceiling. The jump apex is clamped by PLAY_TOP (y>=24), leaving only 8 px of headroom, which exactly equals the notch wall (8 px), so no jump can clear it. updateWalker also flips e.d on every wall bump, even in mid-air (src/40_game.js:921-926), and the escape hop launches away from the wall. A quick patch in a copy (out/qa/mechanics/fizzpop_patched_stepup.html: step up 1-tile ledges in moveX for enemies) cut the stuck entries from 34 to 15. A direction-only patch (fizzpop_patched_walker.html) did not help.
- **expected:** Walkers eventually leave any pit or notch (the :33-34 header comment promises 'pits/notches must never hold an enemy forever') and keep pressuring the player.
- **actual:** Enemies jitter in place for the whole round (until hurry), look broken, and are trivial sitting-duck targets. Levels with them play with a fraction of their intended enemy count.
- **suggestedFix:** Primary: add a one-tile step-up for enemies in moveX (src/40_game.js:193-209): when blockInner && !bodyHitsSolid(e.x,e.y) && bodyHitsSolid(nx,e.y) and e.t is set (not the kraken), and !bodyHitsSolid(nx,e.y-8) and e.y-8>=PLAY_TOP, then e.y-=8; e.x=nx; return false. Also add a watchdog: if a walker's position stays within 20 px for 360 frames, give it a free-pass jump (ignore block collisions while rising) or poof it to a random landable spot far from players. Hop springles harder (SPRINGLE_HOP -3.2 -> -3.5, apex 38 px). Levels: open the L12 notches at rows 3-4 cols 10-11 and 20-21 and the L25 bottom corners so no pocket is as wide as the 12 px body plus 4 px (or 8 px deep under a low ceiling), and make validate_levels simulate enemy jump height (32 px for springle, 8 px headroom under row 1).

### M3 [major] HURRY UP re-triggers after the boss bubble is popped (banner, sfx and tempo 1.3 over the victory fanfare and text)  _(lens: codereview)_
- **evidence:** src/40_game.js:1147 popBossBubble() sets S.hurry=false but leaves S.hurryT and S.hurryBanner alone, and playLogic():1276 is `if (!S.hurry && S.hurryT >= hurryAt) startHurry();`, so hurry restarts on the very next frame. Repro: test/qa_codereview_boss_hurry.mjs prints BUG_REPRODUCED = true (hurry:true, tempo 1.3 right after the pop). Screenshot out/qa/codereview/boss_victory_hurry_overlap.png shows the red HURRY UP! drawn through 'THE MOON PEARL / IS SAFE!'. test/qa_codereview_bossfight.mjs: a perfect teleporting bot needs 46.9 s in 1P and 72.6 s in 2P against the 60 s round-30 hurry, so every real fight is affected.
- **expected:** Once the Kraken King is defeated the round is won: no HURRY UP banner, no 'hurry' sfx and normal music tempo during the pearl and victory phases.
- **actual:** On every boss win where the fight outlasted 60 s: sfx 'hurry' plays over the clear_boss jingle, a flashing 'HURRY UP!' (120 frames) overlaps the victory text, and AUDIO tempo is 1.3.
- **suggestedFix:** 40_game.js playLogic: compute `bossBusy` before the hurry check and use `if (!S.hurry && !bossBusy && S.hurryT >= hurryAt) startHurry();`. Also in defeatBoss() (about :1124) do `S.ghost=null; S.hurry=false; S.hurryBanner=0; AUDIO.setTempo(1.0);`. The playLogic part is verified in out/qa/codereview/fizzpop_patched.html (hurry:false, tempo 1).

### M4 [major] Walkers get permanently stuck in top-row notches in rounds 12 and 26 (rising-ceiling clamp makes the escape hop useless)  _(lens: codereview)_
- **evidence:** src/40_game.js:225 `else if (e.y < PLAY_TOP) { e.y = PLAY_TOP; e.vy = 0; }` caps any jump started at y<=32 to <=8 px of rise (0 px from y=24). The 4-bump BUMP_ESCAPE hop at :925 therefore cannot clear a 1-tile lip, and it flips d away from the wall it just hit. test/qa_codereview_stuck.mjs (hurry disabled, god player parked at spawn): out/qa/codereview/stuck_10seeds.txt records 36 stuck instances in 10 seeds (nibblers 4468/4484 frames at x=77/165,y=24 in R12; crabbit/springle in R12 and R26; worst 4484 frames). Re-run today: runs/stuck_orig_12_26.txt has 14 instances across 4 seeds. Screenshot out/qa/codereview/r12_enemies_stuck_at_top.png and test/qa_codereview_r12.mjs.
- **expected:** Walkers can always leave a pit (the code comment at :33 promises 'pits/notches in a level must never hold an enemy forever').
- **actual:** In R12 two to four of the six enemies, including both nibblers that spawn on the top islands, never leave the pits at cols 10-11 and 20-21. The player has to climb to the top row to shoot them, and it cannot jump once there. R26 has the same issue with a springle.
- **suggestedFix:** 40_game.js physStep: let non-player entities rise to MAP_Y, e.g. `else if (e.y < (e.t ? MAP_Y : PLAY_TOP)) { e.y = Math.min(y0, e.t ? MAP_Y : PLAY_TOP); e.vy = 0; }` (the Math.min also stops the clamp pushing an entity down into a platform). Verified in out/qa/codereview/fizzpop_patched_ceil.html: 0 stuck in R12/R26 over 4 seeds x 4500 frames (runs/stuck_patched_ceil.txt) and 0 across all 29 rounds (runs/stuck_patched_ceil_all.txt, runs/roam_patched_ceil.txt). Alternative: remove the 2-wide, 1-deep notches from the R12/R26 maps in the levels module.

### M5 [major] Centred banners have no backing plate: 'ROUND n' is nearly illegible on ~10 of 30 rounds, other banners also fight with tiles  _(lens: visual)_
- **evidence:** src/40_game.js renderOverlays (~line 1670) draws ROUND n at 2x in theme accent2 with only a 1px shadow, y=84, right over platforms (tile coverage under the banner 11-80% on 29/30 rounds, out/qa/visual/tiles/banner_contrast.json). out/qa/visual/game/enter_frames_r16.png: 'ROUND 16' cyan on cyan crystal blocks is a blur; also out/qa/visual/rounds/r1_intro20.png (orange on pink), r21_intro70.png. Rounds with >5% of the banner box over tile pixels within dE30 of the text colour: 2,6,7,15,16,17,18,19,20,26 (R17 33%, R16 24%, R20 19%) -> test/qa_visual_assert.mjs G7 FAIL. GAME OVER (out/qa/visual/game/b7_gameover_a.png white on magenta tiles) and 'THE MOON PEARL IS SAFE!' (c6_victory_b.png) have the same issue.
- **expected:** All centred banners legible on every tile look.
- **actual:** Text is lost in tile texture when its colour matches the platforms behind it.
- **suggestedFix:** In Game.renderOverlays (src/40_game.js ~1670-1690) draw a dark translucent band behind every centred banner (ctx.fillStyle='rgba(6,4,20,0.72)'; fillRect(16, y-4, 224, textHeight+8)), or add a 4-direction 1px dark outline option to GFX.text. For ROUND n use white/pale text and keep accent2 as a 1px underline/frame. Apply to ROUND/READY, HURRY UP!, EXTEND!, GAME OVER and the victory text.

### M6 [major] R30 Kraken cannot be killed before HURRY/Bonefin: thunder supply (1 bubble per 45 frames) and 25-44% bolt accuracy cap the DPS; 2P (HP 90) is mathematically impossible under 60 s  _(lens: balance)_
- **evidence:** Constants: src/40_game.js:122 BOSS_HP_1P=60 / BOSS_HP_2P=90, :124 BOSS_THUNDER_PERIOD=45 / BOSS_THUNDER_MAX=6, src/30_levels.js:1431 hurry: 60; Bonefin spawns at hurry+600 frames (:1278, boss round not exempt). Each bolt hits once for 1 HP, so the floor is 60 x 45 f = 45 s at 100% accuracy in 1P and 90 x 45 f = 67.5 s in 2P, already beyond 60 s. Real timings from test/qa_balance_bossoracle.mjs (ORACLE: teleports into the best thunder bubble the moment the predicted bolt volley hits, no travel or dodging, so a strict lower bound), 8 seeds each: 1P pop-when-aligned median 120 s (102-136), 1P wait-for-clusters 108 s (87-116), 2P 176 s (151-200) / 152 s (137-162). test/qa_balance_boss.mjs (navigating bot with real physics and cluster-timing logic, god on): 213-316 s over 3-4 seeds, 'ghost true' in most runs. Hit rate: the bot fired 205-257 bolts for 60 hits (25-29%); the oracle needs 136-180 bolts for 60 hits (35-44%). Alignment geometry: the boss rect spans y 24-168 and a bolt is 8 px tall, so a given bubble row lines up with the boss only about 31% of the time. test/qa_balance_bossbubbles.mjs: with nobody popping, the 6 alive bubbles split into two groups of 2-3 (left x~40 y 100-120, right x~164 y 70-88) with chain components '2,2,1,1' or '1,1,1,1,1,1', so volleys of more than 3 are rare. For a stationary bot the boss body touched 50-61 times and ink 100-134 times in 230 s, so waiting under a cluster is costly. R30 screenshot out/e2e/round_30.png is consistent with the arena used.
- **expected:** A competent player should finish the Kraken in roughly 60-120 s (1P) and not more than ~1.5x that in 2P, before or at about the time Bonefin appears; HURRY should not be unavoidable in the final fight.
- **actual:** Even the teleporting oracle needs about 2 minutes (1P) or 3 minutes (2P); a realistic player faces 3.5-5 minutes, with HURRY at 60 s and invincible Bonefin from 70 s for essentially the whole fight. In 2P the HP 90 floor exceeds the HURRY time outright.
- **suggestedFix:** src/40_game.js: BOSS_HP_1P 60->40, BOSS_HP_2P 90->60, BOSS_THUNDER_PERIOD 45->30, BOSS_THUNDER_MAX 6->8. src/30_levels.js round 30: hurry 60->150 (or skip spawnGhost while S.bossPhase==='fight' before 150 s). Verified on a patched copy (out/qa/balance/patched/bossB.html): oracle 1P 61 s (pop-aligned) / 36 s (cluster), 2P 96 s / 54 s; navigating bot 97-155 s (median 131 s) versus 213-316 s now. Optional: BOSS_SPEED_MAX 1.4->1.1 (at low HP the diagonal speed is 1.98 px/f versus the player's 1.25). Making bolts 16 px tall alone (bossE.html) gives only 120 s -> 108 s, so cadence and HP are the real levers; a single attractor at [15.5,10] (bossG.html) does not help.

### M7 [minor] HURRY UP re-triggers at the moment the boss dies (banner, 'hurry' sfx, tempo 1.3 during the victory sequence)  _(lens: mechanics)_
- **evidence:** popBossBubble() sets S.hurry=false and calls AUDIO.setTempo(1.0) (src/40_game.js:1147) but does not reset S.hurryT. playLogic (:1271-1276) then starts hurry again on the next frame because hurryT >= hurryAt. Since the fight practically always lasts longer than 60 s, this happens on essentially every win. test/qa_mechanics_bosshurry.mjs: after the pop, hurry=true and hurryBanner=120; AUDIO.setTempo calls were [1.3, 1, 1.3, 1]. test/qa_mechanics_bosshurry_shot.mjs: banner still 95 frames into the victory phase (out/qa/mechanics/boss_victory_hurry.png). The tempo is reset when the play scene is left, and jingles ignore setTempo, so the visible/audible effect is the flashing HURRY UP! and the hurry sfx over the boss_die sfx and the victory text.
- **expected:** Round-30 victory is not interrupted by HURRY UP.
- **actual:** HURRY UP! flashes for 120 frames and sfx 'hurry' plays during boss death, pearl and victory.
- **suggestedFix:** In playLogic guard the hurry trigger: `const bossBusy = L.boss && S.bossPhase !== 'fight'; if (!S.hurry && !bossBusy && S.hurryT >= hurryAt) startHurry();`, and have popBossBubble (and defeatBoss) call resetHurry() so hurryT is zeroed.

### M8 [minor] A player on 0 lives who is still 'dying' when the round transition starts is revived with 0 lives (free extra life)  _(lens: mechanics)_
- **evidence:** beginTransition only handles `p.state==='dying' && p.lives>0` (src/40_game.js:1317-1318). A dying player with 0 lives stays 'dying'. checkGameOver is skipped during 'transition' (:1362), and startRound then sets every non-'out' player to 'normal' (:352-356). test/qa_mechanics_zombie.mjs (2P): P1 dies on its last life 20 frames into a no-food clear (parasol), the transition starts while P1 is still dying, and the next round starts with P1 state 'normal', lives 0, 0 reserve icons. P1 then plays and dies once more before being out.
- **expected:** A player who lost their last life is out of the game (state 'out') once the death animation would have finished.
- **actual:** They are resurrected on the next round start with an invisible extra life. This needs a death shortly before a no-food clear (parasol, EXTEND), so it is rare, but it is a state bug.
- **suggestedFix:** In beginTransition: `if (p.state==='dying') { if (p.lives>0) { p.state='normal'; p.inv=0; } else p.state='out'; }`, and run checkGameOver() when the transition ends.

### M9 [minor] Bubble bounce near the ceiling shoves the player above PLAY_TOP (y 17-23, into the HUD area) and re-bounces every other frame  _(lens: mechanics)_
- **evidence:** playerBubbleContacts sets `p.y = Math.min(p.y, b.y - 14)` (src/40_game.js:579). For a bubble with b.y < 38 (cluster hover rows are y 24-37), p.y becomes < 24. test/qa_mechanics_fuzz19.mjs: a bubble rising 42->30 at the left wall under a player holding jump gives per-frame y = 24, 23, 22, ... 17, 24.08, with vy forced to -3.75 every other frame for about 15 frames (the player jitters in and out of the ceiling/HUD). The bounce branch is not gated by noPopT.
- **expected:** Entities never go above y=24 (SPEC 4.1).
- **actual:** The player sprite flickers up to 7 px into the HUD and gets pinned while bouncing on top-row bubbles.
- **suggestedFix:** Clamp: `p.y = Math.max(PLAY_TOP, Math.min(p.y, b.y - 14));` and skip the bounce (pop instead) when b.y - 14 < PLAY_TOP, or require p.noPopT===0 for a new bounce.

### M10 [minor] Boss moves at 1.13-1.97 px/frame net, faster than the player (1.25) and faster than shoes (1.75)  _(lens: mechanics)_
- **evidence:** updateBoss applies speed to both axes (src/40_game.js:1094-1096). test/qa_mechanics_boss2.mjs: dx=dy=0.80 at full HP and dx=dy=1.39 at HP 1, so the net speed is 1.13 up to 1.97 px/frame. SPEC 4.5 says 'bounces diagonally 0.8 (speeds up to 1.4)'. A 36x36 hitbox at about 2 px/frame in the last third of the fight sweeps the whole arena, cannot be outrun, and combines with ink and Bonefin.
- **expected:** 0.8-1.4 interpreted as speed magnitude (the jellop explicitly says 'diagonal 0.6/0.6' per axis; the boss line is ambiguous).
- **actual:** Boss net speed is 1.41x the stated figure.
- **suggestedFix:** Make BOSS_SPEED_MIN/MAX magnitudes: `const c = spd*Math.SQRT1_2; e.x += e.jx*c; e.y += e.jy*c;` or set BOSS_SPEED_MAX 1.0. Keep 0.8-1.0 net if the contract is meant per axis.

### M11 [minor] Player 2 joining the boss round re-heals the boss (+30 HP on top of current HP)  _(lens: mechanics)_
- **evidence:** addPlayer2 adds `BOSS_HP_2P - BOSS_HP_1P` to both bossMax and the live boss hp (src/40_game.js:374). test/qa_mechanics_2p.mjs: hp 60 -> 90 at full health. With hp=10 the boss goes to 40. A 1P player who is losing the fight can press P2's bubble key to push the boss back up by 30 HP (an unfair penalty or exploit).
- **expected:** Joining scales the boss proportionally (keeps the damage dealt) or only adds HP if undamaged.
- **actual:** Flat +30 HP regardless of progress.
- **suggestedFix:** Scale: `e.hp = Math.round(e.hp * BOSS_HP_2P / BOSS_HP_1P)` (hp fraction preserved), or add nothing once the boss has been hit.

### M12 [minor] Specials have weak payoff: thunder is one-directional (wasted when facing the wrong way or at a wall), fire is a 5-tile patch, water flows away from the nearer wall regardless of enemies  _(lens: mechanics)_
- **evidence:** Thunder: triggerSpecial uses owner.face only (src/40_game.js:716-719). test/qa_mechanics_special.mjs: with enemies at x=60 (left) and 150/170/200 (right), the right-facing pop killed the 3 right enemies (1000/2000/4000) and left the left one. A pop at x=20 facing left produced 0 bolts (the bolt dies on its first update, `bo.x <= INNER_L`). Fire: FLAME_SPREAD=2 gives 5 flames x=112..144 for 240 frames on one platform, killing only enemies standing on that exact patch; flames stun the player 60 frames plus 60 immunity. Water: dir is chosen from the bubble x vs screen centre (:727), so pops on the right half flow left; test/qa_mechanics_water.mjs 'rightSide' carried 0 enemies while the target stood on the other side.
- **expected:** A special bubble that usually kills something when popped near enemies, as the arcade equivalent does.
- **actual:** Roughly half of thunder pops are wasted; fire and water kill only on a lucky alignment.
- **suggestedFix:** Thunder: spawn two bolts (dir=+1 and -1; skip the one that would die on spawn), or aim toward the nearest enemy (boss included). Fire: FLAME_SPREAD 2->4, or propagate flames along the platform at 1 tile/6 frames until the platform edge. Water: choose dir toward the nearest active enemy, falling back to away-from-wall.

### M13 [minor] pu_gold (faster bubble) has almost no gameplay value  _(lens: mechanics)_
- **evidence:** test/qa_mechanics_shot.mjs: normal shot travel 46 px in 24 frames; gold shot 45 px in 15 frames. The gold power-up changes only the bubble speed (SHOT_SPEED_GOLD 6.0, src/40_game.js:82, 407). Range is identical, enemies are slow (0.6), and the shot already captures at 72 px. Blue (cooldown 14->8) and pink (range 46->78) are real upgrades.
- **expected:** Each of the four lasting buffs (weight 12-15 each) is noticeably useful.
- **actual:** Gold saves 9 frames of flight time on the same range.
- **suggestedFix:** Give gold a real benefit: SHOT_RANGE_GOLD 64 px in addition to speed 6.0, or make gold fire two bubbles (a short spread) per press.

### M14 [minor] A player who loses the last life near a round clear is revived with 0 lives (free life / zombie)  _(lens: codereview)_
- **evidence:** src/40_game.js:353 startRound() only skips state 'out', and beginTransition():1318 revives only lives>0, so a 'dying' player with lives==0 is set to 'normal' (checkGameOver is skipped in 'transition'). test/qa_codereview_zombie.mjs prints BUG_REPRODUCED = true: P1 dies on its last life, P2 grabs a parasol 5 frames later, and P1 ends round 5 as state:normal, lives:0. test/qa_codereview_fuzz.mjs hit it in 2 of 12 seeds (zombie player x253 and x473). Rare in real play: the partner must clear within ~25 frames of the death.
- **expected:** A player with 0 lives and a finished death animation is 'out' for the rest of the game.
- **actual:** The dead player respawns at the next round with lives 0 and plays on. The next death takes the 'out' path, so it is effectively a free life and the HUD shows no reserve icons.
- **suggestedFix:** 40_game.js startRound line 353: `if (p.state === 'out' || (p.state === 'dying' && p.lives <= 0)) { p.state = 'out'; continue; }`. Alternatively handle it in beginTransition at :1318. Verified in fizzpop_patched.html (p0 stays 'out').

### M15 [minor] Bonefin keeps hunting after the Kraken King is defeated (until the boss bubble is popped)  _(lens: codereview)_
- **evidence:** src/40_game.js defeatBoss() (:1124-1131) never clears S.ghost / S.hurry; only popBossBubble() does (:1147), and the bubble rises at 0.3 px/frame (up to ~420+ frames). test/qa_codereview_boss_ghost.mjs: hurry+ghost active, killAll(); ghost:true in phase 'trapped'; an idle player at the spawn dies after 297 frames while bossPhase==='trapped'. BUG_REPRODUCED = true (also on the patched copy: the patch does not cover this).
- **expected:** Beating the boss ends the threats (ink is already cleared in defeatBoss; the ghost should go too).
- **actual:** A player who just won the fight can still lose a life to the Bonefin while walking to the boss bubble.
- **suggestedFix:** 40_game.js defeatBoss(): add `S.ghost = null; S.hurry = false; S.hurryBanner = 0; AUDIO.setTempo(1.0);` (also fixes the hurry re-trigger above).

### M16 [minor] P2 joining a running boss fight heals the Kraken King by 30 HP  _(lens: codereview)_
- **evidence:** src/40_game.js:374 addPlayer2(): `S.bossMax += 30; kraken.hp += 30`. test/qa_codereview_boss_join.mjs: hp 3/60 -> 33/90 on Game.join(1) (screenshot out/qa/codereview/boss_join_heal.png). P2's join keys are Q and Left Shift (also reachable by accident in a 1P game).
- **expected:** Joining scales the HP pool (60 -> 90) without undoing the damage already dealt.
- **actual:** A boss on 3 HP is back to 33/90 (37 %). Also: a P2 who has gone 'out' still leaves bossMax at 90 for the lone survivor.
- **suggestedFix:** 40_game.js addPlayer2(): scale proportionally, `const k = 90/60; e.hp = Math.max(1, Math.round(e.hp*k)); S.bossMax = 90;` (keeps hp/bossMax constant); optionally ignore Join in the boss round after the first hit.

### M17 [minor] leadingPlayer() returns an 'out' player when it has the higher score, so periodic EXTEND letters are wasted on the dead partner  _(lens: codereview)_
- **evidence:** src/40_game.js:684-688 starts with best=0 and only compares non-out players, so best stays 0 when P1 is out with the higher score. test/qa_codereview_leading.mjs: P1 out (5000 pts), P2 needs only 'D' -> only 20 % of the 60 letter bubbles carry 'D' (distribution {N:10,E:20,T:11,D:12,X:7}); patched copy gives 60/60 'D'.
- **expected:** The periodic letter is one that the leading living player still lacks.
- **actual:** After P1 is out, P2 mostly receives letters it already owns (worth only 500), so EXTEND is much harder for the last survivor.
- **suggestedFix:** 40_game.js leadingPlayer: `let best=-1; S.players.forEach((p,i)=>{ if(p.state!=='out' && (best<0 || p.score>S.players[best].score)) best=i; }); return best<0?0:best;` (verified in fizzpop_patched.html).

### M18 [minor] Round number and life icons have poor contrast on 18 of 30 wall variants (and EXTEND ghost letters are faint)  _(lens: visual)_
- **evidence:** test/qa_visual_assert.mjs G2: mean WCAG contrast of the HUD round digits vs surrounding wall px < 3.0 on rounds 1,2,4,5,6,7,8,9,10,15,16,17,18,19,20,22,26,30 (R1 1.85, R4 1.66, R6 1.64, R7 1.58, R17 2.02). Visual: out/qa/visual/hud/leftwall_all30.png (orange on pink R1/R5, lime on green R6-10, cyan on cyan R16, pale yellow on gold R28) and out/qa/visual/hud/letters_walls.png. P2 aqua life icons vanish on teal walls (R8,R10,R13,R16,R28, rightwall_all30.png). HUD labels (1UP / HI SCORE) also sit flush on the top pixel row (hud/hud_top_x8.png).
- **expected:** Round number and life icons legible on every wall variant, like the EXTEND panel.
- **actual:** drawRoundNumber (src/40_game.js:1601) prints accent2 directly on the wall; icons have no plate.
- **suggestedFix:** In renderHud (src/40_game.js:1635-1660) draw the same dark plate used for EXTEND (rgba(14,6,28,0.72)) behind the 2-digit round number (16x9 at y=MAP_Y+3) and behind the lives column, and print the number in white with the accent colour only as outline/underline. Optionally brighten the faint (alpha 0.28) uncollected EXTEND letters to 0.4.

### M19 [minor] Boss HP bar is an unframed purple strip painted over the ceiling tiles  _(lens: visual)_
- **evidence:** src/40_game.js:1661-1668 (x=64,y=18,w=128,h=4); out/qa/visual/game/c5_boss_play.png, c5_boss_angry.png: a flat bar overlapping ceiling row 0 and its gap, no frame/label/ticks, looks like a glitch. In intro it overlaps the Kraken's crown (c5_boss_intro.png).
- **expected:** A deliberate, themed boss gauge.
- **actual:** Naked rectangle on tile art.
- **suggestedFix:** Draw a dark backing plate over the ceiling (rect 60..196 x 17..25, rgba(6,4,20,0.9)), a 1px gold frame, a small crown icon (reuse the Kraken crown pixels) at the left end, 8 tick marks, and flash the bar on hit; hide it during 'intro'.

### M20 [minor] Victory overlay: banner flush against the walls and special bubbles still floating through the text  _(lens: visual)_
- **evidence:** out/qa/visual/game/c6_victory_b.png: 'THE MOON PEARL' at 2x is 224px wide = exactly the playfield (x16-240), the 'T' touches the left wall and the shadow overlaps the right wall; thunder bubbles keep rising over 'PEARL' because beginVictory (src/40_game.js:1371) doesn't clear S.bubbles. Same flush width in the story scene's 4th line (out/qa/visual/scenes/story_230.png, 28 chars = 224px).
- **expected:** Margin around centred text; calm victory screen.
- **actual:** Text collides with walls and bubbles.
- **suggestedFix:** Break the victory text into 3 shorter lines ('THE MOON' / 'PEARL IS' / 'SAFE!') or use scale 1 for line 1; on beginVictory pop/clear special and letter bubbles and projectiles; add the dark banner plate (see banner finding). In 50_main.js story copy wrap at <= 26 chars.

### M21 [minor] Boss victory: the clear_boss fanfare is partly masked by boss_die, and the ending music starts about 2.4 s after the fanfare ends  _(lens: audio)_
- **evidence:** test/qa_audio_bossdie.mjs: Game.popBossBubble starts jingle clear_boss and sfx boss_die in the same frame (40_game.js:1148-1149). Jingle level minus boss_die level per 0.5 s window: -3.0, -3.3, +1.5, +3.1, then clear. So the fanfare's opening G5-B5-D6-G6 sits 3 dB under the explosions, and boss_die's C-major chime run (C5 E5 G5 C6 E6 G6 C7 at 1.1-2.0 s) collides with the G-major jingle (B5 against C6 is a minor second around 1.3 s). test/qa_audio_pearl.mjs + flow H: after the 3.1 s jingle there is no music until Main's ending scene calls AUDIO.music('ending'): pearl grabbed at +1.4 s (best case), victory phase 4.0 s, so about 2.4 s of silence (1.0 s measured with an instant grab; longer for a slow player), during which 'THE MOON PEARL IS SAFE!' is shown.
- **expected:** The climax of the game should have a clear, un-masked fanfare and continuous music into the ending.
- **actual:** Fanfare under explosion noise, a pitch clash, then dead air.
- **suggestedFix:** 40_game.js popBossBubble: after AUDIO.jingle('clear_boss') add AUDIO.music('ending') (it queues behind the jingle; Main's later music('ending') is a no-op). Delay the jingle about 1.1 s (setTimeout/phase timer) or drop the chime section of boss_die (20_audio.js:386-387) so the two do not overlap. Minor in the same area: sfx powerup's A-lydian run contains C# (2 of 8 notes), which is outside all three music keys (G major, A dorian, E minor).

### M22 [minor] Chain kills all play the same sound; sfx pitch option is never used  _(lens: audio)_
- **evidence:** grep 'pitch' in src/40_game.js finds nothing; killEnemy() (40_game.js:~641-652) knows k = chain.kills but calls sfx('kill') without options. AUDIO.sfx supports {pitch: semitones}. The 'kill' sound is a falling staircase (1100->370 Hz, 20_audio.js:288), i.e. the wrong direction for an escalating 1000, 2000, 4000 ... 64000 chain.
- **expected:** The main scoring mechanic (chain multiplier) should be audible as escalation.
- **actual:** Seven chained kills sound like seven identical descending blips.
- **suggestedFix:** 40_game.js killEnemy: sfx('kill', { pitch: Math.min(2 * k, 12), vol: 1 + 0.03 * k }) and, in 20_audio.js, give kill a rising variant (e.g. ascending staircase) or add a short bell on k >= 3.

### M23 [minor] Enemies turn hostile ~60 frames before READY! ends and the player has no spawn protection: pad-rushes kill an idle player 0.35-1.0 s after READY! in R3, R21, R23, R26, R27, R30  _(lens: balance)_
- **evidence:** src/40_game.js:93 ENTER_FRAMES=90 (+6 frame stagger) but :117 INTRO_FRAMES=150, so enemies are 'active' from frame 90-132 while READY! is still drawn (:1676, phaseT>60) and the player can already move; startRound (:352-355) gives no p.inv although respawn gets RESPAWN_INV=120 (:75). test/qa_balance_rush.mjs (real, non-god, idle player; READY! ends at frame 150): R27 dies at frame 193 on both pads (all 4 seeds, springles); R21 P2 at 171-213 (springle); R23 P1 208; R3 P1 203-222; R26 P1 179-217 (crabbit pebble) ; R30 P1 230 (kraken). test/qa_balance_spawn.mjs (god, 8 seeds x 60 s, test/qa_balance_spawn_report.mjs): median first lethal contact after READY! under 3 s on P1 in R3 1.2, R5 2.6, R8 2.1, R10 2.0, R20 2.6, R22 2.6, R23 1.0, R27 0.7 and on P2 in R1 2.0, R3 1.2, R7 1.4, R8 2.2, R10 2.7, R20 2.4, R21 1.1, R24 2.5, R27 0.8, R29 1.9. R30: the boss starts with jx=-1, jy=1 (:328, :883) and always runs diagonally into the P1 pad corner (death at 230 f, 1.3 s). Springle-heavy rounds (R11, R21, R25, R27) rush the pads fastest because they hop toward the nearest player.
- **expected:** A round should not hurt the player before the READY! cue ends, and the first second of play should be a grace period consistent with respawns (120 f invulnerability).
- **actual:** Enemies hunt for up to 60 frames under the READY! banner, and 6+ rounds can kill a pad-sitter within 1 s of play starting; the boss's scripted first path hits the P1 pad every time.
- **suggestedFix:** src/40_game.js startRound(): after the p.face line add `p.inv = INTRO_FRAMES + 60;` (verified in out/qa/balance/patched/invstart.html: R27 first death moves 193->241, R21 P2 171->213, R23/R3 -> >=210). Additionally keep enemies inert until the intro ends: set ENTER_FRAMES so the last enemy (idx*ENTER_STAGGER <= 42) becomes active at >=150, or clamp updateEnter's 'active' switch to S.phaseT>=INTRO_FRAMES. For the boss use an enter time of INTRO_FRAMES and a seeded random initial jx/jy instead of the fixed (-1,+1) at :328/:883.

### M24 [minor] Boss ink fan is aimed dead-centre at the player and is effectively undodgeable by reaction at close range  _(lens: balance)_
- **evidence:** src/40_game.js:1104-1111 fireInk: 5 bullets at base angle +-0.3/0.6 rad, speed 1.4, k=0 aimed exactly at the player's centre, every 120 frames, no telegraph. test/qa_balance_ink.mjs (Monte-Carlo, 4000 trials, ink-only, real player physics macros, 150-frame window): share of trials where some move avoids all 5 bullets, by boss->player distance 0-40 / 40-80 / 80-120 / 120-160 / >160 px: reaction 200 ms 40% / 77% / 81% / 88% / 95%; reaction 400 ms 0% / 49% / 81% / 88% / 94%; reaction 600 ms 0% / 26% / 81% / 87% / 94%. Standing still survives in 0-1% of cases at every distance. Even with zero reaction time 5-18% of positions (corner pockets) cannot dodge. Boss-body-only survival when standing still is 42-71%. Variant 'even4' (4 bullets at +-0.15/+-0.45 rad, no centre bullet): standing still survives 88-100% beyond 80 px, close range unchanged.
- **expected:** A telegraphed spread the player can sidestep with normal human reaction (~300-400 ms) at any distance beyond roughly one body width of the boss.
- **actual:** Within 80 px of the boss the aimed centre bullet is a coin flip or worse (26-49% at 400-600 ms) and the fan is untelegraphed.
- **suggestedFix:** src/40_game.js fireInk: add a 20-24 frame wind-up (flash kraken_angry frame / white flash via flashT) before spawning the fan; use an even fan k = +-0.5, +-1.5 (4 bullets, no bullet aimed at the centre) or add a random +-0.15 rad offset so the player must still move; skip the fan (or reduce to the two outer bullets) when the nearest player is within ~48 px since the body already threatens there.

### M25 [polish] Player stays grounded with ~1 px of foot overlap, so Fizz visibly floats up to 14 px beyond a platform edge  _(lens: mechanics)_
- **evidence:** test/qa_mechanics_plat.mjs 'edge': the player falls only when the 12 px body fully clears the platform (rightEdgeFallX=142.5 vs platform edge 144; left edge -1 px overlap). test/qa_mechanics_edge.mjs on L1: last grounded x=93.75 with the platform edge at 96, so the 16 px sprite overhangs by 13.75 px (screenshot out/qa/mechanics/edge_hang_real_crop.png shows the axolotl hovering beside the ledge with only the left frill touching). Enemies use a centre+4 sample, so they turn earlier, which is inconsistent.
- **expected:** Standing needs a believable amount of support, with generosity but not floating.
- **actual:** A 1 px sliver keeps the player standing, so edges look like thin air.
- **suggestedFix:** In landingY calls for players use a narrower foot box (x+5..x+11, i.e. BODY inset 5) or require >=4 px overlap: `landingY(e.x+5, e.x+11, ...)`. Optionally add 4-5 frames of coyote time so the stricter edge doesn't cost jumps.

### M26 [polish] Fire presses during the 14-frame cooldown are swallowed (no fire buffer)  _(lens: mechanics)_
- **evidence:** updatePlayer fires only when `inp.firePressed && p.cooldown === 0` on the press frame (src/40_game.js:403). test/qa_mechanics_feel.mjs: press at frame 0 and again at frame 10 (4 frames before the cooldown ends) fires only at frame 0. A jump buffer exists (JUMP_BUFFER=4) but not a fire buffer; holding fire never auto-repeats (verified: 1 bubble in 120 frames of holding).
- **expected:** Mashing fire yields a steady 4.3 shots/s; presses a few frames early are not lost.
- **actual:** Early presses are dropped and the player has to re-press.
- **suggestedFix:** Add FIRE_BUFFER=4 like the jump buffer: on firePressed set p.fireBuf=4, decrement each frame, and shoot when cooldown===0 && fireBuf>0 (not stunned).

### M27 [polish] Floating bubbles collapse into one overlapping blob at the ceiling attractor (all chain-connected)  _(lens: mechanics)_
- **evidence:** test/qa_mechanics_cluster.mjs: 12 bubbles shot over 260 frames; after 400 more frames 12/12 are within 40 px of the attractor (124,40), spaced 14 px apart (PUSH_DIST=14 < 16 px diameter), the largest chain-connected component is 12/12, and several are clamped at y=24 under the ceiling (out/qa/mechanics/cluster2.png: warn-state bubbles hidden inside the blob; individual trap stages are hard to read). One touch pops the whole mass (including any enemy bubbles), which is fun but accidental.
- **expected:** Bubbles cluster believably, but individual bubbles and their warn/trap state stay legible, spreading along the ceiling.
- **actual:** A tight overlapping ball at a single point per attractor.
- **suggestedFix:** src/40_game.js: PUSH_DIST 14->17, PUSH_STEP 0.3->0.4, and for bubbles hovering at/above attractor row drift laterally along the ceiling away from the nearest neighbour (e.g. widen the cos wobble term and add a horizontal repulsion weighted 2x on x). Keep CHAIN_DIST 18 so the chain still propagates.

### M28 [polish] Enemies become hostile 12-60 frames before the READY! banner ends (player can die during the intro)  _(lens: codereview)_
- **evidence:** src/40_game.js: ENTER_FRAMES=90 inside INTRO_FRAMES=150; enemies turn 'active' at frame 90 + idx*stagger, and updateEnemies() applies contact kills in the intro. test/qa_codereview_intro_hostile.mjs: at frame 100 two enemies are active, and walking into one kills the player while READY! is on screen. (No enemy spawns within 28 px of a pad, so it needs the player to walk into one.)
- **expected:** Intro is safe until READY! disappears (arcade convention).
- **actual:** Enemies are hostile and angry-capable while the banner is still visible.
- **suggestedFix:** 40_game.js updateEnemies(): skip the contact loop when S.phase==='intro' (or keep `enter` enemies inert until phase 'play').

### M29 [polish] Chain score popups stack on each other and hide the dying sprites; EXTEND moment skips a 'all six lit' beat  _(lens: visual)_
- **evidence:** out/qa/visual/game/b4_dying_12.png: '8000', '16000', '32000', '64000' overlap enemies and each other; out/qa/visual/game/c3_extend_20.png: on the last letter the wall panel resets immediately, so the player never sees all six letters lit.
- **expected:** Readable chain feedback; a satisfying EXTEND payoff.
- **actual:** Clutter and a missing payoff beat.
- **suggestedFix:** In popup spawning (src/40_game.js popup()) offset concurrent popups vertically (y -= 9 per active popup within 24px) and draw them with a dark 1px outline; in beginExtend keep the six letters lit and flashing on the wall panel for the 'extend' phase before resetting.

### M30 [polish] 'land' is effectively inaudible  _(lens: audio)_
- **evidence:** Measured: peak 0.17, A-weighted -45.0 dB, 98.5% of energy below 150 Hz, loses 15 dB under the phone simulation; masking vs stage1/stage2/boss beds: 62%/30%/29% audible, SMR +0.8/+1.0/-4.2 dB. Game passes {vol:0.5} again at 40_game.js:402, so the real peak is about 0.085. Verified patch (qa_audio_proposals_sfx.mjs): bandpass 1100 Hz tick + triangle 360->160 thump + the low sine, trim 0.9: peak 0.18, A-weighted -40.1 dB, phone loss 5.5 dB.
- **expected:** A quiet but perceivable landing cue.
- **actual:** No audible landing feedback on any realistic device.
- **suggestedFix:** 20_audio.js land: use the patched definition above; 40_game.js:402 drop the {vol:0.5} override (or raise to 0.8).

### M31 [polish] No audio escalation or closure moments: boss phase 2, boss hurry at 221 bpm, round clear  _(lens: audio)_
- **evidence:** Boss track is one 45 s loop for the whole fight; kraken_angry (HP < 50%) has no audio cue (no setTempo/sfx in 40_game.js for it); hurry in round 30 gives 170 x 1.3 = 221 bpm with 16th gallop bass (14.7 notes/s) and 16th lead. Round clear (phase 'clear') has no stinger; music just continues (the SPEC jingle list has none).
- **expected:** Escalation at HP < 50% and a short reward cue when a round is cleared, to give 30 rounds a sense of progress.
- **actual:** Flat boss audio and no clear/progress cue.
- **suggestedFix:** 40_game.js: when the boss crosses 50% HP call AUDIO.setTempo(1.1) (and reset in popBossBubble); cap the boss hurry tempo at 1.15 via a per-track max in AUDIO.setTempo or in startHurry; optionally add a 0.8 s 'round_clear' stinger (G5 B5 D6 G6 pentatonic ping) played with {resume:true} at beginClear.

### M32 [polish] Angry enemies outrun the player in later rounds (and stay angry forever after breaking out of a bubble)  _(lens: balance)_
- **evidence:** src/40_game.js:97 ANGRY_MULT=1.6, SPEED_PER_ROUND=0.01 (cap 0.30), player WALK=1.25 (shoes 1.75). test/qa_balance_curve.mjs columns: angry Nibbler 0.96 px/f at R1 -> 1.23 at R29 (98% of player speed); angry Jellop net diagonal speed 1.36 at R1 -> 1.74 at R29; angry Springle 1.28 at R1, 1.41 at R11, 1.64 at R29 (horizontal speed while airborne). So an angry Jellop already outruns a shoeless player from R1 and an angry Springle from about R7. Bonefin is slower (0.7). Clear bot (god mode) shows 0-1.6 escaped bubbles per run, i.e. the angry state is mostly a penalty for slow players.
- **expected:** Angry enemies should be a threat that can still be out-manoeuvred at least on flat ground.
- **actual:** From R7 angry Springles and from R1 angry Jellops cannot be outrun; from about R25 angry Nibblers match the player.
- **suggestedFix:** src/40_game.js foeSpeed: cap the angry result at ~1.2 px/f for walkers/springles (e.g. Math.min(base*scale*ANGRY_MULT, 1.2)) or use per-type angry multipliers (springle 1.35, jellop 1.35, nibbler 1.6).

## module: gfx

### G1 [major] Springle reads as a green dinosaur/dragon (and echoes Bub's green dragon with orange spikes)  _(lens: visual)_
- **evidence:** out/qa/visual/strip_springle.png and out/qa/visual/game/a3_normal_angry_frozen.png: wide horizontal snout with cream 'teeth' stripes (SPRING_BODY rows 7 and 9, src/10_gfx.js:998-1013), 3-4 yellow spiky crest pixels on the head top ('.y.y .y..' row 0), teal/green body with yellow-orange spikes, tiny short spring. At 1x (out/qa/visual/anim/lineup.png bottom row) it is a small green dino head on a spring. Spec says seahorse with coiled spring tail; seahorse cues (tube snout, ringed torso, dorsal fin, curled tail) are absent.
- **expected:** A seahorse: tube snout, bulbous head with big eye, ringed S-curved torso with belly pouch, fan dorsal fin, prominent coiled spring tail; clearly NOT a green dragon (originality vs Bub).
- **actual:** Dino/dragon head profile in Bub-like green + yellow-orange spikes; the 'seahorse' is nearly unreadable.
- **suggestedFix:** Rebuild SPRING_BODY / SPRING_PARTS in src/10_gfx.js (keep 16x16, keep the 4 spring-height frames and squash frame). Remove: cream stripe rows on the snout, the 3 yellow head spikes, the flat forward snout. Add: (1) tube snout 2px tall x 4px long angled slightly down, one dark nostril px, no mouth line; (2) round head with one big eye (3x3 white, 2x2 pupil, 1px highlight) set high; (3) small coronet of 3 short curved frills in lilac (#b79cff) instead of yellow spikes; (4) torso with 3-4 horizontal ring bands alternating m/d and a pale belly-pouch bulge on the front; (5) lilac/pink fan-shaped dorsal fin (3x4) on the back, keep the 1px fin-flick frame; (6) bigger spring tail: 6px tall coil with 3 visible silver loops ending in a curled tip. Keep teal body but move accents from yellow to lilac/pink so it no longer matches Bub. Review out/qa/visual/strip_springle.png at 1x for a 'seahorse, not dino' read.

### G2 [major] Fizz/Pop facing direction is unreadable (front-facing, near mirror-symmetric)  _(lens: visual)_
- **evidence:** test/qa_visual_symmetry.mjs -> out/qa/visual/anim/symmetry.json: p1/p2 silhouette differs from its own mirror by only 2.3-9.4% of opaque px (p1_shoot 2.3%, p1_walk 3.8/8.2/3.8/9.4%, p1_idle 7/5.9%) versus 28-35% for facing enemies (nibbler/springle/glimmer). Zoom: out/qa/visual/anim/players_zoom_x10.png (rows 1 vs 2 and 3 vs 4 are almost identical); in-game: out/qa/visual/anim/fizz_walk.png (walking right looks like a front-facing sticker sliding). test/qa_visual_assert.mjs G1 FAIL (min 2.3%).
- **expected:** Facing direction obvious at 1x (SPEC 3.1 'Face right'; section 5 'clarity of facing direction').
- **actual:** Both eyes centred, symmetric frills, tail not distinguishable; flipping changes mostly shading. Players walking left/right/aiming bubbles give no facing cue.
- **suggestedFix:** Redraw p1_*/p2_* in src/10_gfx.js as a 3/4 or profile view: shift both eyes 2px toward the facing side and give the mouth/smile a forward offset; draw a clear 5-6px flat tail fin trailing behind at the lower back (2-frame wag in p?_walk, raised in p?_jump); show 3 frills on the near side and only 1-2 peeking on the far side; walk frames: lift alternating foot; shoot frame 1: mouth opened toward facing. Target mirror silhouette difference >= 15% on every frame (assert G1).

### G3 [major] Crabbit's claws read as shoulders (no pincers)  _(lens: visual)_
- **evidence:** out/qa/visual/strip_crabbit.png and out/qa/visual/game/a3_normal_angry_frozen.png (5x zoom): the body is one wide orange bar spanning the full 16px; the 'claws' are the outer 2-3px of that bar (CRAB_HALF rows 7-10, src/10_gfx.js:938-954, '.l.l.llm', '.llmlllm') with no notch, no gap, no arm. The look is a pumpkin with two antennae/ears; crabbit_die frames show the same shape.
- **expected:** Crab with recognisable open pincers (spec: 'Crab with long bunny-like eye stalks').
- **actual:** No claw silhouette; wide body bar = shoulders.
- **suggestedFix:** Redraw CRAB_HALF: shrink the carapace to cols 3-12 (rows 7-10); add separate raised pincer arms outside it at cols 0-3, rows 5-9: an open C-shape (upper jaw 'll' on row 5, 1px dark notch on row 6, lower jaw row 7, a 1px forearm diagonal joining the body at row 8), claws in the lighter l/c colours so they pop from the carapace, 1px dark gap between claw and body; in crabbit_throw close the near claw and raise it. Keep the eye stalks but make them diverge slightly (V) so they stop merging into a horseshoe/'U' with the claws.

### G4 [major] 'Angry' look is hot pink: collides with Fizz and with the pink/red coral and volcanic tiles; angry is signalled by hue only  _(lens: visual)_
- **evidence:** test/qa_visual_playerhue.mjs: mean-colour dE76 between p1_idle and nibbler/crabbit/jellop/springle/glimmer _angry = 23.3 / 18.5 / 27.1 / 27.2 / 33 (<35 is easily confused; G3 FAIL). test/qa_visual_camo.mjs -> out/qa/visual/tiles/camouflage.json: share of body px within dE14 of a tile colour: R5 nibbler_angry 0.79, springle_angry 0.78, glimmer_angry 0.65, crabbit_angry 0.62; R24 jellop_angry 0.60; R1 crabbit_angry 0.52. Greyscale row in out/qa/visual/anim/lineup.png shows angry vs normal differ little in value. Screens: out/qa/visual/game/a3_normal_angry_frozen.png.
- **expected:** Angry enemies instantly distinguishable from P1 and from the themed tiles, and recognisable without relying on hue alone.
- **actual:** Five angry enemies share Fizz's hue and the Coral Reef/Volcanic palettes.
- **suggestedFix:** Re-colour every *_ANGRY palette (src/10_gfx.js ~930-1100): crimson/orange-red body (#e0201c, highlight #ff7a1a, shade #5a0a0a), white sclera + glowing yellow pupils, instead of hot pink. Add a non-colour cue: 2-3px steam puffs above the head alternating per frame, or a '#' anger-vein mark. Keep silhouettes unchanged. Target dE >= 35 vs p1_idle (assert G3).

### G5 [minor] Frozen enemies are a flat 55% blue tint; Glimmer (already blue) barely changes  _(lens: visual)_
- **evidence:** src/40_game.js:1508-1510 drawTinted(... '#3aa0ff', 0.55). out/qa/visual/game/a3_normal_angry_frozen.png bottom row: frozen glimmer vs normal glimmer dE76 = 14.8 (test/qa_visual_assert.mjs G4 FAIL); all five lose their palette identity and there is no ice cue (no outline, glints).
- **expected:** Clearly 'frozen/ice' for every enemy type.
- **actual:** Looks like a colour filter; Glimmer is nearly indistinguishable from active.
- **suggestedFix:** Frozen: tint white-blue at 0.7 (white for Glimmer), add a 1px pale-cyan outline (draw the white silhouette offset by +-1px under the sprite), two alternating 1px sparkle pixels and a diagonal shine bar; keep the blink during the last 60 frames. Implement in drawEnemy/drawTinted (src/40_game.js ~1448-1511) or add a 'frozen' overlay sprite in GFX.

### G6 [minor] Moon Pearl halo is a muddy olive-brown ring, not a glow  _(lens: visual)_
- **evidence:** out/qa/visual/anim/items_zoom.png and out/qa/visual/sheet4.png: the 32x32 pearl is wrapped in a dull brown/olive ring. Palette src/10_gfx.js:1718 uses translucent warm yellows ('#ffd24a1e','#ffe06a3c','#fff09a66') that composite over the near-black background into brown (mean L*=31, chroma 17 over the theme bg; assert G5 FAIL). In-game: out/qa/visual/game/c5_boss_pearl.png.
- **expected:** A luminous pearl halo (the title/story scenes draw a convincing glow separately).
- **actual:** Dirty bronze halo around the final treasure.
- **suggestedFix:** Change the halo palette to a cool lilac-white at rising alpha (e.g. '#c8b8ff1e','#dcd0ff40','#f4eeff66') and add one more ring; or draw the glow in Game via ctx.globalCompositeOperation='lighter' behind the sprite and drop the halo from the sprite.

### G7 [minor] pu_shoes (flippers) reads as fried chicken / fish fin and is confusable with food_3 shrimp tempura  _(lens: visual)_
- **evidence:** out/qa/visual/anim/items_zoom.png (first vs second sprite) and strip_items.png: orange, textured, single wing-like shape in the same orange hue as the tempura. Listed on the How-To power-ups page (out/qa/visual/scenes/howto_3.png).
- **expected:** A recognisable flipper/shoe power-up that doesn't look like food.
- **actual:** Looks like a drumstick or orange croissant.
- **suggestedFix:** Redraw pu_shoes (src/10_gfx.js items) as a PAIR of webbed flippers side by side in lime/teal (#4fd0a0, not orange) with 2-3 webbing lines and a strap px, or as a winged sneaker; keep 16x16 with the standard outline and top-left light.

### G8 [minor] Thunder bolt is a thin 3px yellow squiggle with no impact  _(lens: visual)_
- **evidence:** out/qa/visual/game/b1_thunder_zoom.png and b1_thunder_6.png: the 'bolt' sprite (16x8) is a single thin yellow zigzag floating above the floor line; no glow, no trail, no screen flash for a screen-crossing kill.
- **expected:** A punchy lightning bolt (spec: 'clearly iconic'); the thunder bubble itself is nice.
- **actual:** Weak and easy to miss.
- **suggestedFix:** Redraw bolt frames with a 2px white-hot core, 1px cyan/yellow edge and a 1px dark outline; centre it vertically on the 16px hitbox; draw 2 ghost afterimages (alpha 0.5/0.25) behind it in drawWorldEntities (src/40_game.js:1566-1590) and trigger the existing flash (S.flashT) for 3-4 frames on pop.

### G9 [minor] Figure/ground clashes: sprites share hue with the tiles in specific rounds (incl. Round 1)  _(lens: visual)_
- **evidence:** test/qa_visual_camo.mjs -> out/qa/visual/tiles/camouflage.json (share of sprite body px within dE14 of any tile colour): R1 Fizz 0.84 (pink player on pink floor, first screen of the game), R16 Pop 0.72 (aqua on cyan crystal), R26 Glimmer 0.69 (blue on blue bricks), R26-30 Nibbler 0.44-0.59 (yellow vs gold trim), R2 Crabbit 0.56, R4 Crabbit 0.47, R18 Springle 0.49, R8 Pop 0.47. Overview sheets: out/qa/visual/tiles/all30_a.png, all30_b.png. Characters stay readable only thanks to the dark outline.
- **expected:** Sprites pop from platforms (arcade practice: tiles darker/less saturated than sprites).
- **actual:** Highly saturated, bright tile masses compete with the small 16px characters (e.g. R3 purple fish, R15 olive skull, R2 orange).
- **suggestedFix:** In GFX.levelCanvas variant palettes (src/10_gfx.js tile section) lower value ~15-20% and saturation ~15% for the conflicting variants (R1,R2,R4,R5,R16-R20,R26-R30) and avoid exactly matching the sprite hues: e.g. R1 platforms to a darker rose (#b04a78) so Fizz's bubblegum pink pops; R16 cyan to a deeper steel cyan; R26-30 reduce gold trim brightness. Optionally add a 1px bright rim (selective outline) to player sprites only.

### G10 [polish] GFX.levelCanvas builds each round's art lazily at the start of the transition scroll (6-36 ms hitch per new round)  _(lens: codereview)_
- **evidence:** test/qa_codereview_levelcost.mjs: first-use ms per level 36, 14.9, 13.9 ... sum 266 ms, max 36 ms (levelCanvas is first called from renderTransition, 40_game.js:1620-1623). Caches in 10_gfx.js are bounded (string cache 400, tint cache 48, 30 level canvases) and test/qa_codereview_leaks.mjs shows no growth.
- **expected:** No frame spike while a round change is animating.
- **actual:** One or two dropped frames at the start of the scroll; negligible on desktop, more visible on phones.
- **suggestedFix:** 40_game.js beginClear() (or startRound): pre-build the next round's canvas, `GFX.levelCanvas(to-1, LEVELS[to-1].map)`, in an idle frame before the transition.

### G11 [polish] Bubble ring has no dark outer outline; rim contrast over light tiles is only ~2:1  _(lens: visual)_
- **evidence:** out/qa/visual/tiles/bubbles_on_tiles_all30.png and bubble_zoom_worst.png; test/qa_visual_bubble_zoom.mjs: pale inner rim vs tile average has WCAG contrast 1.8-2.3 on R4, R2, R16, R18, R20 (outer blue rim 1.04-1.3 on basalt R21-25). The bubble is still findable because of the dark-teal fill, so this is a safety margin, not a failure.
- **expected:** Bubbles pop on all 30 looks.
- **actual:** Relies on the dark interior fill.
- **suggestedFix:** Add a 1px dark navy (#0b1030, alpha ~0.8) outer ring to bubble/bubble_warn/trap_overlay/bubble_shot (src/10_gfx.js bubble builders), keeping the current blue and cyan rim inside.

### G12 [polish] Nibbler/Crabbit and Glimmer/Jellop share hue families; Nibbler's wind-up key echoes Zen-Chan  _(lens: visual)_
- **evidence:** test/qa_visual_camo.mjs: mean-colour dE between nibbler and crabbit = 22.7 (both orange-yellow), glimmer vs jellop = 25.5 (both blue-violet); other pairs 47-79. Silhouettes keep them separable (out/qa/visual/anim/lineup.png). The T-shaped wind-up key on a walking toy is the signature motif of a well-known Taito enemy.
- **expected:** Five enemies separable by silhouette AND colour; no look-alikes of Taito art.
- **actual:** Two close hue pairs; one motif risk.
- **suggestedFix:** Shift Crabbit to a rust/brick red with a pale blue underside (CRAB_PAL) and Glimmer to a deep teal-green body (GLIM_PAL) keeping the yellow lantern; replace Nibbler's T-key with a small spinning cog/gear or a clock-face on its flank (NIB key sprite in 10_gfx.js).

### G13 [polish] Backgrounds are a single flat near-black colour per theme; the 5 rounds in a theme share it  _(lens: visual)_
- **evidence:** test/qa_visual_hazards.mjs output: GFX.theme(r).bg is one of 6 values (#16080f, #06140c, #120c07, #071120, #160807, #050918) for all 30 rounds; out/qa/visual/tiles/all30_a.png, all30_b.png.
- **expected:** Near-black with a subtle theme hue (spec) - but the level looks could carry more atmosphere.
- **actual:** Flat fills; only tiles differ.
- **suggestedFix:** Optional: add a very low-contrast vertical gradient and 2-3 faint theme silhouettes (kelp fronds, ship ribs, crystal spikes, lava glow at the bottom, temple pillars) drawn into a cached bg canvas in Game.renderPlayfield (alpha <= 0.12 so sprites stay readable); vary the hue slightly per variant.

### G14 [polish] food_2 (clam) reads as a pink brain/macaron  _(lens: visual)_
- **evidence:** out/qa/visual/anim/items_zoom.png (third sprite) and howto_2.png.
- **expected:** Recognisable clam.
- **actual:** Pink textured bun with a white band.
- **suggestedFix:** Redraw as an open clam: two ridged shell halves with fan ribs (lavender/pink) and a visible white pearl in the gap, hinge pixels at the back.

## module: audio

### A1 [major] Stage1/stage2 loops fatigue over a full run: one 8-bar phrase is 75% of the loop and the arrangement is flat  _(lens: audio)_
- **evidence:** test/qa_audio_score.mjs, qa_audio_density.mjs, qa_audio_dynamics.mjs, qa_audio_rhythm.mjs; scores in out/qa/audio/score.txt. Stage1 = 51.2 s / 32 bars: A, A2 (73% identical lead to A), B, A3 (97% identical to A, only bar 8 differs), so 24 of 32 bars are the same melody. Stage2 and boss: A2 lead is 100% identical to A (only the harm voice changes). Lead sounds on 97% of steps (stage1/stage2), 98% (boss); stage1 has one rest of 4+ steps in 32 bars and an unbroken 16-bar (25 s) lead run. Per-section loudness spread is only 0.44 dB (stage1), 0.46 (stage2), 0.24 (boss). The sum of the 15 round hurry limits in 30_levels.js is 558 s, i.e. about 11 loops (stage1) and 11.2 (stage2), roughly 12-13 with clear and intro time. That is about 35 hearings of the stage1 hook plus 12 loops of every other bar. SPEC calls for an A-A-B-A form of at least 32 bars, which this meets, but it is too little for the two themes that cover rounds 1-29.
- **expected:** Long-session variety: 64-90 s of non-repeating material, breathing room (rests or a lead-tacet bridge), and some per-pass or per-theme change so round 12 does not sound like round 2.
- **actual:** Effective unique melody is 16 bars (stage1) or 24 bars (stage2) of non-stop 8th-note lead with the same drums, voices and levels throughout.
- **suggestedFix:** src/20_audio.js songDefs(). Verified patch (validate() clean, strong-beat chord tones 93%, no new m2/M7 clashes, range E5..A6): add a bridge section to stage1 and set order ['A','A2','B','C','A3'] (40 bars, 64 s). The unused DRUMS.g1d pattern fits it. const S1C = { chords:'| Em | Bm | C | G | Em | Bm | Am7 | D |', lead:`| e6/3 e6/3 d6/2 b5/3 g5/3 b5/2 | d6/3 d6/3 b5/2 f#5/6 r/2 | e6/3 e6/3 d6/2 c6/3 g5/3 c6/2 | d6/3 d6/3 b5/2 g5/6 r/2 | g6/4 e6/4 b5/4 e6/4 | f#6/4 d6/4 b5/4 d6/4 | e6/2 c6/2 a5/2 c6/2 e6/4 g6/4 | a5/2 d6/2 f#6/2 a6/2 f#6/4 d6/4`, harm:{arp:'tender',gate:0.8}, bass:'half half half half half half bnc bnc', drums:'g1d g1d g1d g1d g1c g1c g1c g1f', cfg:{lead:{vib:[5.6,18,0.1]}} }. Do the same for stage2 (a 4th A-section replacement with a different lead). Also: give stage2 A2 and boss A2 their own lead (octave-up or 16th-fill variation) instead of only changing the harm voice. Also add a loop-pass counter in the engine (no API change): on every second pass swap A3 for the bridge or apply a +2 semitone key lift, so the same 'stage1' name sounds different at round 12.

### A2 [major] SFX loudness is calibrated on unweighted RMS: low-end-heavy sounds are 7-13 dB quiet perceptually and vanish on phone/laptop speakers  _(lens: audio)_
- **evidence:** test/qa_audio_measure.mjs sfx, test/qa_audio_masking.mjs, test/qa_audio_proposals_sfx.mjs. A-weighted active level (dB) of non-quiet SFX ranges from -16.2 (freeze) to -32.8 (boss_hit), a 16.6 dB spread; median is about -19.5. Low-end-heavy ones: boss_hit -32.8 (66% of energy below 150 Hz), thunder -26.7 (82%), bomb -25.7 (83.5%), boss_die -22.4 (71%), land -45.0 (98.5%). Small-speaker simulation (2nd-order HPF 300 Hz) loses 9.0 dB (thunder), 7.5 (bomb), 7.4 (boss_die), 5.4 (boss_hit), 15.0 (land); a laptop HPF at 150 Hz still loses 6.9/3.3/5.7/1.3/5.8 dB. Masking against the music bed (per 1/3-octave band, from 111 Hz up): thunder has only 19-45% of its energy above the music, SMR -2.3..-0.6 dB; bomb SMR +2.2..+3.9 dB; fire +2.1..+5.3 dB. Meanwhile bells (item_appear -16.3, freeze -16.2, letter -16.9) sit 3 dB above the median, in the 2-4 kHz band where hearing is most sensitive. audio_analyze.mjs checks +-4 dB on unweighted RMS, which is why all of this passes.
- **expected:** SPEC section 6: consistent loudness, bubbly and juicy, nothing piercing. Boss feedback (boss_hit fires on every bolt hit) must be as audible as shoot/pop on the devices a web game is played on, including phones with touch controls.
- **actual:** Boss hit, thunder bubble, star bomb and boss death read as quiet thuds or disappear on small speakers; jump (-26.0), spawn (-25.4) and ghost (-23.9) are also 5-7 dB below the pack.
- **suggestedFix:** src/20_audio.js SFX table: (a) move at least half of the energy of thunder/bomb/boss_hit/boss_die above 200 Hz (mid noise band 500-2500 Hz plus a 150-400 Hz saw thump), keeping only a short sub tail. (b) Re-fit the trims with `node test/audio_analyze.mjs --apply-trims` using A-weighted (or K-weighted) active loudness, target about -20 dB, and trim item_appear/freeze/letter down 2-3 dB. Verified candidate (offline patch): boss_hit = sine 300->70 v.3 + saw 700->220 v.55 + noise bandpass 2200->700 q.9 v1.0 + the two square clanks; thunder = noise bandpass 1800->300 v1.0 + saw 2000->160 + saw 240->70 v.3 + sine 95->34 v.35 + crackles; bomb = noise bandpass 2600->300 v1.0 + saw 320->60 v.3 + sine 150->30 v.4 + crack. This cuts the phone-simulation loss from 6.7/7.3/7.3 dB to 0.2/2.6/2.9 dB (boss_hit/thunder/bomb) and lifts boss_hit A-weighted level by 4.7 dB; trims then need raising (peaks 0.46-0.55 before trim).

### A3 [minor] Resume after a long pause can cut a half-played jingle when ctx.resume() is slow  _(lens: codereview)_
- **evidence:** src/20_audio.js:1379-1387: the wall-clock fallback (`else if (!paused)`) finishes any jingle whose wallDeadline (:1454, from performance.now() at creation) has passed. wallDeadline is not extended during pause() and resume() clears `paused` before the context is 'running'. test/qa_codereview_pause_jingle.mjs (initScript delays AudioContext.resume by 120 ms, typical for mobile): pause 5.5 s during the 3 s start jingle, RESUME -> jingle:null, music:'stage1' immediately (BUG_REPRODUCED = true). With zero added latency it does not reproduce (0/12 in test/qa_codereview_pause_jingle_race.mjs).
- **expected:** Pause time does not count against a jingle; it plays out after resume.
- **actual:** On devices with slow context resume the start / extend / gameover jingle is truncated and its onEnd fires at once.
- **suggestedFix:** 20_audio.js: record `pausedAt=performance.now()` in pause(); in resume() add `performance.now()-pausedAt` to every active jingle's wallDeadline.

### A4 [minor] Scheduler and SFX exceptions are unguarded: one failing WebAudio call freezes the music and floods the console  _(lens: audio)_
- **evidence:** test/qa_audio_fault.mjs (fault injection, mode detune: OscillatorNode.detune undefined, as on some older WebKit builds): 318 page errors in about 7 s (about 45/s) from pitched() called from tick()->pump()->advanceTrack()->scheduleStep(), music state never advances, game keeps running silently. Cause: 20_audio.js tick() (1370-1389) and scheduleStep() (1261-1277, try/finally only) have no catch, and the step position/clock is advanced after the throwing call, so the same step re-throws every 25 ms. sfx() (1494) has the same try/finally with no catch.
- **expected:** Audio must never throw into game logic or stall (SPEC 3.2 spirit: silent no-ops on failure).
- **actual:** A single unsupported feature or a closed context (InvalidStateError) produces a permanent music stall plus an error flood.
- **suggestedFix:** Wrap each event creation in scheduleStep and the body of sfx()/tick() in try/catch; on failure advance the step anyway, count the failure, and after about 20 failures call stopMusic and disable further scheduling with a single console.warn.

### A5 [minor] Three of four jingles are the same gesture: G-major triad rise ending on a long G6  _(lens: audio)_
- **evidence:** test/qa_audio_score.mjs interval signatures: start = 4 3 5 -1 1 -5 ... (G5 B5 D6 G6 F#6 G6 | D6 B5 G5 D6 G6/8), clear_boss = 4 3 5 4 -4 -5 ... (G5 B5 D6 G6 B6 G6 ... G6/6), title fanfare TI = G5 G5 B5 B5 D6 D6 G6. All three open with +4 +3 +5, are in G major, are 3.1-3.2 s long, and end on a held G6. extend is a G-pentatonic run to a held G6/12. Only gameover is clearly distinct.
- **expected:** Jingle clarity: a player should be able to tell start / 1UP / boss-clear apart by ear.
- **actual:** Start and boss-clear differ only by tempo (150 vs 156 bpm) and a few notes.
- **suggestedFix:** 20_audio.js D.clear_boss: resolve the E-minor boss theme to E MAJOR (Picardy). Verified patch: key:4, chords '| E | A/4.E/12 |', lead `| b5/2 e6/2 g#6/2 b6/4 g#6/2 e6/4 | a5/2 c#6/2 g#6/2 b6/2 e6/8` (validate() clean; first intervals become 5 4 3 -3 -4, a different contour and key from start/title). Give the title fanfare a different shape (e.g. a rising 4th/5th figure) so it is not the same triad as start.

### A6 [minor] The title loop is largely the stage1 tune  _(lens: audio)_
- **evidence:** test/qa_audio_originality.mjs: stage1 and title share 72 identical 8-interval windows (35% of stage1). T1 bars 1-4 are note-for-note S1A bars 1-4; T2 bars 1-5 and 7 are S1A2 bars 1-5 and 7. Both are in G at 144/150 bpm.
- **expected:** Contrast between title and stage1 (SPEC: 'title: short fanfare into a hook'); the hook should feel like an arrival when stage1 starts.
- **actual:** The player hears the stage1 hook on the title screen, again in the start jingle region, then for about 10 minutes in rounds 1-15.
- **suggestedFix:** 20_audio.js T1 bars 1-4: replace with a slower, broader hook. Verified (compiles, strong-beat chord tones 87%, shared windows 72->41): `| g5/4 b5/4 d6/6 b5/2 | e6/4 d6/4 b5/6 g5/2 | c6/4 b5/4 g5/4 e5/4 | f#5/2 a5/2 d6/4 f#6/4 e6/2 d6/2`. Rewrite T2 bars 1-5 as well (still a copy of S1A2) to remove the remaining 41 shared windows.

### A7 [minor] Rhythmic and timbral sameness across tracks, and the master compressor erases dynamic contrast  _(lens: audio)_
- **evidence:** test/qa_audio_rhythm.mjs: 160 loop bars across the six loops use only 30 distinct lead rhythms; the cell '0:6 6:2 8:4 12:4' (dotted-quarter, 8th, half-split) alone is 30 bars (19%) and occurs in all six tracks (stage1 x4, stage2 x5, boss x5, title x2, entry x8, ending x6); straight 8ths another 18 bars. All loops use the same three-voice recipe (25% pulse lead, 12.5% pulse harm, 'bass' wave) and the same drum kit; stage1 vs stage2 differ in mode and chords but not in timbre or drum family (g1 vs g2). test/qa_audio_dynamics.mjs: section loudness spread is 0.19-0.47 dB in every loop, and the ending's 'triumphant then tender' halves are -18.9 dB (X1A) vs -19.4 dB (X2B). Chain (20_audio.js:1177): threshold -20 dB, ratio 4 plus automatic makeup of about +5 dB (qa_audio_pump.mjs), so a 4 dB level change becomes about 1 dB. Compressor breathing itself is fine (p95-p5 gain 1.5-1.8 dB).
- **expected:** Distinct identity per track and an audible arc in the ending ('triumphant then tender'); SPEC 6: ending triumphant then tender.
- **actual:** Tender section is as loud as the triumphant one; tracks feel like variations of one recipe.
- **suggestedFix:** 20_audio.js buildChain: threshold -14 dB, ratio 2.5 (or limiter-style 8:1 at -6 dB) so per-section vol differences survive. Add per-section mix multipliers (compileSection already merges cfg; add sec.mix applied to the bus gains) and drop drums/lower lead to about -3 dB in X2A/X2B. Give stage2 its own lead timbre (50% pulse or triangle, slower vibrato) and a half-time drum family; replace the 6-2-4-4 cell in at least stage2 B and ending X1B with syncopated figures.

### A8 [minor] Loop-to-loop switches are not bar-aligned: stage1->stage2 (round 16), stage2->boss (round 30), title->start jingle cut mid-phrase  _(lens: audio)_
- **evidence:** test/qa_audio_flow.mjs B and C: music('stage2') is issued at play/intro of round 16 (call log 15842 ms) and AUDIO.music() does stopAll(0.04 s fade) followed by startLoop (20_audio.js:1424-1425), so the running loop is cut at an arbitrary step (stats showed pos 13 of 128 at an earlier switch); the start jingle likewise replaces the title loop with a 40 ms fade (flow B: jingle(start) at 1081 ms, title playing since the story scene).
- **expected:** Theme changes land on a bar line or crossfade; jingle resume already uses barStart() so the machinery exists.
- **actual:** Abrupt 40 ms cut, audible as a click-like chop in the melody at the two most dramatic theme changes.
- **suggestedFix:** 20_audio.js playMusic(): for loop->loop switches without opts.restart, keep the old track going until the end of its current bar (barStart(cur)+16 steps; at most 1.6 s) and start the new loop sample-accurately there, with a 150-250 ms fade-out; same for the start jingle replacing the title loop.

### A9 [minor] The bass line and kick are inaudible on phone-class speakers; some bass notes go below 60 Hz  _(lens: audio)_
- **evidence:** test/qa_audio_masking.mjs phone, qa_audio_measure.mjs stems, qa_audio_score.mjs bass register. Stage1 stems after a 300 Hz HPF: bass -29.2 -> -42.9 dB, drums -29.9 -> -40.6 dB, lead -27.7 -> -27.9 dB (similar on all six loops); bass-only energy is 72-76% in 60-150 Hz (centroid 111-137 Hz). 51% of bass notes are below 100 Hz in stage1/stage2/boss (59% title) and the lowest are G1 49 Hz (boss) and A1 55 Hz (stage1): the 'b' (fifth-below) symbol of the bnc2/gal2 patterns drops under BASS_LO=36 (20_audio.js:560, 585, 590). Bass wave harmonics: h2 about 7%, h3 about 16% of the fundamental (20_audio.js:156-164).
- **expected:** Bass line and groove survive on the speakers a touch/web game is played on.
- **actual:** On a phone the music is lead + arps + hats only; the bass and kick weight disappear and a third of the music's energy is not reproduced.
- **suggestedFix:** 20_audio.js: raise BASS_LO to about 43-48 (root range G2-F#3) and map 'b' to the fifth ABOVE; give the bass wave a stronger 2nd-4th harmonic set (e.g. h2 .3, h3 .2, h4 .12) or add a -12 dB 25%-pulse doubling one octave up; shorten the kick tail (setTargetAtTime 0.055 -> 0.04) so it does not smear over the bass root on beat 1.

### A10 [polish] Originality screen: one exact 5-interval outline shared with Tetris Type A; Bubble Bobble comparison needs a human ear  _(lens: audio)_
- **evidence:** test/qa_audio_originality.mjs against 27 famous tunes written from memory (windows of 5+ exact intervals, 9+ fuzzy). Real hit: boss lead bar 1 'E5 E5 E5 G5 B5 | A5 G5' has intervals 0 3 4 -2 -2, identical to Tetris Type A 'A A C E D C' (same tonic-tonic, minor third, fifth, step, step shape), different rhythm (16ths + a long note). Other hits are trivial scale runs and triad arpeggios (Canon, Hot Cross Buns, William Tell shape) and a fuzzy hit of stage1's bar 4->5 descent against Tetris; none are melodic quotes. The reference list does NOT contain the Bubble Bobble main theme (I cannot reproduce it reliably from memory). Macro-recipe worth a human check: stage1/title hook is a descending-thirds sequence over I-vi-IV-V (G Em C D) at 150 bpm in a bouncy major, which is the same general recipe as BB; the intervals themselves (+3 +5 -1 -2 -2 -3 ...) do not match anything I know.
- **expected:** SPEC 6: no quoting or paraphrasing of the BB theme or any known tune.
- **actual:** No flagrant copy found, but the boss riff shape and the BB macro-recipe are worth removing.
- **suggestedFix:** Boss BA bar 1, second phrase: replace 'a5/1 g5/1 e5/1 g5/1 b5/4' with 'd6/1 b5/1 g5/1 b5/1 e6/4' (verified: the Tetris outline is gone, validate() clean). Optionally break the strict descending-thirds sequence in stage1 A bars 1-3 (e.g. make bar 2 start on b5 instead of g5).

### A11 [polish] Look-ahead of 0.14 s makes the music drop out on main-thread stalls of 160 ms or more  _(lens: audio)_
- **evidence:** test/qa_audio_jank.mjs in the real game (stage1): stalls of 60-200 ms cause no resync, but a 200 ms stall leaves a hole of about 60 ms with bunched notes; 300 ms: 1 resync; 400 ms: 1 resync, 3 steps lost; 800 ms: 7 steps lost. HORIZON = 0.14 s and TICK_MS = 25 (20_audio.js:63-65).
- **expected:** Robust music on mobile/low-end devices where GC or layout stalls of 100-250 ms happen.
- **actual:** Audible dropouts on stalls above about 150 ms.
- **suggestedFix:** 20_audio.js HORIZON 0.14 -> 0.28 s (tempo change and hurry latency becomes about 0.3 s, which is inaudible); keep TICK_MS 25 or relax to 40.

## module: levels

### L1 [minor] Round-30 HURRY UP (60 s) is shorter than the minimum possible boss fight in 2P, so the Bonefin chase is guaranteed  _(lens: codereview)_
- **evidence:** test/qa_codereview_bossfight.mjs: a teleporting bot that only pops a thunder bubble when its bolt row crosses the boss needs 46.9 s (1P, 60 HP) and 72.6 s (2P, 90 HP; hurryAt 3599). Thunder bubbles are supply-limited (1 per 45 frames, max 6), so about 45 s is the floor even for perfect 1P play.
- **expected:** Hurry/Bonefin are pressure on dawdlers; the finale should be winnable without the chase.
- **actual:** A human fight takes minutes, so HURRY plus Bonefin (from 70 s) is present in effectively 100 % of boss fights. This is per SPEC 4.5 but hurts the finale.
- **suggestedFix:** 30_levels.js: set round 30 `hurry` to 150-180 s (or suspend the hurry timer while the Kraken is alive).

### L2 [minor] R19 Frost Star: bubbles shot from the upper rows end in an unreachable pocket inside the ceiling bead at x=184  _(lens: balance)_
- **evidence:** test/qa_balance_air.mjs + qa_balance_air_report.mjs: R19 attractor [24,13] (src/30_levels.js:917) is 96 px below the ceiling, so bubbles shot above its hover band rise to the ceiling and slide to x=192; 9 of 52 real shots end at (184,24) with 50% of the bubble inside the bead at cols 23-24 rows 2-3; tSettle = unreachable for all 9 (no standable spot within jump range; the row-2 bead surfaces are not standable since y < PLAY_TOP). Overlay: out/qa/balance/air/air_19.png (red box top right). Patched attractor [22,13] (out/qa/balance/patched/r19air.html, FP_HTML=... node test/qa_balance_air.mjs --levels 19): ceiling cluster moves to (168,24) and all shots are reachable (0 unreachable).
- **expected:** Every bubble gathering spot must be touchable by a player (standing jump or short walk).
- **actual:** Trapped enemies/bubbles that drift into the bead pocket cannot be popped; trapped enemies break out angry.
- **suggestedFix:** src/30_levels.js round 19: air [[15.5,5],[24,13]] -> [[15.5,5],[22,13]] (or delete the bead at cols 23-24 rows 2-3).

### L3 [minor] R27 (and R12/R18) bubbles gather at ceiling spots with no platform within straight-jump reach; R27's far attractors cause the round's spike  _(lens: balance)_
- **evidence:** test/qa_balance_ceil.mjs: ceiling gather clusters whose nearest standing spot for a straight-up jump is >10 px away: R27 x=68 (11 shots) and x=172 (12 shots), 26 px; R12 corners x=16 and x=224, 29 px (tSettle 266-315 frames from some spots); R18 x=116, 17 px; R19 see the pocket finding. R27 attractors [9.5,15],[22.5,15] (src/30_levels.js:1293) are 136 px below the ceiling, so any bubble shot from the upper half goes to the ceiling. Clear bot R27 (test/qa_balance_clear.mjs, 10 seeds, out/qa/balance/clear_*_p1.json): median 19.2 s (max 44.5 s), 1.6 escapes/run, hurry margin 2.1x, lowest of all rounds (others >=3.1x); the bot repeatedly trapped a glimmer that drifted to (172,24) and could not pop it (traplog: test/qa_balance_traplog.mjs 27). With attractors [9.5,9],[22.5,9] (out/qa/balance/patched/r27air2.html): median 13.8 s (max 19.3 s), 0.7 escapes/run, ceiling clusters at 176 drop from 12 to 3 of 52 shots. Idle pad-rush also peaks here (0.7 s, see the spawn finding).
- **expected:** Gather spots 2-4 rows above a platform a player can jump to, and a round following the R26 breather that is not the hardest of the late game.
- **actual:** R27 is a difficulty spike mostly because trapped bubbles drift to unreachable ceiling positions; R12 corners and R18 have a smaller version.
- **suggestedFix:** src/30_levels.js round 27: air [[15.5,3],[9.5,15],[22.5,15]] -> [[15.5,3],[9.5,9],[22.5,9]] (verified above). Round 12: move the wall attractors [3,12],[29,12] to [4,12],[28,12] (or add a ledge near the top corners). Round 18: [15.5,8] -> [15.5,9]. Re-run `node test/qa_balance_air.mjs --levels N` and `node test/qa_balance_ceil.mjs` after the change.

### L4 [minor] Difficulty plateau R17-R29 and clumped specials: no escalation except +1%/round speed, 6-round hole without specials (R16-R21)  _(lens: balance)_
- **evidence:** test/qa_balance_curve.mjs (table over LEVELS data, bot clear times, idle-pad hits): from R17 on every round contains all 5 enemy types with 6-8 enemies (threat score 9.0-14.1), bot median clear 10-13.5 s flat (R17 10.3, R18 13.1, R19 10.1, R20 12.6, R21 10.6, R22 11.7, R23 12.7, R24 11.5, R25 13.3, R26 10.9, R28 11.4, R29 10.7) with hurry/bot margin a constant 3.1-3.8x; trapTime only drops 352 -> 256 frames (about 0.13 s per round) and the speed scale 1.16 -> 1.28. Earlier spikes: R5 (bot 3.6 s -> 10.3 s, first thunder + 2 crabbits), R7 (threat 4.2 -> 7.2, 3 jellops debut). Specials only in R5, 8, 10, 13, 15, 22, 24, 27, 29, 30 so R16-R21 have none (src/30_levels.js).
- **expected:** A visible difficulty ramp through the last third and specials spread over the theme blocks.
- **actual:** 13 rounds of nearly identical pressure; round-to-round changes are imperceptible.
- **suggestedFix:** src/30_levels.js: add a special to one of R18/R19/R20 (fire or water) and R25; from R22 on lower hurry by 2-3 s per round or start 1-2 enemies angry via a per-round flag; consider 9 enemies in R29. src/40_game.js: TRAP_DECAY 8 -> 10 (floor 240 reached at R25) to make late trap windows 4 s.

### L5 [minor] Multi-attractor rounds almost never allow chain pops (R11, R22 none; R2, R15, R23, R24, R26 split)  _(lens: balance)_
- **evidence:** test/qa_balance_chain.mjs: every enemy of a round is frozen at its spawn and trapped with a real bubble shot, then the trapped bubbles float for trapTime-40 frames. Connected components (chain link <= 18 px) at that time: R11 1,1,1,1,1; R22 2,1,1,1,1,1; R2 2,1,1; R15 2,2,1,1; R23 4,1,1,1; R24 2,2,1,1; R26 2,2,1,1; R9 3,2,1; R20 3,2,2,1; R29 3,3,2; versus single-cluster rounds R1 3, R5 5, R10 6, R25 7,1, R17 5,1. pickAttractor (src/40_game.js:455) chooses the attractor by |dx| only, so bubbles split left/right at the moment they start floating.
- **expected:** The chain mechanic (x2 scoring, letters at 3 kills) should be reachable in every round when the player traps enemies close together.
- **actual:** In about 10 rounds with 2-3 attractors bubbles from different enemies end up in separate groups.
- **suggestedFix:** src/30_levels.js: reduce R11 [[16,5],[10,14],[22,14]] and R22 [[4.5,12],[15.5,8],[26.5,10]] to at most 2 attractors within ~40 px of each other, or src/40_game.js pickAttractor: pick by 2D distance with a bias toward the single lowest-row attractor. Verify with `node test/qa_balance_chain.mjs`.

### L6 [polish] R5 (and R24, R3) bubbles settle embedded inside solid blocks  _(lens: balance)_
- **evidence:** test/qa_balance_air.mjs, overlay out/qa/balance/air/air_05.png: 48 of 52 shots settle with more than 25% of the 16x16 bubble inside the apex coral block (mean overlap 0.43, max 0.98); R24 15/52 (max 0.41), R19 9/52, R3 8/52. The attractor point itself overlaps 25% in R5 ([15.5,5.5], src/30_levels.js) and R24 ([11,9]). Bubbles do pass through blocks by SPEC, they are reachable (tSettle median 40 f in R5), so this is cosmetic. Wobble/jitter was checked: at most 1.2-1.5 px range, no visible jitter in any round.
- **expected:** Gather points in open water, as the level header comment states ('open water 2-4 rows above a platform').
- **actual:** Bubbles visually sit inside the rock in R5/R24.
- **suggestedFix:** src/30_levels.js: R5 air [15.5,5.5] -> [15.5,6.5]; R24 air [11,9] -> [12,9]. Re-check with `node test/qa_balance_air.mjs --levels 5,24`.

## module: main

### U1 [major] Game and music keep running state when the host hides or scrolls away the iframe (no pause, no audio suspend)  _(lens: platform)_
- **evidence:** test/qa_platform_r2_hostvis.mjs (cross-origin sandboxed iframe, game playing, audio running). With the iframe display:none or scrolled offscreen: document.hidden=false, visibilityState=visible, no blur, Main.paused()=false, AudioContext 'running', AUDIO._state().paused=false while the game frame counter freezes (213->213 over 3 s). On re-show the frame counter continues at once (213->264) with no pause. With visibility:hidden the game even keeps stepping (354->444). So an Artifact panel tab switch, a chat scroll or a collapsed card leaves music playing over a frozen game, and the game resumes live on return. test/qa_platform_r2_hostvis2.mjs proves both detection routes work inside the iframe: IntersectionObserver gave isIntersecting=false/true, and a 500 ms setInterval watchdog logged 'no rAF for 985..2485 ms' while hidden. onBlur/visibilitychange (50_main.js:491-498, 1257) never fire in these cases.
- **expected:** When the game is not visible (iframe hidden, offscreen or throttled) it auto-pauses like a blur: AUDIO.pause(), input released, play scene paused.
- **actual:** Nothing fires; audio continues, game resumes unpaused.
- **suggestedFix:** In src/50_main.js bindDom(): (a) record `lastRaf = performance.now()` at the top of frame(); add `setInterval(() => { if (performance.now() - lastRaf > 700) onBlur(); }, 500)`. (b) add `if ('IntersectionObserver' in window) new IntersectionObserver((es) => { es[es.length-1].isIntersecting ? onFocus() : onBlur(); }, { threshold: [0, 0.05] }).observe(canvas);`. onBlur already releases input, pauses the play scene (auto) and suspends audio; onFocus only resumes audio when not paused.

### U2 [major] Touch layout is chosen by vw>vh alone, giving tiny or unplayable canvases in short or square frames and shrinking hybrid desktops after the first touch  _(lens: platform)_
- **evidence:** 50_main.js:1214 `land = touchMode && vw > vh` and :1219-1220 subtracts two pad-group widths from availW. test/qa_platform_r2_sweep.mjs (touch): 390x300 -> canvas 86x75 (x0.34); 360x300 -> 64x56 (x0.25); 480x270 -> x0.69; 600x500 -> 296x259 (x1.16, 26% of area); 768x600 -> x1.81. Portrait stacking would give about x0.82, x1.71 and x2.16 for the same frames. test/qa_platform_r2_hybrid.mjs (desktop context, dispatch one pointerType='touch' pointerdown): 700x600@2 goes from x2.00 to x1.55; 600x500 from x1.90 to x1.16; 900x700 from x2.50 to x2.00. The first touch on a touchscreen laptop or a coarse-pointer tablet panel therefore shrinks the picture even though the window did not change.
- **expected:** The touch layout is whichever of the two arrangements gives the larger canvas. In frames too small for either, the controls overlay the canvas margins instead of consuming width.
- **actual:** Landscape side pads are used for any frame wider than tall, including 390x300 and 600x500.
- **suggestedFix:** src/50_main.js fit(): compute `kPort = min((vw-2*GUTTER)/C.W, (vh-2*V_PAD-touchEl.offsetHeight-V_PAD)/C.H)` and `kLand = min((vw-2*GUTTER-2*(padW+12))/C.W, (vh-2*V_PAD)/C.H)`, then `land = touchMode && kLand >= kPort` (also require vw >= 560). Below k<1 let the pads overlay the outer wall columns (semi-transparent) rather than shrink the canvas. Also consider shrinking --btn (template.html:35, 77) with vh in landscape.

### U3 [major] Audio never recovers from an external suspend or interruption except via Pause then Resume (unlockAudio is one-shot)  _(lens: platform)_
- **evidence:** 50_main.js:417-420 `unlockAudio(){ if (audioSynced) return; ... }` and audioSynced becomes true after the first ready() (:1163-1166); 20_audio.js tick() has no resume retry. test/qa_platform_r2_audiounlock.mjs and test/qa_platform_r2_audiorecover.mjs (real autoplay policy): after `AudioContext.suspend()` from outside (what an iOS 'interrupted' state, a call, Siri or lost audio focus does), 3 arrow-key presses, a mouse click, M-M, and title-menu clicks all leave ctxState 'suspended' while AUDIO._state().paused=false; only Esc, Esc (setPaused(false) calling AUDIO.resume()) revives it. On iOS Safari that resume() runs from the RAF tick, not inside the gesture, so audio may stay dead until reload. I could not run real iOS.
- **expected:** Any later user gesture retries AudioContext.resume() inside the gesture handler; a 'TAP FOR SOUND' hint appears if the context is not running.
- **actual:** After the first successful unlock, gestures never re-arm audio.
- **suggestedFix:** src/50_main.js: drop the `audioSynced` guard in unlockAudio: `function unlockAudio(){ try { if (!AUDIO.ready() && !paused) AUDIO.init(); } catch(e){ reportError('AUDIO.init', e); } }` (AUDIO.init already resumes a non-running ctx). Keep calling it from pointerdown/pointerup/touchend/keydown. Also call AUDIO.resume() directly inside onCanvasPointer/touch handlers when the tap chooses RESUME. In 20_audio.js add `ctx.onstatechange` and a `needsGesture()` flag Main can show as a toast.

### U4 [minor] Quitting during the 3 s start jingle leaves stage music playing on the title screen (and title music delayed)  _(lens: codereview)_
- **evidence:** src/40_game.js:366 jingle onEnd guard is only `S && tok === musicSerial && !S.over`, and Game has no stop(). src/50_main.js:1102 leave() does not stop the jingle. AUDIO.music('title') while a jingle plays only queues the loop as the jingle's resume (20_audio.js:1418). test/qa_codereview_quit_jingle_real.mjs with real keys (Enter, Enter, Esc, Down, Enter) shows scene:'title', jingle:'start', music:null for about 2.5 s, then music:'stage1', which then stays on the title.
- **expected:** Leaving a game cancels its pending music callbacks and the title plays 'title'.
- **actual:** Title is silent until the jingle ends, then the round-1 stage loop replaces it and keeps playing on the title until the scene changes.
- **suggestedFix:** 50_main.js scenes.play.leave(): `if (!Game.isOver()) AUDIO.stopMusic();` (cuts the jingle and drops its onEnd; keep it conditional so the gameover jingle is not cut). Or add an additive Game.stop() that bumps musicSerial.

### U5 [minor] Window blur outside the 'play' scene does not pause: the game then starts unpaused with audio suspended (and the entry timer keeps running)  _(lens: codereview)_
- **evidence:** src/50_main.js:491 onBlur() -> setPaused(true,true) returns immediately unless scene==='play' (:477), but still calls AUDIO.pause(). test/qa_codereview_pause.mjs part (a): blur dispatched during the story gives audioPaused:true; 5 s later scene:'play', paused:false, frame 76 -> 166 (game advancing while unfocused, silent). Same for the 30 s name-entry countdown. test/qa_codereview_monkey.mjs ended once with scene play, paused:false and AUDIO ctx 'suspended'.
- **expected:** An unfocused window never starts or advances a game, or the game starts paused.
- **actual:** Alt-tabbing or clicking away during the 4 s story intro (or an Artifact iframe losing focus) lets round 1 start unattended and silent. The idle player can lose lives, and the audio stays suspended until a focus event.
- **suggestedFix:** 50_main.js: track `blurred` in onBlur/onFocus; in scenes.play.enter() call `if (blurred || !document.hasFocus()) setPaused(true, true)` after Game.start; freeze the entry timer (`if (blurred) return`) while blurred.

### U6 [minor] Ending is a plain text scroll: no victory tableau, heroes only appear as 16px icons  _(lens: visual)_
- **evidence:** out/qa/visual/scenes/ending_0040.png (small pearl + text on an empty blue gradient), ending_0300.png, ending_0600.png, ending_0900.png, ending_1300.png ('THE END' in plain yellow text). The only art are 16px icons in a centred list.
- **expected:** A finale that pays off 30 rounds (SPEC: 'scrolling victory + credits' composed, 'title/ending composition').
- **actual:** Reads like a generic credits roll.
- **suggestedFix:** In the ending scene (src/50_main.js) open with a tableau: Fizz and Pop (use the 2P art, optionally 2x nearest-neighbour) flanking a large glowing Moon Pearl with slowly rotating light rays (draw rays with GFX/ctx, additive), reef-light colour washing in from the bottom, bubbles rising; end with all six enemies lined up waving instead of a text list, and keep THE END with the logo bubble letters via GFX.drawLogo or a bubbly treatment.

### U7 [minor] Title composition: tiny mascots in the corners, uneven text panels, bubbles clutter the menu  _(lens: visual)_
- **evidence:** out/qa/visual/scenes/title_60.png, title_140.png, title_continue.png: huge logo vs 16px mascots at the floor corners; two stacked dark text panels of different widths (controls panel 84-684px, copyright panel 180-588px at 3x) with text touching panel edges; drifting trapped-enemy bubbles sit behind '2 PLAYERS' / 'CONTINUE ROUND 6' text. With CONTINUE shown the 4th item (SOUND ON, y=140) is only ~10px above the controls panel.
- **expected:** Balanced title screen with characters integrated with the logo.
- **actual:** Functional but bottom half is dense text and the mascots are lost.
- **suggestedFix:** In scenes.title (src/50_main.js ~565-640): perch Fizz and Pop on the logo letters (F top-left and the O of POP) or flank the menu; use one shared panel with 4px padding for controls+copyright; keep ambient bubbles away from the menu column (x 64-192, y 90-150) or draw them at lower alpha; reduce menu pitch to 12 when 4 items.

### U8 [minor] Phones: fractional canvas scale (uneven pixels), large dead space in portrait, 'PUSH Q' shown on touch devices  _(lens: visual)_
- **evidence:** test/qa_visual_phone.mjs layout: 360x640 -> scale 1.281 (328x287 canvas), 390x844 -> 1.398, 320x480 -> 1.125; out/qa/visual/phone/p360x640_play.png, p390x844_title.png: pixel columns are uneven/smeary, and ~215px of empty page above and ~210px between canvas and controls (canvas uses ~35% of the screen). The blinking cyan 'PUSH Q' (HUD, src/40_game.js:1641) is shown on touch devices where Q does not exist (p360x640_play.png, l640x360_play.png).
- **expected:** Crisp pixels, sensible use of space, no keyboard hints on touch.
- **actual:** CSS-fractional scaling, centred canvas floating between the page edges and controls.
- **suggestedFix:** Main.fit (src/50_main.js): size in DEVICE pixels, s = floor(availCssW*dpr/256)/dpr (e.g. dpr 3 on 390px -> 1.333 css = 4 device px per game px), fall back to fractional only if < 2 device px; in portrait anchor the canvas to the top (or just above the controls) instead of vertically centring. Pass a touch flag into Game (Game.start opts or Game.setHud({touch:true})) so the 'PUSH Q' blink is replaced by '2P: JOIN' or hidden.

### U9 [minor] Pause-menu navigation and RESUME/QUIT confirmations are silent  _(lens: audio)_
- **evidence:** test/qa_audio_flow.mjs D (checks D3, D4 FAIL). Call log: sfx(menu_move) x4 with ctxBefore=suspended, groupsDelta=0; resume() then sfx(menu_select) with ctxBefore=suspended, groupsDelta=0. The 'pause' blip itself is audible (ctxBefore=running, groupsDelta=1). Cause: AUDIO.pause() suspends the context 320 ms after the call (20_audio.js:1511-1521) and sfx() returns when ctx.state !== 'running' (20_audio.js:1471); resume() is asynchronous so the confirm blip right after it is dropped too. The QUIT choice (50_main.js:~1092) plays menu_select under the same suspended-context condition (same code path, inferred rather than measured).
- **expected:** Every menu has audible move/select feedback; the title menu does.
- **actual:** Pausing is the only menu with no feedback, and un-pausing makes no sound.
- **suggestedFix:** 20_audio.js pause(): for a manual pause keep the context running (duck music, stop the scheduler, nothing else costs CPU) and only call ctx.suspend() for blur or hidden-tab (e.g. AUDIO.pause({suspend:true}) from Main.onBlur and the visibilitychange hook). Alternative in Main.setPaused(false): call AUDIO.resume() and play menu_select about 60 ms later.

### U10 [minor] An externally suspended/interrupted AudioContext is never recovered by a user gesture  _(lens: audio)_
- **evidence:** test/qa_audio_interrupt.mjs: after ctx.suspend() from outside (simulating iOS call/Siri interruption), the state stays 'suspended' after ArrowDown, a mouse click and Enter; only a blur+focus cycle recovers it. Cause: 50_main.js:417-420 unlockAudio() returns early once audioSynced is true (set at 50_main.js:1166), and 20_audio.js has no statechange handling (grep for statechange/interrupted finds nothing).
- **expected:** Any tap or key press revives audio whenever the context is not running (standard practice for iOS Safari 'interrupted').
- **actual:** Audio stays dead until the page is blurred, hidden or reloaded.
- **suggestedFix:** 50_main.js unlockAudio(): drop the audioSynced early-return, or use `if (!AUDIO.ready() && !paused) AUDIO.init()` (init() is idempotent and resumes a non-running context). Optionally add ctx.onstatechange in AUDIO.init to log the state and re-run syncSceneMusic after a recovery.

### U11 [minor] Touch menu hit targets are 18-27 css px; QUIT sits one row from RESUME with no confirmation  _(lens: platform)_
- **evidence:** 50_main.js:554-558 rowAt() uses the row pitch as the hit height; title PITCH=14 game px (:562), pause PAUSE_PITCH=16 (:1088). test/qa_platform_r2_shots.mjs: row height in CSS px = 17.9 (360 wide), 19.6 (390), 23.4 (844x390) for the title; 20.5 / 22.4 / 26.7 for the pause menu. 44 css px would need about 2.5 rows at 360 wide. A finger centred on '2 PLAYERS' routinely lands on '1 PLAYER' (starts the game at once, no undo) or 'SOUND'. QUIT abandons the run in one tap.
- **expected:** Tappable rows of at least 40-44 css px; destructive QUIT confirmed.
- **actual:** About 18-27 px rows, adjacent QUIT, immediate action.
- **suggestedFix:** In touch mode (touchMode) lay the title and pause menus out with a pitch of ceil(44/scale) game px (drop the two hint panels, which duplicate the on-screen buttons) and hit-test the full pitch plus the full text width. Add a second step for QUIT ('QUIT? YES / NO') or separate QUIT from RESUME by at least 24 game px.

### U12 [minor] Touch-only players cannot reach HOW TO PLAY or HI-SCORES, and 2 PLAYERS is offered although P2 has no controls  _(lens: platform)_
- **evidence:** 50_main.js:566-570 title items are only p1/p2/cont/sound; how-to is key H and the table is key T (:615-616), documented only in the desktop legend which is display:none in touch mode (template.html:97). Touch is wired to pad 0 only (:289 `(i===0 && touch(a))`). Choosing 2 PLAYERS on a phone gives an idle P2 that soaks enemies, and SPEC 4.5 makes boss HP 90 instead of 60 in 2P. The how-to page 0 (screenshot out/qa/platform/r2/howto_touch.png) lists only keyboard keys (A D W Q).
- **expected:** Menu rows for HOW TO PLAY and HI-SCORES on every device. 2 PLAYERS hidden or annotated on touch-only devices without a pad. Touch instructions on the how-to page.
- **actual:** How-to and scores are only reachable through the 10 s attract loop on touch; 2P is a trap.
- **suggestedFix:** src/50_main.js build(): add {id:'help'} and {id:'table'} items (gotoScene howto / scores); when touchMode && no gamepad connected, label p2 '2 PLAYERS (PAD/KEYS)' or hide it. In howto page 0 branch on touchMode and show 'JUMP / BUBBLE / ◀ ▶' instead of A-D-W-Q.

### U13 [minor] Mouse-pressed touch pad button stays pressed if the pointer is released off the pad (hybrid or desktop touch UI)  _(lens: platform)_
- **evidence:** 50_main.js:381-393: pointermove and pointerup are only listened to on #touch; a mouse has no implicit capture. test/qa_platform_r2_mouse.mjs (touch UI visible, mouse down on the right pad, drag to the canvas, release): `on` stays ['right'] after release and the player keeps running (x 94 -> 124 in 0.4 s) until the next pad press-and-release. Reproduces on hybrid laptops, Chromebooks, and desktop Chrome in device-emulation.
- **expected:** Releasing the button anywhere ends the press.
- **actual:** The direction is latched.
- **suggestedFix:** In bindTouchControls pointerdown: `try { e.target.setPointerCapture(e.pointerId); } catch(_){}` or register `window.addEventListener('pointerup'/'pointercancel', (e) => touchRelease(e.pointerId), true)`.

### U14 [minor] Name-entry hint on touch renders '? ?' because the font has no ◀ ▶ glyphs  _(lens: platform)_
- **evidence:** 50_main.js:996 `touchMode ? '◀ ▶ CHANGE   BUBBLE: OK'`. GFX font only has ← → (SPEC 3.1), so the glyphs map to '?'. Screenshot out/qa/platform/r2/entry_touch.png shows '? ? CHANGE   BUBBLE: OK'. Reached by every phone player who earns a hi-score.
- **expected:** Readable arrows.
- **actual:** Two question marks.
- **suggestedFix:** src/50_main.js:996: use '← → CHANGE   BUBBLE: OK' (supported glyphs) or 'LEFT/RIGHT: CHANGE'.

### U15 [minor] A tap on Left Shift (next to Z, the P1 bubble key) joins P2 into a 1P game  _(lens: platform)_
- **evidence:** KEYS[1].fire includes 'ShiftLeft' (50_main.js:81) and the 1P branch calls Game.join(1) on pads[1].firePressed (:1121). test/qa_platform_r2_bigcanvas.mjs: 1P game in round 3, down/up ShiftLeft -> Game.result().players 1 -> 2 and a second life pool of 3 appears. Left Shift is physically adjacent to Z, so a Z-mashing 1P player can brush it. The join also gives an idle P2 and a 90 HP Kraken (SPEC 4.5).
- **expected:** Only the deliberate join input (Q, or pad 1) joins P2; the HUD says 'PUSH Q'.
- **actual:** Left Shift also joins.
- **suggestedFix:** src/50_main.js: derive join from `tapped/down KeyQ` or pad-1 A/B only, not from pads[1].firePressed (keep ShiftLeft as a P2 fire key during 2P play), or require a 20-frame hold.

### U16 [minor] Safe-area handling ignores the Artifact skeleton's root padding: canvas clipped in landscape, bottom inset double-counted in portrait  _(lens: platform)_
- **evidence:** The publish skeleton pads :root top and bottom by env(safe-area-inset-*) while fit() (50_main.js:1212-1222) uses window.innerHeight and ignores that padding. test/qa_platform_r2_artifact.mjs (CDP setSafeAreaInsetsOverride, skeleton-wrapped dist): 844x390 with bottom inset 21 -> canvas top = -2 px (canvas 374 tall in a 369 px body, top HUD row cut); plain dist top = 8. 390x844 with top 47 / bottom 34: bar buttons end 76 px above the viewport bottom (34 root + 8 body + 34 from template.html:93 `max(10px, env(safe-area-inset-bottom))`) versus 42 px without the skeleton. The game's own meta (template.html:5) lacks viewport-fit=cover, so which meta wins is host dependent (wrapped doc has two viewport metas).
- **expected:** fit() measures the box actually available. The bottom inset is counted once.
- **actual:** Fit uses the full viewport height, and the bottom inset is applied twice.
- **suggestedFix:** fit(): `const cs = getComputedStyle(document.documentElement); const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom); availH = vh - padY - 2*V_PAD ...`. template.html: drop env(safe-area-inset-bottom) from the portrait #touch padding (the root padding supplies it) and keep it only for the fixed landscape groups. Add viewport-fit=cover to the template's viewport meta so both agree.

### U17 [minor] Click-to-play overlay: desktop wording on phones, buries the title screen, and leaves an auto-paused game paused  _(lens: platform)_
- **evidence:** template.html:130-134 text 'Click here to give the game keyboard focus and switch the sound on' (wraps with an orphan 'on'), shown on phones too (out/qa/platform/r2/iframe_phone390_0.png). Veil alpha 0.84 (:19, :34) hides the title/logo, so an Artifact thumbnail or first frame (iframe is never focused during capture) is a near-black card. test/qa_platform_r2_refocus.mjs (iframe): click host chat box -> overlay + paused=true (frame 185); click the game -> overlay hidden but paused=true (frame stays 185), so the player needs a second action (P, Esc, Enter or tapping RESUME). dismissFocus() (50_main.js:510-515) does not resume.
- **expected:** 'TAP TO PLAY' on coarse pointers; the picture visible behind the call to action; clicking the overlay resumes a game that was only paused by the blur.
- **actual:** Keyboard-focus copy on phones, 84% veil, extra step to resume.
- **suggestedFix:** template.html: veil alpha about 0.5 plus a pill-shaped CTA; Main sets focusEl text via touchMode ('TAP TO PLAY / Sound starts on your first tap'). In Main track `autoPaused` in setPaused(true,true) and in dismissFocus() call setPaused(false) when autoPaused is set.

### U18 [minor] Integer-only scaling plus the 2-3 line legend leave 50-65% of typical Artifact panel sizes unused  _(lens: platform)_
- **evidence:** 50_main.js:1225-1231 and 1222. test/qa_platform_r2_sweep.mjs (desktop, no touch): 800x600@1 -> x2 (512x448, 48% of area) where x2.35 would fit (x2.6 without the legend); 700x600 -> x2 vs x2.61; 900x700 -> x2 (36% area) vs x3.05; 600x300 -> x1.01 (legend 46 px + 12 gap) vs x1.27 without it; 480x400 -> x1.36 vs x1.71. At DPR 2 the device-pixel rule recovers some (800x700 -> x2.5) but 800x600@2 and 900x600@2 are still 42-48%.
- **expected:** Within a typical 700-1000 x 500-800 panel the picture is about 70-80% of the frame.
- **actual:** Often one integer step smaller than fits.
- **suggestedFix:** fit(): hide the legend (it duplicates the H help page) when vh < 640 or when hiding it gains a whole integer step; if the integer scale uses <80% of the achievable k, use the fractional k with sharp-bilinear scaling (render 1:1 offscreen, one drawImage to an integer-multiple backing store, CSS image-rendering:auto). Prototype out/qa/platform/r2/fizzpop_sharpbilinear2.html looks identical at x1.4/DPR2 but cost +6 ms/frame at 6x CPU throttle under software GL (test/qa_platform_r2_sharp.mjs), so gate it on devicePixelRatio and measure on a real GPU.

### U19 [minor] No render interpolation: motion judders on 75, 90 and 144 Hz displays  _(lens: platform)_
- **evidence:** 50_main.js:1183-1197 steps at 60 Hz and renders on every RAF with no alpha. test/qa_platform_r2_cadence.mjs replicates the accumulator and reports display-time gaps between updates: 60 Hz 16.7 ms; 120 Hz 16.7; 240 Hz 16.7; but 90 Hz alternates 11.1/22.2 ms (cv 0.33), 75 Hz 13.3/26.7 (cv 0.35), 144 Hz 13.9/20.8 (cv 0.20), 165 Hz 18.2/12.1. Many Android phones run 90 Hz and many PC monitors 144 Hz.
- **expected:** Smooth motion on common refresh rates.
- **actual:** Visible hitching (2:1 frame-time ratio at 90 Hz).
- **suggestedFix:** Add `alpha = acc / STEP_MS` and pass it to Game.render(ctx, alpha); entities keep px/py from the previous update and draw at lerp(px, x, alpha) (Game module change, so coordinate with its owner). Cheap fallback: accept and document.

### U20 [minor] Gamepad slots: a phantom HID 'gamepad' in slot 0 steals P1, and unplugging pad 0 swaps players  _(lens: platform)_
- **evidence:** readGamepads() (50_main.js:261-276) takes the first two connected entries by list position and never checks mapping/button count. test/qa_platform_r2_gamepad2.mjs: pad in slot 0 with 0 buttons/0 axes (as some receivers/dongles report) plus a real standard pad in slot 1: stick right on the real pad moves P1 by 0 px (the real pad became P2). test/qa_platform_r2_input.mjs: a pad only in slot 1 drives P1, so unplugging pad 0 in a 2P game hands pad 1 to P1. Standard mapping works: D-pad, stick dead zone 0.45, A jump, B/X fire, Start pause, pad-1 A joins.
- **expected:** Only usable pads are assigned, with stable ownership.
- **actual:** Slot-order assignment.
- **suggestedFix:** Filter `list` with `g.buttons.length >= 4 && (g.axes.length >= 2 || g.mapping === 'standard')`, and keep an id->player map assigned at first button press.

### U21 [polish] Gamepad slots are assigned by position in the connected list, so unplugging pad 0 makes pad 1 drive P1 and P2 loses its controller  _(lens: codereview)_
- **evidence:** src/50_main.js:261-275 readGamepads(): filters connected pads, then uses list[i]. test/qa_codereview_gamepad.mjs: 'pad0 unplugged ... P1 x 54 -> 80 P2 x 194 -> 194 (P2 pad now drives P1)'.
- **expected:** Pad 0 stays P1 and pad 1 stays P2 (a dropped controller should only disable its own player).
- **actual:** In a 2P game a disconnect (Bluetooth drop, dead battery) silently shifts the surviving controller onto P1.
- **suggestedFix:** 50_main.js readGamepads(): keep a stable slot map keyed by gamepad.index, assigned on first use and cleared on disconnect; do not compact the list.

### U22 [polish] CONTINUE restarts as 1P after a 1P game that P2 joined and then QUIT  _(lens: codereview)_
- **evidence:** src/50_main.js:1099 / 1102: session.lastPlayers is set in play.enter and finishGame() but not in leave(). test/qa_codereview_join_continue.mjs: Game had players 2, after QUIT session.lastPlayers=1, CONTINUE starts a game with players=1.
- **expected:** CONTINUE reuses the player count of the abandoned game.
- **actual:** The joined P2 is dropped.
- **suggestedFix:** 50_main.js scenes.play.leave(): `session.lastPlayers = Game.result().players === 2 ? 2 : 1;` inside the existing try.

### U23 [polish] Hi-score page leaves the bottom third empty and has no footer/prompt  _(lens: visual)_
- **evidence:** out/qa/visual/scenes/scores.png: table ends at 3/4 height, no 'PUSH ANY BUTTON' / page hint (other attract pages have one), no decoration.
- **expected:** Composed page like the How-To pages.
- **actual:** Top-heavy, plain.
- **suggestedFix:** In scenes.scores (src/50_main.js) add a footer line ('ESC: BACK') and a decorative row (Fizz and Pop idle on the bottom wall, a few ambient bubbles) or space the 8 rows with pitch 14.

### U24 [polish] Busy scenes allocate about 50 KB per frame, and boot blocks the main thread for 100-600 ms  _(lens: platform)_
- **evidence:** test/qa_platform_r2_perf.mjs (heap sawtooth over 4 s): bubbles40 about 3.0 MB/s with 15-17 GCs per 4 s and chain_cluster 3.2-3.3 MB/s, versus about 0.6 MB/s in the other scenes. GC pauses did not show: raf over50 <= 1, 54-60 fps even at 6x throttle on the phone profile (the title scene fps was 54 at 6x because of boot contention). Update p99 <= 3.3 ms and render p99 <= 12.7 ms at 6x. test/qa_platform_r2_boot.mjs: one long task of about 100 ms at 1x, 370-425 ms at 4x, 485-670 ms at 6x (GFX.init plus level cache) while an empty black canvas is shown; the heap after boot is 3.1-3.7 MB. test/qa_platform_r2_soak.mjs: 24,000 steps plus 40 scene cycles, heap 2.25 -> 2.7 MB after forced GC, listeners constant at 23.
- **expected:** Within budget (it is); no allocation hot spots on weak phones.
- **actual:** Fine today; margins shrink on a 6x+ slower device.
- **suggestedFix:** Optional: avoid per-frame template-string colours in bubble and chain drawing (cache rgba() strings), and show a 'LOADING' line on the canvas before GFX.init() (draw one frame, then yield with requestAnimationFrame before building sprites).

### U25 [polish] Legend and help are keyed to QWERTY key labels; gamepad support is not mentioned anywhere  _(lens: platform)_
- **evidence:** 50_main.js uses e.code (KeyA/KeyD/KeyW/KeyQ/KeyZ), which is right for position, but the legend (template.html:123-125) and how-to print the QWERTY letters. On AZERTY the keycap labelled Q is KeyA (move left) and the one labelled W is KeyZ (bubble). No screen mentions the gamepad (only a 'PAD n READY' toast), and Chrome only exposes gamepads to cross-origin iframes with allow='gamepad' (host dependent).
- **expected:** Help matches what the player sees on the keycaps; pad controls are discoverable.
- **actual:** QWERTY-only labels and no pad hint.
- **suggestedFix:** Add a how-to line 'PAD: STICK/D-PAD MOVE, A JUMP, B BUBBLE, START PAUSE' and 'KEYS ARE POSITIONAL (WASD BLOCK)' to the legend and howto page 0. Optionally try navigator.keyboard?.getLayoutMap?.() to print real labels.

## module: template

### Ut1 [minor] Pinch zoom, double-tap zoom and pull-to-refresh/overscroll are not disabled outside the controls  _(lens: platform)_
- **evidence:** template.html sets touch-action:none only on #screen and #touch (:57, :88); computed touch-action on html and body is 'auto', overscroll-behavior 'auto', and the viewport meta has no maximum-scale. test/qa_platform_r2_touch.mjs (CDP Input.synthesizePinchGesture on blank page area at 390x844, 844x390 and 360x740): visualViewport.scale goes 1 -> 2.2 and stays 2.2 after a double-tap. A zoomed page pushes the controls offscreen. iOS Safari also double-tap-zooms the gutters. Meta maximum-scale is ignored by iOS and inside iframes.
- **expected:** The page cannot be zoomed or pulled while playing.
- **actual:** Any two-finger touch on blank space zooms the whole page 2.2x.
- **suggestedFix:** src/template.html: add `html, body { touch-action: none; overscroll-behavior: none; -webkit-user-select: none; user-select: none; }` and in src/50_main.js bindDom `document.addEventListener('gesturestart', (e) => e.preventDefault())` (iOS). Keep `maximum-scale=1` as a belt-and-braces for top-level loads.

### Ut2 [minor] PAUSE and SOUND buttons sit 8-10 px from the BUBBLE button and fire on pointerdown  _(lens: platform)_
- **evidence:** test/qa_platform_r2_touch.mjs rects: 360x740 BUBBLE x222..279, PAUSE 148..212 (y650..682, overlapping BUBBLE's y665..722), SOUND 146..214; 390x844 gap about 10 px. Both small buttons are 32 px tall (below 44) and are triggered immediately (touchPress -> tapped.add('KeyP'), 50_main.js:358-364). BUBBLE is the most-mashed control, so a slightly off tap pauses the game. Landscape (844x390) is fine, and at 640x360 and 667x375 PAUSE overlaps the canvas by 1x7 and 1x11 px (test/qa_platform_r2_overlap.mjs).
- **expected:** Rarely-used controls are out of the thumb path, or require a deliberate press.
- **actual:** Adjacent to the busiest button, instant action.
- **suggestedFix:** Portrait: move PAUSE/SOUND into the empty band above the canvas (about 180 px free at 360x740) or to the bar's top row, and fire pause on pointerup. Landscape: add 8 px to the mid-group offset in template.html:78-80 so it never touches the canvas.

### Ut3 [polish] Contract nits vs the Artifact skeleton and artifact-design: color-scheme never becomes dark, no hot-reload snapshot, no wake lock or fullscreen  _(lens: platform)_
- **evidence:** test/qa_platform_r2_artifact.mjs: all six OS x data-theme combinations give the right body background and tokens, but computed color-scheme is always 'light dark' (template.html:24 only; the two dark blocks never set color-scheme: dark, and data-theme=light under OS dark stays 'light dark'). The design rules want color-scheme: dark wherever the dark palette applies. No window.claude?.hot snapshot (a republish reloads a game in progress), no wakeLock, no fullscreen button; artifact-design lists both as supported-but-optional. Light-mode pressed button label is white on #ff6fae = 2.58:1 (template.html:11-12). Everything else passes: title 'Fizz & Pop', no external refs, 385,745 B, gutters 16 px, [hidden] respected, clean under a strict artifact-like CSP (test/qa_platform_r2_csp.mjs).
- **expected:** color-scheme follows the tokens; optional hosting niceties present.
- **actual:** Static 'light dark'.
- **suggestedFix:** template.html: add `color-scheme: dark;` to both dark blocks and `color-scheme: light` to :root[data-theme='light']; set --btn-on-fg in light mode to #1b1033 (6.9:1). Optional: `navigator.wakeLock?.request('screen').catch(()=>{})` on play start, an F key / button calling requestFullscreen().catch(()=>{}), and window.claude?.hot?.snapshot({scene, muted}).

### Ut4 [polish] Degenerate or short viewports: content centred with overflow is clipped at the top and unreachable; fractional scales give uneven pixels  _(lens: platform)_
- **evidence:** test/qa_platform_r2_robust.mjs 'tiny': 100x100 -> canvas y=-18; 50x50 -> y=-43 (body is a column flexbox with justify-content:center so overflow above the top cannot be scrolled to); no errors anywhere (1x1 to 2000x120). test/qa_platform_r2_pixelgrid.mjs measures game-pixel run lengths in device px: all integer scales are EVEN, but fractional fits are not: 390x844@3 -> 4 and 5 device px (204 vs 50 runs), 390x844@2 -> 2 and 3 px (52/202), 800x600@1 -> 1/2 px (16/238), 390x844@1 -> 1/2 px (152/102). At DPR 2-3 it is visually subtle (out/qa/platform/r2/sharp2_baseline_ph390_2.png).
- **expected:** Content stays reachable in tiny frames; a fractional scale is not noticeably lumpy at DPR 1.
- **actual:** Top clipped below about 130 px height; lumpy 1/2 px grid at DPR 1.
- **suggestedFix:** template.html body: use `justify-content: safe center` (or margin:auto on #stage) so overflow scrolls. For DPR 1 phone-width windows prefer sharp-bilinear (see the scaling finding).

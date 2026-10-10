/* DEV scene: close-up of whatever is being designed right now (hash #dev). */
function sceneDev(ctx, t) {
  const W = 1600, H = 900;
  drawBackground(ctx, W, H, t, { seed: 3 });
  drawPlayer(ctx, 'fizz', { x: 20, y: 30, k: 14, t, pose: 'idle' });
  drawPlayer(ctx, 'fizz', { x: 270, y: 30, k: 14, t, pose: 'shoot', mouth: 1 });
  drawPlayer(ctx, 'pop', { x: 520, y: 30, k: 14, t, pose: 'jump', face: -1 });
  drawPlayer(ctx, 'pop', { x: 770, y: 30, k: 14, t, pose: 'idle' });
  // 1x-ish sizes (gameplay uses k 5.9)
  drawPlayer(ctx, 'fizz', { x: 1050, y: 60, k: 5.9, t, pose: 'shoot', mouth: 1 });
  drawPlayer(ctx, 'pop', { x: 1150, y: 60, k: 5.9, t, pose: 'jump', face: -1 });
  drawPlayer(ctx, 'fizz', { x: 1250, y: 60, k: 5.9, t, pose: 'idle' });
  drawPlayer(ctx, 'pop', { x: 1350, y: 60, k: 5.9, t, pose: 'idle' });
  drawPlayer(ctx, 'fizz', { x: 1050, y: 160, k: 11, t, pose: 'idle' });
  drawPlayer(ctx, 'pop', { x: 1250, y: 160, k: 11, t, pose: 'idle' });
  drawEnemy(ctx, 'kraken', { x: 20, y: 330, k: 8, t, face: 1 });
  drawEnemy(ctx, 'nibbler', { x: 640, y: 380, k: 10, t, face: 1 });
  drawEnemy(ctx, 'crabbit', { x: 820, y: 380, k: 10, t, face: 1 });
  drawEnemy(ctx, 'jellop', { x: 1000, y: 380, k: 10, t, face: 1 });
  drawBubble(ctx, 'empty', 1250, 450, 80, { t });
  drawBubble(ctx, 'shot', 1430, 450, 60, { t });
  drawBubble(ctx, 'trapped', 1300, 700, 90, { t, stage: 1, enemy: { type: 'springle' } });
  drawBubble(ctx, 'thunder', 1100, 700, 70, { t });
  drawFood(ctx, 'sushi', { x: 700, y: 640, k: 10, t });
  drawPowerup(ctx, 'heart', { x: 900, y: 640, k: 10, t });
  bloom(ctx, W, H);
}

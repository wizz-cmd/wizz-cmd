// Replicates Main.frame()'s accumulator (50_main.js:1183-1197) for several display refresh rates and reports the display-time
// interval between consecutive game updates (what the eye sees as motion cadence): 16.67 ms every time = perfectly smooth.
const STEP = 1000 / 60;
function sim(R, jitter = 0) {
  const dtf = 1000 / R; let acc = 0, now = 0, last = 0; const shown = []; // time (ms) at which each update first becomes visible
  let rnd = 12345; const rand = () => (rnd = (rnd * 1664525 + 1013904223) >>> 0) / 4294967296;
  for (let i = 0; i < 2000; i++) {
    now += dtf + (rand() - 0.5) * 2 * jitter; const dt = Math.min(now - last, 250); last = now; acc += dt;
    let steps = 0; while (acc >= STEP && steps < 5) { acc -= STEP; steps++; }
    if (steps) shown.push(now);                     // render after the updates of this frame
  }
  const iv = []; for (let i = 1; i < shown.length; i++) iv.push(shown[i] - shown[i - 1]);
  const mean = iv.reduce((a, b) => a + b, 0) / iv.length; const sd = Math.sqrt(iv.reduce((a, b) => a + (b - mean) ** 2, 0) / iv.length);
  const hist = {}; iv.forEach((x) => { const k = x.toFixed(1); hist[k] = (hist[k] || 0) + 1; });
  const top = Object.entries(hist).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${k}ms x${v}`).join(', ');
  return { R, meanMs: +mean.toFixed(2), sdMs: +sd.toFixed(2), cv: +(sd / mean).toFixed(3), top };
}
for (const R of [60, 75, 90, 120, 144, 165, 240]) console.log(JSON.stringify(sim(R)), '| with ±0.8ms rAF jitter:', JSON.stringify(sim(R, 0.8)));

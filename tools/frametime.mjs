/* Frame time, measured rather than guessed.
 *
 * WHY THIS EXISTS. Timing a render from JS by putting performance.now() around
 * renderer.render() measures how fast COMMANDS ARE QUEUED, not how long the
 * frame takes. WebGL is asynchronous: the call returns as soon as the driver
 * has accepted the work. Doing it that way in this repo produced readings that
 * disagreed with each other by a factor of ten at the same station, and made
 * hiding a layer look SLOWER than leaving it on.
 *
 * A one-pixel readPixels after each render forces a stall until the GPU has
 * actually finished, which is the only way to time drawing from script without
 * timer-query extensions. It costs a full pipeline flush, so the absolute
 * number is pessimistic and includes no frame overlap — but it is repeatable
 * (three runs at one station agree within 2%) and A/B differences are real.
 * Treat it as a comparator, not as the frame rate a player will see.
 *
 * DO NOT COMPARE TWO RUNS OF THIS TOOL. The absolute number tracks the state
 * of the machine, not only the state of the code. Identical builds measured
 * 56, 97 and 80 ms at the same station within a few minutes of each other on
 * an otherwise idle laptop, and a change that provably REMOVED 26 M triangles
 * appeared to make the frame 45% slower purely because the run happened later.
 * The repeatability spread printed below is the warning light: at 0.3 ms the
 * machine is quiet and the run is internally consistent; at 2 ms or more the
 * absolute numbers are drifting and only WITHIN-RUN A/B is meaningful.
 *
 * For an A/B, flip the thing under test inside one page session and time both
 * sides before the session ends. Triangle and draw-call counts, printed here
 * beside the timing, are exact and machine-independent — when the clock is
 * untrustworthy they are still evidence.
 *
 *   node tools/frametime.mjs lake
 *   node tools/frametime.mjs jungle --stations 6
 */
import { run } from './harness.mjs';

const argv = process.argv.slice(2);
const level = argv.find((a) => !a.startsWith('--')) || 'lake';
const nStations = Number((argv.find((a) => a.startsWith('--stations')) || '').split('=')[1]
  || argv[argv.indexOf('--stations') + 1]) || 10;

let shaderErr = 0;
const hash = level === 'jungle'
  ? 'manual&tier=high&cond=morning'
  : 'manual&tier=high&level=lake&cond=morning';

await run({ width: 1280, height: 720, hash, timeout: 900_000 }, async ({ page }) => {
  page.on('console', (m) => { if (/Shader Error|ERROR: 0:/.test(m.text())) shaderErr++; });
  page.on('pageerror', () => { shaderErr++; });

  const r = await page.evaluate(async (N) => {
    const g = window.__game; g.begin();
    for (let i = 0; i < 60; i++) g.step(1 / 60);
    const gl = g.renderer.getContext();
    const buf = new Uint8Array(4);
    const sync = () => gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    const time = (n) => {
      for (let i = 0; i < 8; i++) { g.render(); sync(); }
      const t0 = performance.now();
      for (let i = 0; i < n; i++) { g.render(); sync(); }
      return +((performance.now() - t0) / n).toFixed(2);
    };
    const rows = [];
    for (let k = 0; k < N; k++) {
      const t = (k + 0.5) / N;
      g.walker.placeAt(t); g.level.cullAround(g.walker.pos.x, g.walker.pos.z);
      for (let i = 0; i < 30; i++) g.step(1 / 60);
      g.renderer.info.autoReset = false;
      g.renderer.info.reset(); g.render();
      const inf = g.renderer.info.render;
      const calls = inf.calls, tris = inf.triangles;
      g.renderer.info.autoReset = true;
      rows.push({ t: +t.toFixed(2), ms: time(22), calls, trisM: +(tris / 1e6).toFixed(1) });
    }
    /* Repeatability, so a reader can see whether a difference is signal. */
    g.walker.placeAt(0.35); g.level.cullAround(g.walker.pos.x, g.walker.pos.z);
    for (let i = 0; i < 30; i++) g.step(1 / 60);
    return { rows, repeat: [time(22), time(22), time(22)] };
  }, nStations);

  const worst = r.rows.reduce((a, b) => (b.ms > a.ms ? b : a));
  console.log(`\nframetime ${level} — GPU-synced, ${nStations} stations`);
  console.log('   t        ms    draw calls   triangles');
  for (const x of r.rows) {
    console.log(`  ${String(x.t).padEnd(6)} ${String(x.ms).padStart(7)}  ${String(x.calls).padStart(9)}  ${String(x.trisM).padStart(8)} M`);
  }
  const sp = Math.max(...r.repeat) - Math.min(...r.repeat);
  console.log(`\n  worst ${worst.ms} ms at t=${worst.t}`);
  console.log(`  repeatability at t=0.35: ${r.repeat.join(', ')} ms (spread ${sp.toFixed(2)})`);
  if (sp > 2) {
    console.log('  WARNING — spread over 2 ms: the machine is busy or thermally');
    console.log('  throttled. Treat the ms column as unusable and compare draw');
    console.log('  calls and triangles instead, or A/B within a single run.');
  }
  console.log(`  shader errors: ${shaderErr}`);
  if (shaderErr) { console.log('\n  READINGS INVALID — a shader failed to compile.'); process.exitCode = 1; }
});

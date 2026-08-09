/* What the player actually sees.
 *
 * Every other capture tool in here places a camera by hand at a viewpoint
 * chosen to interrogate one system. This one does the opposite and is the only
 * honest test of the thing being shipped: drive the stage, and photograph it
 * from the camera the game gives you, at points along the road rather than at
 * points chosen to flatter it.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { run, capture } from './harness.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const tag = args[0] && !args[0].startsWith('--') ? args[0] : 'drive';
const flag = (k, d) => { const i = args.indexOf(`--${k}`); return i < 0 ? d : args[i+1]; };
const W = +flag('w', 1280), H = +flag('h', 720);
const MODE = flag('cam', 'chase');
const outDir = path.join(ROOT, 'shots', tag);
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

await run({ width: W, height: H, hash: 'manual&tier=ultra&level=lake', timeout: 420_000 }, async ({ page }) => {
  await page.evaluate((mode) => {
    const g = window.__game;
    g.begin();
    g.walker.camMode = mode;
    g.setSun(34, 26);
  }, MODE);

  /* Stop at a set of arc lengths and photograph from there. Driving to each
   * one rather than teleporting matters: the chase camera is a filter with
   * several seconds of memory in it, so a teleported camera is not the camera
   * the player would have had. */
  const STOPS = [0.05, 0.18, 0.32, 0.46, 0.58, 0.70, 0.82, 0.94];
  for (let i = 0; i < STOPS.length; i++) {
    const info = await page.evaluate(async ({ target }) => {
      const g = window.__game, d = g.walker, trail = g.trail, THREE = window.THREE;
      const P = new THREE.Vector3(), T = new THREE.Vector3();
      /* The shared driver — tools/autodriver.mjs. This file used to carry its
       * own copy, which then drifted from the one telemetry.mjs uses: the lap
       * measured 0% off the road while these stations reported the car in the
       * tussock for the whole back half, because the two were not the same
       * driver at all. Two instruments disagreeing about the same car is worse
       * than either being wrong. */
      const { drive } = await import('/tools/autodriver.mjs');
      let stalled = 0;
      for (let n = 0; n < 60 * 180; n++) {
        const q = trail.nearest(d.pos.x, d.pos.z, {});
        if (q.t >= target) break;
        drive(g);
        g.step(1 / 60);
        /* If it is genuinely stuck — in a ditch, against the world edge — put
         * it back on the road rather than burning three minutes of frames. */
        if (d.speed < 1.5) { if (++stalled > 240) { d.recover(); stalled = 0; } }
        else stalled = 0;
      }
      /* Let the camera settle at speed rather than photographing it mid-lag —
       * but keep driving while it does.
       *
       * This used to step without calling drive(), which leaves whatever keys
       * the last frame set still held: at 150 km/h a third of a second of
       * latched steering and throttle is fifteen metres of unattended car, and
       * doing it at every one of eight stations walked it off the road and
       * into a field. The lap telemetry said 0% off the seal the whole time,
       * because the lap never stops driving — two instruments disagreeing
       * about the same car, and this was why. */
      for (let n = 0; n < 20; n++) { drive(g); g.step(1 / 60); }
      const q = trail.nearest(d.pos.x, d.pos.z, {});
      return { t: +q.t.toFixed(3), kmh: Math.round(d.speed * 3.6), surface: d.surface };
    }, { target: STOPS[i] });

    const name = `${String(i + 1).padStart(2, '0')}-t${String(Math.round(STOPS[i] * 100)).padStart(2, '0')}`;
    await capture(page, path.join(outDir, `${name}.png`));
    console.log(`  ${name}  t=${info.t}  ${info.kmh} km/h  ${info.surface}`);
  }
  console.log(`\n  → shots/${tag}`);
});

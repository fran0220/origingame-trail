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
      /* A driver, not a controller with a hair trigger.
       *
       * The first version aimed at a point a fixed 0.018 of *arc length* ahead
       * and lifted whenever the heading error passed 0.055 rad. Both broke when
       * the world got longer and the car started in its own lane: 0.018 of a
       * 2 km route is 36 m rather than 14 m, and from 1.75 m off the centreline
       * the bearing to a point 36 m ahead is already 0.048 rad out before the
       * road has done anything. The car spent the whole run on the brakes and
       * never left the start line.
       *
       * So the lookahead is in metres, it scales with speed the way a real
       * driver's does, the aim point is the centre of the driver's own lane
       * rather than the crown of the road, and there is always throttle below
       * walking pace so it cannot deadlock. */
      let stalled = 0;
      for (let n = 0; n < 60 * 180; n++) {
        const q = trail.nearest(d.pos.x, d.pos.z, {});
        if (q.t >= target) break;
        const lookM = 14 + d.speed * 1.1;
        const ahead = Math.min(1, q.t + lookM / trail.length);
        trail.pointAt(ahead, P);
        trail.tangentAt(ahead, T);
        /* Aim at the near lane, offset to the car's left of the centreline —
         * (cos yaw, -sin yaw) is the left of a nose-+Z car in this frame. */
        const ay = Math.atan2(T.x, T.z);
        const ax = P.x + Math.cos(ay) * 1.75, az = P.z - Math.sin(ay) * 1.75;
        const want = Math.atan2(ax - d.pos.x, az - d.pos.z);
        let err = want - d.yaw;
        while (err > Math.PI) err -= Math.PI * 2;
        while (err < -Math.PI) err += Math.PI * 2;
        /* Increasing yaw rotates the nose from +Z toward +X, which in a
         * right-handed Y-up frame is the car's LEFT — so a positive heading
         * error is corrected with A, not D. */
        d.keys.KeyA = err > 0.015; d.keys.KeyD = err < -0.015;
        const tooFast = d.speed > 30 && Math.abs(err) > 0.10;
        d.keys.KeyW = d.speed < 6 || !tooFast;
        d.keys.KeyS = d.speed > 24 && Math.abs(err) > 0.22;
        g.step(1 / 60);
        /* If it is genuinely stuck — in a ditch, against the world edge — put
         * it back on the road rather than burning three minutes of frames. */
        if (d.speed < 1.5) { if (++stalled > 240) { d.recover(); stalled = 0; } }
        else stalled = 0;
      }
      /* Let the camera settle at speed rather than photographing it mid-lag. */
      for (let n = 0; n < 20; n++) g.step(1 / 60);
      const q = trail.nearest(d.pos.x, d.pos.z, {});
      return { t: +q.t.toFixed(3), kmh: Math.round(d.speed * 3.6), surface: d.surface };
    }, { target: STOPS[i] });

    const name = `${String(i + 1).padStart(2, '0')}-t${String(Math.round(STOPS[i] * 100)).padStart(2, '0')}`;
    await capture(page, path.join(outDir, `${name}.png`));
    console.log(`  ${name}  t=${info.t}  ${info.kmh} km/h  ${info.surface}`);
  }
  console.log(`\n  → shots/${tag}`);
});

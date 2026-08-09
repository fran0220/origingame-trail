/* The car, on a turntable, at the size the player actually sees it.
 *
 * The chase camera shows this object for the entire stage, so it is worth
 * being able to look at it deliberately rather than judging it from whatever
 * angle the road happened to provide.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { run, capture } from './harness.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tag = process.argv[2] || 'car';
const outDir = path.join(ROOT, 'shots', tag);
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

const VIEWS = [
  ['01-rear',        180,  8,  7.0],
  ['02-rear-three',  215, 10,  7.5],
  ['03-side',        270,  6,  8.0],
  ['04-front-three', 325, 10,  7.5],
  ['05-front',         0,  8,  7.0],
  ['06-high-rear',   190, 26,  8.0],
  ['07-close-rear',  180,  5,  4.2],
];

await run({ width: 1000, height: 750, hash: 'manual&tier=ultra&level=lake', timeout: 420_000 }, async ({ page }) => {
  for (const [name, az, el, dist] of VIEWS) {
    await page.evaluate(({ az, el, dist }) => {
      const g = window.__game, d = g.walker;
      /* The harness starts the frame loop, and the frame loop owns the camera:
       * a chase camera positioned from here is overwritten by _updateCamera()
       * before the screenshot lands, which is why the first run of this tool
       * produced views of empty road. Stop the loop and drive the two steps
       * this tool actually wants by hand. */
      g.paused = true;
      g.hideCar = false;
      d.camMode = 'chase';
      /* Freeze the car on a straight, level piece of road and light it the way
       * the level lights everything else. */
      d.placeAt(0.30);
      d.vx = d.vy = d.yawRate = 0;
      d.steer = 0.10;                 // a little lock, so the front wheels read
      g._driveCar(1 / 60);
      const c = g.car.root.position, y = g.walker.yaw;
      const a = (az * Math.PI) / 180 + y, e = (el * Math.PI) / 180;
      g.camera.position.set(
        c.x + Math.sin(a) * Math.cos(e) * dist,
        c.y + Math.sin(e) * dist + 0.5,
        c.z + Math.cos(a) * Math.cos(e) * dist);
      g.camera.lookAt(c.x, c.y + 0.62, c.z);
      g.camera.fov = 40; g.camera.updateProjectionMatrix();
      g.camera.updateMatrixWorld();
      g.render();
    }, { az, el, dist });
    await capture(page, path.join(outDir, `${name}.png`));
    console.log(`  ${name}`);
  }
  console.log(`\n  → shots/${tag}`);
});

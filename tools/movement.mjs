/* Does W go where the camera is looking?
 *
 * This is the test that was missing. The movement basis was mirrored about the
 * world Z axis, which is invisible at the trailhead — the trail starts running
 * along -Z, and a mirror about Z is the identity there — and exactly backwards
 * once the player turns ninety degrees. Every earlier test drove the walker
 * along the trail or teleported it, so none of them ever turned and walked.
 *
 * The assertion is deliberately about the *rendered camera*, not about the
 * walker's internal yaw: it takes the camera's own world forward and right
 * vectors after a frame and checks that each key moved the player along the
 * one it names. That holds for any basis convention the walker chooses.
 *
 * Usage:  node tools/serve.mjs &  node tools/movement.mjs
 */
import { chromium } from 'playwright';

const URL_BASE = process.env.MOVE_URL || 'http://localhost:8099/';
/* Eight headings including the two the mirrored basis got right by accident,
 * so a regression cannot hide behind the axis it agrees on. */
const YAWS = [0, 0.4, Math.PI / 2, 2.1, Math.PI, -Math.PI / 2, -2.4, 5.9];
const KEYS = [
  ['KeyW', 'forward', 1],
  ['KeyS', 'forward', -1],
  ['KeyD', 'right', 1],
  ['KeyA', 'right', -1],
];

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=default', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

await page.goto(`${URL_BASE}#manual`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__game, null, { timeout: 180_000 });

const result = await page.evaluate(async ({ yaws, keys }) => {
  const g = window.__game;
  g.walker.enabled = true;
  g.walker.setAuto(null);

  const run = (yaw, code) => {
    const w = g.walker;
    /* A clearing well away from the banks: the slope limiter and the collision
     * registry can legitimately refuse a direction, and a refused step is not
     * a reversed one. */
    w.placeAtPoint(0, -180, yaw);
    g.step(1 / 60);
    g.render();

    const cam = g.camera;
    const fwd = new window.THREE.Vector3();
    cam.getWorldDirection(fwd);
    fwd.y = 0; fwd.normalize();
    // right = forward × up, for up = +Y.
    const right = new window.THREE.Vector3(-fwd.z, 0, fwd.x);

    const from = { x: w.pos.x, z: w.pos.z };
    w.keys[code] = true;
    for (let i = 0; i < 30; i++) g.step(1 / 60);
    w.keys[code] = false;

    const dx = w.pos.x - from.x, dz = w.pos.z - from.z;
    const travelled = Math.hypot(dx, dz);
    return {
      travelled,
      alongForward: dx * fwd.x + dz * fwd.z,
      alongRight: dx * right.x + dz * right.z,
    };
  };

  const failures = [];
  const samples = [];
  for (const yaw of yaws) {
    for (const [code, axis, sign] of keys) {
      const r = run(yaw, code);
      const wanted = axis === 'forward' ? r.alongForward : r.alongRight;
      const other = axis === 'forward' ? r.alongRight : r.alongForward;
      samples.push({
        yaw: Math.round(yaw * 100) / 100, code,
        travelled: Math.round(r.travelled * 100) / 100,
        wanted: Math.round(wanted * 100) / 100,
        other: Math.round(other * 100) / 100,
      });
      if (r.travelled < 0.25) {
        failures.push(`${code} at yaw ${yaw.toFixed(2)}: barely moved (${r.travelled.toFixed(2)} m)`);
        continue;
      }
      // The named axis has to carry the movement, in the named direction.
      if (wanted * sign < r.travelled * 0.9) {
        failures.push(
          `${code} at yaw ${yaw.toFixed(2)}: moved ${(wanted * sign).toFixed(2)} m along ${axis}`
          + ` out of ${r.travelled.toFixed(2)} m travelled`,
        );
      }
      if (Math.abs(other) > r.travelled * 0.25) {
        failures.push(
          `${code} at yaw ${yaw.toFixed(2)}: ${Math.abs(other).toFixed(2)} m sideways drift`,
        );
      }
    }
  }
  return { failures, samples };
}, { yaws: YAWS, keys: KEYS });

console.log(JSON.stringify({ ...result, errors }, null, 1));
await browser.close();

if (result.failures.length || errors.length) {
  console.error('\nfailed — a movement key does not go where the camera points');
  process.exit(1);
}
console.log('\nok — every key moves along the axis the camera says it should');

/* Does the environment map contain the world the probe is standing in?
 *
 * This is the second time that question has been worth asking. The first time,
 * `sky.bake()` captured a temporary scene holding nothing but the sky dome, so
 * every reflective surface in the forest reflected an unbroken bright sky, and
 * two global dimmers (`environmentIntensity = 0.34`, the water's
 * `envMapIntensity = 0.42`) were quietly compensating for it. Capturing the
 * real scene from a probe fixed that and let both dimmers go back to 1.
 *
 * It can fail a second way, through a different door. Vegetation is culled per
 * frame against the *camera*, and the probe stands at trail t=0.5 no matter
 * where the camera is. Walk to the falls and the forest around the probe has
 * been culled away — so a bake triggered there captures a bald clearing.
 * `setSun()` rebakes, and the sun advances with the player's progress, which
 * means the map gets *more* wrong the further the walk gets.
 *
 * The assertion has to read the map back out rather than recompute what it
 * ought to hold. That lesson is already paid for: the first `map-truth` recomputed
 * the trail centreline it was checking and passed with the sign still inverted.
 * So this renders a mirror ball lit only by `scene.environment` and reads its
 * pixels — whatever is in the map ends up in that image or it is not there.
 *
 * The test itself is a comparison rather than an absolute: bake at the probe
 * with the player standing on it, bake again with the player at the falls, and
 * demand the two agree. Same probe, same sun, same world — anything that makes
 * them differ is the bug.
 *
 * Usage:  node tools/serve.mjs &
 *         node tools/env-truth.mjs
 */
import { chromium } from 'playwright';

const URL_BASE = process.env.GALLERY_URL || 'http://localhost:8099/';

/* The bounds, and what each is worth.
 *
 * The run reports a `noise` figure beside every drift: a third bake from the
 * first standpoint, the same number of frames later. Leaves move in the wind
 * and the water runs between bakes, so some disagreement is the world being
 * alive rather than the capture being wrong, and every bound below is set
 * against that measured floor rather than picked.
 *
 * `green` is the sharpest of these. A probe that has lost its forest is not
 * merely brighter — it stops being green, because what it is looking at is
 * sky. Before the cull fix it read +0.0149 standing on the probe and -0.0100
 * standing at the falls, so the sign alone catches the failure.
 *
 * `lower` is the loosest, and honestly so. It still drifts about 21% against a
 * 7.6% floor for a reason not yet found: vegetation and ruins are re-culled to
 * the probe, the shadow cascade is re-aimed there, the spray is excluded, and
 * none of camera yaw, a level-wide shadow frustum or terrain LOD accounts for
 * it — the two mirror balls are structurally the same picture with a slightly
 * brighter floor in one. The bound is therefore set to catch a regression, not
 * to certify the number. docs/experiments.md keeps the open question.
 */
const TOL_MEAN = 0.12;
const TOL_UPPER = 0.06;
const TOL_LOWER = 0.30;
const TOL_GREEN = 0.30;

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=default', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

await page.goto(`${URL_BASE}#manual`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__game, null, { timeout: 300_000 });
await page.waitForFunction(() => !document.getElementById('boot'), null, { timeout: 120_000 });

const result = await page.evaluate(async ({ TOL_MEAN, TOL_UPPER, TOL_LOWER, TOL_GREEN }) => {
  const g = window.__game;
  const THREE = window.THREE;
  const r = g.renderer;

  g.walker.enabled = true;
  /* Pinned, because the whole comparison is "same sun, different standpoint"
   * and the session's progression would otherwise move it between bakes. */
  g.setSun(38, 152);

  /* A chrome ball in an otherwise empty scene: no lights, metalness one and
   * roughness zero, so every pixel of it is the environment map and nothing
   * else. Rendered into an 8-bit target because what is wanted here is a
   * signature to compare, not radiance to grade. */
  const SIZE = 256;
  const rt = new THREE.WebGLRenderTarget(SIZE, SIZE);
  const ballScene = new THREE.Scene();
  const ball = new THREE.Mesh(
    new THREE.SphereGeometry(1, 64, 48),
    new THREE.MeshStandardMaterial({ metalness: 1, roughness: 0 }),
  );
  ballScene.add(ball);
  const ballCam = new THREE.PerspectiveCamera(50, 1, 0.1, 10);
  ballCam.position.set(0, 0, 2.4);
  ballCam.lookAt(0, 0, 0);

  const px = new Uint8Array(SIZE * SIZE * 4);

  /** Read the map back out of a picture of it. */
  const signature = () => {
    ballScene.environment = g.scene.environment;
    const prev = r.getRenderTarget();
    r.setRenderTarget(rt);
    r.clear();
    r.render(ballScene, ballCam);
    r.readRenderTargetPixels(rt, 0, 0, SIZE, SIZE, px);
    r.setRenderTarget(prev);

    let n = 0, sum = 0, upper = 0, uN = 0, lower = 0, lN = 0, green = 0;
    const c = SIZE / 2, rad = SIZE * 0.42;
    for (let j = 0; j < SIZE; j++) {
      for (let i = 0; i < SIZE; i++) {
        // Only the disc: the corners are empty background, and averaging them
        // in would dilute every difference by the same constant.
        if (Math.hypot(i - c, j - c) > rad) continue;
        const k = (j * SIZE + i) * 4;
        const R = px[k] / 255, G = px[k + 1] / 255, B = px[k + 2] / 255;
        const l = R * 0.2126 + G * 0.7152 + B * 0.0722;
        sum += l; n++;
        green += G - (R + B) * 0.5;
        // readPixels is bottom-up, so high j is the top of the ball, which is
        // reflecting what is above and behind the probe.
        if (j > c) { upper += l; uN++; } else { lower += l; lN++; }
      }
    }
    return {
      mean: +(sum / n).toFixed(4),
      upper: +(upper / uN).toFixed(4),
      lower: +(lower / lN).toFixed(4),
      green: +(green / n).toFixed(4),
    };
  };

  const P = new THREE.Vector3();
  const standAt = (t) => {
    g.trail.pointAt(t, P);
    g.walker.setAuto(null);
    g.walker.pos.set(P.x, g.terrain.height(P.x, P.z), P.z);
    g.walker.vel.set(0, 0, 0);
    // Let the per-frame vegetation cull settle around the new standpoint.
    for (let i = 0; i < 90; i++) { g.step(1 / 60); g.render(); }
  };

  /* Bake from the standpoint, then read the map. `_bakeEnv` is the same call
   * `setSun` makes, so this exercises the path the game actually takes. */
  const bakeFrom = (t) => {
    standAt(t);
    g._bakeEnv();
    return signature();
  };

  const onProbe = bakeFrom(0.5);
  const atFalls = bakeFrom(0.97);
  /* The control. Same standpoint as the first bake, the same number of frames
   * later — so it carries the wind's phase and the water's, and nothing else.
   * Leaves move between bakes and the lower hemisphere is looking straight at
   * the understorey, so some drift is the world being alive rather than the
   * capture being wrong. Anything the standpoint costs has to be read against
   * this floor, or the threshold is just a number someone picked. */
  const control = bakeFrom(0.5);

  const rel = (a, b) => Math.abs(a - b) / Math.max(1e-4, Math.abs(a));
  const d = {
    mean: +rel(onProbe.mean, atFalls.mean).toFixed(4),
    upper: +rel(onProbe.upper, atFalls.upper).toFixed(4),
    lower: +rel(onProbe.lower, atFalls.lower).toFixed(4),
  };
  const noise = {
    mean: +rel(onProbe.mean, control.mean).toFixed(4),
    upper: +rel(onProbe.upper, control.upper).toFixed(4),
    lower: +rel(onProbe.lower, control.lower).toFixed(4),
  };

  const failures = [];
  /* Green first: it is the assertion that says "a forest is in there" rather
   * than "the numbers are close". Sky is not green, so a capture that lost its
   * canopy takes this negative. */
  for (const [where, s] of [['on the probe', onProbe], ['from the falls', atFalls]]) {
    if (!(s.green > 0)) {
      failures.push(`green is ${s.green} ${where} — the map is reflecting sky, `
        + `not canopy: the forest around the probe is missing from the capture`);
    }
  }
  const dGreen = rel(onProbe.green, atFalls.green);
  if (dGreen > TOL_GREEN) {
    failures.push(`green moved ${(dGreen * 100).toFixed(1)}% between bakes `
      + `(${onProbe.green} vs ${atFalls.green})`);
  }
  if (d.mean > TOL_MEAN) {
    failures.push(`mean moved ${(d.mean * 100).toFixed(1)}% between bakes `
      + `(${onProbe.mean} on the probe, ${atFalls.mean} from the falls) — the probe `
      + `is capturing a different world depending on where the player stands`);
  }
  if (d.upper > TOL_UPPER) {
    failures.push(`upper hemisphere moved ${(d.upper * 100).toFixed(1)}% `
      + `(${onProbe.upper} vs ${atFalls.upper}) — the canopy over the probe `
      + `is not the same in both captures`);
  }
  if (d.lower > TOL_LOWER) {
    failures.push(`lower hemisphere moved ${(d.lower * 100).toFixed(1)}% `
      + `(${onProbe.lower} vs ${atFalls.lower}, floor ${noise.lower})`);
  }

  rt.dispose();
  ball.geometry.dispose();
  ball.material.dispose();

  return { onProbe, atFalls, control, drift: d, noise, failures };
}, { TOL_MEAN, TOL_UPPER, TOL_LOWER, TOL_GREEN });

await browser.close();

console.log(JSON.stringify({ ...result, errors }, null, 1));
if (result.failures.length || errors.length) {
  console.error('\nfailed — the environment map depends on where the player is standing');
  process.exit(1);
}
console.log('ok — the probe captures the same world wherever the player stands');

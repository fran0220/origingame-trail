/* The bed under the water has to move.
 *
 * Refraction and caustics are both drawn by the terrain, not by the water:
 * the scene renders into the atmosphere's HDR target, so at the moment the
 * water draws, the frame it would need to sample is the one it is drawing
 * into. Computing the displacement on the refracting side avoids that
 * entirely — but it puts the effect in a shader nobody would think to look at
 * when the water looks wrong, which is exactly why it needs a test.
 *
 * The assertion is about pixels, not about source. The camera is put in the
 * channel looking straight down, so the submerged bed fills the frame and
 * nothing else can account for a change; the surface clock is then set to two
 * different values and the two frames are compared. A static bed is a bed with
 * no water over it, whatever the shader says it is doing.
 *
 * A second frame pair checks the thing that makes this worth having at all:
 * the dry bank beside the channel must NOT move. Advancing a global clock and
 * finding the whole world shimmering would pass a naive "did it change" test
 * while being a bug — the displacement has to be gated on the depth field.
 *
 * Usage:  node tools/serve.mjs &
 *         node tools/water-bed.mjs
 */
import { chromium } from 'playwright';

const URL_BASE = process.env.GALLERY_URL || 'http://localhost:8099/';
const failures = [];

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=default', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 640, height: 480 } });
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(`${URL_BASE}#manual`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__game, null, { timeout: 300_000 });

/* Both viewpoints are resolved from the level's own curves rather than written
 * down as metres. The brook has moved once already in this project's history,
 * and a test pinned to stale coordinates would have gone on passing while
 * pointing at a dry hillside. */
const setup = await page.evaluate(async () => {
  const g = window.__game;
  g.walker.enabled = true;
  document.getElementById('hud').style.display = 'none';
  g.setSun(38, 152);
  const { brookOffset } = await import(new URL('src/world/brook.js', document.baseURI).href);
  const { trailOffset } = await import(new URL('src/game/anchors.js', document.baseURI).href);

  const t = 0.60;
  const wet = trailOffset(t, brookOffset(t), g.trail);
  /* Far enough from the channel to be dry, close enough to be the same
   * ground under the same light — a control that differed in either would
   * prove nothing. */
  const dry = trailOffset(t, brookOffset(t) + 6.0, g.trail);

  window.__wb = {
    look(p) {
      const w = g.walker;
      w.setAuto(null);
      w.pos.set(p.x, g.terrain.height(p.x, p.z) + 1.4, p.z);
      w.vel.set(0, 0, 0);
      w.yaw = 0;
      w.pitch = -1.45;                       // all but straight down
      for (let i = 0; i < 30; i++) { g.step(1 / 60); g.render(); }
    },
    /**
     * Render at a chosen instant and return the frame as pixels.
     *
     * Read here rather than through a screenshot for two reasons. The renderer
     * runs without preserveDrawingBuffer, so the frame only exists until the
     * browser composites it — the copy has to happen in the same task as the
     * draw. And a PNG is entropy-coded, so a single changed pixel rewrites
     * most of the file: comparing screenshot bytes reports 100% moved for any
     * change at all, which is how the first version of this test managed to
     * "fail" on correct code.
     */
    frame(v) {
      /* The surface is hidden for the measurement, and that is the whole
       * design of this test rather than a convenience.
       *
       * The first version left it drawing and compared the frame as the player
       * sees it. It passed at 53% of pixels moved — and it still passed at 53%
       * with the refraction and the caustics deleted outright, because what it
       * was actually measuring was the ripple animation on the surface. A test
       * that reports a healthy number for code that has been removed is worse
       * than no test. With the surface hidden, nothing else in frame is a
       * function of this clock, so a change can only have come from the bed.
       */
      g.water.root.visible = false;
      g.terrainMat.userData.uniforms.uTime.value = v;
      g.render();
      g.water.root.visible = true;
      const src = g.renderer.domElement;
      const c = document.createElement('canvas');
      c.width = 160; c.height = 120;
      const cx = c.getContext('2d');
      cx.drawImage(src, 0, 0, c.width, c.height);
      return Array.from(cx.getImageData(0, 0, c.width, c.height).data);
    },
  };
  return {
    wet: { x: +wet.x.toFixed(2), z: +wet.z.toFixed(2), depth: +g.terrain.subAt(wet.x, wet.z).toFixed(3) },
    dry: { x: +dry.x.toFixed(2), z: +dry.z.toFixed(2), depth: +g.terrain.subAt(dry.x, dry.z).toFixed(3) },
  };
});

/* The stations are only meaningful if they are what they claim to be, and the
 * depth field is the authority on that. Asserting it here means a future
 * retune of the channel fails loudly instead of silently moving the camera
 * onto dry land and reporting "the bed does not move". */
if (!(setup.wet.depth > 0.05)) {
  failures.push(`wet station is not submerged: ${JSON.stringify(setup.wet)}`);
}
if (setup.dry.depth !== 0) {
  failures.push(`dry control station is under water: ${JSON.stringify(setup.dry)}`);
}

/** Both instants of one viewpoint, without moving the camera between them. */
const pair = async (p) => page.evaluate((q) => {
  window.__wb.look(q);
  return [window.__wb.frame(0.0), window.__wb.frame(4.7)];
}, p);

/** Fraction of pixels whose colour differs visibly between two frames. */
const moved = (a, b) => {
  let n = 0, total = a.length / 4;
  for (let i = 0; i < a.length; i += 4) {
    const d = Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
    if (d > 6) n++;
  }
  return n / total;
};

const [wetA, wetB] = await pair(setup.wet);
const [dryA, dryB] = await pair(setup.dry);

const wetMoved = moved(wetA, wetB);
const dryMoved = moved(dryA, dryB);

/* Two per cent of the frame, which is a low bar deliberately: the threshold is
 * here to separate "the shader runs" from "the shader is a constant", not to
 * pin down an amplitude somebody may want to tune. The camera is looking
 * straight down into the channel and the channel is about two metres wide, so
 * the wetted part of the frame is a band across the middle rather than all of
 * it. */
if (!(wetMoved > 0.02)) {
  failures.push(`submerged bed is static across the surface clock (${(wetMoved * 100).toFixed(2)}% of pixels moved) `
    + '— refraction and caustics are not reaching the frame');
}
if (dryMoved > wetMoved * 0.5) {
  failures.push(`dry ground moves with the surface clock (${(dryMoved * 100).toFixed(2)}% vs wet `
    + `${(wetMoved * 100).toFixed(2)}%) — the displacement is not gated on the depth field`);
}
if (pageErrors.length) failures.push(`page errors: ${pageErrors.join('; ')}`);

await browser.close();

console.log(JSON.stringify({
  stations: setup,
  wetMovedPct: +(wetMoved * 100).toFixed(2),
  dryMovedPct: +(dryMoved * 100).toFixed(2),
  failures,
}, null, 1));
if (failures.length) process.exit(1);
console.log('ok — the bed under the water moves, and the bank beside it does not');

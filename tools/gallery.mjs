/* Fixed viewpoints, for judging a change to the look by looking at it.
 *
 * Every visual problem found in this project so far was found in a picture and
 * missed in the code: the map drew the brook on the dry bank and read fine, the
 * ruins are untextured boxes and the source says nothing about it, and the
 * water reflects a sky with no forest in it because the bake's temp scene has
 * one object. Reasoning about a renderer does not work. Looking does.
 *
 * So this is the iteration loop for the visual work: a fixed set of stations
 * derived from the level's own parameters, shot with the HUD off, at a fixed
 * sun, into a named directory. Two runs are comparable frame for frame, which
 * is the whole point — a change to the environment map moves every pixel in
 * every shot, and the only way to know whether it moved them the right way is
 * to put before and after side by side.
 *
 * Usage:  node tools/serve.mjs &
 *         node tools/gallery.mjs [outDir] [--perf]
 */
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const OUT = process.argv[2] || 'media/gallery';
const PERF = process.argv.includes('--perf');
const URL_BASE = process.env.GALLERY_URL || 'http://localhost:8099/';

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=default', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

await page.goto(`${URL_BASE}#manual`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__game, null, { timeout: 300_000 });

await page.evaluate(() => {
  const g = window.__game;
  g.walker.enabled = true;
  document.getElementById('hud').style.display = 'none';
  /* The sun is pinned rather than left wherever the session's progression put
   * it, because a gallery whose light differs between runs compares nothing. */
  g.setSun(38, 152);
  window.__g = {
    stand(s) {
      const w = g.walker;
      w.setAuto(null);
      w.pos.set(s.x, g.terrain.height(s.x, s.z) + (s.lift || 0), s.z);
      w.vel.set(0, 0, 0);
      w.yaw = s.yaw;
      /* Aiming at a point beats hand-picking a pitch: the pool sits three
       * metres below the rim it is shot from and a flat -0.10 put the whole
       * basin under the bottom of the frame. */
      if (s.target) {
        const eye = { x: w.pos.x, y: w.pos.y + 1.66, z: w.pos.z };
        const dx = s.target.x - eye.x, dy = s.target.y - eye.y, dz = s.target.z - eye.z;
        w.yaw = Math.atan2(-dx, -dz);
        w.pitch = Math.atan2(dy, Math.hypot(dx, dz));
      } else {
        w.pitch = s.pitch;
      }
      for (let i = 0; i < 40; i++) { g.step(1 / 60); g.render(); }
    },
  };
});

/* The stations, resolved in the page because every one of them is defined by a
 * constant the level owns: an arc length, the brook's offset curve, the pool's
 * plan. Hardcoding metres here would rot the moment the trail is retuned. */
const stations = await page.evaluate(async () => {
  const g = window.__game;
  const THREE = window.THREE;
  const { brookOffset } = await import(new URL('src/world/brook.js', document.baseURI).href);
  const { trailOffset } = await import(new URL('src/game/anchors.js', document.baseURI).href);
  const { POOL } = await import(new URL('src/world/spillway.js', document.baseURI).href);
  const P = new THREE.Vector3(), T = new THREE.Vector3();
  const out = [];

  // Facing down-trail, which is the view the player spends the walk in.
  const along = (t, name, pitch = -0.04) => {
    g.trail.pointAt(t, P); g.trail.tangentAt(t, T).normalize();
    out.push({ name, x: P.x, z: P.z, yaw: Math.atan2(-T.x, -T.z), pitch });
  };
  along(0.22, '01-forest');
  along(0.45, '02-shafts');
  along(0.80, '03-ruins');
  along(0.97, '04-falls');

  /* Standing in the channel, looking down the flow. The brook is the surface
   * that reads worst and it cannot be judged from the trail, where eleven
   * metres of understorey hide it completely. */
  {
    const t = 0.60;
    const a = trailOffset(t, brookOffset(t), g.trail);
    const down = trailOffset(t + 0.05, brookOffset(t + 0.05), g.trail);
    out.push({
      name: '05-brook-along', x: a.x, z: a.z, lift: 0.9,
      target: { x: down.x, y: g.terrain.height(down.x, down.z) + 0.2, z: down.z },
    });
    // And across it from the near bank, the grazing angle that blows out.
    const bank = trailOffset(t, brookOffset(t) * 0.62, g.trail);
    out.push({
      name: '06-brook-across', x: bank.x, z: bank.z,
      target: { x: a.x, y: g.terrain.height(a.x, a.z) + 0.15, z: a.z },
    });
  }

  /* Across the basin at a grazing angle, from the near rim. Fresnel goes to
   * one here and the reflection becomes the whole of the shading, so this is
   * the frame that reports what the water is actually reflecting. */
  out.push({
    name: '07-pool', x: POOL.x + 8, z: POOL.z + 12, lift: 0.1,
    target: { x: POOL.x - 5, y: 0.25, z: POOL.z - 16 },
  });

  // A tablet, for stone read at reading distance.
  const tab = g.session.glyphs.items[0];
  if (tab) {
    const m = tab.mesh.position;
    const yaw = tab.mesh.rotation.y;
    const d = 2.6;
    const px = m.x + Math.sin(yaw) * d, pz = m.z + Math.cos(yaw) * d;
    out.push({ name: '08-tablet', x: px, z: pz, target: { x: m.x, y: m.y + 1.1, z: m.z } });
  }
  return out;
});

for (const s of stations) {
  await page.evaluate((s) => window.__g.stand(s), s);
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/${s.name}.jpg`, type: 'jpeg', quality: 90 });
}

let perf = null;
if (PERF) {
  /* Measured while walking rather than standing: a still camera lets every
   * cache stay warm and reports a number no player ever sees. */
  perf = await page.evaluate(async () => {
    const g = window.__game;
    g.walker.enabled = true;
    const t0 = performance.now();
    let frames = 0;
    await new Promise((done) => {
      const loop = () => {
        g.step(1 / 60); g.render();
        if (++frames < 240) requestAnimationFrame(loop); else done();
      };
      requestAnimationFrame(loop);
    });
    const ms = (performance.now() - t0) / frames;
    const info = g.renderer.info;
    return {
      fps: +(1000 / ms).toFixed(1), msPerFrame: +ms.toFixed(2),
      drawCalls: info.render.calls, triangles: info.render.triangles,
      programs: info.programs?.length ?? null,
      textureMB: +(info.memory.textures).toFixed(0),
      geometries: info.memory.geometries,
    };
  });
}

console.log(JSON.stringify({ out: OUT, shots: stations.map((s) => s.name), perf, errors }, null, 1));
await browser.close();
if (errors.length) process.exit(1);

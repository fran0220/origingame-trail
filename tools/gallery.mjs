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
 * Pictures are the judgement, but they are not the record. A shot that looks
 * "moodier" is the same shot with the black point dropped, and three rounds of
 * judging that by eye is how the exposure ended up being re-graded twice. So
 * every station also writes numbers — the frame's own histogram, and what it
 * cost to draw — into metrics.json next to the images. Two runs then diff, and
 * `--compare` puts the deltas on screen so a change that quietly crushed the
 * understorey has to say so.
 *
 * Usage:  node tools/serve.mjs &
 *         node tools/gallery.mjs [outDir] [--perf] [--compare <baselineDir>]
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { chromium } from 'playwright';

/* `--compare` takes a value, so its argument is not a positional one. Consuming
 * it explicitly keeps `gallery.mjs --compare media/base` from reading the
 * baseline path as the output directory and overwriting the baseline. */
const argv = process.argv.slice(2);
const VALUED = new Set(['--compare']);
const positional = [];
let BASE = null;
for (let i = 0; i < argv.length; i++) {
  if (VALUED.has(argv[i])) { if (argv[i] === '--compare') BASE = argv[++i] ?? ''; }
  else if (!argv[i].startsWith('--')) positional.push(argv[i]);
}
const OUT = positional[0] || 'media/gallery';
const PERF = argv.includes('--perf');
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

const shots = {};
for (const s of stations) {
  await page.evaluate((s) => window.__g.stand(s), s);
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/${s.name}.jpg`, type: 'jpeg', quality: 90 });
  /* Read the frame back at this station rather than once at the end: the whole
   * value of a fixed viewpoint is that its numbers belong to that viewpoint,
   * and an average over eight of them hides the one that went black. */
  shots[s.name] = await page.evaluate(() => {
    const g = window.__game;
    const p = g.probe();
    const i = g.info();
    return {
      ...p,
      calls: i.calls, triangles: i.triangles,
      textures: i.textures, geometries: i.geometries, programs: i.programs,
    };
  });
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

    /* The environment bake, timed on its own. It is the one cost in the frame
     * budget that is paid in lumps rather than per-frame — every sun step
     * rebakes — and it is geometry-bound rather than fill-bound, so it does
     * not move with resolution and will not show up in the fps above. Best of
     * three, because the first is warming caches. */
    const gl = g.renderer.getContext();
    const bake = [];
    for (let i = 0; i < 3; i++) {
      const a = performance.now();
      g._bakeEnv();
      gl.finish();
      bake.push(performance.now() - a);
    }

    return {
      fps: +(1000 / ms).toFixed(1), msPerFrame: +ms.toFixed(2),
      envBakeMs: +Math.min(...bake).toFixed(1),
      drawCalls: info.render.calls, triangles: info.render.triangles,
      programs: info.programs?.length ?? null,
      // A count, not a size. It was labelled textureMB and is neither.
      textures: info.memory.textures,
      geometries: info.memory.geometries,
    };
  });
}

await browser.close();

const metrics = { out: OUT, when: new Date().toISOString(), perf, shots, errors };
writeFileSync(`${OUT}/metrics.json`, JSON.stringify(metrics, null, 1));

/* Absolute sanity, not a look-freeze. These runs exist to *change* the look,
 * so pinning a median would fail on every improvement. What can be asserted
 * without knowing the intent is that a frame still carries a picture: not
 * crushed to black, not blown to white, and not flattened to one value. The
 * bounds are set wide of the eight stations' real spread, so tripping one
 * means something broke rather than something moved. */
const GATES = [
  ['blackPct', (v) => v <= 45, 'crushed to black'],
  ['blownPct', (v) => v <= 8, 'blown to white'],
  ['contrast', (v) => v >= 18, 'flattened to one value'],
  ['median', (v) => v > 0.005 && v < 0.97, 'frame is a solid colour'],
  ['calls', (v) => v > 50, 'scene did not draw'],
];
const failures = [];
for (const [name, shot] of Object.entries(shots)) {
  for (const [key, ok, why] of GATES) {
    if (!ok(shot[key])) failures.push(`${name}: ${key}=${shot[key]} — ${why}`);
  }
}

if (BASE) {
  const f = `${BASE}/metrics.json`;
  if (!existsSync(f)) {
    console.error(`no baseline at ${f} — run the gallery there first`);
    process.exit(2);
  }
  const base = JSON.parse(readFileSync(f, 'utf8'));
  const KEYS = ['median', 'mean', 'contrast', 'detail', 'blackPct', 'blownPct', 'lower', 'calls'];
  const w = 14;
  console.log(`\ndelta vs ${BASE}\n${'station'.padEnd(w)}${KEYS.map((k) => k.padStart(10)).join('')}`);
  for (const name of Object.keys(shots)) {
    const b = base.shots?.[name];
    if (!b) { console.log(`${name.padEnd(w)}  (new station)`); continue; }
    const cells = KEYS.map((k) => {
      const d = shots[name][k] - b[k];
      const s = Math.abs(d) < 1e-9 ? '·' : (d > 0 ? '+' : '') + d.toFixed(Math.abs(d) < 10 ? 3 : 0);
      return s.padStart(10);
    });
    console.log(`${name.padEnd(w)}${cells.join('')}`);
  }
}

console.log(JSON.stringify(
  { out: OUT, shots: Object.keys(shots), perf, errors, failures }, null, 1));
if (errors.length || failures.length) process.exit(1);

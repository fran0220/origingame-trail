/* Did a refactor change what the level looks like?
 *
 * The gallery answers "is this better"; a human decides. This answers "is this
 * the same", and nothing decides — the frames either match or they do not.
 * That is the one question a pure refactor has to be able to answer, and it is
 * the question the whole multi-level extraction depends on: moving the jungle
 * into a level module is only safe if the jungle still renders pixel for pixel
 * what it rendered before it moved.
 *
 * Two rules give it its value:
 *
 *   It drives only the public surface — `window.__game`, the trail, the
 *   terrain, the walker. It must not import a level's own modules, because
 *   the refactor being guarded against is exactly the one that relocates
 *   them: a guard that has to be edited in the same commit as the code it
 *   guards has stopped being a guard.
 *
 *   It stores a hash of the full frame *and* a coarse downsample. The hash
 *   answers "identical or not" with no tolerance to argue about; the
 *   downsample is what says how badly, and where, when the answer is no.
 *
 * Usage:
 *   node tools/serve.mjs &
 *   node tools/leveldiff.mjs --save          # write the baseline
 *   node tools/leveldiff.mjs                 # compare against it
 *   node tools/leveldiff.mjs --url http://localhost:8124/
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';

const argv = process.argv.slice(2);
const flag = (k, d) => { const i = argv.indexOf('--' + k); return i < 0 ? d : argv[i + 1]; };
const SAVE = argv.includes('--save');
const LEVEL = flag('level', 'jungle');
const URL_BASE = flag('url', process.env.LEVEL_URL || 'http://localhost:8099/');
const BASE = flag('base', `media/baseline/${LEVEL}.json`);
const OUT = flag('out', `media/leveldiff/${LEVEL}`);
/* Small on purpose. A refactor that moves a module either changes every pixel
 * of a frame or none of them; resolution buys nothing here and costs seconds
 * per station. The downsample below is what localises a difference. */
const W = 800, H = 450;
const DW = 80, DH = 45;

mkdirSync(OUT, { recursive: true });
mkdirSync('media/baseline', { recursive: true });

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=default', '--enable-unsafe-swiftshader',
         '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: W, height: H } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

/* One fragment, built here rather than handed in. The level selector and the
 * harness flag both live in the hash, so a caller who appends its own `#...`
 * to a base URL produces two of them; the browser keeps the first and silently
 * boots the default level, which then gets compared against the baseline of a
 * level it was never asked for. */
await page.goto(`${URL_BASE.split('#')[0]}#manual&level=${LEVEL}`,
                { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__game, null, { timeout: 300_000 });

await page.evaluate(({ dw, dh }) => {
  const g = window.__game;
  document.getElementById('hud').style.display = 'none';
  // Pinned, for the same reason the gallery pins it: a light that differs
  // between runs compares nothing.
  g.setSun(38, 152);

  const scratch = document.createElement('canvas');
  scratch.width = dw; scratch.height = dh;
  const sctx = scratch.getContext('2d', { willReadFrequently: true });

  window.__ld = {
    /* Stations from the trail alone. Every other candidate anchor — the pool,
     * the brook's offset curve, a tablet — belongs to one level's own modules,
     * and this file is not allowed to know those exist. */
    stations() {
      const T = window.THREE;
      const P = new T.Vector3(), D = new T.Vector3();
      const out = [];
      for (let i = 0; i < 12; i++) {
        const t = 0.02 + i * 0.088;
        g.trail.pointAt(t, P); g.trail.tangentAt(t, D).normalize();
        const yaw = Math.atan2(-D.x, -D.z);
        out.push({ name: `t${t.toFixed(2)}`, x: P.x, z: P.z, yaw, pitch: -0.04 });
        // Every third station also looks off the path, where the scatter lives.
        if (i % 3 === 0) {
          out.push({ name: `t${t.toFixed(2)}-side`, x: P.x, z: P.z,
                     yaw: yaw + Math.PI / 2, pitch: 0.06 });
        }
      }
      return out;
    },

    shoot(s) {
      const w = g.walker;
      w.setAuto(null);
      w.pos.set(s.x, g.terrain.height(s.x, s.z), s.z);
      w.vel.set(0, 0, 0);
      w.yaw = s.yaw; w.pitch = s.pitch;
      /* The same fixed number of fixed-size steps the gallery uses. Animation
       * time is accumulated, not read off a clock, so a station reached by the
       * same number of steps is the same frame every run. */
      for (let i = 0; i < 40; i++) { g.step(1 / 60); g.render(); }

      const cv = g.renderer.domElement;
      sctx.drawImage(cv, 0, 0, dw, dh);
      const d = sctx.getImageData(0, 0, dw, dh).data;
      // RGB only; alpha is 255 everywhere and would just pad the record.
      const small = new Uint8Array(dw * dh * 3);
      for (let i = 0, o = 0; i < d.length; i += 4) {
        small[o++] = d[i]; small[o++] = d[i + 1]; small[o++] = d[i + 2];
      }
      let bin = '';
      for (let i = 0; i < small.length; i++) bin += String.fromCharCode(small[i]);
      /* g.info(), not renderer.info.render. The composite is a fullscreen quad
       * drawn after the scene, so the renderer's live counters at the end of a
       * frame read calls=1, tris=1 for a perfectly healthy picture — which is
       * how the first cut of this guard managed to condemn the jungle. The
       * host snapshots the scene pass itself, and that is the number that
       * means "the world was drawn". */
      const st = g.info();
      return { small: btoa(bin), calls: st.calls, tris: st.triangles };
    },
  };
}, { dw: DW, dh: DH });

const stations = await page.evaluate(() => window.__ld.stations());

/* Warm-up, and it is not superstition: without it the first station of every
 * run differed from the first station of every other run while all fifteen
 * behind it matched exactly. The difference never reached the downsample —
 * a handful of pixels, invisible — but a guard that cries wolf once per run
 * is a guard nobody reads. It is the first frame paying for shader
 * compilation and the first pass through every lazily-built cache; shooting a
 * station and discarding it puts that cost before the record instead of
 * inside it. */
await page.evaluate((s) => window.__ld.shoot(s), stations[0]);

const rec = { level: LEVEL, w: W, h: H, dw: DW, dh: DH, shots: {} };

for (const s of stations) {
  const { small, calls, tris } = await page.evaluate((s) => window.__ld.shoot(s), s);
  /* An empty frame must never reach the record, and this guard matters more
   * here than anywhere else in the toolchain: two black frames hash equal, so
   * a lost context on both sides of a comparison does not read as a failure,
   * it reads as "16/16 stations identical". A guard that can be satisfied by
   * rendering nothing is worse than no guard, because it is trusted. */
  if (calls <= 1 || tris === 0) {
    console.error(`\nEMPTY FRAME at station ${s.name} (calls=${calls}, tris=${tris}).`);
    console.error('The renderer lost the world. Nothing was written; rerun.');
    await browser.close();
    process.exit(2);
  }
  /* The full frame is hashed from the PNG the browser encodes, which is
   * lossless and deterministic for identical pixels — so an equal hash is a
   * real "nothing moved", not a tolerance. */
  const png = await page.screenshot({ path: `${OUT}/${s.name}.png` });
  rec.shots[s.name] = {
    hash: createHash('sha256').update(png).digest('hex').slice(0, 16),
    small,
  };
}
if (errors.length) rec.errors = errors;

if (SAVE) {
  writeFileSync(BASE, JSON.stringify(rec));
  console.log(`baseline written: ${BASE}  (${stations.length} stations)`);
  if (errors.length) console.log('PAGE ERRORS:', errors);
  await browser.close();
  process.exit(0);
}

if (!existsSync(BASE)) {
  console.error(`no baseline at ${BASE} — run with --save first`);
  await browser.close();
  process.exit(2);
}

const base = JSON.parse(readFileSync(BASE, 'utf8'));
const rows = [];
let changed = 0;
for (const [name, cur] of Object.entries(rec.shots)) {
  const old = base.shots[name];
  if (!old) { rows.push({ name, note: 'new station' }); changed++; continue; }
  if (old.hash === cur.hash) { rows.push({ name, same: true }); continue; }
  const a = Buffer.from(old.small, 'base64');
  const b = Buffer.from(cur.small, 'base64');
  let diffPx = 0, maxD = 0, sumD = 0;
  for (let i = 0; i < a.length; i += 3) {
    const d = Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]),
                       Math.abs(a[i + 2] - b[i + 2]));
    if (d > 0) diffPx++;
    if (d > maxD) maxD = d;
    sumD += d;
  }
  const px = a.length / 3;
  rows.push({ name, diffPct: +(100 * diffPx / px).toFixed(2), maxD,
              meanD: +(sumD / px).toFixed(2) });
  changed++;
}

for (const r of rows) {
  if (r.same) continue;
  console.log(r.note
    ? `${r.name.padEnd(14)} ${r.note}`
    : `${r.name.padEnd(14)} pixels=${String(r.diffPct).padStart(6)}%  ` +
      `max=${String(r.maxD).padStart(3)}  mean=${r.meanD}`);
}
console.log(errors.length ? `PAGE ERRORS: ${errors.join(' | ')}` : '');
console.log(changed === 0
  ? `leveldiff ${LEVEL}: PASS — ${stations.length}/${stations.length} stations identical`
  : `leveldiff ${LEVEL}: FAIL — ${changed}/${stations.length} stations differ`);

await browser.close();
process.exit(changed === 0 ? 0 : 1);

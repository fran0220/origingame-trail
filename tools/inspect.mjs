/* Look at any point in a level, from any angle, with the HUD gone.
 *
 * Every capture tool here either drives the route or uses a fixed station
 * list, which is right for judging the drive and useless for judging one
 * object. The woolshed reads as a shipping container from the road and I spent
 * two rounds guessing at why, because the shed is forty metres inland and no
 * instrument could point a camera at it.
 *
 * The awkward part is not the camera. It is that this game opens on a title
 * splash which dims the frame to about a tenth of its brightness, and it does
 * not clear until the run has been going for a while. Teleporting the camera
 * at t=0 produces a photograph of a dark blue rectangle — which is exactly
 * what my first three attempts at photographing the wayside produced, and I
 * misread all three as "the object is not there".
 *
 * So: drive first until the splash has gone, THEN move the camera.
 *
 * Usage:
 *   node tools/serve.mjs &
 *   node tools/inspect.mjs lake farm.sheds 0 --dist 28 --height 9
 *   node tools/inspect.mjs lake wayside     0 --dist 22
 *   node tools/inspect.mjs jungle deadwood  3 --dist 8  --height 3
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { run } from './harness.mjs';

const argv = process.argv.slice(2);
const flag = (name, dflt) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? Number(argv[i + 1]) : dflt;
};
const positional = argv.filter((a, i) =>
  !a.startsWith('--') && !(i > 0 && argv[i - 1].startsWith('--')));

const level = positional[0] || 'lake';
const subject = positional[1] || 'wayside';
const index = Number(positional[2] || 0);
const DIST = flag('dist', 26);
const HEIGHT = flag('height', 8);
const AZ = flag('az', 35);
const W = flag('w', 1280), H = flag('h', 720);
const WARMUP = flag('warmup', 26);   // seconds of sim before the splash clears

await run({ width: W, height: H, hash: `manual&tier=high&level=${level}&cond=morning`, timeout: 600_000 },
  async ({ page }) => {
    const info = await page.evaluate(async (o) => {
      const g = window.__game;
      g.begin();
      if (g.setSun) g.setSun(34, 26);

      /* Warm up. On the lake this means driving, because the splash clears on
       * progress rather than on wall time; on foot, stepping is enough. */
      let driver = null;
      try { driver = (await import('/tools/autodriver.mjs')).drive; } catch { /* walker level */ }
      for (let n = 0; n < 60 * o.warmup; n++) {
        if (driver) driver(g);
        g.step(1 / 60);
      }

      /* Find the subject. Named meshes first, then a module's own geometry —
       * whichever the caller asked for, resolved as level.<path>. */
      const parts = o.subject.split('.');
      const mod = g.level[parts[0]];
      if (!mod) return { error: `no level.${parts[0]}` };

      const points = [];
      mod.root.traverse((n) => {
        if (!n.isMesh && !n.isInstancedMesh) return;
        if (parts[1] && !new RegExp(parts[1], 'i').test(n.name || '')) return;
        if (n.isInstancedMesh) {
          const M = new window.THREE.Matrix4(), V = new window.THREE.Vector3();
          for (let i = 0; i < n.count; i++) {
            n.getMatrixAt(i, M); V.setFromMatrixPosition(M);
            if (V.y > -50) points.push({ x: V.x, y: V.y, z: V.z, name: n.name });
          }
        } else {
          const V = new window.THREE.Vector3();
          n.getWorldPosition(V);
          points.push({ x: V.x, y: V.y, z: V.z, name: n.name });
        }
      });
      if (!points.length) return { error: `nothing matched ${o.subject}` };
      const p = points[Math.min(o.index, points.length - 1)];

      /* A mesh's origin is not always where its geometry is — the sheds are
       * one merged buffer whose origin sits at the world origin. Fall back to
       * the geometry's own bounding-sphere centre when that happens. */
      let target = p;
      if (Math.abs(p.x) < 1e-3 && Math.abs(p.z) < 1e-3) {
        const m = mod.root.children.find((c) => c.isMesh);
        if (m) {
          if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere();
          const c = m.geometry.boundingSphere.center;
          target = { x: c.x, y: c.y, z: c.z, name: m.name };
        }
      }

      const a = o.az * Math.PI / 180;
      const camX = target.x + Math.cos(a) * o.dist;
      const camZ = target.z + Math.sin(a) * o.dist;

      /* LIFT THE CAMERA ABOVE ANYTHING IN THE WAY.
       *
       * A fixed offset puts the camera wherever the maths says, which on
       * rolling ground is regularly behind a rise. The first useful shot this
       * tool produced showed a woolshed with only its ridge above the grass,
       * and I read that as "the building is buried" and rewrote its placement.
       * It was not buried — measured, it stood 5 m clear — there was simply a
       * low ridge between it and the lens.
       *
       * Sampling the ground along the view ray and clearing the highest point
       * on it costs twenty height lookups and removes an entire category of
       * wrong conclusion. An instrument that can be occluded without saying so
       * is an instrument that reports absence when it means obstruction. */
      const terr = g.level.terrain;
      let ridge = -Infinity;
      for (let i = 0; i <= 20; i++) {
        const u = i / 20;
        const sx = camX + (target.x - camX) * u, sz = camZ + (target.z - camZ) * u;
        const h = terr.height(sx, sz);
        if (h > ridge) ridge = h;
      }
      const camY = Math.max(target.y + o.height, ridge + 3.0);
      g.camera.position.set(camX, camY, camZ);
      g.camera.lookAt(target.x, target.y + 1.2, target.z);
      g.camera.updateMatrixWorld(true);
      g.level.cullAround?.(g.camera.position.x, g.camera.position.z);
      /* renderer.render, NOT g.render. The game's own render step re-derives
       * the camera from the chase rig every frame, so a camera set beforehand
       * is overwritten before the shutter — the first version of this tool
       * produced a perfect photograph of the car's rear bumper no matter what
       * it was asked to look at. */
      g.renderer.render(g.scene, g.camera);
      /* Grab the pixels IN THIS TICK.
       *
       * The game owns a requestAnimationFrame loop, so anything rendered here
       * is replaced by the game's own next frame long before Playwright's
       * screenshot lands — the second version of this tool rendered the right
       * image and then photographed the one after it, which was the chase
       * camera again. Reading the drawing buffer synchronously is the only
       * way to be sure the pixels captured are the pixels drawn. */
      const url = g.renderer.domElement.toDataURL('image/png');
      return { candidates: points.length, target, name: target.name, url };
    }, { subject, index, dist: DIST, height: HEIGHT, az: AZ, warmup: WARMUP });

    if (info.error) { console.error(`inspect: ${info.error}`); process.exitCode = 1; return; }
    mkdirSync('shots/inspect', { recursive: true });
    const out = `shots/inspect/${subject.replace(/[^\w]/g, '-')}-${index}.png`;
    writeFileSync(out, Buffer.from(info.url.split(',')[1], 'base64'));
    console.log(`inspect: ${info.candidates} candidate(s); shot ${info.name} at ` +
                `${info.target.x.toFixed(0)},${info.target.z.toFixed(0)} -> ${out}`);
  });

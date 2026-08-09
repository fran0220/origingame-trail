/* Fixed visual targets for Lake Tekapo.
 *
 * Correctness tests answer whether the lake, route and authored subjects agree
 * on world-space truth. This tool answers the separate question that matters
 * during an art pass: did one controlled change make the same picture better?
 * Every station pins its world position, aim point, lens, sun and resolution.
 *
 * Usage:
 *   node tools/lake-gallery.mjs <tag> [--system mountains|water|flora|all]
 *                                    [--ablate snow|erosion|haze|waves|shore|ao|ao-wide|contact]
 *                                    [--isolate]
 *                                    [--w 1280] [--h 720]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { run, capture } from './harness.mjs';
import { finish } from './tame.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const tag = args[0] && !args[0].startsWith('--') ? args[0] : 'lake-gallery';
const flag = (key, fallback) => {
  const i = args.indexOf(`--${key}`);
  return i < 0 ? fallback : args[i + 1];
};
const SYSTEM = flag('system', 'all');
const ABLATE = flag('ablate', 'none');
const ISOLATE = args.includes('--isolate');
const ONLY = flag('only', '');
const ONLY_SET = new Set(ONLY.split(',').filter(Boolean));
const W = +flag('w', 1280);
const H = +flag('h', 720);
const outDir = path.join(ROOT, 'shots', tag);

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

await run({ width: W, height: H, hash: 'manual&tier=high&level=lake&cond=morning', timeout: 300_000 }, async ({ page, errs, gl }) => {
  const stations = (await page.evaluate(({ system, ablate, isolate }) => {
    const g = window.__game;
    const THREE = window.THREE;
    const level = g.level;
    const shoreAt = (z) => {
      const u = THREE.MathUtils.clamp((70 - z) / 730, 0, 1);
      let x = -34 - 96 * THREE.MathUtils.smoothstep(u, .05, .55)
        + 120 * THREE.MathUtils.smoothstep(u, .72, 1);
      x += 26 * Math.exp(-(((z + 300) / 46) ** 2));
      x += 17 * Math.exp(-(((z + 486) / 38) ** 2));
      return x + 5.5 * Math.sin(z * .019) + 2.4 * Math.sin(z * .047 + 1.7);
    };
    const out = [];
    const P = new THREE.Vector3();
    const T = new THREE.Vector3();

    g.setSun(38, 22);
    /* The car is the player, not the scenery, and every station here places a
     * camera by hand rather than driving to it. Left visible, the shell stays
     * parked wherever the physics body happens to be — which on a fixed-view
     * station is directly on the lens, so twenty of these frames come back
     * showing the underside of a floorpan. This tool reviews the landscape. */
    g.hideCar = true;
    level.distance?.setDebug?.(ablate);
    level.water?.setDebug?.(ablate);
    level.veg?.setDebug?.(ablate);
    if (g.atmos) {
      if (ablate === 'ao' || ablate === 'ao-wide') g.atmos.aoStrength = 0;
      if (ablate === 'ao' || ablate === 'contact') g.atmos.contactStrength = 0;
    }
    /* "The ground texture is invisible" and "the ground texture is unlit" look
     * identical in a finished frame. These two read the basin shader's own
     * debug switch so a review can tell them apart. */
    const gd = level.terrainMat?.userData?.uniforms?.uDebug;
    if (gd && ablate === 'ground-splat') gd.value = 1;
    if (gd && ablate === 'ground-albedo') gd.value = 2;
    /* Habitat scans sit between the continuous meadow and authored native
     * species. Keep a pair of review switches so alpha, scale and distribution
     * faults can be assigned to the correct layer instead of guessed from the
     * integrated frame. */
    if (ablate === 'no-habitat' && level.habitat?.root) level.habitat.root.visible = false;
    if (ablate.startsWith('no-habitat:') && level.habitat?.root) {
      const families = new Set(ablate.slice('no-habitat:'.length).split(','));
      level.habitat.root.traverse((mesh) => {
        if (!mesh.isInstancedMesh) return;
        const family = mesh.name.split(':')[1];
        if (families.has(family)) mesh.count = 0;
      });
    }
    if (ablate === 'no-props' && level.props?.root) level.props.root.visible = false;
    if (ablate === 'habitat-only') {
      if (level.meadow?.root) level.meadow.root.visible = false;
      if (level.veg?.root) level.veg.root.visible = false;
      if (level.props?.root) level.props.root.visible = false;
      if (level.fauna?.root) level.fauna.root.visible = false;
    }
    /* Fast subsystem iteration still needs the real terrain, camera,
     * atmosphere and lighting, but it need not shade several million hidden
     * triangles. Isolation is opt-in so the ordinary gallery remains the
     * integration gate and cannot accidentally pass a system outside the
     * complete frame. */
    if (isolate && system === 'mountains') {
      if (level.water?.root) level.water.root.visible = false;
      if (level.veg?.root) level.veg.root.visible = false;
      if (level.fauna?.root) level.fauna.root.visible = false;
    } else if (isolate && system === 'water') {
      if (level.veg?.root) level.veg.root.visible = false;
      if (level.fauna?.root) level.fauna.root.visible = false;
    }

    const routeEye = (t, name, target, fov = 55, lift = 0) => {
      g.trail.pointAt(t, P);
      out.push({ name, x: P.x, z: P.z, lift, target, fov });
    };

    if (system === 'all' || system === 'mountains') {
      routeEye(.28, '01-aoraki-wide', { x: -600, y: 720, z: -9200 }, 58);
      routeEye(.62, '02-aoraki-route', { x: -600, y: 710, z: -9200 }, 58);
      routeEye(.62, '03-aoraki-tele', { x: -600, y: 830, z: -9200 }, 34);
      routeEye(.90, '04-delta-head', { x: -520, y: 510, z: -7600 }, 50);
    }

    if (system === 'all' || system === 'water') {
      const wetZ = -235;
      const wetX = shoreAt(wetZ);
      out.push({
        /* Stand beyond the wet overlay and look across its full width. The
         * previous camera sat inside the wet band, so a valid darkening had no
         * dry reference in frame and could not actually be reviewed. */
        name: '05-wet-margin', x: wetX + 13, z: wetZ + 1, lift: 1.2, fov: 42,
        target: { x: wetX + .5, y: .04, z: wetZ - 2 },
      });
      const grazeZ = -360;
      const grazeX = shoreAt(grazeZ);
      out.push({
        name: '06-water-grazing', x: grazeX + 3, z: grazeZ + 8, lift: 1.4, fov: 42,
        target: { x: grazeX - 210, y: .04, z: grazeZ - 35 },
      });
      const sideZ = -300;
      const sideX = shoreAt(sideZ);
      out.push({
        name: '07-lake-side', x: sideX + 12, z: sideZ + 20, lift: 5.5, fov: 58,
        target: { x: sideX - 1000, y: .1, z: sideZ - 400 },
      });
    }

    if (system === 'all' || system === 'flora') {
      const heroes = [
        ['silver-tussock', '08-silver-tussock'],
        ['matagouri', '09-matagouri'],
        ['flax', '10-flax'],
        ['toetoe', '11-toetoe'],
        ['raoulia-cushion', '12-raoulia'],
      ];
      for (const [id, name] of heroes) {
        const points = level.veg?.notable?.[id] || [];
        /* Pick a specimen close enough to the route to be a real player view,
         * but not in its clearance strip. This score is deterministic and the
         * resulting position is written to report.json, so a distribution
         * change cannot silently turn the close-up into a different plant. */
        let plant = null;
        let best = Infinity;
        for (const p of points) {
          const q = g.trail.nearest(p.x, p.z, {});
          if (q.t < .14 || q.t > .88 || q.dist < 5 || q.dist > 18) continue;
          let nearest = Infinity;
          for (const other of points) {
            if (other === p) continue;
            nearest = Math.min(nearest, Math.hypot(other.x-p.x,other.z-p.z));
          }
          const isolation = id === 'toetoe' || id === 'flax' ? 7 : 3.4;
          const crowd = Math.max(0, isolation-nearest) * (isolation > 4 ? 12 : 2);
          const young = Math.max(0, .92-(p.plantScale || 1)) * 4;
          const score = Math.abs(q.dist - 8) + Math.abs(q.t - .52) * 3 + crowd + young;
          if (score < best) { best = score; plant = p; }
        }
        if (!plant) plant = points[0];
        if (!plant) continue;
        const q = g.trail.nearest(plant.x, plant.z, {});
        g.trail.pointAt(q.t, P);
        T.set(P.x - plant.x, 0, P.z - plant.z).normalize();
        const low = id === 'raoulia-cushion';
        const distance = { flax: 3.4, toetoe: 5.2 }[id] || 2.7;
        /* The cushion grows centimetres high. Shoot it from its lakeward side
         * with a kneeling macro-height camera; the former standing eye on the
         * uphill side put the selected specimen behind a 2 cm shingle crest
         * and accidentally reviewed its neighbours at the frame edge. */
        const stand = plant.clone().addScaledVector(T, low ? -.75 : distance);
        const aimHeight = {
          'silver-tussock': .55, matagouri: .52, flax: .68,
          toetoe: 1.50, 'raoulia-cushion': .07,
        }[id];
        out.push({
          name, x: stand.x, z: stand.z, lift: low ? -1.32 : 0, fov: id === 'toetoe' ? 48 : 38,
          target: { x: plant.x, y: plant.y + aimHeight, z: plant.z },
          subject: id,
        });
      }
      /* Two complementary route compositions: a nearby mixed stand that
       * proves individual plants hold up together, then an up-lake view where
       * the established fan vegetation frames the shore and Aoraki instead of
       * being cropped out by a camera aimed ninety degrees across the lake. */
      routeEye(.80, '13-community-landward', { x: 15, y: 3.4, z: -505 }, 52);
      routeEye(.40, '14-community-shore', { x: -600, y: -300, z: -9200 }, 60, 1.5);

      /* The middle storey has its own fixed evidence. Select deterministic
       * scanned instances near the playable route so density or scale changes
       * cannot remain invisible in landscape-only frames. */
      const habitatTarget = (prefix, name, idealDist, aimHeight) => {
        const matrix = new THREE.Matrix4();
        const point = new THREE.Vector3();
        let chosen = null;
        let score = Infinity;
        level.habitat?.root?.traverse((mesh) => {
          if (!mesh.isInstancedMesh || !mesh.name.startsWith(`habitat:${prefix}:`)) return;
          for (let i = 0; i < mesh.count; i++) {
            mesh.getMatrixAt(i, matrix);
            point.setFromMatrixPosition(matrix);
            const q = g.trail.nearest(point.x, point.z, {});
            if (q.t < .14 || q.t > .88 || q.dist < 8 || q.dist > 28) continue;
            const next = Math.abs(q.dist - idealDist) + Math.abs(q.t - .52) * 4;
            if (next < score) { score = next; chosen = { x:point.x, y:point.y, z:point.z, t:q.t }; }
          }
        });
        if (!chosen) return;
        g.trail.pointAt(chosen.t, P);
        /* These are asset evidence frames, not route compositions. Stand a few
         * metres from the selected instance on its route-facing side; leaving
         * the camera on the route put small scans behind intervening moraine
         * relief and the frame reviewed an unrelated native plant instead. */
        T.set(P.x - chosen.x, 0, P.z - chosen.z).normalize();
        const stand = point.set(chosen.x, chosen.y, chosen.z).addScaledVector(T, 3.8);
        out.push({
          name, x:stand.x, z:stand.z, lift:0, fov:40,
          target:{ x:chosen.x, y:chosen.y + aimHeight, z:chosen.z },
        });
      };
      habitatTarget('fern-gully', '15-habitat-fern', 13, .42);
      habitatTarget('broadleaf-scrub', '16-habitat-scrub', 16, .58);
      habitatTarget('dense-green-scrub', '21-habitat-green-scrub', 16, .72);
      habitatTarget('spring-dandelion', '24-habitat-dandelion', 11, .16);
      habitatTarget('spring-buttercup-bank', '25-habitat-buttercup-bank', 12, .20);
    }

    if (system === 'all' || system === 'fauna') {
      const faunaTarget = (species, name, fov = 36, distance = 5, zOffset = 0, lift = 0) => {
        const entity = level.fauna?.notable?.[species];
        if (!entity) return;
        /* Stand on the landward side of the subject. Route-only cameras put
         * small waterbirds behind a berm and insects tens of metres away. */
        const bank = shoreAt(entity.base.z) + 2.8;
        const x = entity.habitat === 'water'
          ? bank
          : Math.max(bank, entity.base.x + distance);
        out.push({
          name, x, z:entity.base.z + zOffset, lift, fov,
          target:{ x:entity.base.x, y:entity.base.y + entity.focusY, z:entity.base.z },
          faunaSpecies:species,
        });
      };
      faunaTarget('kea', '17-fauna-kea', 32, 6.5, 4.8, 4.8);
      faunaTarget('paradise-shelduck', '18-fauna-waterfowl', 30, 4.2, 2.8);
      faunaTarget('black-stilt', '19-fauna-wader', 30, 2.8, 2.2);
      faunaTarget('red-admiral', '20-fauna-butterfly', 20, .46, .30, -.25);
    }
    return out;
  }, { system: SYSTEM, ablate: ABLATE, isolate: ISOLATE })).filter(s => !ONLY_SET.size || ONLY_SET.has(s.name));

  const report = [];
  for (const station of stations) {
    await page.evaluate((s) => {
      const g = window.__game;
      const w = g.walker;
      w.setAuto(null);
      /* Free visual targets must not be pulled back toward the traversable
       * route while they settle. Keep every world system stepping (water,
       * culling, shadows, fauna), but pose the camera directly and silence only
       * the controller exactly as look.mjs does. */
      if (!w.__galleryPosed) {
        w.__galleryPosed = true;
        w.update = () => {};
      }
      const eyeY = g.terrain.height(s.x, s.z) + 1.66 + (s.lift || 0);
      w.pos.set(s.x, eyeY, s.z);
      w.vel.set(0, 0, 0);
      const dx = s.target.x - w.pos.x;
      const dy = s.target.y - eyeY;
      const dz = s.target.z - w.pos.z;
      w.yaw = Math.atan2(-dx, -dz);
      w.pitch = Math.atan2(dy, Math.hypot(dx, dz));
      g.camera.position.copy(w.pos);
      g.camera.lookAt(s.target.x, s.target.y, s.target.z);
      g.camera.fov = s.fov;
      g.camera.updateProjectionMatrix();
      /* These are scene-system targets, not player-body tests. Looking down at
       * a low plant otherwise lets the first-person hand enter a corner and a
       * composition reviewer quite reasonably scores the unrelated mesh. */
      if (g.body?.root) g.body.root.visible = false;
      g.level.veg?.setDebug?.(s.subject || 'none');
      if (s.faunaSpecies) {
        const target = g.level.fauna?.notable?.[s.faunaSpecies];
        if (target) { target.orbit = 0; target.speed = 0; }
      }
      g.cullAround?.(w.pos.x, w.pos.z);
      for (let i = 0; i < 90; i++) {
        g.step(1 / 60);
        if (g.body?.root) g.body.root.visible = false;
        if (g.level.fauna?.root) {
          g.level.fauna.root.visible = Boolean(s.faunaSpecies);
          if (s.faunaSpecies) {
            for (const entity of g.level.fauna.entities) {
              entity.root.visible = entity.species === s.faunaSpecies
                && g.level.fauna.notable[s.faunaSpecies] === entity;
            }
          }
        }
        g.render();
      }
    }, station);
    await page.waitForTimeout(180);
    const metrics = await page.evaluate(() => {
      const g = window.__game;
      return {
        ...g.info(),
        hist: g.probe(),
        actualCamera: [g.camera.position.x,g.camera.position.y,g.camera.position.z],
        actualWalker: [g.walker.pos.x,g.walker.pos.y,g.walker.pos.z],
        actualLook: [g.walker.yaw,g.walker.pitch],
      };
    });
    if (metrics.calls <= 1 || metrics.triangles <= 0) {
      throw new Error(`${station.name}: empty frame (${metrics.calls} calls, ${metrics.triangles} triangles)`);
    }
    const file = path.join(outDir, `${station.name}.png`);
    await capture(page, file);
    report.push({ ...station, file: path.basename(file), ...metrics });
    console.log(`  ${station.name.padEnd(24)} calls=${metrics.calls} tris=${Math.round(metrics.triangles / 1000)}k median=${metrics.hist.median}`);
  }

  fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify({
    tag, system: SYSTEM, ablate: ABLATE, isolate: ISOLATE, size: [W, H], sun: [38, 22], gl,
    generatedAt: new Date().toISOString(), stations: report, errors: errs,
  }, null, 2));
  console.log(`\n  → ${path.relative(ROOT, outDir)}`);
});

finish(process.exitCode || 0);

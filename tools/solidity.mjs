/* Solidity: does anything solid-looking have nothing behind it?
 *
 * Three bugs in three days, all the same shape and none of them visible in a
 * screenshot: the lookout rail did not stop anyone, the timing gantries were
 * driven through, and the service park was not there as far as the physics was
 * concerned. Each was found by hand, and each was found only because I happened
 * to go looking. A fault class I find by remembering to look is a fault class
 * that ships the week I am busy.
 *
 * So this walks the scene, groups meshes by name, and reports any group whose
 * geometry has no collider near it. It is a REPORT, not a pass/fail, for the
 * same reason the seating audit is: whether a thing should be solid is a
 * judgement, and encoding that judgement as a threshold would either fail
 * forever or be widened until it caught nothing.
 *
 * What it cannot do is tell you a collider is the WRONG SIZE. It answers one
 * question — is there anything there at all — which is precisely the question
 * all three of those bugs got wrong.
 *
 * Usage:  node tools/solidity.mjs [lake|jungle]
 */
import { run } from './harness.mjs';

const level = process.argv[2] || 'lake';

/* Things that are correctly not solid, with the reason. Kept explicit and
 * short: adding an entry should be a decision somebody made, not a threshold
 * quietly widening. */
const SOFT = [
  [/sky|cloud|distance|water|lake-surface|stream|adaptive-density/i, 'not an object'],
  [/falls|pool|boil|chute|brook|spray|cascade/i, 'water'],
  [/vine|liana|deadwood|bracket/i, 'pushed through or stepped over'],
  [/wing|antenna|thorax|abdomen|bill|eye|leg|foot|tail|breast|head|neck|covert/i,
   'an animal body part'],
  [/flora|sward|turf|tussock|grass|veg:|fungi|reclaim/i, 'vegetation you walk through'],
  [/bird|butterfl|life:|fauna|insect|skink|dust|motes/i, 'moves, or is airborne'],
  [/flag|banner|board|chevron|marker|reflector|wire|power/i,
   'frangible or overhead by design'],
  [/sheep|people|stage:|crowd/i, 'animate; the collision world is static'],
  [/road|seal|marking|terrain|ground|litter/i, 'the surface itself'],
  [/^race:/i, 'split markers, frangible by design'],
  /* Stone scatter is driven and walked over. This is the same judgement
   * colliders.js already records in prose — "scree is driven over", "a
   * collider on every stone would make the roadside a minefield and cost
   * thousands of proxies to do it" — written here so the audit agrees with the
   * decision instead of re-litigating it every run. Large outcrops ARE solid;
   * they are registered separately and appear as rock:outcrop. */
  [/shingle|scree|cobble|erratic|lichen-slab|fan-rill/i, 'stone scatter, driven over'],
  [/^body$|^bill$|^wing/i, 'an animal body part'],
  [/alps|massif|mantle|range|aoraki/i, 'the distance pass, forty kilometres out'],
  [/driftwood/i, 'stone scatter, driven over'],
  [/car-|wheel|rim|brake|tyre|rubber|caliper|cockpit|inst-/i, 'the player'],
  [/trackwork|boardwalk/i, 'deck at litter height, walked over'],
];

await run({ hash: `manual&tier=high&level=${level}&cond=morning`, timeout: 600_000 },
  async ({ page }) => {
    const out = await page.evaluate(async (softSrc) => {
      const soft = softSrc.map((s) => [new RegExp(s.source, s.flags), s.why]);
      const g = window.__game;
      g.begin();
      for (let i = 0; i < 90; i++) g.step(1 / 60);
      const THREE = window.THREE;
      const world = g.collision;
      if (!world) return { error: 'no collision world' };

      /* Collider centres, bucketed onto a coarse grid so the nearest-search is
       * not 500,000 x 900. */
      const CELL = 8;
      const grid = new Map();
      for (const c of world.colliders) {
        const cx = c.x !== undefined ? c.x : (c.ax + c.bx) / 2;
        const cz = c.z !== undefined ? c.z : (c.az + c.bz) / 2;
        const k = `${Math.floor(cx / CELL)},${Math.floor(cz / CELL)}`;
        let b = grid.get(k);
        if (!b) grid.set(k, b = []);
        b.push([cx, cz]);
      }
      const nearest = (x, z) => {
        const gx = Math.floor(x / CELL), gz = Math.floor(z / CELL);
        let best = Infinity;
        for (let a = -2; a <= 2; a++) {
          for (let b = -2; b <= 2; b++) {
            const bucket = grid.get(`${gx + a},${gz + b}`);
            if (!bucket) continue;
            for (const [cx, cz] of bucket) {
              const d = Math.hypot(cx - x, cz - z);
              if (d < best) best = d;
            }
          }
        }
        return best;
      };

      const M = new THREE.Matrix4(), V = new THREE.Vector3();
      const groups = new Map();
      g.scene.traverse((o) => {
        if (!o.isMesh && !o.isInstancedMesh) return;
        const name = o.name || '(unnamed)';
        const key = name.replace(/:\d+.*$/, '');
        let e = groups.get(key);
        if (!e) groups.set(key, e = { key, pts: [], instances: 0, radius: 0 });
        /* An object's own size is slack. A timing gantry is 15 m wide with its
         * legs at the ends, so its instance origin — on the road centreline —
         * is 7.5 m from the nearest collider and the group read 100% unbacked
         * immediately after I gave it colliders. The question is whether the
         * OBJECT has something behind it, not whether its origin does. */
        if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
        e.radius = Math.max(e.radius, o.geometry.boundingSphere.radius || 0);
        if (o.isInstancedMesh) {
          e.instances += o.count;
          const stride = Math.max(1, Math.floor(o.count / 12));
          for (let i = 0; i < o.count; i += stride) {
            o.getMatrixAt(i, M); V.setFromMatrixPosition(M);
            if (V.y > -50) e.pts.push([V.x, V.z]);
          }
        } else {
          e.instances += 1;
          o.updateMatrixWorld(true);
          const pos = o.geometry.getAttribute('position');
          if (!pos) return;
          const stride = Math.max(1, Math.floor(pos.count / 24));
          for (let i = 0; i < pos.count; i += stride) {
            V.set(pos.getX(i), pos.getY(i), pos.getZ(i)).applyMatrix4(o.matrixWorld);
            e.pts.push([V.x, V.z]);
          }
        }
      });

      const rows = [];
      for (const e of groups.values()) {
        if (!e.pts.length) continue;
        const why = soft.find(([re]) => re.test(e.key));
        /* FRACTION UNBACKED, not worst gap.
         *
         * Worst gap is the wrong statistic for a merged mesh. structures.js
         * holds culvert headwalls, gates, stockyards, boat ramps and jetties in
         * ONE buffer spanning two kilometres; the headwalls have colliders and
         * the jetties correctly do not, so its worst sample is 9.9 m from
         * anything and the group looks unbacked when most of it is fine. The
         * same applied to the fences, the wayside and the trailhead, whose
         * marker stakes run the length of the trail and are frangible on
         * purpose. Asking what SHARE of the object has nothing behind it
         * separates "this is missing" from "part of this is meant to be
         * soft". */
        const slack = 4.0 + Math.min(e.radius, 40);
        let unbacked = 0, worst = 0;
        for (const [x, z] of e.pts) {
          const d = nearest(x, z);
          if (d > slack) unbacked++;
          if (d > worst) worst = d;
        }
        rows.push({ key: e.key, instances: e.instances,
                    worstGapM: +worst.toFixed(1),
                    unbackedPct: +(100 * unbacked / e.pts.length).toFixed(0),
                    soft: why ? why[1] : null });
      }
      rows.sort((a, b) => b.unbackedPct - a.unbackedPct || b.worstGapM - a.worstGapM);
      return { rows, colliders: world.colliders.length };
    }, SOFT.map(([re, why]) => ({ source: re.source, flags: re.flags, why })));

    if (out.error) { console.error(`solidity: ${out.error}`); process.exitCode = 1; return; }

    /* A group is "unbacked" if its furthest sample is more than this from any
     * collider. Generous: a collider does not have to be under every vertex,
     * only somewhere in the object. */
    const GAP = 4.0;
    /* Most of the object, not a corner of it. */
    const SHARE = 60;
    const hard = out.rows.filter((r) => !r.soft && r.unbackedPct >= SHARE);

    console.log(`\nsolidity: ${level}`);
    console.log(`  ${out.rows.length} mesh groups, ${out.colliders} colliders`);
    console.log(`  ${out.rows.filter((r) => r.soft).length} exempt by name\n`);
    if (!hard.length) {
      console.log('  ok — every solid-looking group has a collider near it');
      return;
    }
    console.log(`  ${hard.length} group(s) at least ${SHARE}% unbacked ` +
                `(no collider within ${GAP} m):\n`);
    for (const r of hard) {
      console.log(`    ${r.key.padEnd(30)} n=${String(r.instances).padStart(6)}  ` +
                  `${String(r.unbackedPct).padStart(3)}% unbacked, worst ${r.worstGapM} m`);
    }
    console.log('\n  Each is either a missing collider or a missing SOFT entry.');
  });

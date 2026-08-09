/* What the car can hit.
 *
 * The lake registered nothing with the collision world — not a fence post, not
 * a power pole, not a shed — and the driver never queried it anyway, so the
 * car passed through every solid object in the level without so much as a
 * change in pitch. Reported as the car having no real interaction with the
 * world and being unable to be stopped by anything, which was exactly right.
 *
 * WHAT GETS A COLLIDER, and what deliberately does not:
 *
 *   Anything a real car would be stopped or hurt by — poles, trunks,
 *   buildings, yard rails, parked vehicles, culvert headwalls, big rock.
 *
 *   NOT the fence WIRE, only the posts. A wire fence does not stop a car; it
 *   wraps around it. Giving a fence line a continuous collider would build an
 *   invisible wall down both sides of the road, which is a far worse lie than
 *   driving through a wire — and it would turn every off-road excursion into
 *   an instant stop instead of the slide through the paddock it should be.
 *
 *   NOT small rock, tussock, sheep or marker posts. A frangible plastic
 *   marker post is designed to be flattened; scree is driven over. A collider
 *   on every stone would make the roadside a minefield and cost thousands of
 *   proxies to do it.
 *
 *   NOT the sheep, because they move and the collision world is static. A
 *   sheep-shaped hole that is not where the sheep is would be worse than no
 *   sheep collider at all.
 *
 * HEIGHTS MATTER. Every collider carries the vertical span of the real object,
 * because the world is a heightfield with hills in it: a pole registered as
 * infinitely tall would block a car driving over the rise it stands behind.
 */
import * as THREE from 'three';

/**
 * Register the lake's solid furniture.
 *
 * Called once, after the modules that own the geometry have built it, so the
 * proxies are derived from where things actually ended up rather than from the
 * rules that placed them — those two have disagreed before.
 */
export function registerLakeColliders(collision, level, terrain) {
  if (!collision) return { total: 0 };
  const counts = { poles: 0, posts: 0, trees: 0, buildings: 0, vehicles: 0,
                   headwalls: 0, boulders: 0 };
  const M = new THREE.Matrix4();
  const V = new THREE.Vector3();
  const S = new THREE.Vector3();
  const Q = new THREE.Quaternion();
  const ground = (x, z) => terrain.height(x, z);

  /* ── power poles ──────────────────────────────────────────────────────── */
  level.roadside?.root.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh) return;
    if (!/power/.test(o.name || '')) return;
    /* The run is one merged mesh, so the poles have to be recovered from the
     * geometry. Their trunks are the only vertical clusters in it. */
    const pos = o.geometry.getAttribute('position');
    const seen = new Map();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const key = `${Math.round(x / 2)},${Math.round(z / 2)}`;
      const e = seen.get(key);
      if (!e) seen.set(key, { x, z, lo: y, hi: y, n: 1 });
      else { e.lo = Math.min(e.lo, y); e.hi = Math.max(e.hi, y); e.n++; e.x = (e.x * (e.n - 1) + x) / e.n; e.z = (e.z * (e.n - 1) + z) / e.n; }
    }
    for (const e of seen.values()) {
      if (e.hi - e.lo < 3.0) continue;       // wires and crossarms, not a pole
      collision.addCircle({ x: e.x, z: e.z, radius: 0.30,
        minY: e.lo - 0.5, maxY: e.lo + 8.0, kind: 'pole' });
      counts.poles++;
    }
  });

  /* ── trees ────────────────────────────────────────────────────────────── */
  level.shelter?.root.traverse((o) => {
    if (!o.isInstancedMesh) return;
    const kind = /poplar/.test(o.name) ? 0.28 : /pine/.test(o.name) ? 0.34 : 0.40;
    for (let i = 0; i < o.count; i++) {
      o.getMatrixAt(i, M); M.decompose(V, Q, S);
      collision.addCircle({ x: V.x, z: V.z, radius: kind * S.x,
        minY: V.y - 1.0, maxY: V.y + 12 * S.y, kind: 'tree' });
      counts.trees++;
    }
  });

  /* ── strainer posts only, and only the substantial ones ───────────────── */
  level.fences?.root.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh) return;
    /* Posts are 1.15 m of 0.06 m timber every 4.6 m. Registering all 1,397 of
     * them would be 1,397 proxies for objects a car snaps off without
     * noticing. Every sixth one stands in for the strainers — enough that a
     * fence line is felt as a rough edge rather than a wall. */
    const pos = o.geometry.getAttribute('position');
    const seen = new Map();
    for (let i = 0; i < pos.count; i += 3) {
      const x = pos.getX(i), z = pos.getZ(i);
      const key = `${Math.round(x / 3)},${Math.round(z / 3)}`;
      if (!seen.has(key)) seen.set(key, { x, z });
    }
    let n = 0;
    for (const e of seen.values()) {
      if ((n++ % 6) !== 0) continue;
      const y = ground(e.x, e.z);
      collision.addCircle({ x: e.x, z: e.z, radius: 0.16,
        minY: y - 0.4, maxY: y + 1.3, kind: 'post' });
      counts.posts++;
    }
  });

  /* ── buildings, yards, headwalls, ramps, waysides ─────────────────────── */
  const solidMesh = (o, kind, pad) => {
    if (!o.isMesh || o.isInstancedMesh || !o.geometry) return;
    o.updateMatrixWorld(true);
    const pos = o.geometry.getAttribute('position');
    /* Clustered into a coarse grid and boxed, because these are single merged
     * buffers holding many separate objects. A bounding box round the whole
     * buffer would fence off half the valley. */
    const CELL = 6;
    const cells = new Map();
    for (let i = 0; i < pos.count; i++) {
      V.set(pos.getX(i), pos.getY(i), pos.getZ(i)).applyMatrix4(o.matrixWorld);
      const key = `${Math.floor(V.x / CELL)},${Math.floor(V.z / CELL)}`;
      const e = cells.get(key);
      if (!e) cells.set(key, { x0: V.x, x1: V.x, z0: V.z, z1: V.z, y0: V.y, y1: V.y });
      else {
        e.x0 = Math.min(e.x0, V.x); e.x1 = Math.max(e.x1, V.x);
        e.z0 = Math.min(e.z0, V.z); e.z1 = Math.max(e.z1, V.z);
        e.y0 = Math.min(e.y0, V.y); e.y1 = Math.max(e.y1, V.y);
      }
    }
    for (const e of cells.values()) {
      const hx = (e.x1 - e.x0) / 2, hz = (e.z1 - e.z0) / 2;
      if (e.y1 - e.y0 < 0.55) continue;      // aprons, gravel, rails lying flat
      if (hx < 0.12 && hz < 0.12) continue;
      collision.addBox({
        x: (e.x0 + e.x1) / 2, z: (e.z0 + e.z1) / 2,
        halfX: hx + pad, halfZ: hz + pad,
        minY: e.y0 - 0.3, maxY: e.y1, kind,
      });
      counts[kind] = (counts[kind] || 0) + 1;
    }
  };
  level.farm?.root.traverse((o) => { if (/shed/.test(o.name || '')) solidMesh(o, 'buildings', 0.05); });
  level.structures?.root.traverse((o) => solidMesh(o, 'headwalls', 0.05));
  level.wayside?.root.traverse((o) => solidMesh(o, 'vehicles', 0.05));

  /* ── the biggest boulders only ────────────────────────────────────────── */
  level.rock?.root.traverse((o) => {
    if (!o.isInstancedMesh || !/outcrop/.test(o.name || '')) return;
    for (let i = 0; i < o.count; i++) {
      o.getMatrixAt(i, M); M.decompose(V, Q, S);
      /* Under about a metre and a half a car drives over it, or should. */
      if (S.x < 1.6) continue;
      collision.addCircle({ x: V.x, z: V.z, radius: S.x * 0.55,
        minY: V.y - 1.5, maxY: V.y + S.y * 1.2, kind: 'boulder' });
      counts.boulders++;
    }
  });

  counts.total = Object.values(counts).reduce((a, b) => a + b, 0);
  return counts;
}

/* Baled feed in the paddocks.
 *
 * Chosen by measurement rather than by taste. Toggling every man-made layer at
 * twenty stations along the stage gives the share of each frame that is built:
 * it runs from 22% at the busiest corner down to 3.9% at t = 0.675 and 3.9%
 * again on the run to the finish. Those thin stretches are open paddock, and
 * the road spends a long time in them.
 *
 * What is actually in a Mackenzie paddock in late summer is baled feed. It is
 * also close to ideal for the job the measurement set:
 *
 *   IT IS PALE ON GREEN. Wrapped silage is near-white and straw is bleached
 *   gold; either reads from several hundred metres against pasture, which is
 *   the distance these are seen from at 130 km/h.
 *
 *   IT IS CYLINDRICAL AND HUGE. A 1.2 m round bale is a simple, unmistakable
 *   solid among a landscape of soft forms, and there is nothing else this
 *   shape anywhere in the level.
 *
 *   IT COMES IN LINES AND STACKS. Bales are dropped where the baler ran, so
 *   they lie in ROWS along the contour, and then they are collected into
 *   stacks near the gate. Both patterns are strongly man-made and neither
 *   looks like a scatter — which is what every natural layer here already is.
 */
import * as THREE from 'three';
import { BOUNDS, VALLEY, shoreX, LAKE_Y, ROAD_SHOULDER } from './basin.js';
import { clearsDisc } from '../../world/clearance.js';

function random(seed) {
  let s = seed >>> 0 || 1;
  s ^= s >>> 16; s = Math.imul(s, 0x7feb352d) >>> 0;
  s ^= s >>> 15; s = s >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

/* A round bale lying on its side: a drum with flat ends, seen end-on as often
 * as side-on. The end face gets a spiral of tone because that is where the
 * layers of the wrap show, and it is the only detail that survives distance. */
function baleGeometry(rng, wrapped) {
  const pos = [], col = [], idx = [];
  const SIDES = 12;
  const R = 0.62, HALF = 0.60;
  /* Silage wrap is a dirty white; straw is bleached gold. Neither is bright:
   * a bale that has been in a paddock since February is filthy. */
  const skin = wrapped
    ? [0.470 + rng() * 0.075, 0.470 + rng() * 0.070, 0.440 + rng() * 0.065]
    : [0.400 + rng() * 0.090, 0.330 + rng() * 0.075, 0.150 + rng() * 0.050];

  const ring = (x, r, shadeK) => {
    const base = pos.length / 3;
    for (let s = 0; s < SIDES; s++) {
      const a = (s / SIDES) * Math.PI * 2;
      const up = Math.sin(a);
      pos.push(x, Math.sin(a) * r, Math.cos(a) * r);
      const k = (0.74 + 0.40 * (up * 0.5 + 0.5)) * shadeK;
      col.push(skin[0] * k, skin[1] * k, skin[2] * k);
    }
    return base;
  };
  const a0 = ring(-HALF, R, 0.96);
  const a1 = ring(HALF, R, 1.0);
  for (let s = 0; s < SIDES; s++) {
    const n = (s + 1) % SIDES;
    idx.push(a0 + s, a1 + s, a0 + n, a0 + n, a1 + s, a1 + n);
  }
  /* Flat ends, each a fan with a slightly darker hub — the wrap's centre. */
  for (const [rb, x, sgn] of [[a0, -HALF, -1], [a1, HALF, 1]]) {
    const c = pos.length / 3;
    pos.push(x, 0, 0);
    col.push(skin[0] * 0.72, skin[1] * 0.72, skin[2] * 0.70);
    for (let s = 0; s < SIDES; s++) {
      const n = (s + 1) % SIDES;
      if (sgn > 0) idx.push(c, rb + s, rb + n);
      else idx.push(c, rb + n, rb + s);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export class LakeHarvest {
  constructor(terrain, tier = 'high') {
    this.terrain = terrain;
    this.root = new THREE.Group();
    this.root.name = 'lake-harvest';
    this.materials = [];
    this.geometries = [];

    const rng = random(0x8a1e5);
    const trail = terrain.trail;
    const dummy = new THREE.Object3D();

    const mat = new THREE.MeshStandardMaterial({
      name: 'harvest', color: 0xffffff, vertexColors: true,
      roughness: 0.93, metalness: 0.0,
      /* Pale and rounded is exactly the combination that sparkles at the
       * default environment intensity — the sward lesson, applied in advance. */
      envMapIntensity: 0.28,
    });
    this.materials.push(mat);

    const variants = [true, false].map((w) => baleGeometry(random(w ? 0x11 : 0x22), w));
    this.geometries.push(...variants);
    const lists = variants.map(() => []);

    const slope = (x, z) => {
      const e = 2.0;
      const dx = (terrain.height(x + e, z) - terrain.height(x - e, z)) / (2 * e);
      const dz = (terrain.height(x, z + e) - terrain.height(x, z - e)) / (2 * e);
      return Math.hypot(dx, dz);
    };
    const ok = (x, z) => {
      if (x < BOUNDS.x0 + 12 || x > BOUNDS.x1 - 12) return null;
      const y = terrain.height(x, z);
      if (y < LAKE_Y + 1.5) return null;
      /* Baling ground is flat ground. Nobody bales a hillside, and a bale on
       * one would roll. */
      if (slope(x, z) > 0.16) return null;
      if (!clearsDisc(trail, x, z, 1.0, ROAD_SHOULDER + 4)) return null;
      return y;
    };

    const DENS = tier === 'low' ? 0.4 : tier === 'medium' ? 0.7 : 1.0;
    let rows = 0, stacks = 0;

    /* ── rows, where the baler ran ─────────────────────────────────────── */
    /* MEASURED, then corrected. The first cut placed 8 rows between 28 and
     * 138 m inland and produced 49 bales that registered 0.00% of frame at
     * eighteen of twenty stations. Two things were wrong and both were about
     * distance rather than count: at 130 km/h anything past about fifty metres
     * to the side is outside the forward view entirely, and eight rows over
     * two kilometres is one row every 250 m. Closer, and many more of them. */
    const nRows = Math.round(VALLEY / 55 * DENS);
    for (let i = 0; i < nRows; i++) {
      const z0 = BOUNDS.z0 - rng() * VALLEY;
      const x0 = shoreX(z0) + ROAD_SHOULDER + 12 + Math.pow(rng(), 1.4) * 46;
      if (ok(x0, z0) === null) continue;
      /* The line follows the contour, so it is perpendicular to the fall line
       * — which is also why a row of bales reads as a line drawn ON the hill
       * rather than one laid across it. */
      const e = 2.0;
      const dx = (terrain.height(x0 + e, z0) - terrain.height(x0 - e, z0)) / (2 * e);
      const dz = (terrain.height(x0, z0 + e) - terrain.height(x0, z0 - e)) / (2 * e);
      const g = Math.hypot(dx, dz) || 1;
      let ux = -dz / g, uz = dx / g;
      if (!isFinite(ux)) { ux = 1; uz = 0; }
      const n = 4 + ((rng() * 7) | 0);
      const gap = 7 + rng() * 9;
      let placed = 0;
      for (let k = 0; k < n; k++) {
        const x = x0 + ux * (k - n / 2) * gap + (rng() - 0.5) * 1.4;
        const z = z0 + uz * (k - n / 2) * gap + (rng() - 0.5) * 1.4;
        const y = ok(x, z);
        if (y === null) continue;
        lists[rng() < 0.55 ? 0 : 1].push({
          x, y: y + 0.58, z,
          /* Lying on its side, axis along the row. */
          yaw: Math.atan2(uz, ux) + (rng() - 0.5) * 0.35,
          s: 0.92 + rng() * 0.18,
        });
        placed++;
      }
      if (placed) rows++;
    }

    /* ── stacks, near the gate ─────────────────────────────────────────── */
    const nStacks = Math.max(3, Math.round(VALLEY / 260 * DENS));
    for (let i = 0; i < nStacks; i++) {
      const z0 = BOUNDS.z0 - ((i + 0.5) / nStacks) * VALLEY + (rng() - 0.5) * 200;
      const x0 = shoreX(z0) + ROAD_SHOULDER + 11 + rng() * 22;
      if (ok(x0, z0) === null) continue;
      const yaw = rng() * 6.283;
      const ax = Math.cos(yaw), az = Math.sin(yaw);
      /* Pyramid: three, then two, then one. Bales stack that way because a
       * round bale will not sit on top of a single other one. */
      const LAYERS = [3, 2, 1];
      let placed = 0;
      LAYERS.forEach((cnt, layer) => {
        for (let k = 0; k < cnt; k++) {
          const off = (k - (cnt - 1) / 2) * 1.30;
          const x = x0 + ax * off, z = z0 + az * off;
          const y = terrain.height(x, z);
          lists[0].push({
            x, y: y + 0.58 + layer * 1.06, z,
            yaw: yaw + Math.PI / 2 + (rng() - 0.5) * 0.12,
            s: 0.95 + rng() * 0.10,
          });
          placed++;
        }
      });
      if (placed) stacks++;
    }

    variants.forEach((geo, v) => {
      const list = lists[v];
      if (!list.length) return;
      const mesh = new THREE.InstancedMesh(geo, mat, list.length);
      mesh.name = `harvest:bales:${v}`;
      list.forEach((q, i) => {
        dummy.position.set(q.x, q.y, q.z);
        dummy.rotation.set(0, q.yaw, 0);
        dummy.scale.setScalar(q.s);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.computeBoundingSphere();
      this.root.add(mesh);
    });

    this.counts = { rows, stacks, bales: lists.reduce((a, l) => a + l.length, 0) };
  }

  update() {}
  setTier() {}
  cullAround() {}
  stats() { return this.counts; }
  dispose() {
    this.geometries.forEach((g) => g.dispose());
    this.materials.forEach((m) => m.dispose());
  }
}

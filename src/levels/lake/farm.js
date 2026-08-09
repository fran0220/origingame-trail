/* Sheep, and the buildings they are worked from.
 *
 * There are more sheep than people in this country by a factor of five, and a
 * fenced paddock with nothing in it reads as abandoned. They are also the one
 * thing in the basin that *moves at its own pace* — everything else here is
 * either fixed or a bird — and a flock drifting across a hillside at walking
 * speed is what makes a landscape look inhabited rather than modelled.
 *
 * Flocks, never a uniform scatter. Sheep are gregarious to the point of
 * absurdity: they graze in a loose mob a few tens of metres across, with the
 * density highest in the middle, and the whole mob moves together. Scattering
 * them evenly over a paddock is the single most obvious way to get this wrong.
 *
 * The buildings are deliberately few and deliberately plain: a woolshed and a
 * couple of implement sheds, long low gables in corrugated iron gone chalky
 * red or bare galvanised silver. One of them at a distance does more than a
 * village would, because it gives the eye something man-made to measure the
 * hills against.
 */
import * as THREE from 'three';
import { BOUNDS, VALLEY, shoreX, LAKE_Y, ROAD_SHOULDER } from './basin.js';

function random(seed) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

/* A sheep: a woolly barrel on four sticks with a dark face. About 90
 * triangles, because there are two thousand of them and each one is four
 * pixels tall at the distance it is usually seen. */
function sheepGeometry(variant, rng) {
  const pos = [], col = [], idx = [];
  const push = (x, y, z, c) => { const n = pos.length / 3; pos.push(x, y, z); col.push(...c); return n; };
  const blob = (cx, cy, cz, rx, ry, rz, c, det) => {
    const g = new THREE.IcosahedronGeometry(1, det);
    const p = g.getAttribute('position');
    const base = pos.length / 3;
    for (let i = 0; i < p.count; i++) {
      const w = 0.86 + rng() * 0.26;
      push(cx + p.getX(i) * rx * w, cy + p.getY(i) * ry * w, cz + p.getZ(i) * rz * w,
           c.map((v) => v * (0.80 + 0.34 * (p.getY(i) * 0.5 + 0.5))));
    }
    for (let i = 0; i < p.count; i++) idx.push(base + i);
    g.dispose();
  };
  /* Fleece is not white. A working sheep is the colour of the dust it lives
   * in — a dirty cream that goes grey underneath. */
  const wool = [0.360 + rng() * 0.120, 0.335 + rng() * 0.110, 0.290 + rng() * 0.095];
  const face = [0.085, 0.075, 0.068];
  blob(0, 0.42, 0, 0.30, 0.26, 0.46, wool, variant ? 1 : 0);
  blob(0, 0.52, 0.42, 0.15, 0.14, 0.15, wool, 0);
  blob(0, 0.50, 0.55, 0.085, 0.085, 0.10, face, 0);
  for (const [lx, lz] of [[-0.16, 0.26], [0.16, 0.26], [-0.16, -0.24], [0.16, -0.24]]) {
    const b = pos.length / 3;
    for (let s = 0; s < 3; s++) {
      const a = (s / 3) * Math.PI * 2;
      push(lx + Math.cos(a) * 0.035, 0.0, lz + Math.sin(a) * 0.035, face);
      push(lx + Math.cos(a) * 0.030, 0.30, lz + Math.sin(a) * 0.030, face);
    }
    for (let s = 0; s < 3; s++) {
      const n = (s + 1) % 3;
      idx.push(b + s * 2, b + s * 2 + 1, b + n * 2);
      idx.push(b + n * 2, b + s * 2 + 1, b + n * 2 + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/* A long low gable in corrugated iron. Corrugation is faked with alternating
 * vertex shade down the roof rather than modelled, because at any distance
 * this is seen from, what reads is the stripe and not the section. */
function shedGeometry(len, wide, wall, ridge, iron, rng) {
  const pos = [], col = [], idx = [];
  const push = (x, y, z, c) => { const n = pos.length / 3; pos.push(x, y, z); col.push(...c); return n; };
  const quad = (a, b, c, d) => idx.push(a, b, c, a, c, d);
  const hw = wide / 2, hl = len / 2;
  const timber = [0.115, 0.098, 0.078];
  /* Walls. */
  const w = [
    [[-hw, 0, -hl], [hw, 0, -hl], [hw, wall, -hl], [-hw, wall, -hl]],
    [[hw, 0, hl], [-hw, 0, hl], [-hw, wall, hl], [hw, wall, hl]],
    [[-hw, 0, hl], [-hw, 0, -hl], [-hw, wall, -hl], [-hw, wall, hl]],
    [[hw, 0, -hl], [hw, 0, hl], [hw, wall, hl], [hw, wall, -hl]],
  ];
  for (const f of w) {
    const shade = 0.80 + rng() * 0.30;
    const v = f.map((q) => push(q[0], q[1], q[2], iron.map((c) => c * shade)));
    quad(v[0], v[1], v[2], v[3]);
  }
  /* Gable ends and a corrugated roof in strips. */
  for (const s of [-1, 1]) {
    const v = [push(-hw, wall, s * hl, timber), push(hw, wall, s * hl, timber),
               push(0, ridge, s * hl, timber)];
    idx.push(v[0], v[1], v[2]);
  }
  const STRIPS = 14;
  for (let i = 0; i < STRIPS; i++) {
    const t0 = i / STRIPS, t1 = (i + 1) / STRIPS;
    const shade = i % 2 ? 1.14 : 0.80;
    const c = iron.map((v) => v * shade);
    for (const s of [-1, 1]) {
      const x0 = s * hw * (1 - t0), y0 = wall + (ridge - wall) * t0;
      const x1 = s * hw * (1 - t1), y1 = wall + (ridge - wall) * t1;
      const a = push(x0, y0, -hl, c), b = push(x1, y1, -hl, c);
      const cc = push(x1, y1, hl, c), d = push(x0, y0, hl, c);
      quad(a, b, cc, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export class LakeFarm {
  constructor(terrain, tier = 'high') {
    this.terrain = terrain;
    this.root = new THREE.Group();
    this.root.name = 'lake-farm';
    this.materials = [];
    this.meshes = [];
    this.geometries = [];
    this.flocks = [];

    const rng = random(0x5eeb1);
    const trail = terrain.trail;
    const dummy = new THREE.Object3D();

    const mat = new THREE.MeshStandardMaterial({
      color: 0xffffff, vertexColors: true, roughness: 0.94, metalness: 0.0,
    });
    this.materials.push(mat);

    const ok = (x, z, minRoad) => {
      if (x < BOUNDS.x0 + 15 || x > BOUNDS.x1 - 15) return null;
      if (z > BOUNDS.z0 - 15 || z < BOUNDS.z1 + 15) return null;
      const y = terrain.height(x, z);
      if (y < LAKE_Y + 1.4) return null;
      if (trail.nearest(x, z, {}).dist < minRoad) return null;
      /* Not on a slope a sheep would not stand on, and not on shingle. */
      const e = 1.2;
      const dx = (terrain.height(x + e, z) - terrain.height(x - e, z)) / (2 * e);
      const dz = (terrain.height(x, z + e) - terrain.height(x, z - e)) / (2 * e);
      if (Math.hypot(dx, dz) > 0.55) return null;
      return y;
    };

    /* ── flocks ─────────────────────────────────────────────────────────── */
    const variants = [0, 1].map((v) => sheepGeometry(v, random(0x9a11 + v)));
    this.geometries.push(...variants);
    const nFlocks = Math.round(VALLEY / 135) * (tier === 'low' ? 1 : 2);
    const lists = [[], []];
    for (let f = 0; f < nFlocks; f++) {
      const z0 = BOUNDS.z0 - rng() * VALLEY;
      const x0 = shoreX(z0) + ROAD_SHOULDER + 14 + Math.pow(rng(), 0.75) * 120;
      if (ok(x0, z0, ROAD_SHOULDER + 8) === null) continue;
      const spread = 9 + rng() * 22;
      const n = 14 + ((rng() * 34) | 0);
      /* The mob has a heading: they all face roughly the same way, because
       * they are all walking away from whatever last worried them. */
      const mobYaw = rng() * 6.283;
      for (let i = 0; i < n; i++) {
        const r = Math.pow(rng(), 0.55) * spread;
        const a = rng() * 6.283;
        const x = x0 + Math.cos(a) * r, z = z0 + Math.sin(a) * r;
        const y = ok(x, z, ROAD_SHOULDER + 6);
        if (y === null) continue;
        lists[(rng() * 2) | 0].push({
          x, y, z, s: 0.88 + rng() * 0.26,
          yaw: mobYaw + (rng() - 0.5) * 1.5,
        });
      }
      this.flocks.push({ x: x0, z: z0, n });
    }
    variants.forEach((geo, v) => {
      const list = lists[v];
      if (!list.length) return;
      const mesh = new THREE.InstancedMesh(geo, mat, list.length);
      mesh.name = `farm:sheep:${v}`;
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
      this.meshes.push(mesh);
    });
    this.sheep = lists[0].length + lists[1].length;

    /* ── sheds ──────────────────────────────────────────────────────────── */
    const IRONS = [[0.230, 0.108, 0.078], [0.300, 0.295, 0.285], [0.145, 0.150, 0.140]];
    let sheds = 0;
    const nSheds = Math.max(2, Math.round(VALLEY / 620));
    for (let s = 0; s < nSheds; s++) {
      const z0 = BOUNDS.z0 - ((s + 0.5) / nSheds) * VALLEY + (rng() - 0.5) * 160;
      const x0 = shoreX(z0) + ROAD_SHOULDER + 34 + rng() * 90;
      const y = ok(x0, z0, ROAD_SHOULDER + 26);
      if (y === null) continue;
      const len = 11 + rng() * 16, wide = 6.5 + rng() * 4;
      const wall = 2.5 + rng() * 1.2;
      const geo = shedGeometry(len, wide, wall, wall + 1.5 + rng() * 1.0,
                               IRONS[(rng() * IRONS.length) | 0], rng);
      this.geometries.push(geo);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.name = `farm:shed:${s}`;
      mesh.position.set(x0, y - 0.1, z0);
      mesh.rotation.y = rng() * 6.283;
      mesh.castShadow = true; mesh.receiveShadow = true;
      this.root.add(mesh);
      this.meshes.push(mesh);
      sheds++;
    }
    this.sheds = sheds;
  }

  update() {}
  setTier() {}
  cullAround(x, z) {
    this.meshes.forEach((m) => {
      const s = m.boundingSphere || m.geometry.boundingSphere;
      if (!s) return;
      const c = m.isInstancedMesh ? s.center : m.position;
      m.visible = Math.hypot(c.x - x, c.z - z) < 800 + s.radius;
    });
  }
  stats() { return { sheep: this.sheep, flocks: this.flocks.length, sheds: this.sheds }; }
  dispose() {
    this.geometries.forEach((g) => g.dispose());
    this.materials.forEach((m) => m.dispose());
  }
}

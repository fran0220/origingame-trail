/* Fungi on the forest floor.
 *
 * The deadwood commit put bracket fungi on standing and fallen wood, which is
 * where the big obvious ones are. It left the floor itself bare, and the floor
 * is what a walking player looks at: the camera is 1.7 m up and the trail runs
 * downhill more often than not, so the litter layer occupies the bottom third
 * of most frames in this level.
 *
 * WHY FUNGI RATHER THAN MORE PLANTS. The understorey here is already dense and
 * adding another green thing to it changes nothing — it would be absorbed. A
 * mushroom is worth far more than its size for three reasons:
 *
 *   IT IS NOT GREEN. In a frame that is ninety percent olive, a few dozen
 *   points of bone white, ochre and orange are the only chroma at ground
 *   level, and the eye goes to them.
 *
 *   IT IS ROUND. Everything else down there is a blade, a frond or a fallen
 *   leaf — flat things at angles. A cap is a smooth convex form and reads
 *   instantly as a different KIND of object rather than more of the same.
 *
 *   IT CLUSTERS. Fungi fruit in troops from one mycelium, so they come in
 *   tight groups of five to twenty of graded size, which is a very different
 *   spatial signature from the even scatter everything else uses. That
 *   difference is most of what makes them read as alive rather than placed.
 */
import * as THREE from 'three';
import { clearsPoint } from '../../world/clearance.js';

function random(seed) {
  let s = seed >>> 0 || 1;
  s ^= s >>> 16; s = Math.imul(s, 0x7feb352d) >>> 0;
  s ^= s >>> 15; s = s >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

/* Three species, because one shape repeated is a decal.
 *   0  a classic cap on a stem, bone white
 *   1  a flat ochre plate, wide and low
 *   2  a small orange cone in dense troops
 */
function capGeometry(kind, rng) {
  const pos = [], col = [], idx = [];
  const push = (x, y, z, c) => { const n = pos.length / 3; pos.push(x, y, z); col.push(...c); return n; };

  const SIDES = kind === 2 ? 6 : 9;
  const capR = kind === 0 ? 0.030 + rng() * 0.022
             : kind === 1 ? 0.048 + rng() * 0.034
             : 0.012 + rng() * 0.010;
  const stemH = kind === 0 ? 0.048 + rng() * 0.040
              : kind === 1 ? 0.014 + rng() * 0.012
              : 0.026 + rng() * 0.020;
  const capH = kind === 0 ? capR * 0.72 : kind === 1 ? capR * 0.24 : capR * 1.9;

  const top = kind === 0 ? [0.470, 0.442, 0.392]
            : kind === 1 ? [0.360, 0.256, 0.108]
            : [0.520, 0.246, 0.062];
  /* Gills are always paler than the cap and always in shadow, which is the
   * combination that makes the underside read at all. */
  const gill = kind === 1 ? [0.230, 0.196, 0.130] : [0.400, 0.372, 0.318];
  const stem = [0.330, 0.312, 0.272];

  /* Stem: a short taper. */
  const sr = capR * (kind === 1 ? 0.22 : 0.17);
  const base = pos.length / 3;
  for (let ring = 0; ring < 2; ring++) {
    for (let s = 0; s < SIDES; s++) {
      const a = (s / SIDES) * Math.PI * 2;
      const r = sr * (ring ? 0.86 : 1.0);
      push(Math.cos(a) * r, ring * stemH, Math.sin(a) * r,
           stem.map((v) => v * (0.7 + 0.5 * ring)));
    }
  }
  for (let s = 0; s < SIDES; s++) {
    const n = (s + 1) % SIDES;
    idx.push(base + s, base + SIDES + s, base + n);
    idx.push(base + n, base + SIDES + s, base + SIDES + n);
  }

  /* Cap: a rim ring, an apex, and an underside centre. */
  const rim = pos.length / 3;
  for (let s = 0; s < SIDES; s++) {
    const a = (s / SIDES) * Math.PI * 2;
    push(Math.cos(a) * capR, stemH, Math.sin(a) * capR, top.map((v) => v * 0.86));
  }
  const apex = push(0, stemH + capH, 0, top);
  const under = push(0, stemH - capH * 0.22, 0, gill);
  for (let s = 0; s < SIDES; s++) {
    const n = (s + 1) % SIDES;
    idx.push(rim + s, apex, rim + n);
    idx.push(rim + n, under, rim + s);
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export class JungleFungi {
  constructor(terrain, trail, tier = 'high') {
    this.terrain = terrain;
    this.root = new THREE.Group();
    this.root.name = 'jungle-fungi';
    this.materials = [];
    this.geometries = [];

    const rng = random(0x3f1a97);
    const dummy = new THREE.Object3D();
    const L = trail.length;
    const P = new THREE.Vector3();

    const mat = new THREE.MeshStandardMaterial({
      name: 'fungi', color: 0xffffff, vertexColors: true,
      roughness: 0.88, metalness: 0.0, side: THREE.DoubleSide,
      /* Same lesson as the sward: a bright small object left at the default
       * environment intensity picks up the sky and sparkles. */
      envMapIntensity: 0.30,
    });
    this.materials.push(mat);

    const DENS = tier === 'low' ? 0.4 : tier === 'medium' ? 0.7 : 1.0;
    const variants = [0, 1, 2].map((k) => capGeometry(k, random(0x77 + k * 31)));
    this.geometries.push(...variants);
    const lists = variants.map(() => []);
    let troops = 0;

    const nTroops = Math.round(L * 0.55 * DENS);
    for (let i = 0; i < nTroops; i++) {
      /* Troops sit close to the trail, because that is the only part of this
       * floor anyone gets near enough to resolve a 4 cm cap on. */
      trail.pointAt(rng(), P);
      const a = rng() * Math.PI * 2;
      const r = 1.4 + Math.pow(rng(), 0.7) * 5.5;
      const cx = P.x + Math.cos(a) * r, cz = P.z + Math.sin(a) * r;
      if (!clearsPoint(trail, cx, cz, 1.15)) continue;

      const kind = rng() < 0.42 ? 0 : rng() < 0.6 ? 1 : 2;
      const n = kind === 2 ? 7 + ((rng() * 14) | 0) : 3 + ((rng() * 7) | 0);
      const spread = kind === 2 ? 0.22 + rng() * 0.30 : 0.30 + rng() * 0.55;
      for (let k = 0; k < n; k++) {
        /* Graded size within a troop: they did not all fruit on the same day,
         * and a cluster of identical caps is the giveaway. */
        const age = Math.pow(rng(), 0.6);
        const x = cx + (rng() - 0.5) * 2 * spread;
        const z = cz + (rng() - 0.5) * 2 * spread;
        const y = terrain.height(x, z);
        lists[kind].push({
          x, y: y - 0.004, z,
          s: 0.55 + age * 0.85,
          /* Caps lean. A vertical stem is a nail. */
          rx: (rng() - 0.5) * 0.42, ry: rng() * 6.283, rz: (rng() - 0.5) * 0.42,
        });
      }
      troops++;
    }

    variants.forEach((geo, k) => {
      const list = lists[k];
      if (!list.length) return;
      const mesh = new THREE.InstancedMesh(geo, mat, list.length);
      mesh.name = `fungi:${k}`;
      list.forEach((q, i) => {
        dummy.position.set(q.x, q.y, q.z);
        dummy.rotation.set(q.rx, q.ry, q.rz);
        dummy.scale.setScalar(q.s);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      mesh.computeBoundingSphere();
      this.root.add(mesh);
    });

    this.counts = { troops, caps: lists.reduce((a, l) => a + l.length, 0) };
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

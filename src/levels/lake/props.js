/* Non-plant environmental assets for a Mackenzie glacial lake shore.
 *
 * Flora.js carries living species. This file carries the *stage dressing* a
 * real basin has between them: stranded timber, fan-channel cobble, erratics
 * the ice left behind, lichen-crusted slab, wind-raked thatch mats and the
 * rare standing snag. Without them the level is a ground texture + plant
 * stamps, and that is exactly the sparse reading the galleries keep rejecting.
 *
 * Everything is procedural, seeded, and laid out by habitat so a drift log
 * lands only where swash could leave it and a fan rill only on the fans.
 */
import * as THREE from 'three';
import { BOUNDS, shoreX } from './basin.js';

function random(seed) {
  return () => {
    seed = Math.imul(seed ^ seed >>> 15, 1 | seed);
    seed ^= seed + Math.imul(seed ^ seed >>> 7, 61 | seed);
    return ((seed ^ seed >>> 14) >>> 0) / 4294967296;
  };
}

const ramp = (v, a, b) => THREE.MathUtils.smoothstep(v, Math.min(a, b), Math.max(a, b));

function woodGeo(rng, long = 1.6, fat = 0.09, segs = 7, warp = 1) {
  const p = [], ix = [], col = [];
  const sides = 8;
  const push = (x, y, z, c) => {
    const i = p.length / 3;
    p.push(x, y, z);
    col.push(...c);
    return i;
  };
  const rings = [];
  for (let i = 0; i <= segs; i++) {
    const u = i / segs;
    /* warp=0 → true stranded log; warp=1 was producing beach zig-zags once
     * the column was rotated onto the ground plane. */
    const bend = Math.sin(u * Math.PI) * (0.01 + rng() * 0.025) * warp * (rng() < 0.5 ? 1 : -1);
    const r = fat * (0.78 + 0.22 * Math.sin(u * Math.PI)) * (0.9 + rng() * 0.18);
    const y = u * long;
    const cx = bend + (rng() - 0.5) * 0.008 * warp;
    const ring = [];
    for (let k = 0; k < sides; k++) {
      const a = (k / sides) * Math.PI * 2;
      /* Sun- and water-bleached timber stays mid-value in this bright basin.
       * The former near-black pentagonal poles read as manufactured boards. */
      const tone = 0.58 + 0.14 * rng() + 0.08 * Math.sin(u * 8 + k);
      ring.push(push(
        cx + Math.cos(a) * r,
        y,
        Math.sin(a) * r * (0.7 + 0.3 * Math.sin(u * 5 + k)),
        [tone * 0.90, tone * 0.80, tone * 0.62],
      ));
    }
    rings.push(ring);
  }
  for (let i = 0; i < segs; i++) {
    for (let k = 0; k < sides; k++) {
      const n = (k + 1) % sides;
      ix.push(rings[i][k], rings[i][n], rings[i + 1][k]);
      ix.push(rings[i][n], rings[i + 1][n], rings[i + 1][k]);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(ix);
  g.computeVertexNormals();
  return g;
}

function slabGeo(rng, rx = 0.55, rz = 0.38, h = 0.07) {
  const p = [], ix = [], col = [];
  const push = (x, y, z, c) => {
    const i = p.length / 3;
    p.push(x, y, z);
    col.push(...c);
    return i;
  };
  const top = [], bot = [];
  const n = 7;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2;
    const wr = 1 + 0.12 * Math.sin(k * 2.1 + rng() * 3) + 0.06 * Math.sin(k * 4.7);
    const x = Math.cos(a) * rx * wr;
    const z = Math.sin(a) * rz * wr;
    const lichen = 0.5 + 0.5 * Math.sin(x * 17 + z * 13);
    const c = [
      0.28 + 0.08 * lichen,
      0.30 + 0.10 * lichen,
      0.27 + 0.05 * lichen,
    ];
    top.push(push(x, h * (0.7 + 0.3 * Math.sin(k * 1.7)), z, c));
    bot.push(push(x * 0.92, 0, z * 0.92, c.map((v) => v * 0.55)));
  }
  const cTop = push(0, h * 1.05, 0, [0.34, 0.36, 0.32]);
  const cBot = push(0, 0, 0, [0.18, 0.18, 0.17]);
  for (let k = 0; k < n; k++) {
    const n1 = (k + 1) % n;
    ix.push(cTop, top[k], top[n1]);
    ix.push(cBot, bot[n1], bot[k]);
    ix.push(top[k], bot[k], top[n1]);
    ix.push(bot[k], bot[n1], top[n1]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(ix);
  g.computeVertexNormals();
  return g;
}

function thatchGeo(rng) {
  const p = [], ix = [], col = [];
  const push = (x, y, z, c) => {
    const i = p.length / 3;
    p.push(x, y, z);
    col.push(...c);
    return i;
  };
  /* Occasional wind-raked litter, not a second vegetation carpet. Continuous
   * cover now belongs to the scanned meadow; these few grounded fragments only
   * break a clean patch where last season's leaves collected. */
  const blades = 8 + (rng() * 7) | 0;
  for (let i = 0; i < blades; i++) {
    const a = rng() * Math.PI * 2;
    const len = 0.18 + rng() * 0.42;
    const lean = 0.55 + rng() * 0.9;
    const w = 0.01 + rng() * 0.018;
    const dead = rng() < 0.26;
    const c = dead
      ? [0.28 + rng() * 0.08, 0.23 + rng() * 0.06, 0.08 + rng() * 0.04]
      : [0.10 + rng() * 0.05, 0.27 + rng() * 0.08, 0.06 + rng() * 0.04];
    const x0 = (rng() - 0.5) * 0.55;
    const z0 = (rng() - 0.5) * 0.55;
    const x1 = x0 + Math.cos(a) * len;
    const z1 = z0 + Math.sin(a) * len;
    const y1 = lean * 0.08 + rng() * 0.04;
    const s0 = [-Math.sin(a) * w, 0, Math.cos(a) * w];
    const a0 = push(x0 + s0[0], 0.004, z0 + s0[2], c);
    const a1 = push(x0 - s0[0], 0.004, z0 - s0[2], c);
    const b0 = push(x1 + s0[0] * 0.4, y1, z1 + s0[2] * 0.4, c.map((v) => v * 1.08));
    const b1 = push(x1 - s0[0] * 0.4, y1, z1 - s0[2] * 0.4, c.map((v) => v * 1.08));
    ix.push(a0, a1, b0, a1, b1, b0);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(ix);
  g.computeVertexNormals();
  return g;
}

function snagGeo(rng) {
  const p = [], ix = [], col = [];
  const push = (x, y, z, c) => {
    const i = p.length / 3;
    p.push(x, y, z);
    col.push(...c);
    return i;
  };
  const h = 0.9 + rng() * 1.1;
  const trunk = [];
  const sides = 5;
  for (let j = 0; j <= 5; j++) {
    const u = j / 5;
    const r = 0.045 * (1 - u * 0.55);
    const ring = [];
    for (let k = 0; k < sides; k++) {
      const a = (k / sides) * Math.PI * 2 + u * 0.4;
      const c = [0.22 + rng() * 0.06, 0.18 + rng() * 0.04, 0.12 + rng() * 0.03];
      ring.push(push(Math.cos(a) * r, u * h, Math.sin(a) * r, c));
    }
    trunk.push(ring);
  }
  for (let j = 0; j < 5; j++) {
    for (let k = 0; k < sides; k++) {
      const n = (k + 1) % sides;
      ix.push(trunk[j][k], trunk[j][n], trunk[j + 1][k]);
      ix.push(trunk[j][n], trunk[j + 1][n], trunk[j + 1][k]);
    }
  }
  /* Branch stubs with real faces (orphan verts read as zig-zag lines). */
  for (let b = 0; b < 2; b++) {
    const a = b * 1.7 + rng();
    const y0 = h * (0.45 + b * 0.2);
    const len = 0.18 + rng() * 0.22;
    const rings = [];
    for (let j = 0; j < 3; j++) {
      const u = j / 2;
      const r = 0.012 * (1 - u * 0.7);
      const ring = [];
      for (let k = 0; k < 4; k++) {
        const ang = (k / 4) * Math.PI * 2;
        ring.push(push(
          Math.cos(a) * u * len + Math.cos(ang) * r,
          y0 + u * 0.04,
          Math.sin(a) * u * len + Math.sin(ang) * r,
          [0.2, 0.16, 0.1],
        ));
      }
      rings.push(ring);
    }
    for (let j = 0; j < 2; j++) {
      for (let k = 0; k < 4; k++) {
        const n = (k + 1) % 4;
        ix.push(rings[j][k], rings[j][n], rings[j + 1][k]);
        ix.push(rings[j][n], rings[j + 1][n], rings[j + 1][k]);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(ix);
  g.computeVertexNormals();
  return g;
}

function boulderGeo(rng) {
  const g = new THREE.IcosahedronGeometry(1, 1);
  const pos = g.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const n = 0.78 + 0.22 * Math.sin(x * 7.1 + z * 5.3 + rng() * 6);
    pos.setXYZ(i, x * n, y * (0.55 + 0.2 * Math.sin(x * 4 + z * 3)), z * n * (0.85 + 0.2 * Math.sin(y * 5)));
  }
  pos.needsUpdate = true;
  g.computeVertexNormals();
  return g;
}

function place(list, terrain, dummy, mesh) {
  list.forEach((p, i) => {
    dummy.position.set(p.x, p.y, p.z);
    dummy.rotation.set(p.rx || 0, p.yaw || 0, p.rz || 0);
    dummy.scale.set(p.sx || p.s || 1, p.sy || p.s || 1, p.sz || p.s || 1);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    if (p.color && mesh.setColorAt) mesh.setColorAt(i, p.color);
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.computeBoundingSphere();
}

/**
 * Basin-wide layout of prop families. Layout is habitat-driven so density and
 * kind change with landform, not with a single scatter seed.
 */
export class LakeProps {
  constructor(terrain, tier = 'high') {
    this.root = new THREE.Group();
    this.root.name = 'lake-environment-props';
    this.materials = [];
    this.meshes = [];
    this.geometries = [];
    const dummy = new THREE.Object3D();
    const rng = random(0xc0a57);
    const q = {};

    const matWood = new THREE.MeshStandardMaterial({
      color: 0xffffff, vertexColors: true, roughness: 0.94, metalness: 0,
      flatShading: true, envMapIntensity: 0.45,
    });
    const matRock = new THREE.MeshStandardMaterial({
      color: 0xffffff, vertexColors: false, roughness: 0.92, metalness: 0,
      flatShading: true, envMapIntensity: 0.55,
    });
    const matThatch = new THREE.MeshStandardMaterial({
      color: 0xffffff, vertexColors: true, roughness: 0.97, metalness: 0,
      side: THREE.DoubleSide, envMapIntensity: 0.3,
    });
    this.materials.push(matWood, matRock, matThatch);

    /* Shore driftwood moved to habitat.js: a photoscanned trunk now carries
     * bark breakup and a genuinely round silhouette. The old procedural
     * columns read as pale manufactured boards at the fixed wet-margin view. */

    /* ── lichen slabs on terrace and fan edges ───────────────────────────── */
    const slabs = [];
    for (let tries = 0; tries < 6000 && slabs.length < 90; tries++) {
      const z = THREE.MathUtils.lerp(BOUNDS.z0, BOUNDS.z1, rng());
      const d = 8 + Math.pow(rng(), 0.9) * 95;
      const x = shoreX(z) + d;
      if (x > BOUNDS.x1 - 3) continue;
      terrain.sampleField(x, z, q);
      if (q.dist < terrain.trail.widthAt(q.t) + 2.2) continue;
      const y = terrain.height(x, z);
      const e = 0.6;
      const dx = (terrain.height(x + e, z) - terrain.height(x - e, z)) / (2 * e);
      const dz = (terrain.height(x, z + e) - terrain.height(x, z - e)) / (2 * e);
      if (Math.hypot(dx, dz) > 0.38) continue;
      /* Prefer slightly gravelly ground: slabs sit where soil is thin. */
      const gr = terrain.gravelAt?.(x, z) ?? 0.3;
      if (rng() > 0.25 + gr * 0.55) continue;
      slabs.push({
        x, y: y - 0.01, z,
        yaw: rng() * 6.283,
        rx: Math.atan(dz) * 0.6,
        rz: -Math.atan(dx) * 0.6,
        sx: 0.55 + rng() * 1.35,
        sy: 0.55 + rng() * 0.7,
        sz: 0.55 + rng() * 1.2,
      });
    }
    const slabG = slabGeo(rng);
    this.geometries.push(slabG);
    const slabMesh = new THREE.InstancedMesh(slabG, matWood, slabs.length);
    slabMesh.name = 'props:lichen-slabs';
    slabMesh.castShadow = true;
    slabMesh.receiveShadow = true;
    place(slabs, terrain, dummy, slabMesh);
    this.root.add(slabMesh);
    this.meshes.push(slabMesh);

    /* The former "sparse litter" was hundreds of procedural crossed strips.
     * Against a continuous green scan they read as loose neon matchsticks,
     * not as dead grass. Damp moss and scanned sward in habitat.js now own the
     * organic floor; no second filler is layered over it here. */

    /* ── fan-channel cobble strings (dry rills) ──────────────────────────── */
    const rill = [];
    for (const [fz, fr] of [[-300, 110], [-486, 90]]) {
      for (let i = 0; i < 150; i++) {
        const t = rng();
        const along = (rng() - 0.5) * fr * 0.55;
        const d = 12 + t * 95;
        const z = fz + along * (0.4 + t * 0.4);
        const x = shoreX(z) + d + (rng() - 0.5) * 2.2;
        if (x > BOUNDS.x1 - 2) continue;
        terrain.sampleField(x, z, q);
        if (q.dist < terrain.trail.widthAt(q.t) + 1.2) continue;
        const y = terrain.height(x, z);
        rill.push({
          x, y: y + 0.01, z,
          yaw: rng() * 6.283,
          rx: (rng() - 0.5) * 0.9,
          rz: (rng() - 0.5) * 0.9,
          sx: 0.08 + rng() * 0.22,
          sy: 0.05 + rng() * 0.12,
          sz: 0.08 + rng() * 0.22,
          color: new THREE.Color().setRGB(
            0.15 + rng() * 0.10,
            0.16 + rng() * 0.09,
            0.16 + rng() * 0.09,
          ),
        });
      }
    }
    const cobG = boulderGeo(rng);
    this.geometries.push(cobG);
    const rillMesh = new THREE.InstancedMesh(cobG, matRock, rill.length);
    rillMesh.name = 'props:fan-rill-cobble';
    rillMesh.castShadow = true;
    rillMesh.receiveShadow = true;
    place(rill, terrain, dummy, rillMesh);
    this.root.add(rillMesh);
    this.meshes.push(rillMesh);

    /* ── erratics (ice-left boulders, larger than shore cobbles) ─────────── */
    const erratics = [];
    for (let tries = 0; tries < 6000 && erratics.length < 80; tries++) {
      const z = THREE.MathUtils.lerp(BOUNDS.z0, BOUNDS.z1, rng());
      /* Prefer till belt and fan lobes. */
      const onFan = Math.max(
        Math.exp(-(((z + 300) / 70) ** 2)),
        Math.exp(-(((z + 486) / 55) ** 2)),
      );
      const d = 14 + Math.pow(rng(), 0.85) * (onFan > 0.2 ? 110 : 70);
      const x = shoreX(z) + d;
      if (x > BOUNDS.x1 - 4) continue;
      terrain.sampleField(x, z, q);
      if (q.dist < terrain.trail.widthAt(q.t) + 2.5) continue;
      if (rng() > 0.18 + onFan * 0.55) continue;
      const y = terrain.height(x, z);
      const s = 0.22 + Math.pow(rng(), 1.6) * 0.95;
      erratics.push({
        x, y: y + s * 0.22, z,
        yaw: rng() * 6.283,
        rx: (rng() - 0.5) * 0.5,
        rz: (rng() - 0.5) * 0.5,
        sx: s * (0.9 + rng() * 0.5),
        sy: s * (0.35 + rng() * 0.35),
        sz: s * (0.85 + rng() * 0.45),
        color: new THREE.Color().setRGB(
          0.14 + rng() * 0.12,
          0.15 + rng() * 0.11,
          0.15 + rng() * 0.11,
        ),
      });
    }
    const errMesh = new THREE.InstancedMesh(cobG, matRock, erratics.length);
    errMesh.name = 'props:moraine-erratics';
    errMesh.castShadow = true;
    errMesh.receiveShadow = true;
    place(erratics, terrain, dummy, errMesh);
    this.root.add(errMesh);
    this.meshes.push(errMesh);

    /* ── rare standing snags (inland only; never the wet margin) ──────────── */
    const snags = [];
    for (let tries = 0; tries < 2400 && snags.length < 12; tries++) {
      const z = THREE.MathUtils.lerp(BOUNDS.z0 - 10, BOUNDS.z1 + 10, rng());
      const d = 32 + rng() * 90;
      const x = shoreX(z) + d;
      if (x > BOUNDS.x1 - 3) continue;
      terrain.sampleField(x, z, q);
      if (q.dist < terrain.trail.widthAt(q.t) + 3) continue;
      const y = terrain.height(x, z);
      if (y < 2.2) continue;
      snags.push({
        x, y: y - 0.02, z,
        yaw: rng() * 6.283,
        rx: (rng() - 0.5) * 0.15,
        rz: (rng() - 0.5) * 0.15,
        s: 0.42 + rng() * 0.34,
      });
    }
    const snagG = snagGeo(rng);
    this.geometries.push(snagG);
    const snagMesh = new THREE.InstancedMesh(snagG, matWood, snags.length);
    snagMesh.name = 'props:standing-snags';
    snagMesh.castShadow = true;
    snagMesh.receiveShadow = true;
    place(snags, terrain, dummy, snagMesh);
    this.root.add(snagMesh);
    this.meshes.push(snagMesh);

    /* Likewise, the old horizontal five-sided stems became straight coloured
     * lines at every landscape camera. Branched scanned driftwood now carries
     * this role on the actual strandline. */

    this.setTier(tier);
  }

  cullAround(x, z) {
    this.meshes.forEach((m) => {
      const c = m.boundingSphere?.center;
      m.visible = !c || Math.hypot(c.x - x, c.z - z) < 220 + (m.boundingSphere?.radius || 0);
    });
  }

  setTier(tier) {
    this.tier = tier;
    this.meshes.forEach((m) => {
      m.count = tier === 'low'
        ? Math.ceil(m.instanceMatrix.count * 0.45)
        : m.instanceMatrix.count;
    });
  }

  stats() {
    return {
      families: this.meshes.map((m) => m.name),
      instances: this.meshes.reduce((n, m) => n + m.count, 0),
      meshes: this.meshes.length,
    };
  }

  dispose() {
    this.geometries.forEach((g) => g.dispose());
    this.materials.forEach((m) => m.dispose());
  }
}

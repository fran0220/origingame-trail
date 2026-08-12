/* The dike on Red Crater, and the scoria mounds along the ridge.
 *
 * The crater itself is terrain and always was — the ridge drops 118 m on that
 * side, and an attempt to carve a second bowl inside it left no trace at all.
 * What the landform was missing is the thing standing ON it: a near-vertical
 * wall of dark rock crossing the crater, where the feeder crack filled with
 * lava that set harder than everything around it and then outlasted it as the
 * crater wall eroded back.
 *
 * It belongs here rather than in the heightfield for a simple reason: a
 * heightfield cannot make anything vertical. A dike is a wall two metres thick
 * and forty high; expressed as a height function it is a smear across however
 * many cells the grid spends on it, which is exactly what happened when it was
 * tried — one 35 m bump in a cross-section that showed nothing else.
 */
import * as THREE from 'three';
import { Noise2D, clamp, smoothstep } from '../../world/noise.js';
import { STAGES } from './route.js';

function random(seed) {
  let s = seed >>> 0 || 1;
  s ^= s >>> 16; s = Math.imul(s, 0x7feb352d) >>> 0;
  s ^= s >>> 15; s = s >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

const DARK = [0.118, 0.096, 0.086];
const RUST = [0.380, 0.132, 0.058];

export class Dike {
  constructor(terrain, trail, tier = 'high') {
    this.root = new THREE.Group();
    this.root.name = 'tongariro-dike';
    this.materials = [];
    const rng = random(0x3d19c7);
    const n = new Noise2D(0x8811);
    const pos = [], col = [], idx = [];
    let panels = 0, mounds = 0;

    const quadStrip = (pts, h, thick, c0, c1) => {
      /* One wall: a strip of quads along a polyline, given thickness so it has
       * two faces and an edge. A single plane would vanish edge-on, which for
       * a thing whose whole job is to be a vertical line is fatal. */
      const rows = [];
      for (const pt of pts) {
        const base = pos.length / 3;
        for (const s of [-1, 1]) {
          for (const up of [0, 1]) {
            pos.push(pt.x + pt.nx * thick * s, pt.y + up * pt.h, pt.z + pt.nz * thick * s);
            const k = up ? 1 : 0;
            col.push(c0[0] * (1 - k) + c1[0] * k,
                     c0[1] * (1 - k) + c1[1] * k,
                     c0[2] * (1 - k) + c1[2] * k);
          }
        }
        rows.push(base);
      }
      for (let i = 0; i < rows.length - 1; i++) {
        const a = rows[i], b = rows[i + 1];
        /* Two faces and a cap. */
        idx.push(a, a + 1, b, a + 1, b + 1, b);
        idx.push(b + 2, a + 3, a + 2, b + 2, b + 3, a + 3);
        idx.push(a + 1, a + 3, b + 1, a + 3, b + 3, b + 1);
      }
    };

    const P = new THREE.Vector3(), T = new THREE.Vector3();
    const mid = (STAGES.redRidge[0] + STAGES.redRidge[1]) * 0.5;
    trail.pointAt(mid, P); trail.tangentAt(mid, T);
    const nx = T.z, nz = -T.x;

    /* THE DIKE runs out across the crater from the rim, which is where the
     * feeder was. It stands tallest where the wall has eroded furthest back
     * and dies into the ground at both ends. */
    /* RUN 95, NOT 150, AND IT IS AN ARITHMETIC FIX RATHER THAN A TASTE ONE.
     * At 150 m the dike ran far down the crater wall, which falls 118 m over
     * 190: its midpoint sat on ground at about 178 m against a rim at 264, so
     * a 31 m wall topped out FIFTY-THREE METRES BELOW THE EYELINE. It was
     * built correctly and entirely beneath the place the player stands, and
     * the render showed bare slope. Kept near the rim it breaks the skyline,
     * which is the only reason to model it. */
    const SEG = 22, RUN = 95;
    const pts = [];
    for (let i = 0; i <= SEG; i++) {
      const u = i / SEG;
      const d = 10 + u * RUN;
      const wob = n.n(u * 3.1, 0.5) * 7;
      const x = P.x + nx * d + T.x * wob;
      const z = P.z + nz * d + T.z * wob;
      const g = terrain.height(x, z);
      /* Proud of the slope by up to 34 m in the middle, nothing at the ends. */
      const h = Math.sin(u * Math.PI) ** 0.65 * (26 + rng() * 16);
      pts.push({ x, y: g - 3, z, h, nx: T.x, nz: T.z });
    }
    quadStrip(pts, 0, 1.6 + rng() * 1.1, DARK, DARK.map((v) => v * 1.5));
    panels = SEG;

    /* SCORIA MOUNDS along the rim: the loose stuff that has slumped off the
     * ridge and piled at the angle of repose. They give the rim a broken
     * profile instead of a drawn line. */
    const box = (cx, cy, cz, hw, hh, hd, yaw, c) => {
      const s = Math.sin(yaw), co = Math.cos(yaw);
      const b = pos.length / 3;
      for (let i = 0; i < 8; i++) {
        const dx = (i & 1) ? hw : -hw, dy = (i & 2) ? hh : 0, dz = (i & 4) ? hd : -hd;
        pos.push(cx + dx * co - dz * s, cy + dy, cz + dx * s + dz * co);
        col.push(...c);
      }
      const F = [[0,1,3,2],[4,6,7,5],[0,2,6,4],[1,5,7,3],[2,3,7,6],[0,4,5,1]];
      const SH = [0.82, 1.16, 0.90, 1.00, 1.04, 0.86];
      F.forEach((f, k) => {
        idx.push(b+f[0], b+f[1], b+f[2], b+f[0], b+f[2], b+f[3]);
        for (const vi of f) for (let j = 0; j < 3; j++) col[(b+vi)*3+j] *= SH[k] ** 0.4;
      });
    };
    const N = tier === 'low' ? 30 : 70;
    for (let i = 0; i < N; i++) {
      const t = STAGES.redRidge[0] + rng() * (STAGES.redRidge[1] - STAGES.redRidge[0]);
      trail.pointAt(t, P); trail.tangentAt(t, T);
      const mx = T.z, mz = -T.x;
      const off = 9 + Math.pow(rng(), 0.7) * 46;
      const x = P.x + mx * off, z = P.z + mz * off;
      const g = terrain.height(x, z);
      const r = 1.1 + rng() * 3.4;
      const c = RUST.map((v, j) => v * (0.75 + rng() * 0.5) + DARK[j] * 0.4);
      box(x, g - r * 0.35, z, r, r * (0.5 + rng() * 0.5), r * (0.7 + rng() * 0.6),
          rng() * 6.283, c);
      mounds++;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    this.geometry = geo;

    const mat = new THREE.MeshStandardMaterial({
      name: 'red-crater-dike', vertexColors: true, side: THREE.DoubleSide,
      roughness: 0.90, metalness: 0.0, envMapIntensity: 0.30,
    });
    this.materials.push(mat);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = 'dike:red-crater';
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.root.add(mesh);
    this.counts = { panels, mounds, triangles: idx.length / 3 };
  }

  update() {}
  setTier() {}
  cullAround() {}
  stats() { return this.counts; }
  dispose() { this.geometry.dispose(); this.materials.forEach((m) => m.dispose()); }
}

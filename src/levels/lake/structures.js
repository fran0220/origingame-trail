/* The built things, other than the road itself.
 *
 * A working valley is full of small structures that nobody photographs and
 * everybody would notice the absence of. Each of these is here for a specific
 * reason rather than as set dressing:
 *
 *   CULVERT HEADWALLS, where the fan streams cross under the road. The road
 *   already climbs over six alluvial fans and there was never any explanation
 *   of where the water went. A concrete headwall and a pair of white posts at
 *   each crossing answers that, and it puts a hard man-made edge right at the
 *   road margin where the player is looking.
 *
 *   FARM GATES, hung in the fence lines. A fence with no way through it is a
 *   wall, and a gate is the single clearest sign that the paddock is worked.
 *
 *   STOCKYARDS — a set of small pens by a shed. This is where the sheep in
 *   farm.js are actually worked, and it is the one piece of geometry in the
 *   basin with repeated right angles, which is exactly why it reads as built.
 *
 *   A BOAT RAMP and a jetty on the lake. Every road that runs along a lake in
 *   this country has half a dozen of these, and they give the shoreline —
 *   otherwise an unbroken curve for two kilometres — somewhere to be
 *   interrupted.
 */
import * as THREE from 'three';
import { BOUNDS, VALLEY, shoreX, LAKE_Y, ROAD_SHOULDER, ROAD_HALF, FANS } from './basin.js';
import { clearsSegment } from '../../world/clearance.js';

function random(seed) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

/* One merged builder. Everything here is boxes and posts at a handful of
 * angles, so a single vertex-coloured mesh is both the simplest and the
 * cheapest representation — these are objects the player passes at 130 km/h. */
class Builder {
  constructor() { this.pos = []; this.col = []; this.idx = []; }
  vert(x, y, z, c) { const n = this.pos.length / 3; this.pos.push(x, y, z); this.col.push(...c); return n; }
  quad(a, b, c, d) { this.idx.push(a, b, c, a, c, d); }
  /* An axis-aligned box, rotated about Y, with per-face shading so a flat
   * colour still reads as a solid rather than a silhouette. */
  box(cx, cy, cz, hw, h, hd, yaw, c) {
    const s = Math.sin(yaw), co = Math.cos(yaw);
    const p = (dx, dy, dz) => this.vert(cx + dx * co - dz * s, cy + dy, cz + dx * s + dz * co, c);
    const v = [];
    for (let i = 0; i < 8; i++) v.push(p((i & 1) ? hw : -hw, (i & 2) ? h : 0, (i & 4) ? hd : -hd));
    const shade = (f, k) => { for (const i of f) for (let j = 0; j < 3; j++) this.col[i * 3 + j] *= k; };
    this.quad(v[0], v[1], v[3], v[2]); shade([v[0], v[1]], 0.82);
    this.quad(v[4], v[6], v[7], v[5]);
    this.quad(v[0], v[2], v[6], v[4]);
    this.quad(v[1], v[5], v[7], v[3]);
    this.quad(v[2], v[3], v[7], v[6]);
    this.quad(v[0], v[4], v[5], v[1]);
  }
  /* A rail: a long thin box between two points, which is how every gate,
   * yard and jetty in here is made. */
  rail(ax, ay, az, bx, by, bz, r, c) {
    const dx = bx - ax, dz = bz - az;
    const len = Math.hypot(dx, dz);
    if (len < 1e-4) return;
    const yaw = Math.atan2(dz, dx);
    this.box(ax + dx * 0.5, (ay + by) * 0.5 - r, az + dz * 0.5, len * 0.5, r * 2, r, yaw, c);
  }
  finish() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx);
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  }
}

const CONCRETE = [0.315, 0.310, 0.292];
const TIMBER = [0.150, 0.126, 0.092];
const WHITE = [0.520, 0.512, 0.480];
const RUST = [0.185, 0.108, 0.072];

export class LakeStructures {
  constructor(terrain, tier = 'high') {
    this.terrain = terrain;
    this.root = new THREE.Group();
    this.root.name = 'lake-structures';
    this.materials = [];
    const b = new Builder();
    const rng = random(0x8bd103);
    const trail = terrain.trail;
    const L = trail.length;
    const P = new THREE.Vector3(), T = new THREE.Vector3();
    const counts = { culverts: 0, gates: 0, yards: 0, ramps: 0 };

    const groundAt = (x, z) => terrain.height(x, z);

    /* ── culvert headwalls at the fan crossings ─────────────────────────── */
    for (const [fu] of FANS) {
      const fz = BOUNDS.z0 - fu * VALLEY;
      /* Find where the road actually crosses that z, rather than assuming. */
      let bestT = null, bestD = 1e9;
      for (let i = 0; i <= 400; i++) {
        const t = i / 400;
        trail.pointAt(t, P);
        const d = Math.abs(P.z - fz);
        if (d < bestD) { bestD = d; bestT = t; }
      }
      if (bestT === null || bestD > 60) continue;
      trail.pointAt(bestT, P); trail.tangentAt(bestT, T);
      const nx = T.z, nz = -T.x;
      const yaw = Math.atan2(T.x, T.z);
      const ax = Math.cos(yaw), az = Math.sin(yaw);
      for (const side of [-1, 1]) {
        /* PUSH THE WINGWALL OUT UNTIL ALL OF IT CLEARS THE SEAL.
         *
         * A headwall is 5.2 m long and laid on the local tangent, so on a bend
         * its ends swing in toward the carriageway while its middle sits at
         * the offset it was given. At ROAD_SHOULDER + 0.5 one of them reached
         * 4.4 m from the centreline — inside the running surface — and the
         * only reason it was ever found is that the car now collides with
         * things: the lap gate failed on mean speed because the autodriver was
         * hitting a concrete wall at 30 m/s once a lap.
         *
         * This is the fifth extended object in this project to need its whole
         * length tested rather than its anchor, and the first one where the
         * consequence was a solid obstacle standing in the road rather than
         * something merely misplaced. */
        let off = null;
        const halfLen = 2.6;
        for (const cand of [0.5, 1.4, 2.4, 3.6, 5.0]) {
          const o = (ROAD_SHOULDER + cand) * side;
          const cx = P.x + nx * o, cz = P.z + nz * o;
          if (clearsSegment(trail, cx - ax * halfLen, cz - az * halfLen,
                            cx + ax * halfLen, cz + az * halfLen,
                            ROAD_HALF + 1.6, 0.8)) { off = o; break; }
        }
        if (off === null) continue;
        const x = P.x + nx * off, z = P.z + nz * off;
        const y = groundAt(x, z);
        if (y < LAKE_Y + 0.6) continue;
        /* A low wingwall parallel to the road, and the two white posts that
         * mark the ends of it for anyone running wide at night. */
        b.box(x, y - 0.55, z, 2.6, 0.85, 0.22, yaw, CONCRETE);
        for (const e of [-1, 1]) {
          b.box(x + Math.cos(yaw) * 2.5 * e, y + 0.10, z + Math.sin(yaw) * 2.5 * e,
                0.055, 0.85, 0.055, yaw, WHITE);
        }
        counts.culverts++;
      }
    }

    /* ── farm gates, hung in the roadside fence ─────────────────────────── */
    const nGates = Math.round(VALLEY / 260);
    for (let i = 0; i < nGates; i++) {
      const m = ((i + 0.5) / nGates) * L + (rng() - 0.5) * 90;
      if (m < 30 || m > L - 30) continue;
      trail.pointAt(m / L, P); trail.tangentAt(m / L, T);
      const nx = T.z, nz = -T.x;
      const side = -1;                       // inland, where the paddocks are
      const off = (ROAD_SHOULDER + 2.6) * side;
      const x = P.x + nx * off, z = P.z + nz * off;
      const y = groundAt(x, z);
      if (y < LAKE_Y + 1.0) continue;
      const yaw = Math.atan2(T.x, T.z);
      const ax = Math.cos(yaw), az = Math.sin(yaw);
      /* Two strainer posts and a five-rail gate swung part open, because a
       * gate that is exactly shut looks painted on. */
      const half = 1.9;
      for (const e of [-1, 1]) {
        b.box(x + ax * half * e, y - 0.1, z + az * half * e, 0.10, 1.45, 0.10, yaw, TIMBER);
      }
      const swing = (rng() * 0.5 + 0.1) * (rng() < 0.5 ? -1 : 1);
      const gx = Math.cos(yaw + swing), gz = Math.sin(yaw + swing);
      for (let r = 0; r < 5; r++) {
        const h = 0.28 + r * 0.24;
        b.rail(x - ax * half, y + h, z - az * half,
               x - ax * half + gx * half * 1.9, y + h, z - az * half + gz * half * 1.9,
               0.030, RUST);
      }
      counts.gates++;
    }

    /* ── stockyards ─────────────────────────────────────────────────────── */
    const nYards = Math.max(1, Math.round(VALLEY / 900));
    for (let i = 0; i < nYards; i++) {
      const z0 = BOUNDS.z0 - ((i + 0.55) / nYards) * VALLEY + (rng() - 0.5) * 120;
      const x0 = shoreX(z0) + ROAD_SHOULDER + 44 + rng() * 40;
      const y = groundAt(x0, z0);
      if (y < LAKE_Y + 1.5 || x0 > BOUNDS.x1 - 25) continue;
      const yaw = rng() * 6.283;
      const ax = Math.cos(yaw), az = Math.sin(yaw);
      const bx = -Math.sin(yaw), bz = Math.cos(yaw);
      /* A three-by-two grid of pens, rails on every division. */
      const CW = 6.5, CH = 5.0, NX = 3, NZ = 2;
      for (let gx2 = 0; gx2 <= NX; gx2++) {
        for (let gz2 = 0; gz2 < NZ; gz2++) {
          const sx = x0 + ax * (gx2 * CW) + bx * (gz2 * CH);
          const sz = z0 + az * (gx2 * CW) + bz * (gz2 * CH);
          const ex = sx + bx * CH, ez = sz + bz * CH;
          for (let r = 0; r < 4; r++) {
            const h = 0.30 + r * 0.26;
            b.rail(sx, groundAt(sx, sz) + h, sz, ex, groundAt(ex, ez) + h, ez, 0.028, TIMBER);
          }
        }
      }
      for (let gz2 = 0; gz2 <= NZ; gz2++) {
        for (let gx2 = 0; gx2 < NX; gx2++) {
          const sx = x0 + ax * (gx2 * CW) + bx * (gz2 * CH);
          const sz = z0 + az * (gx2 * CW) + bz * (gz2 * CH);
          const ex = sx + ax * CW, ez = sz + az * CW;
          for (let r = 0; r < 4; r++) {
            const h = 0.30 + r * 0.26;
            b.rail(sx, groundAt(sx, sz) + h, sz, ex, groundAt(ex, ez) + h, ez, 0.028, TIMBER);
          }
        }
      }
      /* Posts at every corner of the grid. */
      for (let gx2 = 0; gx2 <= NX; gx2++) {
        for (let gz2 = 0; gz2 <= NZ; gz2++) {
          const sx = x0 + ax * (gx2 * CW) + bx * (gz2 * CH);
          const sz = z0 + az * (gx2 * CW) + bz * (gz2 * CH);
          b.box(sx, groundAt(sx, sz) - 0.1, sz, 0.075, 1.35, 0.075, yaw, TIMBER);
        }
      }
      counts.yards++;
    }

    /* ── boat ramps and a jetty ─────────────────────────────────────────── */
    const nRamps = Math.max(2, Math.round(VALLEY / 700));
    for (let i = 0; i < nRamps; i++) {
      const z0 = BOUNDS.z0 - ((i + 0.3) / nRamps) * VALLEY + (rng() - 0.5) * 140;
      const sx = shoreX(z0);
      /* A concrete apron running from above the waterline down into the lake,
       * which is the only man-made straight edge the shoreline gets. */
      const len = 16 + rng() * 10;
      for (let s = 0; s < 10; s++) {
        const u = s / 9;
        const x = sx + 6 - u * len;
        const y = LAKE_Y + 0.55 - u * 1.4;
        b.box(x, y, z0, len / 18, 0.10, 1.9, 0, CONCRETE);
      }
      counts.ramps++;
      /* Every second one gets a short timber jetty beside it. */
      if (i % 2 === 0) {
        const jz = z0 + 12 + rng() * 8;
        const jx = sx + 2;
        for (let s = 0; s < 7; s++) {
          const x = jx - s * 2.1;
          const deck = LAKE_Y + 0.75;
          b.box(x, deck - 0.12, jz, 1.05, 0.14, 1.15, 0, TIMBER);
          for (const e of [-1, 1]) {
            const py = groundAt(x, jz + e * 0.9);
            b.box(x, Math.min(py, LAKE_Y - 0.4), jz + e * 0.9, 0.075,
                  deck - Math.min(py, LAKE_Y - 0.4), 0.075, 0, TIMBER);
          }
        }
      }
    }

    const geo = b.finish();
    this.geometry = geo;
    const mat = new THREE.MeshStandardMaterial({
      color: 0xffffff, vertexColors: true, roughness: 0.88, metalness: 0.0,
    });
    this.materials.push(mat);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = 'structures';
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.root.add(mesh);
    this.counts = { ...counts, triangles: b.idx.length / 3 };
  }

  update() {}
  setTier() {}
  cullAround() {}
  stats() { return this.counts; }
  dispose() { this.geometry.dispose(); this.materials.forEach((m) => m.dispose()); }
}

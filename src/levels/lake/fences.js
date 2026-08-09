/* Post-and-wire fences, which is what this country is actually made of.
 *
 * Every hectare of New Zealand farmland is fenced, and a high-country run is
 * fenced in long straight lines that ignore the contour completely — over the
 * hummocks, down the gullies and up the other side. That is the visual point:
 * the whole basin is soft curves, and a fence is a dead straight line laid
 * across them, so it describes the shape of the ground better than the ground
 * does. It is also the cheapest possible sense of scale, because everyone
 * knows how tall a fence post is.
 *
 * Built as one merged geometry per run rather than instanced posts, because a
 * fence is a continuous object: the wires have to go from *this* post to *that*
 * one at the heights the ground gives them, and an instanced post plus a
 * separately instanced wire cannot know about each other.
 */
import * as THREE from 'three';
import { BOUNDS, VALLEY, shoreX, LAKE_Y, ROAD_SHOULDER } from './basin.js';

function random(seed) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

const POST_H = 1.15;
const POST_R = 0.055;
const SPACING = 4.6;
/* Seven wires is a standard sheep fence. They are not evenly spaced: the gaps
 * are tight at the bottom, where a lamb would otherwise get through, and open
 * out toward the top. */
const WIRES = [0.13, 0.26, 0.41, 0.58, 0.75, 0.93, 1.09];

export class LakeFences {
  constructor(terrain, tier = 'high') {
    this.terrain = terrain;
    this.root = new THREE.Group();
    this.root.name = 'lake-fences';
    this.materials = [];

    const rng = random(0x3fe0c1);
    const trail = terrain.trail;
    const pos = [], col = [], idx = [];
    const push = (x, y, z, c) => { const n = pos.length / 3; pos.push(x, y, z); col.push(...c); return n; };

    /* Weathered pine, silvered by thirty years of nor'wester. */
    const POST = [0.150, 0.132, 0.104];
    const WIRE = [0.240, 0.236, 0.225];

    const box = (x, y, z, hw, h, hd, c, tiltA, tiltD) => {
      const b = pos.length / 3;
      const tx = Math.cos(tiltA) * tiltD, tz = Math.sin(tiltA) * tiltD;
      for (let i = 0; i < 8; i++) {
        const sx = (i & 1) ? hw : -hw, sy = (i & 2) ? h : 0, sz = (i & 4) ? hd : -hd;
        const lean = sy / Math.max(0.001, h);
        push(x + sx + tx * lean, y + sy, z + sz + tz * lean, c.map((v) => v * (0.80 + 0.32 * (sy / Math.max(0.001, h)))));
      }
      for (const f of [[0,1,3,2],[4,6,7,5],[0,2,6,4],[1,5,7,3],[2,3,7,6],[0,4,5,1]]) {
        idx.push(b + f[0], b + f[1], b + f[2], b + f[0], b + f[2], b + f[3]);
      }
    };

    /* A wire is a very thin quad strip, doubled so it is visible from both
     * sides without needing a two-sided material for the posts as well. */
    const wire = (ax, ay, az, bx, by, bz) => {
      const b = pos.length / 3;
      const t = 0.011;
      push(ax, ay + t, az, WIRE); push(bx, by + t, bz, WIRE);
      push(ax, ay - t, az, WIRE); push(bx, by - t, bz, WIRE);
      idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
      idx.push(b + 2, b + 3, b, b + 3, b + 1, b);
    };

    const ok = (x, z, minRoad) => {
      if (x < BOUNDS.x0 + 8 || x > BOUNDS.x1 - 8) return null;
      if (z > BOUNDS.z0 - 8 || z < BOUNDS.z1 + 8) return null;
      const y = terrain.height(x, z);
      if (y < LAKE_Y + 1.0) return null;
      if (trail.nearest(x, z, {}).dist < minRoad) return null;
      return y;
    };

    let runs = 0, posts = 0;
    const buildRun = (x0, z0, dirA, length, minRoad) => {
      const n = Math.floor(length / SPACING);
      let prev = null, started = false;
      for (let i = 0; i <= n; i++) {
        const x = x0 + Math.cos(dirA) * SPACING * i;
        const z = z0 + Math.sin(dirA) * SPACING * i;
        const y = ok(x, z, minRoad);
        if (y === null) { prev = null; continue; }
        /* Posts lean a little, because they have been in the ground for
         * decades and the ground has moved. */
        box(x, y - 0.05, z, POST_R, POST_H, POST_R, POST, rng() * 6.283, 0.02 + rng() * 0.05);
        posts++;
        if (prev) {
          for (const h of WIRES) {
            /* Wires sag between posts and follow the ground's slope from post
             * top to post top, which is what makes a fence describe a hummock
             * instead of floating over it. */
            wire(prev.x, prev.y + h, prev.z, x, y + h, z);
          }
        }
        prev = { x, y, z };
        started = true;
      }
      if (started) runs++;
    };

    /* The road is fenced both sides for its whole length — that is the law and
     * it is also the strongest line in any frame here, running parallel to the
     * seal a few metres out. */
    const L = trail.length, P = new THREE.Vector3(), T = new THREE.Vector3();
    for (const side of [-1, 1]) {
      let prev = null;
      for (let m = 0; m < L; m += SPACING) {
        trail.pointAt(m / L, P); trail.tangentAt(m / L, T);
        const nx = T.z, nz = -T.x;
        const off = (ROAD_SHOULDER + 2.6 + Math.sin(m * 0.013) * 0.9) * side;
        const x = P.x + nx * off, z = P.z + nz * off;
        const y = ok(x, z, ROAD_SHOULDER + 1.4);
        if (y === null) { prev = null; continue; }
        box(x, y - 0.05, z, POST_R, POST_H, POST_R, POST, rng() * 6.283, 0.02 + rng() * 0.05);
        posts++;
        if (prev) for (const h of WIRES) wire(prev.x, prev.y + h, prev.z, x, y + h, z);
        prev = { x, y, z };
      }
      runs++;
    }

    /* Paddock boundaries running inland, ignoring the contour. */
    const inland = Math.round(VALLEY / 200);
    for (let i = 0; i < inland; i++) {
      const z0 = BOUNDS.z0 - ((i + 0.5) / inland) * VALLEY + (rng() - 0.5) * 70;
      const x0 = shoreX(z0) + ROAD_SHOULDER + 16;
      buildRun(x0, z0, 1.30 + (rng() - 0.5) * 0.85, 120 + rng() * 190, ROAD_SHOULDER + 9);
    }
    /* And a few running along the slope, closing the paddocks off. */
    const along = Math.round(VALLEY / 460);
    for (let i = 0; i < along; i++) {
      const z0 = BOUNDS.z0 - ((i + 0.4) / along) * VALLEY;
      const x0 = shoreX(z0) + 70 + rng() * 60;
      buildRun(x0, z0, -1.55 + (rng() - 0.5) * 0.4, 150 + rng() * 220, ROAD_SHOULDER + 9);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    this.geometry = geo;

    const mat = new THREE.MeshStandardMaterial({
      color: 0xffffff, vertexColors: true, roughness: 0.88, metalness: 0.0,
      side: THREE.DoubleSide,
    });
    this.materials.push(mat);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = 'fences';
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.root.add(mesh);
    this.mesh = mesh;
    this.counts = { runs, posts, triangles: idx.length / 3 };
  }

  update() {}
  setTier() {}
  cullAround() {}
  stats() { return this.counts; }
  dispose() { this.geometry.dispose(); this.materials.forEach((m) => m.dispose()); }
}

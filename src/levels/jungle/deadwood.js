/* Deadwood: what has fallen, and what is eating it.
 *
 * A rainforest floor is not soil with plants on it. It is a slow-motion
 * demolition site — the standing forest is maybe a third of the wood present,
 * and the rest is lying down in various stages of being taken apart. The level
 * had a beautifully detailed understorey growing out of a floor with nothing
 * dead on it, which is the botanical equivalent of a city with no rubbish.
 *
 * Three things, in descending order of how much they change a frame:
 *
 *   FALLEN TRUNKS. A big log lying across the view is the single most useful
 *   object in a forest, because it is the only horizontal line in a scene
 *   built entirely from verticals. It gives the eye somewhere to rest and it
 *   gives the ground a readable depth. They are placed on the DOWNHILL side of
 *   where they fell and lie across the slope, because that is where a trunk
 *   comes to rest.
 *
 *   SNAGS AND STUMPS. A standing dead trunk, snapped off at four to ten
 *   metres, is what a forest gap looks like from underneath — it explains the
 *   hole in the canopy that the light is coming through.
 *
 *   BRACKET FUNGI, on both. This is the detail that makes the wood look dead
 *   rather than merely brown: a pale shelf on a dark trunk is a hard,
 *   high-contrast edge, and there is almost nothing else in this scene with
 *   one.
 */
import * as THREE from 'three';
import { clearsPoint, clearsSegment } from '../../world/clearance.js';

function random(seed) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

class Mesher {
  constructor() { this.pos = []; this.col = []; this.idx = []; }
  vert(x, y, z, c) { const n = this.pos.length / 3; this.pos.push(x, y, z); this.col.push(...c); return n; }
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

/* A tapered, slightly bent tube along +X, with rot and moss written into the
 * vertex colour. Both trunks and snags are this. */
function limb(M, rng, len, r0, r1, sides, wet) {
  const SEG = 7;
  const bend = (rng() - 0.5) * 0.30;
  const lean = (rng() - 0.5) * 0.12;
  const base = 0.062 + rng() * 0.030;
  const ring0 = M.pos.length / 3;
  for (let s = 0; s <= SEG; s++) {
    const t = s / SEG;
    const r = r0 + (r1 - r0) * t;
    const cy = Math.sin(t * Math.PI) * bend * len * 0.12;
    const cz = Math.sin(t * 2.1) * lean * len * 0.10;
    for (let k = 0; k < sides; k++) {
      const a = (k / sides) * Math.PI * 2;
      /* Bark is not a smooth cylinder. Radial jitter per ring per side is the
       * cheapest thing that stops a log reading as plumbing. */
      const rr = r * (0.86 + rng() * 0.28);
      const up = Math.sin(a);
      /* Moss and algae grow on the upper surface, and heavily on the wet side
       * of anything lying on the ground. Underside stays near-black. */
      const moss = Math.max(0, up) * (0.20 + rng() * 0.26) * wet;
      const rot = base * (0.55 + rng() * 0.55);
      /* Moss on rotting wood is DARK OLIVE, not leaf green. The first version
       * used a green three times this strong and produced logs the colour of
       * a snooker table — brighter than the living canopy above them, which
       * is exactly backwards, since this stuff grows in the deepest shade in
       * the forest. Wood first, moss as a tint on it. */
      M.vert(t * len, cy + Math.sin(a) * rr, cz + Math.cos(a) * rr,
             [rot * 1.05 + moss * 0.048, rot * 0.98 + moss * 0.082, rot * 0.80 + moss * 0.034]);
    }
  }
  for (let s = 0; s < SEG; s++) {
    for (let k = 0; k < sides; k++) {
      const a = ring0 + s * sides + k, b = ring0 + s * sides + (k + 1) % sides;
      M.idx.push(a, a + sides, b, b, a + sides, b + sides);
    }
  }
  /* Cap the far end with a pale broken face — a snapped trunk shows sapwood,
   * and that light disc at the end of a dark log is what reads as "broken"
   * rather than "cut". */
  const pale = [0.235, 0.205, 0.160];
  const c = M.vert(len, 0, 0, pale);
  const capRing = ring0 + SEG * sides;
  for (let k = 0; k < sides; k++) {
    M.idx.push(c, capRing + (k + 1) % sides, capRing + k);
  }
  return ring0;
}

/* A bracket fungus: a half-disc shelf, pale on top, dark underneath. */
function bracket(M, rng, x, y, z, ang, size) {
  const SEG = 7;
  const top = [0.400 + rng() * 0.14, 0.360 + rng() * 0.12, 0.285 + rng() * 0.10];
  const under = [0.075, 0.068, 0.058];
  const nx = Math.cos(ang), nz = Math.sin(ang);
  const tx = -nz, tz = nx;
  const hub = M.vert(x, y, z, under);
  const hubT = M.vert(x, y + size * 0.10, z, top);
  const outT = [], outU = [];
  for (let k = 0; k <= SEG; k++) {
    const u = (k / SEG - 0.5) * Math.PI * 1.05;
    const rr = size * (0.75 + 0.25 * Math.cos(u * 1.4));
    const px = x + (nx * Math.cos(u) + tx * Math.sin(u)) * rr;
    const pz = z + (nz * Math.cos(u) + tz * Math.sin(u)) * rr;
    const py = y + size * 0.10 - Math.abs(Math.sin(u)) * size * 0.10;
    outT.push(M.vert(px, py, pz, top));
    outU.push(M.vert(px, py - size * 0.09, pz, under));
  }
  for (let k = 0; k < SEG; k++) {
    M.idx.push(hubT, outT[k], outT[k + 1]);
    M.idx.push(hub, outU[k + 1], outU[k]);
    M.idx.push(outT[k], outU[k], outU[k + 1]);
    M.idx.push(outT[k], outU[k + 1], outT[k + 1]);
  }
}

export class JungleDeadwood {
  constructor(terrain, trail, tier = 'high') {
    this.terrain = terrain;
    this.root = new THREE.Group();
    this.root.name = 'jungle-deadwood';
    this.materials = [];

    const rng = random(0xd4a17e);
    const M = new Mesher();
    const P = new THREE.Vector3();
    const L = trail.length;
    const counts = { logs: 0, snags: 0, stumps: 0, brackets: 0 };

    const slopeAt = (x, z) => {
      const e = 1.0;
      const dx = (terrain.height(x + e, z) - terrain.height(x - e, z)) / (2 * e);
      const dz = (terrain.height(x, z + e) - terrain.height(x, z - e)) / (2 * e);
      return { dx, dz, g: Math.hypot(dx, dz) };
    };

    /* Everything is placed relative to the trail, because the player walks a
     * line through this level and the forest fifty metres off it is scenery
     * nobody resolves. The corridor itself is kept clear — a log across the
     * only path is not atmosphere, it is a wall. */
    const CLEAR = 2.6;
    const pick = (near, far) => {
      for (let tries = 0; tries < 24; tries++) {
        const t = rng();
        trail.pointAt(t, P);
        const a = rng() * Math.PI * 2;
        const r = near + Math.pow(rng(), 0.7) * (far - near);
        const x = P.x + Math.cos(a) * r, z = P.z + Math.sin(a) * r;
        if (!clearsPoint(trail, x, z, CLEAR)) continue;
        return { x, z, y: terrain.height(x, z) };
      }
      return null;
    };

    const DENS = tier === 'low' ? 0.4 : tier === 'medium' ? 0.7 : 1.0;

    /* ── fallen trunks ──────────────────────────────────────────────────── */
    const nLogs = Math.round(L * 0.42 * DENS);
    for (let i = 0; i < nLogs; i++) {
      const site = pick(3.0, 26);
      if (!site) continue;
      const s = slopeAt(site.x, site.z);
      const len = 3.5 + Math.pow(rng(), 1.6) * 11;
      const r0 = 0.13 + Math.pow(rng(), 1.9) * 0.42;
      const r1 = r0 * (0.42 + rng() * 0.34);

      /* A trunk lies ACROSS the slope. One pointing straight downhill would
       * have rolled; one pointing straight uphill did not fall that way. */
      const downhill = Math.atan2(-s.dz, -s.dx);
      const yaw = downhill + Math.PI / 2 + (rng() - 0.5) * 1.1;

      /* CLEAR THE WHOLE LOG, not its origin. pick() only guarantees the root
       * end is off the path; an eleven-metre trunk rooted three metres away
       * sweeps straight across it, and the first render had logs lying over
       * the trail like a barricade. Same mistake as the lake's scree fans:
       * an extended object needs the exclusion tested along its extent. */
      if (!clearsSegment(trail, site.x, site.z,
                         site.x + Math.cos(yaw) * len, site.z + Math.sin(yaw) * len,
                         CLEAR)) continue;

      const start = M.pos.length / 3;
      limb(M, rng, len, r0, r1, 7, 1.0);
      const end = M.pos.length / 3;

      const roll = (rng() - 0.5) * 0.7;
      /* Sunk into the litter. A log resting exactly on the surface floats;
       * a real one is half buried in its own decay. */
      const sink = r0 * (0.35 + rng() * 0.40);
      const cy = Math.cos(yaw), sy = Math.sin(yaw);
      const cr = Math.cos(roll), sr = Math.sin(roll);
      for (let v = start; v < end; v++) {
        const px = M.pos[v * 3], py = M.pos[v * 3 + 1], pz = M.pos[v * 3 + 2];
        const ry = py * cr - pz * sr, rz = py * sr + pz * cr;
        const wx = site.x + px * cy - rz * sy;
        const wz = site.z + px * sy + rz * cy;
        /* Follow the ground along the log's length, so a long trunk on a
         * slope stays in contact instead of spearing into the hill. */
        M.pos[v * 3] = wx;
        M.pos[v * 3 + 1] = terrain.height(wx, wz) + ry + r0 - sink;
        M.pos[v * 3 + 2] = wz;
      }
      counts.logs++;

      /* Brackets, on the upper flank, in a vertical group — they fruit in
       * tiers up one side of a log. */
      if (rng() < 0.55) {
        const n = 2 + ((rng() * 5) | 0);
        for (let k = 0; k < n; k++) {
          const u = 0.12 + rng() * 0.76;
          const bx = site.x + (u * len) * cy;
          const bz = site.z + (u * len) * sy;
          const rr = r0 + (r1 - r0) * u;
          const ang = yaw + Math.PI / 2 + (rng() - 0.5) * 1.6;
          bracket(M, rng, bx + Math.cos(ang) * rr * 0.8,
                  terrain.height(bx, bz) + rr * (0.7 + rng() * 0.7) - sink,
                  bz + Math.sin(ang) * rr * 0.8, ang, 0.10 + rng() * 0.20);
          counts.brackets++;
        }
      }
    }

    /* ── snags and stumps ───────────────────────────────────────────────── */
    const nSnags = Math.round(L * 0.16 * DENS);
    for (let i = 0; i < nSnags; i++) {
      const site = pick(4.0, 30);
      if (!site) continue;
      const tall = rng() < 0.45;
      const len = tall ? 4.5 + rng() * 6.5 : 0.6 + rng() * 1.4;
      const r0 = 0.22 + Math.pow(rng(), 1.5) * 0.50;
      const r1 = r0 * (tall ? 0.55 + rng() * 0.25 : 0.80 + rng() * 0.15);

      const start = M.pos.length / 3;
      limb(M, rng, len, r0, r1, 8, tall ? 0.45 : 0.85);
      const end = M.pos.length / 3;
      /* Rotate the +X tube to stand up, with a lean — a dead trunk is never
       * plumb, and a plumb one reads as a fencepost. */
      const lean = (rng() - 0.5) * 0.22;
      const dir = rng() * Math.PI * 2;
      const cd = Math.cos(dir), sd = Math.sin(dir);
      for (let v = start; v < end; v++) {
        const px = M.pos[v * 3], py = M.pos[v * 3 + 1], pz = M.pos[v * 3 + 2];
        const ux = px * Math.sin(lean), uy = px * Math.cos(lean);
        M.pos[v * 3] = site.x + (ux + py) * cd - pz * sd;
        M.pos[v * 3 + 1] = site.y + uy - 0.25;
        M.pos[v * 3 + 2] = site.z + (ux + py) * sd + pz * cd;
      }
      if (tall) counts.snags++; else counts.stumps++;

      if (rng() < 0.6) {
        const n = 1 + ((rng() * 4) | 0);
        for (let k = 0; k < n; k++) {
          const h = 0.25 + rng() * Math.min(len * 0.8, 2.4);
          const ang = rng() * Math.PI * 2;
          const rr = r0 + (r1 - r0) * (h / len);
          bracket(M, rng, site.x + Math.cos(ang) * rr * 0.85, site.y - 0.25 + h,
                  site.z + Math.sin(ang) * rr * 0.85, ang, 0.09 + rng() * 0.18);
          counts.brackets++;
        }
      }
    }

    const geo = M.finish();
    this.geometry = geo;
    const mat = new THREE.MeshStandardMaterial({
      color: 0xffffff, vertexColors: true, roughness: 0.95, metalness: 0.0,
    });
    this.materials.push(mat);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = 'deadwood';
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.root.add(mesh);
    this.counts = { ...counts, triangles: M.idx.length / 3 };
  }

  update() {}
  setTier() {}
  cullAround() {}
  stats() { return this.counts; }
  dispose() { this.geometry.dispose(); this.materials.forEach((m) => m.dispose()); }
}

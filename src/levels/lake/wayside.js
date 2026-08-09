/* The lookout, and the fact that other people exist.
 *
 * Two kilometres of state highway with fences, power lines, stock and signs,
 * and not one indication that a human being has ever stopped here. The road
 * furniture says the route is maintained; nothing says it is USED. Those are
 * different claims and a landscape needs both — a highway with no vehicles and
 * no pull-offs reads as a film set dressed by somebody who left before the
 * shoot.
 *
 * A wayside does more work than its size suggests, for three reasons:
 *
 *   IT IS THE ONLY PLACE THE DRIVE HAS A REASON TO EXIST. Every other object
 *   here is scenery the player passes. A lookout is scenery that says "this
 *   view is worth stopping for", which retroactively tells the player that the
 *   view they have been driving through was worth looking at.
 *
 *   PARKED VEHICLES ARE THE BEST SCALE REFERENCE AVAILABLE. Everyone knows how
 *   big a van is to within a few percent, far better than they know a tree or
 *   a fence. One van at the roadside calibrates the entire valley behind it.
 *
 *   IT BREAKS THE RHYTHM. The corridor either side of this road has been
 *   uniformly vegetated for its whole length. A patch of bare gravel with hard
 *   edges is the only interruption, and interruptions are what make a length
 *   of road memorable rather than merely long.
 */
import * as THREE from 'three';
import { BOUNDS, VALLEY, shoreX, LAKE_Y, ROAD_SHOULDER } from './basin.js';
import { clearsSegment } from '../../world/clearance.js';

function random(seed) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

/* Same merged-box approach the culverts and stockyards use: everything here is
 * boxes at a handful of angles, seen from a car. */
class Builder {
  constructor() { this.pos = []; this.col = []; this.idx = []; }
  vert(x, y, z, c) { const n = this.pos.length / 3; this.pos.push(x, y, z); this.col.push(...c); return n; }
  quad(a, b, c, d) { this.idx.push(a, b, c, a, c, d); }
  box(cx, cy, cz, hw, h, hd, yaw, c, sink = 0) {
    const s = Math.sin(yaw), co = Math.cos(yaw);
    const pt = (dx, dy, dz) =>
      this.vert(cx + dx * co - dz * s, cy + dy - sink, cz + dx * s + dz * co, c);
    const v = [];
    for (let i = 0; i < 8; i++) v.push(pt((i & 1) ? hw : -hw, (i & 2) ? h : 0, (i & 4) ? hd : -hd));
    const shade = (f, k) => { for (const i of f) for (let j = 0; j < 3; j++) this.col[i * 3 + j] *= k; };
    this.quad(v[0], v[1], v[3], v[2]); shade([v[0], v[1], v[3], v[2]], 0.80);
    this.quad(v[4], v[6], v[7], v[5]); shade([v[4], v[6], v[7], v[5]], 1.12);
    this.quad(v[0], v[2], v[6], v[4]); shade([v[0], v[2], v[6], v[4]], 0.90);
    this.quad(v[1], v[5], v[7], v[3]); shade([v[1], v[5], v[7], v[3]], 0.98);
    this.quad(v[2], v[3], v[7], v[6]);
    this.quad(v[0], v[4], v[5], v[1]);
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

const GRAVEL = [0.300, 0.285, 0.258];
const TIMBER = [0.150, 0.122, 0.086];
const STEEL = [0.185, 0.190, 0.196];
const PANEL = [0.115, 0.135, 0.120];

/* Body colours. Rental fleets in this country are white, and a white van
 * against a dark hillside is the most visible man-made object it is possible
 * to place — which is the point. */
const BODIES = [
  [0.640, 0.640, 0.620],   // white van
  [0.480, 0.505, 0.520],   // silver
  [0.115, 0.180, 0.290],   // dark blue
  [0.300, 0.115, 0.098],   // red
];

export class LakeWayside {
  constructor(terrain, tier = 'high') {
    this.terrain = terrain;
    this.root = new THREE.Group();
    this.root.name = 'lake-wayside';
    this.materials = [];

    const b = new Builder();
    const rng = random(0x1a7e50);
    const trail = terrain.trail;
    const L = trail.length;
    const P = new THREE.Vector3(), T = new THREE.Vector3();
    const counts = { waysides: 0, vehicles: 0, tables: 0, panels: 0 };

    /* Two or three of them over the stage, on the LAKE side. A lookout facing
     * away from the view would be an odd thing to build. */
    const N = Math.max(2, Math.round(VALLEY / 800));
    for (let k = 0; k < N; k++) {
      const AW = 9.5, AL = 15.0;
      /* SEARCH for a site rather than proposing one and giving up.
       *
       * A single proposal per wayside is why the first two versions built
       * either zero or a broken one: the correct clearance test rejects any
       * spot where a 15 m apron on the local tangent swings back toward a
       * curving road, and on this alignment that is most spots. Trying a
       * spread of chainages and a couple of setbacks finds the straight
       * stretches, which is exactly where a real pull-off goes — you do not
       * build a lookout on the outside of a bend. */
      let site = null;
      for (let attempt = 0; attempt < 14 && !site; attempt++) {
        const m = ((k + 0.5) / N) * L + (attempt - 7) * 46 + (rng() - 0.5) * 24;
        if (m < 60 || m > L - 60) continue;
        trail.pointAt(m / L, P);
        trail.tangentAt(m / L, T);
        const nx = T.z, nz = -T.x;
        const yaw = Math.atan2(T.x, T.z);
        const ax = Math.cos(yaw), az = Math.sin(yaw);
        const bx = nx, bz = nz;

        /* Which side is the lake? A lookout facing away from the view would
         * be an odd thing to build. */
        const probe = (sgn) => {
          const x = P.x + bx * sgn * 14, z = P.z + bz * sgn * 14;
          return Math.abs(x - shoreX(z));
        };
        const side = probe(1) < probe(-1) ? 1 : -1;

        for (const setback of [7.5, 10.5, 13.5]) {
          const cx = P.x + bx * side * (ROAD_SHOULDER + setback);
          const cz = P.z + bz * side * (ROAD_SHOULDER + setback);
          const cy = terrain.height(cx, cz);
          if (cy < LAKE_Y + 1.2) continue;
          if (cx < BOUNDS.x0 + 12 || cx > BOUNDS.x1 - 12) continue;
          /* Not on a slope you could not park on. */
          const e = 2.0;
          const gx = (terrain.height(cx + e, cz) - terrain.height(cx - e, cz)) / (2 * e);
          const gz = (terrain.height(cx, cz + e) - terrain.height(cx, cz - e)) / (2 * e);
          if (Math.hypot(gx, gz) > 0.20) continue;

          /* THE PAD IS A SEGMENT, NOT A DISC, and I got this wrong twice.
           *
           * First I passed a disc radius of 8 — half the pad's LENGTH — and
           * every site was rejected, because that demanded 14.9 m of
           * separation from a pad whose nearest edge is 4.75 m from centre.
           *
           * Then I passed the half-width, which built three waysides and put
           * one of them 0.28 m from the centreline. A disc test at the centre
           * says nothing about a fifteen-metre pad laid along the local
           * tangent when the road CURVES AWAY from that tangent: the far end
           * swings back across the carriageway while the middle sits clear.
           *
           * Testing the long axis as a segment, with the half-width folded
           * into the margin, is the only version that asks the question. This
           * is the third extended object to need clearsSegment and the second
           * time I reached for the cheaper test first — see clearance.js. */
          const halfL = AL / 2;
          if (!clearsSegment(trail, cx - ax * halfL, cz - az * halfL,
                             cx + ax * halfL, cz + az * halfL,
                             ROAD_SHOULDER + 1.0 + AW / 2, 1.5)) continue;
          site = { cx, cz, cy, yaw, ax, az, bx, bz, side, AW, AL };
          break;
        }
      }
      if (!site) continue;
      const { cx, cz, yaw, ax, az, bx, bz, side } = site;

      /* THE APRON. A thin slab of gravel, laid as a grid of small boxes that
       * each take their own terrain height, so the pad follows the ground
       * instead of hovering at one corner and burying itself at the other.
       * This is the same mistake that made the streams invisible, and the
       * same fix: sample per element, not once per object. */
      const GX = 8, GZ = 12;
      for (let i = 0; i < GX; i++) {
        for (let j = 0; j < GZ; j++) {
          const u = (i / (GX - 1) - 0.5) * AW, w = (j / (GZ - 1) - 0.5) * AL;
          const px = cx + bx * u + ax * w, pz = cz + bz * u + az * w;
          const shade = 0.86 + rng() * 0.30;
          b.box(px, terrain.height(px, pz) + 0.02, pz,
                AW / (GX - 1) * 0.62, 0.04, AL / (GZ - 1) * 0.62, yaw,
                GRAVEL.map((v) => v * shade));
        }
      }

      /* Vehicles. A van is a box with a taller box on it and four dark
       * patches for wheels; at the distance and speed this is seen from,
       * anything more is invisible. What matters is the PROPORTION — a van is
       * about 5.4 m long and 2.6 m tall, and getting that ratio wrong makes
       * a scale reference that lies. */
      const nVeh = 1 + ((rng() * 2.4) | 0);
      for (let v = 0; v < nVeh; v++) {
        /* Slots run ALONG the road; the vehicles face across it.
         *
         * The first version offset the slots along `bx` — the same axis the
         * vehicles are parked on, because vyaw is the road normal — so a van
         * 5.4 m long was being spaced 3.1 m from the next one on its own
         * length axis. They overlapped nose-to-tail into a single 8 m mass
         * that rendered as a shipping container in a paddock, which is what
         * sent me looking at the glazing when the geometry was the problem.
         * Nose-in parking means the row advances across the frontage, not
         * into itself. */
        const slot = (v - (nVeh - 1) / 2) * 3.0;
        const vx = cx + ax * slot, vz = cz + az * slot;
        const vy = terrain.height(vx, vz) + 0.06;
        const body = BODIES[(rng() * BODIES.length) | 0];
        const van = rng() < 0.55;
        const len = van ? 5.4 : 4.4, wide = van ? 1.05 : 0.90;
        /* Parked nose-in to the view, with a couple of degrees of slop — a
         * row of perfectly aligned vehicles is a car park, not a lookout. */
        const vyaw = yaw + Math.PI / 2 + (rng() - 0.5) * 0.22;
        const bodyH = van ? 1.42 : 0.62;
        b.box(vx, vy + 0.34, vz, len / 2, bodyH, wide, vyaw, body);

        /* THE GLAZING BAND, which is the whole difference between a vehicle
         * and a shipping container.
         *
         * The first version was a plain coloured box at van proportions —
         * 5.4 x 2.1 x 1.9, which is correct to the centimetre — and it read
         * unmistakably as a freight container sitting in a paddock. Correct
         * dimensions are not enough: at any distance the cue the eye uses to
         * identify a vehicle is the DARK HORIZONTAL BAND of its windows,
         * because almost nothing else in a landscape has one. It breaks the
         * mass into a lighter lower body and a roof, and that silhouette is
         * recognisable at ranges where no other detail survives.
         *
         * Slightly proud of the body so it cannot z-fight. */
        const glass = [0.048, 0.055, 0.062];
        b.box(vx, vy + 0.34 + bodyH * (van ? 0.58 : 0.62), vz,
              len / 2 * 0.94, van ? 0.42 : 0.26, wide * 1.02, vyaw, glass);
        if (!van) {
          /* Cabin, set back and narrower — the greenhouse, sitting above the
           * glazing band so a car reads as bonnet / glass / boot. */
          b.box(vx, vy + 0.90, vz, len * 0.30, 0.46, wide * 0.86, vyaw,
                body.map((c) => c * 0.86));
        } else {
          /* A pop-top and a dark windscreen band. */
          b.box(vx, vy + 1.76, vz, len * 0.34, 0.22, wide * 0.92, vyaw,
                body.map((c) => c * 1.12));
        }
        const wr = 0.33;
        for (const s1 of [-1, 1]) for (const s2 of [-1, 1]) {
          const ox = Math.cos(vyaw) * len * 0.33 * s1 - Math.sin(vyaw) * wide * s2;
          const oz = Math.sin(vyaw) * len * 0.33 * s1 + Math.cos(vyaw) * wide * s2;
          b.box(vx + ox, vy, vz + oz, wr, wr * 1.1, 0.16, vyaw, [0.028, 0.028, 0.030]);
        }
        counts.vehicles++;
      }

      /* A picnic table: top, two benches, and the trestle legs. */
      const tx = cx + bx * (AW * 0.28) + ax * (AL * 0.30);
      const tz = cz + bz * (AW * 0.28) + az * (AL * 0.30);
      const ty = terrain.height(tx, tz);
      const tyaw = yaw + (rng() - 0.5) * 0.5;
      b.box(tx, ty + 0.72, tz, 0.85, 0.05, 0.38, tyaw, TIMBER);
      for (const s of [-1, 1]) {
        b.box(tx + Math.sin(tyaw) * -0.72 * s, ty + 0.44, tz + Math.cos(tyaw) * 0.72 * s,
              0.85, 0.05, 0.16, tyaw, TIMBER);
      }
      for (const s of [-1, 1]) {
        b.box(tx + Math.cos(tyaw) * 0.70 * s, ty, tz + Math.sin(tyaw) * 0.70 * s,
              0.06, 0.72, 0.70, tyaw, TIMBER);
      }
      counts.tables++;

      /* An interpretive panel, angled back the way every one of them is, and
       * a bin beside it. The panel faces the lake, because that is what it is
       * about. */
      const px2 = cx + bx * side * (AW * 0.42) - ax * (AL * 0.28);
      const pz2 = cz + bz * side * (AW * 0.42) - az * (AL * 0.28);
      const py2 = terrain.height(px2, pz2);
      for (const s of [-1, 1]) {
        b.box(px2 + ax * 0.42 * s, py2, pz2 + az * 0.42 * s, 0.045, 1.02, 0.045, yaw, STEEL);
      }
      b.box(px2, py2 + 0.72, pz2, 0.52, 0.44, 0.05, yaw, PANEL);
      b.box(px2 + ax * 1.35, py2, pz2 + az * 1.35, 0.24, 0.82, 0.24, yaw, [0.075, 0.098, 0.082]);
      counts.panels++;
      counts.waysides++;
    }

    const geo = b.finish();
    this.geometry = geo;
    const mat = new THREE.MeshStandardMaterial({
      color: 0xffffff, vertexColors: true, roughness: 0.80, metalness: 0.0,
    });
    this.materials.push(mat);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = 'wayside';
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

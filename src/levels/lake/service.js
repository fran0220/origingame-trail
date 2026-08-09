/* The service park beside the start.
 *
 * A stage start is not a line on a road. It is the one place on the whole
 * route where the event is physically assembled: trucks, awnings, tyre stacks,
 * generators, people standing around waiting. The player looks at this spot
 * from a standstill at the beginning of every single run, which makes it the
 * highest-value square metre in the level and — until now — one of the
 * emptiest.
 *
 * That guaranteed visibility is also why it is a safe thing to build. Several
 * things added to this project turned out to be invisible in practice, and the
 * common factor was that nothing forced the player to look at them. Here the
 * camera starts pointed at it.
 *
 * WHAT A SERVICE PARK IS MADE OF, in the order it reads at fifty metres:
 *
 *   AWNINGS. Big, flat, brightly coloured planes on legs. They are the only
 *   large horizontal surfaces in a landscape of hills, and they are what the
 *   eye picks up first.
 *
 *   TRUCKS AND VANS, which give the whole thing scale — as at the wayside, a
 *   vehicle is the one object whose size everybody knows.
 *
 *   TYRE STACKS AND CASES, which are small, dark and numerous, and are what
 *   makes the ground under the awnings read as WORKED rather than as a lawn
 *   with tents on it.
 */
import * as THREE from 'three';
import { LAKE_Y, ROAD_SHOULDER, shoreX } from './basin.js';
import { clearsSegment } from '../../world/clearance.js';

function random(seed) {
  let s = seed >>> 0 || 1;
  s ^= s >>> 16; s = Math.imul(s, 0x7feb352d) >>> 0;
  s ^= s >>> 15; s = s >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

class Builder {
  constructor() { this.pos = []; this.col = []; this.idx = []; }
  box(cx, cy, cz, hw, h, hd, yaw, c) {
    const s = Math.sin(yaw), co = Math.cos(yaw);
    const pt = (dx, dy, dz) => {
      const n = this.pos.length / 3;
      this.pos.push(cx + dx * co - dz * s, cy + dy, cz + dx * s + dz * co);
      this.col.push(...c);
      return n;
    };
    const v = [];
    for (let i = 0; i < 8; i++) v.push(pt((i & 1) ? hw : -hw, (i & 2) ? h : 0, (i & 4) ? hd : -hd));
    const quad = (a, b, c2, d, k) => {
      this.idx.push(a, b, c2, a, c2, d);
      for (const i of [a, b, c2, d]) for (let j = 0; j < 3; j++) this.col[i * 3 + j] *= k;
    };
    quad(v[0], v[1], v[3], v[2], 0.82);
    quad(v[4], v[6], v[7], v[5], 1.14);
    quad(v[0], v[2], v[6], v[4], 0.92);
    quad(v[1], v[5], v[7], v[3], 1.00);
    this.idx.push(v[2], v[3], v[7], v[2], v[7], v[6]);
    this.idx.push(v[0], v[4], v[5], v[0], v[5], v[1]);
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

const TEAMS = [
  [0.560, 0.090, 0.075], [0.075, 0.180, 0.480], [0.640, 0.470, 0.055],
  [0.070, 0.330, 0.170], [0.420, 0.090, 0.360],
];
const STEEL = [0.290, 0.295, 0.300];
const RUBBER = [0.038, 0.038, 0.042];
const CRATE = [0.150, 0.145, 0.135];
const GRAVEL = [0.300, 0.288, 0.262];

export class LakeService {
  constructor(terrain, tier = 'high') {
    this.terrain = terrain;
    this.root = new THREE.Group();
    this.root.name = 'lake-service';
    this.materials = [];

    const b = new Builder();
    const rng = random(0x5e11ce);
    const trail = terrain.trail;
    const L = trail.length;
    const P = new THREE.Vector3(), T = new THREE.Vector3();
    const counts = { bays: 0, vehicles: 0, tyres: 0, crates: 0 };

    /* Just past the start gate, on the inland side and set well back — a
     * service park sits off the road, not on the shoulder. */
    trail.pointAt(0.012, P);
    trail.tangentAt(0.012, T);
    const yaw = Math.atan2(T.x, T.z);
    const ax = Math.cos(yaw), az = Math.sin(yaw);
    const nx = T.z, nz = -T.x;
    /* Which side is inland? The lake is to the west, so away from the shore. */
    const side = (P.x + nx * 20) - shoreX(P.z) > (P.x - nx * 20) - shoreX(P.z) ? 1 : -1;

    const ox = P.x + nx * side * (ROAD_SHOULDER + 16);
    const oz = P.z + nz * side * (ROAD_SHOULDER + 16);

    /* The apron, laid as a grid of thin slabs that each take their own ground
     * height — the wayside's lesson: one slab over sloping ground hovers at
     * one corner and buries itself at the other. */
    const AW = 30, AL = 26, GX = 12, GZ = 11;
    for (let i = 0; i < GX; i++) {
      for (let j = 0; j < GZ; j++) {
        const u = (i / (GX - 1) - 0.5) * AW, w = (j / (GZ - 1) - 0.5) * AL;
        const px = ox + nx * u + ax * w, pz = oz + nz * u + az * w;
        const shade = 0.88 + rng() * 0.26;
        b.box(px, terrain.height(px, pz) + 0.02, pz,
              AW / (GX - 1) * 0.62, 0.04, AL / (GZ - 1) * 0.62, yaw,
              GRAVEL.map((v) => v * shade));
      }
    }

    /* ── the bays ─────────────────────────────────────────────────────────
     * Four teams in a row facing the road, each an awning with a vehicle and
     * its kit under and beside it. */
    const BAYS = 4;
    for (let k = 0; k < BAYS; k++) {
      const team = TEAMS[k % TEAMS.length];
      const slot = (k - (BAYS - 1) / 2) * 7.2;
      const bx = ox + ax * slot, bz = oz + az * slot;
      const by = terrain.height(bx, bz);

      /* Awning: a canopy on four legs. The canopy is the loudest object here
       * and it is deliberately a single unbroken plane — a real event awning
       * is a printed sheet and reads as one colour from any distance. */
      const CW = 3.0, CD = 2.6, CH = 2.55;
      for (const [lx, lz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        const px = bx + ax * lx * CW * 0.92 + nx * lz * CD * 0.92;
        const pz = bz + az * lx * CW * 0.92 + nz * lz * CD * 0.92;
        b.box(px, terrain.height(px, pz), pz, 0.045, CH, 0.045, yaw, STEEL);
      }
      b.box(bx, by + CH, bz, CW, 0.075, CD, yaw, team);
      /* A valance hanging off the front edge, which is what stops a canopy
       * reading as a floating slab. */
      b.box(bx + nx * side * CD * 0.98, by + CH - 0.34, bz + nz * side * CD * 0.98,
            CW, 0.34, 0.04, yaw, team.map((v) => v * 0.86));

      /* The team's van, parked behind the awning, nose out. */
      const vx = bx - nx * side * 4.6, vz = bz - nz * side * 4.6;
      const vy = terrain.height(vx, vz);
      const vyaw = yaw + Math.PI / 2 + (rng() - 0.5) * 0.16;
      b.box(vx, vy + 0.34, vz, 2.7, 1.45, 1.02, vyaw, team.map((v) => v * 0.5 + 0.28));
      b.box(vx, vy + 0.34 + 1.45 * 0.58, vz, 2.55, 0.40, 1.05, vyaw, [0.045, 0.050, 0.058]);
      for (const s1 of [-1, 1]) for (const s2 of [-1, 1]) {
        const wx = vx + Math.cos(vyaw) * 1.75 * s1 - Math.sin(vyaw) * 1.02 * s2;
        const wz = vz + Math.sin(vyaw) * 1.75 * s1 + Math.cos(vyaw) * 1.02 * s2;
        b.box(wx, terrain.height(wx, wz), wz, 0.33, 0.62, 0.16, vyaw, RUBBER);
      }
      counts.vehicles++;

      /* Tyre stacks: four of a set, laid flat, which is how they are stored. */
      for (let s = 0; s < 2; s++) {
        const tx = bx + ax * (s ? 2.1 : -2.1) + nx * side * 1.4;
        const tz = bz + az * (s ? 2.1 : -2.1) + nz * side * 1.4;
        const ty = terrain.height(tx, tz);
        for (let n = 0; n < 4; n++) {
          b.box(tx, ty + n * 0.22, tz, 0.33, 0.21, 0.33, yaw + n * 0.3, RUBBER);
        }
        counts.tyres += 4;
      }
      /* Cases and a jack under the awning. */
      for (let c = 0; c < 3; c++) {
        const cx2 = bx + ax * (-1.6 + c * 1.5), cz2 = bz + az * (-1.6 + c * 1.5);
        const cy = terrain.height(cx2, cz2);
        b.box(cx2, cy, cz2, 0.34, 0.34 + rng() * 0.22, 0.26, yaw + (rng() - 0.5) * 0.5, CRATE);
        counts.crates++;
      }
      counts.bays++;
    }

    /* Keep the whole thing off the running surface. It is 30 m across and
     * sits 16 m out, so this should never fire — but the culvert headwalls
     * also should never have reached the seal, and they did. */
    const halfL = AL / 2;
    if (!clearsSegment(trail, ox - ax * halfL, oz - az * halfL,
                       ox + ax * halfL, oz + az * halfL,
                       ROAD_SHOULDER + 1.0 + AW / 2, 2.0)) {
      this.counts = { ...counts, rejected: true };
    }

    const geo = b.finish();
    this.geometry = geo;
    const mat = new THREE.MeshStandardMaterial({
      name: 'service', color: 0xffffff, vertexColors: true,
      roughness: 0.84, metalness: 0.0, envMapIntensity: 0.35,
    });
    this.materials.push(mat);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = 'service:park';
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

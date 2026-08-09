/* Roadworks: a length of the stage under repair.
 *
 * The frame-share audit killed the way I had been enriching this level.
 * Averaged over eight stations the road is 45.6% of the frame and the scatter
 * modules — bales, structures, wayside — are 0.06 to 0.10% each. Spreading
 * small objects along five kilometres puts nothing anywhere.
 *
 * What worked in the jungle was the opposite: a single set-piece measured at
 * ITS OWN station. The windthrow reads 17%, the slip 20%. So this is a
 * set-piece, it is on the road because road features are the ones that survive
 * this terrain, and it is the one thing every rural highway in the country has
 * that this stage did not:
 *
 *   IT NARROWS THE ROAD. Cones taking a lane away is the only event on five
 *   kilometres of seal that changes what the driver has to do. Everything else
 *   built here is looked at; this is driven through.
 *
 *   IT IS ORANGE. The palette is grey seal, green tussock, blue lake, white
 *   peaks. Fluorescent orange appears nowhere else and carries a long way.
 *
 *   IT HAS A REASON TO BE HERE. Loose chip, a heap of it, a roller that laid
 *   it and the signs that warn about it are one object telling one story, and
 *   the seal they are repairing is the surface the player has been driving on
 *   for two minutes.
 */
import * as THREE from 'three';
import { ROAD_SHOULDER } from './basin.js';

function random(seed) {
  let s = seed >>> 0 || 1;
  s ^= s >>> 16; s = Math.imul(s, 0x7feb352d) >>> 0;
  s ^= s >>> 15; s = s >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

const ORANGE = [0.860, 0.230, 0.020];
const WHITE  = [0.760, 0.755, 0.740];
const STEEL  = [0.300, 0.302, 0.306];
const CHIP   = [0.235, 0.222, 0.196];
const YELLOW = [0.820, 0.640, 0.040];
const TAR    = [0.055, 0.053, 0.056];

export class LakeRoadworks {
  constructor(terrain, tier = 'high', collision = null) {
    this.root = new THREE.Group();
    this.root.name = 'lake-roadworks';
    this.materials = [];

    const rng = random(0x20d19c);
    const trail = terrain.trail;
    const pos = [], col = [], idx = [];
    let cones = 0, signs = 0, heaps = 0;

    const box = (cx, cy, cz, hw, h, hd, yaw, c, tone = 0.10) => {
      const s = Math.sin(yaw), co = Math.cos(yaw);
      const base = pos.length / 3;
      for (let i = 0; i < 8; i++) {
        const dx = (i & 1) ? hw : -hw, dy = (i & 2) ? h : 0, dz = (i & 4) ? hd : -hd;
        pos.push(cx + dx * co - dz * s, cy + dy, cz + dx * s + dz * co);
        const v = 1 - tone * 0.5 + rng() * tone;
        col.push(c[0] * v, c[1] * v, c[2] * v);
      }
      const F = [[0,1,3,2],[4,6,7,5],[0,2,6,4],[1,5,7,3],[2,3,7,6],[0,4,5,1]];
      const SH = [0.80, 1.20, 0.88, 1.02, 1.06, 0.84];
      F.forEach((f, k) => {
        idx.push(base+f[0], base+f[1], base+f[2], base+f[0], base+f[2], base+f[3]);
        for (const vi of f) for (let j = 0; j < 3; j++) col[(base+vi)*3+j] *= SH[k] ** 0.45;
      });
    };
    /* A cone: a tapered hexagonal spike with a white band. Six sides is plenty
     * at the distance one is ever seen from, and the band is what makes it
     * read as a cone rather than as an orange stick. */
    const cone = (cx, gy, cz, lean) => {
      const SIDES = 6, R = 0.19, H = 0.70;
      const rings = [];
      for (let k = 0; k <= 3; k++) {
        const f = k / 3;
        const r = R * (1 - f * 0.86);
        const y = gy + H * f;
        const base = pos.length / 3;
        for (let s = 0; s < SIDES; s++) {
          const a = (s / SIDES) * Math.PI * 2;
          pos.push(cx + Math.cos(a) * r + lean * f * 0.22,
                   y, cz + Math.sin(a) * r + lean * f * 0.1);
          /* The reflective band sits in the middle third. */
          const c = (f > 0.30 && f < 0.62) ? WHITE : ORANGE;
          const v = 0.86 + rng() * 0.24;
          col.push(c[0] * v, c[1] * v, c[2] * v);
        }
        rings.push(base);
      }
      for (let k = 0; k < 3; k++) {
        for (let s = 0; s < SIDES; s++) {
          const n = (s + 1) % SIDES;
          idx.push(rings[k]+s, rings[k+1]+s, rings[k]+n);
          idx.push(rings[k]+n, rings[k+1]+s, rings[k+1]+n);
        }
      }
      /* The square foot, which is most of a cone's silhouette from low down. */
      box(cx, gy - 0.01, cz, 0.24, 0.035, 0.24, rng() * 1.5, ORANGE, 0.16);
      cones++;
    };

    const P = new THREE.Vector3(), T = new THREE.Vector3();
    /* Sited on the straight before the last splits, where the driver has speed
     * and the narrowing costs something. */
    /* LONGER, BECAUSE A REAL CLOSURE IS. The first cut ran 0.545 to 0.585 —
     * about 200 m — and measured 5.17% of frame at its best station against a
     * bar of 6, visible from two stations and gone. That is not what reseal
     * works look like: a crew shuts a kilometre or more at a time, because the
     * cost is in setting the closure up, not in its length. Making it right
     * and making it read are the same edit here. */
    const T0 = 0.530, T1 = 0.650;
    trail.pointAt(T0, P);
    const startY = terrain.height(P.x, P.z);

    /* Which lane is shut? The lake side, so the cones stand between the driver
     * and the view — a taper that closes the outside of a bend is the one a
     * driver actually has to respond to. */
    trail.tangentAt(T0, T);
    const side = (Math.abs(P.x) > Math.abs(P.x + T.z * 5)) ? 1 : -1;

    /* THE TAPER. Cones do not sit in a line; they walk in from the shoulder to
     * the centreline over about forty metres and then hold. Getting the taper
     * right is the whole difference between roadworks and a row of cones. */
    const nSteps = 96;
    for (let k = 0; k < nSteps; k++) {
      const f = k / (nSteps - 1);
      const t = T0 + (T1 - T0) * f;
      trail.pointAt(t, P); trail.tangentAt(t, T);
      const nx = T.z, nz = -T.x;
      /* In over the first third, then parallel to the centreline. */
      const taper = Math.min(1, f / 0.11);
      const out = (ROAD_SHOULDER - 0.35) * (1 - taper) + 0.35 * taper;
      const cx = P.x + nx * side * out, cz = P.z + nz * side * out;
      cone(cx, terrain.height(cx, cz), cz, (rng() - 0.5) * 0.35);
    }

    /* The heap of chip and the strip of fresh tar it is going onto — the
     * reason the lane is shut. Inside the coned area, never outside it. */
    for (let k = 0; k < 46; k++) {
      const f = 0.42 + rng() * 0.5;
      const t = T0 + (T1 - T0) * f;
      trail.pointAt(t, P); trail.tangentAt(t, T);
      const nx = T.z, nz = -T.x;
      const out = 0.9 + rng() * (ROAD_SHOULDER - 1.1);
      const cx = P.x + nx * side * out, cz = P.z + nz * side * out;
      const gy = terrain.height(cx, cz);
      /* PROUD OF THE SEAL, NOT FLUSH WITH IT. At 0.05 m minimum height these
       * lay flat and read as HOLES in the road rather than as heaps of chip on
       * it — a dark patch at road level is a pothole to the eye no matter what
       * it is called in the source. Lifting the floor to 0.16 m and paling the
       * colour gives each one a lit top face and a shadowed side, which is the
       * whole of what makes a heap a heap. */
      /* SMALL AND DARK. Lifting them off the seal stopped them reading as
       * potholes and immediately created the opposite fault: at up to 2.1 m
       * across and 1.45x the chip colour they became pale slabs stacked on the
       * road, which read as concrete debris. A heap of sealing chip is a metre
       * or so across, knee high, and barely lighter than the road it is going
       * onto — it is the same stone. Correcting one property without
       * re-checking the other, for the third time this session. */
      box(cx, gy + 0.01, cz, 0.34 + rng() * 0.62, 0.14 + rng() * 0.22, 0.32 + rng() * 0.58,
          rng() * 3.1, CHIP.map((v) => v * 1.12), 0.30);
      heaps++;
    }
    /* Fresh seal: a dark strip the chip is being spread over. */
    for (let k = 0; k < 34; k++) {
      const f = k / 33;
      const t = T0 + (T1 - T0) * (0.30 + f * 0.66);
      trail.pointAt(t, P); trail.tangentAt(t, T);
      const nx = T.z, nz = -T.x;
      const out = 1.55;
      const cx = P.x + nx * side * out, cz = P.z + nz * side * out;
      box(cx, terrain.height(cx, cz) + 0.012, cz, 1.15, 0.012, 1.9,
          Math.atan2(T.x, T.z), TAR, 0.10);
    }

    /* SIGNS. A board on two legs, facing back down the road at the driver.
     * Three of them: the warning, the speed, and the one at the taper. */
    const sign = (t, aheadOffset, w, h, face, post) => {
      trail.pointAt(t, P); trail.tangentAt(t, T);
      const nx = T.z, nz = -T.x;
      const cx = P.x + nx * side * aheadOffset, cz = P.z + nz * side * aheadOffset;
      const gy = terrain.height(cx, cz);
      const yaw = Math.atan2(T.x, T.z);
      for (const s of [-1, 1]) {
        box(cx + T.x * 0 + Math.cos(yaw) * s * (w * 0.38),
            gy, cz - Math.sin(yaw) * s * (w * 0.38),
            0.035, 0.95, 0.035, yaw, post, 0.10);
      }
      box(cx, gy + 0.95, cz, w * 0.5, h, 0.04, yaw, face, 0.06);
      signs++;
    };
    sign(T0 - 0.030, ROAD_SHOULDER + 0.55, 0.90, 0.90, YELLOW, STEEL);
    sign(T0 - 0.014, ROAD_SHOULDER + 0.55, 0.72, 0.72, WHITE, STEEL);
    sign(T0 + 0.002, ROAD_SHOULDER + 0.45, 0.80, 0.55, ORANGE, STEEL);

    /* The roller. A drum, a frame and a cab-less seat — enough at this
     * distance, and it is parked inside the closure where a real one lives. */
    {
      const t = T0 + (T1 - T0) * 0.72;
      trail.pointAt(t, P); trail.tangentAt(t, T);
      const nx = T.z, nz = -T.x;
      const cx = P.x + nx * side * 1.6, cz = P.z + nz * side * 1.6;
      const gy = terrain.height(cx, cz);
      const yaw = Math.atan2(T.x, T.z);
      box(cx, gy, cz, 0.62, 1.05, 1.05, yaw, YELLOW, 0.10);
      box(cx, gy + 1.05, cz, 0.42, 0.55, 0.55, yaw, YELLOW, 0.10);
      /* Two drums, drawn as wide flat boxes — a torus is wasted here. */
      for (const s of [-1, 1]) {
        box(cx + T.x * s * 1.15, gy - 0.02, cz + T.z * s * 1.15,
            0.60, 0.62, 0.60, yaw, STEEL, 0.08);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    this.geometry = geo;

    const mat = new THREE.MeshStandardMaterial({
      name: 'roadworks', color: 0xffffff, vertexColors: true,
      roughness: 0.68, metalness: 0.06, envMapIntensity: 0.40,
    });
    this.materials.push(mat);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = 'roadworks:closure';
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.root.add(mesh);

    /* CONES ARE FRANGIBLE AND GET NO COLLIDER — the same rule as the fence
     * wire, the marker posts and the chevrons. A cone stops nothing; hitting
     * one at 130 is a cone across the paddock, and a car that bounces off a
     * traffic cone is worse than no roadworks at all. The roller and the sign
     * posts are solid, because those are the things that would actually stop
     * a car, and putting them in keeps the closure honest: the way through is
     * the open lane. */
    if (collision) {
      const t = T0 + (T1 - T0) * 0.72;
      trail.pointAt(t, P); trail.tangentAt(t, T);
      const nx = T.z, nz = -T.x;
      const cx = P.x + nx * side * 1.6, cz = P.z + nz * side * 1.6;
      collision.addCapsule({
        ax: cx - T.x * 1.2, az: cz - T.z * 1.2,
        bx: cx + T.x * 1.2, bz: cz + T.z * 1.2,
        radius: 0.85,
        minY: terrain.height(cx, cz) - 1.0,
        maxY: terrain.height(cx, cz) + 1.8,
        kind: 'roller',
      });
    }

    this.counts = { cones, signs, chipHeaps: heaps, fromT: T0, toT: T1,
                    triangles: idx.length / 3 };
  }

  update() {}
  setTier() {}
  cullAround() {}
  stats() { return this.counts; }
  dispose() { this.geometry.dispose(); this.materials.forEach((m) => m.dispose()); }
}

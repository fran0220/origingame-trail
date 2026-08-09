/* Guardrail, wherever the ground falls away.
 *
 * Two dead ends taught this module where to stand. A centre-pivot irrigator
 * needed open paddock the basin does not have in view; a rock cutting needed
 * the terrain DUG, which cannot be done from a mesh, so it swung between
 * monoliths standing on a lawn and slabs buried in the grass — and the schist
 * it was imitating is already supplied by rock.js. Both failed for the same
 * underlying reason: they were features of the GROUND, and the ground here is
 * not mine to change.
 *
 * A guardrail is a feature of the ROAD. It stands on the shoulder, on posts,
 * on whatever surface is there, and it is correct in every case:
 *
 *   IT IS THE LONGEST CONTINUOUS LINE IN THE LEVEL. W-section rail runs for
 *   hundreds of metres unbroken at bumper height, half a metre outside the
 *   white line. At 130 km/h it is the fastest-moving thing in the frame, which
 *   is the one visual cue a racing stage genuinely needs and this one lacked
 *   entirely — everything built so far is scenery standing still.
 *
 *   IT IS WHERE THE DROP IS. Real barrier is not decoration; it goes where
 *   leaving the road would be serious. Here that is the lake side wherever the
 *   ground falls away toward the water, and placing it by measuring the fall
 *   is what stops it becoming a fence around the whole stage.
 *
 *   IT IS SOLID, AND IT MATTERS. The colliders already stop the car; this is
 *   the first one the player will actually be grateful for, because it is the
 *   difference between a mistake at the lake edge and a swim.
 */
import * as THREE from 'three';
import { LAKE_Y, ROAD_SHOULDER, shoreX } from './basin.js';

function random(seed) {
  let s = seed >>> 0 || 1;
  s ^= s >>> 16; s = Math.imul(s, 0x7feb352d) >>> 0;
  s ^= s >>> 15; s = s >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

const GALV = [0.520, 0.528, 0.534];
const POST = [0.395, 0.400, 0.406];

export class LakeGuardrail {
  constructor(terrain, tier = 'high', collision = null) {
    this.root = new THREE.Group();
    this.root.name = 'lake-guardrail';
    this.materials = [];

    const rng = random(0x6a11e2);
    const trail = terrain.trail;
    const pos = [], col = [], idx2 = [];
    let posts = 0, runs = 0, panels = 0;

    const box = (cx, cy, cz, hw, h, hd, yaw, cc, tone = 0.10) => {
      const s = Math.sin(yaw), co = Math.cos(yaw);
      const base = pos.length / 3;
      for (let i = 0; i < 8; i++) {
        const dx = (i & 1) ? hw : -hw, dy = (i & 2) ? h : 0, dz = (i & 4) ? hd : -hd;
        pos.push(cx + dx * co - dz * s, cy + dy, cz + dx * s + dz * co);
        const v = 1 - tone * 0.5 + rng() * tone;
        col.push(cc[0] * v, cc[1] * v, cc[2] * v);
      }
      const F = [[0,1,3,2],[4,6,7,5],[0,2,6,4],[1,5,7,3],[2,3,7,6],[0,4,5,1]];
      const SH = [0.80, 1.20, 0.88, 1.02, 1.06, 0.84];
      F.forEach((f, k) => {
        idx2.push(base+f[0], base+f[1], base+f[2], base+f[0], base+f[2], base+f[3]);
        for (const vi of f) for (let j = 0; j < 3; j++) col[(base+vi)*3+j] *= SH[k] ** 0.45;
      });
    };

    const P = new THREE.Vector3(), T = new THREE.Vector3();
    /* 4 m post spacing is the real standard and it matters here: the posts are
     * what turn a bare rail into a strobe as the car passes. */
    const SPACING = 4.0;
    const totalLen = trail.length;
    const STEP = SPACING / totalLen;

    /* WHERE THE FALL IS — AND THE INSTRUMENT WAS FIRST AIMED AT THE WRONG
     * DISTANCE. Sampling the drop at exactly 10 m out gave a median of MINUS
     * 0.83 m (the ground rises) and only 2 samples in 600 past 2.2 m, so the
     * first build produced one run of nine posts in the whole stage. Scanning
     * 10 to 60 m instead: 163 of 600 past 2.2 m, deepest 7.71 m. The drop was
     * always there; the road is simply set back from the lip.
     *
     * But a fall 60 m away warrants no barrier — nobody guards a paddock. What
     * matters is whether the drop is NEAR, so take the worst fall within 26 m,
     * which is about as far as a car leaving the seal at speed will travel
     * before the ground decides the outcome. */
    const needs = (t) => {
      trail.pointAt(t, P); trail.tangentAt(t, T);
      const nx = T.z, nz = -T.x;
      const roadY = terrain.height(P.x, P.z);
      /* MEASURE BOTH SIDES AND TAKE THE ONE THAT FALLS. The side used to be
       * chosen by geometry — whichever way is toward the lake — and only THEN
       * was the fall measured on it. Rendering the first run showed the rail
       * standing on the inland edge with the lake safely on the far side of
       * the road, which is what that code deserved: it had decided the answer
       * before it took the reading. Where the road runs a ridge the drop is
       * inland, and a barrier belongs on whichever side would hurt. */
      let fall = 0, side = 1;
      for (const s of [-1, 1]) {
        for (const d of [10, 18, 26]) {
          const f = roadY - terrain.height(P.x + nx * s * d, P.z + nz * s * d);
          if (f > fall) { fall = f; side = s; }
        }
      }
      return { fall, side };
    };

    /* Build in RUNS. A barrier that flickers on and off every few posts is
     * neither real nor useful; find contiguous stretches and put a flared end
     * terminal on each, which is the detail that says highway rather than
     * fence. */
    const marks = [];
    for (let t = 0.01; t < 0.99; t += STEP) marks.push({ t, ...needs(t) });
    let i = 0;
    while (i < marks.length) {
      if (marks[i].fall < 2.0) { i++; continue; }
      let j = i;
      /* A RUN IS ONE SIDE OF THE ROAD. Once the fall was measured on both
       * sides, the side became a per-post decision, and a run that started on
       * the lake could continue on the inland verge — 494 posts in two runs,
       * with the rail free to hop across the seal wherever the deeper drop
       * changed hands. Break the run when the side changes. */
      while (j < marks.length && marks[j].fall >= 1.1
             && marks[j].side === marks[i].side) j++;
      /* Under six posts is a stub; skip it. */
      if (j - i >= 6) {
        for (let k = i; k < j; k++) {
          const m = marks[k];
          trail.pointAt(m.t, P); trail.tangentAt(m.t, T);
          const nx = T.z, nz = -T.x;
          const out = ROAD_SHOULDER + 0.85;
          const bx = P.x + nx * m.side * out, bz = P.z + nz * m.side * out;
          const gy = terrain.height(bx, bz);
          const yaw = Math.atan2(T.x, T.z);
          /* Post: a channel section, 0.72 m proud. */
          box(bx, gy - 0.55, bz, 0.055, 1.27, 0.075, yaw, POST);
          posts++;
          if (k < j - 1) {
            const m2 = marks[k + 1];
            trail.pointAt(m2.t, P); trail.tangentAt(m2.t, T);
            const nx2 = T.z, nz2 = -T.x;
            const cx2 = P.x + nx2 * m2.side * out, cz2 = P.z + nz2 * m2.side * out;
            const gy2 = terrain.height(cx2, cz2);
            const mx = (bx + cx2) / 2, mz = (bz + cz2) / 2;
            const seg = Math.hypot(cx2 - bx, cz2 - bz);
            const segYaw = Math.atan2(cx2 - bx, cz2 - bz);
            /* W-section: two ribs with a valley between, which is what makes
             * a guardrail catch a highlight along its whole length instead of
             * reading as a grey stripe. */
            for (const dy of [0.50, 0.78]) {
              box(mx, (gy + gy2) / 2 + dy, mz, seg * 0.5, 0.13, 0.035,
                  segYaw + Math.PI / 2, GALV, 0.07);
              panels++;
            }
            box(mx, (gy + gy2) / 2 + 0.63, mz, seg * 0.5, 0.06, 0.055,
                segYaw + Math.PI / 2, GALV.map((v) => v * 0.72), 0.06);
          }
        }
        /* Flared terminals: the rail turns away and dives into the ground at
         * each end rather than stopping in mid-air. */
        for (const endK of [i, j - 1]) {
          const m = marks[endK];
          trail.pointAt(m.t, P); trail.tangentAt(m.t, T);
          const nx = T.z, nz = -T.x;
          const dir = endK === i ? -1 : 1;
          const ex = P.x + T.x * dir * 3 + nx * m.side * (ROAD_SHOULDER + 1.9);
          const ez = P.z + T.z * dir * 3 + nz * m.side * (ROAD_SHOULDER + 1.9);
          box(ex, terrain.height(ex, ez) + 0.10, ez, 1.9, 0.13, 0.035,
              Math.atan2(T.x, T.z) + Math.PI / 2 + dir * 0.42, GALV, 0.07);
        }
        if (collision) {
          /* ONE CAPSULE PER SPAN, NOT ONE PER RUN. A single capsule from the
           * first post to the last is a straight chord, and these runs are
           * hundreds of metres of curving road — the chord would cut across
           * the carriageway and the lap gate would drive into a wall that is
           * not there. Capsules are cheap; geometry that lies is not. */
          for (let k = i; k < j - 1; k++) {
            trail.pointAt(marks[k].t, P); trail.tangentAt(marks[k].t, T);
            let nx = T.z, nz = -T.x;
            const sx = P.x + nx * marks[k].side * (ROAD_SHOULDER + 0.85);
            const sz = P.z + nz * marks[k].side * (ROAD_SHOULDER + 0.85);
            trail.pointAt(marks[k + 1].t, P); trail.tangentAt(marks[k + 1].t, T);
            nx = T.z; nz = -T.x;
            const ex = P.x + nx * marks[k + 1].side * (ROAD_SHOULDER + 0.85);
            const ez = P.z + nz * marks[k + 1].side * (ROAD_SHOULDER + 0.85);
            collision.addCapsule({
              ax: sx, az: sz, bx: ex, bz: ez, radius: 0.20,
              minY: terrain.height(sx, sz) - 1.0,
              maxY: terrain.height(sx, sz) + 1.0,
              kind: 'guardrail',
            });
          }
        }
        runs++;
      }
      i = j;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setIndex(idx2);
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    this.geometry = geo;

    const mat = new THREE.MeshStandardMaterial({
      name: 'guardrail', color: 0xffffff, vertexColors: true,
      roughness: 0.38, metalness: 0.62, envMapIntensity: 0.55,
    });
    this.materials.push(mat);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = 'guardrail:run';
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.root.add(mesh);

    this.counts = { runs, posts, panels, triangles: idx2.length / 3 };
  }

  update() {}
  setTier() {}
  cullAround() {}
  stats() { return this.counts; }
  dispose() { this.geometry.dispose(); this.materials.forEach((m) => m.dispose()); }
}

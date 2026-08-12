/* The bush tramway the forest took back.
 *
 * The jungle's feature layers measure 2.3 and 2.8% of frame at t = 0.025 and
 * 0.125 — the thinnest stretch of the walk, and the first thing any player
 * ever sees. The end of this level is a ruin being pulled apart by roots. The
 * start should promise that, not just be trees.
 *
 * Every large tract of cut-over bush in this country has a tramway formation
 * in it: a narrow-gauge timber line, laid on split sleepers, that hauled logs
 * out and was abandoned where it stood when the stand was worked out. Eighty
 * years later the rails are still there, because nobody carries steel out of a
 * valley they have finished with.
 *
 * WHY IT EARNS THE OPENING:
 *
 *   IT CROSSES THE TRACK. Same argument as the windthrow, which measures 17%:
 *   an object the player walks OVER cannot be missed, and the track climbing
 *   over a formation and down the other side is a moment rather than scenery.
 *
 *   IT IS TWO PARALLEL LINES, DEAD STRAIGHT, in a place with none. A forest
 *   has no straight lines and no repetition; sleepers at a fixed spacing
 *   running away into the undergrowth is the strongest possible signal that
 *   something was BUILT here, and it reads before any single object in it is
 *   identifiable.
 *
 *   IT IS RUST. This level is green, brown-black and pale timber. Oxidised
 *   steel is the only warm colour in it, and rust on a rail head is polished
 *   where the wheels ran and rough everywhere else.
 *
 * And it foreshadows the ruins: the same people, the same forest, the far end
 * of the same story, at the near end of the walk.
 */
import * as THREE from 'three';

function random(seed) {
  let s = seed >>> 0 || 1;
  s ^= s >>> 16; s = Math.imul(s, 0x7feb352d) >>> 0;
  s ^= s >>> 15; s = s >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

const RUST = [0.232, 0.116, 0.056];
/* THE RAIL HEAD IS POLISHED STEEL, NOT RUST, AND THAT IS BOTH TRUER AND THE
 * ONLY THING THAT MAKES THIS OBJECT READ. At 0.246/0.168/0.118 it was a brown
 * line on a brown forest floor and the whole formation measured 3.95% of frame
 * against a bar of 4 — dark detail on a dark surface has no edge at any size.
 *
 * And rust is the wrong description anyway. The top of a rail is the one
 * surface on a tramway that never oxidises: the wheels wore it bright, and on
 * an abandoned line it stays bright for decades because the flange face is
 * burnished steel sheltered by its own overhang. Two dark rust flanks with a
 * bright strip along the top is what you actually see in the bush, and it is
 * exactly the contrast this dark level needs. */
const RAILHEAD = [0.560, 0.548, 0.520];
const SLEEPER = [0.070, 0.058, 0.042];
const MOSS = [0.052, 0.086, 0.040];

export class JungleTramway {
  constructor(terrain, trail, tier = 'high', collision = null) {
    this.root = new THREE.Group();
    this.root.name = 'jungle-tramway';
    this.materials = [];

    const rng = random(0x7a11e5);
    const pos = [], col = [], idx = [];
    let sleepers = 0, railSpans = 0, relics = 0;

    const box = (cx, cy, cz, hw, h, hd, yaw, c, tone = 0.16) => {
      const s = Math.sin(yaw), co = Math.cos(yaw);
      const base = pos.length / 3;
      for (let i = 0; i < 8; i++) {
        const dx = (i & 1) ? hw : -hw, dy = (i & 2) ? h : 0, dz = (i & 4) ? hd : -hd;
        pos.push(cx + dx * co - dz * s, cy + dy, cz + dx * s + dz * co);
        const v = 1 - tone * 0.5 + rng() * tone;
        col.push(c[0] * v, c[1] * v, c[2] * v);
      }
      const F = [[0,1,3,2],[4,6,7,5],[0,2,6,4],[1,5,7,3],[2,3,7,6],[0,4,5,1]];
      const SH = [0.78, 1.22, 0.88, 1.02, 1.06, 0.82];
      F.forEach((f, k) => {
        idx.push(base+f[0], base+f[1], base+f[2], base+f[0], base+f[2], base+f[3]);
        for (const vi of f) for (let j = 0; j < 3; j++) col[(base+vi)*3+j] *= SH[k] ** 0.45;
      });
    };

    const P = new THREE.Vector3(), T = new THREE.Vector3();

    /* A TRAMWAY IS NOT A 26 m OBJECT. The first cut laid one straight 26 m
     * crossing and it measured 4.1% of frame at exactly ONE station against a
     * bar of two — correct in every detail and gone in three paces. That is
     * not what a tramway is. It followed the valley for kilometres, and so
     * does the walking track, which is why so many tracks in this country are
     * built along an old formation: the surveyor already found the easy grade
     * once and nobody was going to find a better one.
     *
     * So the line now runs WITH the trail from t = 0.03 to 0.22, drifting in
     * and out on a slow lateral wander and crossing it once in the middle.
     * Same object, told the way it actually sits in a valley, and the drift is
     * what turns it from a prop into a piece of country. */
    const T0 = 0.03, T1 = 0.22;
    const GAUGE = 1.00;
    const SLEEPER_SPACING = 0.85;

    /* Where the formation sits, laterally, at parameter t. One slow swing
     * through zero: it comes in from the left, crosses, and drifts away right.
     * Crossing at a shallow angle is what makes the player walk ALONG it for a
     * while rather than step over it, which is the difference between noticing
     * a line and following one. */
    const lateral = (s) => -8.5 * Math.sin((s - 0.125) * 16.535);
    /* ARITHMETIC BEFORE CODE, WHICH I DID NOT DO THE FIRST TIME. The previous
     * expression was sin((t - 0.42) * 2.35) * 9.5, and over the run t = 0.03
     * to 0.22 that evaluates to -7.54, -6.81, -6.07, -5.27, -4.30 m. It NEVER
     * CROSSES ZERO. The line sat four to eight metres off to one side for its
     * whole length, which in bush this dense means permanently behind
     * something, and the measurement fell from 4.1% to 1.93% — worse than the
     * single 26 m crossing it replaced.
     *
     * 16.535 is pi / 0.19, so the half-cycle spans exactly the run: +8.5 m at
     * the start, through zero at t = 0.125, to -8.5 m at the end. The player
     * meets it coming in from one side, walks over it, and watches it drift
     * away on the other. Ten seconds of arithmetic in a scratchpad would have
     * caught this before a line of it was written. */

    const centre = (s, out) => {
      trail.pointAt(s, P); trail.tangentAt(s, T);
      const off = lateral(s);
      out.x = P.x + T.z * off;
      out.z = P.z - T.x * off;
      out.yaw = Math.atan2(T.x, T.z);
      return out;
    };

    /* Walk the formation in even ground-distance steps rather than even t, so
     * sleeper spacing stays 0.85 m through the bends instead of bunching. */
    const nodes = [];
    {
      const c = { x: 0, z: 0, yaw: 0 };
      let prev = null, acc = 0;
      for (let s = T0; s <= T1; s += 0.0006) {
        centre(s, c);
        if (prev) {
          acc += Math.hypot(c.x - prev.x, c.z - prev.z);
          if (acc >= SLEEPER_SPACING) {
            const yaw2 = Math.atan2(c.x - prev.x, c.z - prev.z);
            nodes.push({ x: c.x, z: c.z, yaw: yaw2 });
            acc = 0;
          }
        }
        prev = { x: c.x, z: c.z };
      }
    }

    /* The formation: a low bench of spoil the line was laid on, still readable
     * as a raised ribbon under the litter. It is what makes the rails look
     * laid rather than dropped. */
    for (let k = 0; k < nodes.length; k += 2) {
      const n = nodes[k];
      box(n.x, terrain.height(n.x, n.z) - 0.05, n.z, 1.55, 0.16 + rng() * 0.07, 0.90,
          n.yaw + Math.PI / 2, [0.061, 0.052, 0.038], 0.22);
    }

    for (const n of nodes) {
      const gy = terrain.height(n.x, n.z);
      /* Sleepers rot from the ends in and sink unevenly; a rank of identical
       * ones lying flat is the giveaway of a repeated primitive. */
      const sink = rng() * 0.06;
      const tilt = (rng() - 0.5) * 0.09;
      const c = SLEEPER.map((v, j) => v + MOSS[j] * (rng() < 0.45 ? 0.5 + rng() * 0.5 : 0));
      box(n.x, gy - 0.02 - sink, n.z, 0.90, 0.09, 0.075, n.yaw + Math.PI / 2 + tilt, c, 0.30);
      sleepers++;
    }

    /* The rails, as spans between sleeper nodes so they follow the ground and
     * the curve, and broken in places — a line that is continuous for its
     * whole length was never abandoned. */
    for (const side of [-1, 1]) {
      let k = 0;
      while (k < nodes.length - 1) {
        const span = 2 + ((rng() * 4) | 0);
        const k1 = Math.min(nodes.length - 1, k + span);
        if (rng() > 0.16) {
          const a = nodes[k], b = nodes[k1];
          const anx = Math.cos(a.yaw), anz = -Math.sin(a.yaw);
          const bnx = Math.cos(b.yaw), bnz = -Math.sin(b.yaw);
          const sx = a.x + anx * side * GAUGE * 0.5, sz = a.z + anz * side * GAUGE * 0.5;
          const ex = b.x + bnx * side * GAUGE * 0.5, ez = b.z + bnz * side * GAUGE * 0.5;
          const mx = (sx + ex) / 2, mz = (sz + ez) / 2;
          const gy = (terrain.height(sx, sz) + terrain.height(ex, ez)) / 2;
          const len = Math.hypot(ex - sx, ez - sz);
          const segYaw = Math.atan2(ex - sx, ez - sz);
          /* Web and head. The head is the polished one. */
          box(mx, gy + 0.07, mz, len * 0.5, 0.055, 0.018, segYaw + Math.PI / 2, RUST, 0.20);
          box(mx, gy + 0.123, mz, len * 0.5, 0.022, 0.034, segYaw + Math.PI / 2, RAILHEAD, 0.07);
          railSpans++;
        }
        k = k1;
      }
    }

    /* Relics beside the formation: a jack, a stack of spare sleepers gone to
     * moss, a bogie wheel off its axle. Two or three objects are what turn a
     * line into a place where people worked. */
    for (let k = 0; k < 22; k++) {
      const n = nodes[(rng() * nodes.length) | 0];
      if (!n) continue;
      const off = (rng() < 0.5 ? -1 : 1) * (1.5 + rng() * 2.2);
      const rx = n.x + Math.cos(n.yaw) * off, rz = n.z - Math.sin(n.yaw) * off;
      const gy = terrain.height(rx, rz);
      if (rng() < 0.45) {
        /* Stacked sleepers, three high, gone green. */
        for (let s = 0; s < 3; s++) {
          box(rx, gy + s * 0.11, rz, 0.85, 0.10, 0.08,
              n.yaw + Math.PI / 2 + (rng() - 0.5) * 0.2,
              SLEEPER.map((v, j) => v + MOSS[j] * 0.9), 0.28);
        }
      } else {
        /* A wheel: a squat octagonal disc on its side in the litter. */
        const r = 0.26 + rng() * 0.1;
        const base = pos.length / 3;
        for (let ring = 0; ring < 2; ring++) {
          for (let s = 0; s < 8; s++) {
            const a2 = (s / 8) * Math.PI * 2;
            pos.push(rx + Math.cos(a2) * r, gy + 0.04 + ring * 0.09 + Math.sin(a2) * r * 0.12,
                     rz + Math.sin(a2) * r);
            const v = 0.8 + rng() * 0.4;
            col.push(RUST[0] * v, RUST[1] * v, RUST[2] * v);
          }
        }
        for (let s = 0; s < 8; s++) {
          const n2 = (s + 1) % 8;
          idx.push(base + s, base + 8 + s, base + n2);
          idx.push(base + n2, base + 8 + s, base + 8 + n2);
        }
      }
      relics++;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    this.geometry = geo;

    const mat = new THREE.MeshStandardMaterial({
      name: 'tramway', color: 0xffffff, vertexColors: true,
      roughness: 0.55, metalness: 0.45, envMapIntensity: 0.45,
    });
    this.materials.push(mat);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = 'tramway:formation';
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.root.add(mesh);

    /* NO COLLIDER ON THE RAILS. They are 0.25 m high and the player walks over
     * them, which is the entire point of putting the line across the track —
     * fencing them off would be the same error as fencing the road. The
     * sleeper stacks are 0.33 m and equally steppable. Recorded here so the
     * solidity audit's silence is a decision and not an oversight. */

    this.counts = { sleepers, railSpans, relics, gaugeM: GAUGE, fromT: T0, toT: T1,
                    triangles: idx.length / 3 };
  }

  update() {}
  setTier() {}
  cullAround() {}
  stats() { return this.counts; }
  dispose() { this.geometry.dispose(); this.materials.forEach((m) => m.dispose()); }
}

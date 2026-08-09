/* Boardwalk over the wet.
 *
 * A rainforest track is not a path through a forest, it is a piece of
 * infrastructure: in this country a Department of Conservation track is
 * boardwalk wherever the ground holds water, because a boot in wet humus
 * destroys the root mat and the track becomes a trench within a season.
 * Anyone who has walked one has spent most of the walk looking at timber.
 *
 * WHERE IT GOES WAS MEASURED, NOT CHOSEN, and the first thing measured was
 * something else entirely. The obvious feature for a bush track is STEPS, so I
 * sampled the trail's gradient: median 0.024, ninetieth percentile 0.069, and
 * a maximum of 0.128 over the whole 424 m. There is no steep ground here at
 * all, and a flight of steps would have been an invention laid on top of a
 * flat walk. The wetness field tells a different story — 8.5% of the trail
 * sits above 0.5, peaking at 0.8 — and that is what this is built from.
 *
 * The field is the same one that darkens the ground texture and drives the
 * squelch in the footstep audio, so the boardwalk appears exactly where the
 * track already looks and sounds soaked. Three systems, one truth.
 */
import * as THREE from 'three';

function random(seed) {
  let s = seed >>> 0 || 1;
  s ^= s >>> 16; s = Math.imul(s, 0x7feb352d) >>> 0;
  s ^= s >>> 15; s = s >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

const WET_ON = 0.45;
/* Deck half-width. Shared by the builder and by covers(), so the geometry and
 * the audio cannot disagree about where the deck is. */
const HALF_W_PUBLIC = 0.52;

export class JungleTrackwork {
  constructor(terrain, trail, tier = 'high') {
    this.root = new THREE.Group();
    this.root.name = 'jungle-trackwork';
    this.materials = [];

    const rng = random(0x7ac1a0);
    const pos = [], col = [], idx = [];
    const P = new THREE.Vector3(), T = new THREE.Vector3();
    const L = trail.length;
    const q = {};
    let runs = 0, planks = 0, piles = 0;

    const box = (cx, cy, cz, hw, h, hd, yaw, c) => {
      const s = Math.sin(yaw), co = Math.cos(yaw);
      const base = pos.length / 3;
      for (let i = 0; i < 8; i++) {
        const dx = (i & 1) ? hw : -hw, dy = (i & 2) ? h : 0, dz = (i & 4) ? hd : -hd;
        pos.push(cx + dx * co - dz * s, cy + dy, cz + dx * s + dz * co);
        col.push(...c);
      }
      const F = [[0,1,3,2],[4,6,7,5],[0,2,6,4],[1,5,7,3],[2,3,7,6],[0,4,5,1]];
      const SH = [0.80, 1.16, 0.90, 0.98, 1.00, 0.86];
      F.forEach((f, k) => {
        idx.push(base+f[0], base+f[1], base+f[2], base+f[0], base+f[2], base+f[3]);
        for (const vi of f) for (let j = 0; j < 3; j++) col[(base+vi)*3+j] *= SH[k] ** 0.34;
      });
    };

    /* ── find the wet runs ────────────────────────────────────────────── */
    const SAMPLE = 1.5;
    const wet = [];
    for (let m = 0; m <= L; m += SAMPLE) {
      trail.pointAt(Math.min(1, m / L), P);
      const y = terrain.height(P.x, P.z);
      trail.nearest(P.x, P.z, q);
      let w = 0;
      try { w = terrain.evalWet(P.x, P.z, y, q); } catch { w = 0; }
      wet.push(w);
    }
    const spans = [];
    let start = -1;
    for (let i = 0; i < wet.length; i++) {
      if (wet[i] > WET_ON && start < 0) start = i;
      else if (wet[i] <= WET_ON && start >= 0) {
        if ((i - start) * SAMPLE > 4) spans.push([start, i]);
        start = -1;
      }
    }
    if (start >= 0 && (wet.length - start) * SAMPLE > 4) spans.push([start, wet.length - 1]);

    const TIMBER = [0.135, 0.118, 0.092];
    const DECK_H = 0.20;
    const HALF_W = HALF_W_PUBLIC;

    for (const [i0, i1] of spans) {
      /* A boardwalk starts BEFORE the mud and ends after it. One that begins
       * exactly at the wet line looks like it was surveyed by the puddle. */
      const m0 = Math.max(2, i0 * SAMPLE - 3.5);
      const m1 = Math.min(L - 2, i1 * SAMPLE + 3.5);
      const len = m1 - m0;
      if (len < 6) continue;
      runs++;

      /* Cross planks, one every 0.34 m. This is the whole visual signature:
       * a boardwalk is READ as a ladder of transverse lines, and a smooth
       * deck would be a jetty. */
      const N = Math.floor(len / 0.34);
      for (let k = 0; k <= N; k++) {
        const m = m0 + (k / N) * len;
        trail.pointAt(m / L, P);
        trail.tangentAt(m / L, T);
        const yaw = Math.atan2(T.x, T.z);
        const y = terrain.height(P.x, P.z) + DECK_H;
        /* Per-plank tone: sawn timber weathers unevenly and a deck of one
         * colour is a painted stripe. */
        const v = 0.82 + rng() * 0.42;
        box(P.x, y, P.z, HALF_W, 0.045, 0.125, yaw,
            TIMBER.map((c) => c * v));
        planks++;
      }
      /* Bearers under the planks, and piles into the mud. */
      for (const s of [-1, 1]) {
        const nb = Math.max(2, Math.round(len / 1.6));
        for (let k = 0; k < nb; k++) {
          const m = m0 + ((k + 0.5) / nb) * len;
          trail.pointAt(m / L, P); trail.tangentAt(m / L, T);
          const yaw = Math.atan2(T.x, T.z);
          const nx = T.z, nz = -T.x;
          const px = P.x + nx * s * (HALF_W - 0.10);
          const pz = P.z + nz * s * (HALF_W - 0.10);
          const g = terrain.height(px, pz);
          box(px, g - 0.12, pz, 0.055, DECK_H + 0.08, 0.055, yaw,
              TIMBER.map((c) => c * 0.82));
          piles++;
        }
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
      name: 'trackwork', color: 0xffffff, vertexColors: true,
      roughness: 0.94, metalness: 0.0, envMapIntensity: 0.22,
    });
    this.materials.push(mat);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = 'trackwork:boardwalk';
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.root.add(mesh);

    /* Kept so the footstep audio can ask. Stored as arc-length ranges rather
     * than as geometry, because the question "is the walker on the deck" is
     * about the trail parameter, and re-deriving it from the planks would be a
     * second implementation of the placement rule — which is how the gearbox
     * ended up existing twice. */
    this._spans = spans.map(([i0, i1]) => [
      Math.max(2, i0 * SAMPLE - 3.5), Math.min(L - 2, i1 * SAMPLE + 3.5),
    ]).filter(([a, c]) => c - a >= 6);
    this._trail = trail;
    this._L = L;
    this._q = {};

    this.counts = { runs, planks, piles, triangles: idx.length / 3, spans: spans.length };
  }

  /**
   * Is this point on the deck?
   *
   * Half-width plus a little, because a boot on the very edge of a plank is
   * still on the plank. Used by the footstep audio; the boardwalk is built
   * exactly where the wetness field peaks, so without this the driest surface
   * in the level plays the wettest sound in the bank.
   */
  covers(x, z) {
    if (!this._spans || !this._spans.length) return false;
    const q = this._trail.nearest(x, z, this._q);
    if (q.dist > HALF_W_PUBLIC + 0.12) return false;
    const m = q.t * this._L;
    for (const [a, c] of this._spans) if (m >= a && m <= c) return true;
    return false;
  }

  update() {}
  setTier() {}
  cullAround() {}
  stats() { return this.counts; }
  dispose() { this.geometry.dispose(); this.materials.forEach((m) => m.dispose()); }
}

/* The trail.
 *
 * One Catmull-Rom curve through a level, and a distance field built from it.
 * Almost every other system asks the same two questions — "how far am I from
 * the trail" and "how far along is that" — to decide whether to carve the
 * ground, plant a tree, thin the canopy or place a ruin, so the answer is
 * computed once here and shared.
 *
 * The curve, the width and the opening-out are the *level's*; the sampling,
 * the bucket grid and the nearest-point search are not. A route is the single
 * strongest statement a level makes about its own pacing — where it pinches,
 * where it turns so the next thing is hidden, where it finally opens — and it
 * is not something a shared class can hold an opinion about.
 */
import * as THREE from 'three';
import { clamp, smoothstep } from './noise.js';

export class Trail {
  /**
   * @param {object} route the level's own path
   * @param {number[][]} route.control [x, z] pairs, hand-placed
   * @param {(t:number)=>number} route.widthAt half-width of tread, metres
   * @param {(t:number)=>number} [route.clearing] 0 enclosed, 1 open
   * @param {number} [route.samples] polyline resolution
   */
  constructor(route) {
    this._widthAt = route.widthAt;
    this._clearing = route.clearing ?? (() => 0);

    this.curve = new THREE.CatmullRomCurve3(
      route.control.map(([x, z]) => new THREE.Vector3(x, 0, z)),
      false, 'catmullrom', 0.5,
    );

    /* Sampled once at ~0.5 m and then treated as a polyline. Evaluating the
     * curve itself per query would be far too slow for the quarter-million
     * terrain samples that need it, and a polyline this dense is
     * indistinguishable from the curve at the scale anything cares about. */
    this.samples = [];
    const N = route.samples ?? 900;
    let acc = 0;
    let prev = this.curve.getPoint(0);
    for (let i = 0; i <= N; i++) {
      const u = i / N;
      const p = this.curve.getPoint(u);
      acc += p.distanceTo(prev);
      const tan = this.curve.getTangent(u);
      this.samples.push({ x: p.x, z: p.z, u, s: acc, tx: tan.x, tz: tan.z });
      prev = p;
    }
    this.length = acc;
    for (const sm of this.samples) sm.t = sm.s / this.length;

    this._buildGrid();
  }

  /* Uniform bucket grid over the samples. The alternative — a kd-tree — is
   * more code and no faster here, because the samples are evenly spaced along
   * a curve rather than clustered. */
  _buildGrid() {
    const CELL = 8;
    this.cell = CELL;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const s of this.samples) {
      if (s.x < minX) minX = s.x; if (s.x > maxX) maxX = s.x;
      if (s.z < minZ) minZ = s.z; if (s.z > maxZ) maxZ = s.z;
    }
    const PAD = 96;   // queries this far off the trail still need a real answer
    this.gx0 = Math.floor((minX - PAD) / CELL);
    this.gz0 = Math.floor((minZ - PAD) / CELL);
    this.gw = Math.ceil((maxX + PAD) / CELL) - this.gx0 + 1;
    this.gh = Math.ceil((maxZ + PAD) / CELL) - this.gz0 + 1;
    this.grid = Array.from({ length: this.gw * this.gh }, () => []);
    this.samples.forEach((s, i) => {
      const cx = Math.floor(s.x / CELL) - this.gx0;
      const cz = Math.floor(s.z / CELL) - this.gz0;
      this.grid[cz * this.gw + cx].push(i);
    });
  }

  /**
   * Nearest point on the trail.
   * @returns {{dist:number, t:number, side:number, i:number}} `side` is signed:
   *   negative left of the direction of travel, positive right, in metres.
   */
  nearest(x, z, out = {}) {
    const CELL = this.cell;
    const cx = Math.floor(x / CELL) - this.gx0;
    const cz = Math.floor(z / CELL) - this.gz0;
    let best = Infinity, bi = -1;

    /* Grow the search ring until a hit is found, then do one more ring: a
     * sample in the current ring can still be further away than one in the
     * next, because the ring is square and distance is round. */
    for (let r = 0, found = false; r <= 24; r++) {
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (r > 0 && Math.abs(dz) !== r && Math.abs(dx) !== r) continue;
          const gx = cx + dx, gz = cz + dz;
          if (gx < 0 || gz < 0 || gx >= this.gw || gz >= this.gh) continue;
          for (const i of this.grid[gz * this.gw + gx]) {
            const s = this.samples[i];
            const d = (s.x - x) * (s.x - x) + (s.z - z) * (s.z - z);
            if (d < best) { best = d; bi = i; }
          }
        }
      }
      if (found) break;
      if (bi >= 0) found = true;   // one more ring, then stop
    }

    if (bi < 0) { out.dist = 999; out.t = 0; out.side = 999; out.i = 0; return out; }
    const s = this.samples[bi];
    out.dist = Math.sqrt(best);
    out.t = s.t;
    out.i = bi;
    // Cross product of tangent and the offset vector, in the ground plane.
    out.side = s.tz * (x - s.x) - s.tx * (z - s.z);
    return out;
  }

  /** Point on the trail at normalised arc length. */
  pointAt(t, target = new THREE.Vector3()) {
    const s = clamp(t, 0, 1) * (this.samples.length - 1);
    const i = Math.min(this.samples.length - 2, Math.floor(s));
    const f = s - i;
    const a = this.samples[i], b = this.samples[i + 1];
    return target.set(a.x + (b.x - a.x) * f, 0, a.z + (b.z - a.z) * f);
  }

  tangentAt(t, target = new THREE.Vector3()) {
    const s = clamp(t, 0, 1) * (this.samples.length - 1);
    const a = this.samples[Math.min(this.samples.length - 1, Math.floor(s))];
    return target.set(a.tx, 0, a.tz).normalize();
  }

  /** Half-width of the walkable tread at this point, in metres. */
  widthAt(t) { return this._widthAt(t); }

  /** 0 where the level encloses you, 1 where it opens out. Drives canopy
   * density, fog and light. */
  clearing(t) { return this._clearing(t); }
}

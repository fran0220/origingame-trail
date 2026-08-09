/* The machinery every level's ground shares, with none of its shape.
 *
 * A heightfield is two things stuck together, and only one of them is about
 * the place. The first is a sampled grid, a trail distance field, bilinear
 * lookups, a concavity measure, and a chunked mesh whose resolution falls off
 * away from the path — none of which knows or cares whether it is describing a
 * rainforest floor or a glacial basin. The second is `evalHeight`, which is
 * the entire answer to what the ground actually does, and belongs to the level.
 *
 * This class is the first half. It was extracted rather than designed: it is
 * exactly the code the jungle's terrain already had, held still by a
 * pixel-for-pixel regression while the seams were cut, at the point where a
 * second level needed the same grid under a completely different shape.
 *
 * Subclasses provide:
 *   evalHeight(x, z, q) -> metres          required
 *   afterHeights()                          optional, once `h` exists
 *   evalChannels(x, z, y, q, out)           optional, four floats per vertex
 *
 * `q` is the trail field sample at that point — distance, arc length, side —
 * refilled by the caller before every call.
 */
import * as THREE from 'three';
import { clamp, lerp } from './noise.js';

/* Resolution of the precomputed trail distance field, in metres.
 *
 * Asking the trail for its nearest point once per terrain vertex is ~350k
 * queries and takes seconds. A distance field is very close to linear away
 * from its source, so sampling it on a 1 m lattice and interpolating is
 * visually identical for a twentieth of the work — and it is done once at
 * boot, so the error that matters is the one you can see, not the one in the
 * third decimal place.
 */
const FIELD_STEP = 1.0;

export class Heightfield {
  /**
   * @param {object} trail the level's path, for the distance field
   * @param {{x0:number, x1:number, z0:number, z1:number}} bounds world extent
   * @param {object} [opts]
   * @param {number} [opts.step] grid spacing in metres
   * @param {number} [opts.chunk] cells per chunk edge
   * @param {number[]} [opts.lod] two distances, in metres from the trail, at
   *   which the mesh drops to every second and every fourth cell
   * @param {number} [opts.skirt] apron depth under each chunk border, metres
   */
  constructor(trail, bounds, opts = {}) {
    this.trail = trail;
    this.bounds = bounds;
    this.step = opts.step ?? 0.5;
    this.chunk = opts.chunk ?? 48;
    this.lod = opts.lod ?? [34, 68];
    this.skirt = opts.skirt ?? 1.2;

    const S = this.step;
    this.x0 = bounds.x0; this.z0 = bounds.z0;
    this.W = Math.round((bounds.x1 - bounds.x0) / S) + 1;
    this.H = Math.round((bounds.z0 - bounds.z1) / S) + 1;

    this.group = new THREE.Group();
    this.group.name = 'terrain';
  }

  /* ── the trail field ───────────────────────────────────────────────────── */

  /** Precompute distance / arc-length / signed side on a 1 m lattice. */
  buildField() {
    const b = this.bounds;
    const fw = Math.ceil((b.x1 - b.x0) / FIELD_STEP) + 2;
    const fh = Math.ceil((b.z0 - b.z1) / FIELD_STEP) + 2;
    const dist = new Float32Array(fw * fh);
    const tt = new Float32Array(fw * fh);
    const side = new Float32Array(fw * fh);
    const q = {};
    for (let j = 0; j < fh; j++) {
      const z = b.z0 - j * FIELD_STEP;
      for (let i = 0; i < fw; i++) {
        const x = b.x0 + i * FIELD_STEP;
        this.trail.nearest(x, z, q);
        const k = j * fw + i;
        dist[k] = q.dist; tt[k] = q.t; side[k] = q.side;
      }
    }
    this.field = { fw, fh, dist, t: tt, side };
    return this;
  }

  /** Bilinear sample of the trail field. Writes into `out` to avoid garbage. */
  sampleField(x, z, out = {}) {
    const f = this.field;
    let u = (x - this.bounds.x0) / FIELD_STEP;
    let v = (this.bounds.z0 - z) / FIELD_STEP;
    u = clamp(u, 0, f.fw - 1.001); v = clamp(v, 0, f.fh - 1.001);
    const i = u | 0, j = v | 0, fx = u - i, fy = v - j;
    const k00 = j * f.fw + i, k10 = k00 + 1, k01 = k00 + f.fw, k11 = k01 + 1;
    const bl = (a) => lerp(lerp(a[k00], a[k10], fx), lerp(a[k01], a[k11], fx), fy);
    out.dist = bl(f.dist); out.t = bl(f.t); out.side = bl(f.side);
    return out;
  }

  /* ── solving ───────────────────────────────────────────────────────────── */

  /**
   * Sample the shape onto the grid, in two passes.
   *
   * The split is not an optimisation. Anything that depends on where the water
   * ends up — and in a carved landscape that includes the waterline itself —
   * has to run against a height field that has stopped changing, so the
   * heights are published before `afterHeights` and the per-vertex channels
   * are asked for after it.
   */
  solve() {
    const { W, H } = this;
    const S = this.step;
    const h = new Float32Array(W * H);
    const q = {};
    for (let j = 0; j < H; j++) {
      const z = this.z0 - j * S;
      for (let i = 0; i < W; i++) h[j * W + i] = this.evalHeight(this.x0 + i * S, z, q);
    }
    this.h = h;
    this.afterHeights?.();

    this.chan = new Float32Array(W * H * 4);
    this.buildHollow();
    if (this.evalChannels) {
      const out = [0, 0, 0, 0];
      for (let j = 0; j < H; j++) {
        const z = this.z0 - j * S;
        for (let i = 0; i < W; i++) {
          const x = this.x0 + i * S;
          const k = j * W + i;
          /* Refilled per vertex, and it has to be: everything downstream reads
           * the trail field out of `q` and nothing downstream puts it there.
           * When this was one pass, `evalHeight` sampled it as its first act
           * and the rest of the body inherited it — so splitting the loop
           * silently left every channel reading whichever cell the height pass
           * happened to finish on, one stale answer for the entire level. */
          this.sampleField(x, z, q);
          this.evalChannels(x, z, h[k], q, out);
          this.chan[k * 4] = out[0]; this.chan[k * 4 + 1] = out[1];
          this.chan[k * 4 + 2] = out[2]; this.chan[k * 4 + 3] = out[3];
        }
      }
    }
    return this;
  }

  /**
   * Concavity of the ground, 0 on a ridge and 1 in a hollow.
   *
   * This is what lets the surface materials respond to the shape they are
   * lying on. Loose material does not settle evenly: rain and wind move it
   * downhill and it piles up wherever the ground dishes, banks against every
   * small step, and is scoured off every convexity. Without this, whatever is
   * strewn on the ground is a decal wrapped over the terrain, and the eye
   * reads that immediately even if it cannot say why.
   *
   * Measured over a 1 m span rather than a single cell: at the grid's own
   * spacing the answer is dominated by the finest octave of the height noise
   * and says nothing about the shapes loose material would collect in.
   */
  buildHollow() {
    const { W, H, h } = this;
    const hollow = new Float32Array(W * H);
    const R = Math.max(1, Math.round(1 / this.step));
    for (let j = 0; j < H; j++) {
      for (let i = 0; i < W; i++) {
        const k = j * W + i;
        const im = Math.max(0, i - R), ip = Math.min(W - 1, i + R);
        const jm = Math.max(0, j - R), jp = Math.min(H - 1, j + R);
        const avg = (h[j * W + im] + h[j * W + ip] + h[jm * W + i] + h[jp * W + i]) * 0.25;
        hollow[k] = clamp((avg - h[k]) * 7.0, 0, 1);
      }
    }
    this.hollow = hollow;
  }

  hollowAt(x, z) { return this._nearest(this.hollow, x, z); }

  /* ── queries ───────────────────────────────────────────────────────────── */

  /** Bilinear terrain height. This is the surface the player stands on. */
  height(x, z) {
    const S = this.step;
    let u = (x - this.x0) / S, v = (this.z0 - z) / S;
    u = clamp(u, 0, this.W - 1.001); v = clamp(v, 0, this.H - 1.001);
    const i = u | 0, j = v | 0, fx = u - i, fy = v - j;
    const k = j * this.W + i;
    return lerp(lerp(this.h[k], this.h[k + 1], fx),
                lerp(this.h[k + this.W], this.h[k + this.W + 1], fx), fy);
  }

  /** Surface normal by central difference on the sampled height. */
  normal(x, z, out = new THREE.Vector3()) {
    const e = this.step;
    const hL = this.height(x - e, z), hR = this.height(x + e, z);
    const hD = this.height(x, z - e), hU = this.height(x, z + e);
    return out.set(hL - hR, 2 * e, hD - hU).normalize();
  }

  _nearest(arr, x, z) {
    const S = this.step;
    let u = (x - this.x0) / S, v = (this.z0 - z) / S;
    u = clamp(u, 0, this.W - 1.001); v = clamp(v, 0, this.H - 1.001);
    return arr[(v | 0) * this.W + (u | 0)];
  }

  /** Nearest-neighbour read of one surface channel. Good enough for a blend weight. */
  chanAt(c, x, z) {
    const S = this.step;
    let u = (x - this.x0) / S, v = (this.z0 - z) / S;
    u = clamp(u, 0, this.W - 1.001); v = clamp(v, 0, this.H - 1.001);
    return this.chan[(((v | 0) * this.W + (u | 0)) << 2) + c];
  }

  /**
   * Bilinear read of one surface channel.
   *
   * Worth the extra taps only where the channel drives a *displacement*: a
   * nearest-neighbour read steps by a whole cell at a time, so an offset fed
   * from one would jump by the better part of a grid square across a cell
   * boundary and draw the terrain lattice into whatever it is displacing.
   * Blend weights do not need it — the same stepping is invisible under the
   * noise they are mixed with.
   */
  chanLerp(c, x, z) {
    const S = this.step;
    let u = (x - this.x0) / S, v = (this.z0 - z) / S;
    u = clamp(u, 0, this.W - 1.001); v = clamp(v, 0, this.H - 1.001);
    const i = u | 0, j = v | 0, fx = u - i, fy = v - j;
    const k = ((j * this.W + i) << 2) + c;
    const w4 = this.W << 2;
    return lerp(lerp(this.chan[k], this.chan[k + 4], fx),
                lerp(this.chan[k + w4], this.chan[k + w4 + 4], fx), fy);
  }

  /* ── meshing ───────────────────────────────────────────────────────────── */

  /**
   * Build the chunk meshes.
   *
   * Chunk resolution is picked from the chunk's distance to the trail, not to
   * the camera. The player never leaves the trail, so that distance is a
   * standing proxy for view distance — which means LOD can be decided once at
   * build time and never re-evaluated, and no chunk ever pops.
   */
  build(material) {
    const { W, H } = this;
    const C = this.chunk, S = this.step;
    const cx = Math.ceil((W - 1) / C), cz = Math.ceil((H - 1) / C);
    let tris = 0;

    for (let cj = 0; cj < cz; cj++) {
      for (let ci = 0; ci < cx; ci++) {
        const i0 = ci * C, j0 = cj * C;
        const iN = Math.min(C, W - 1 - i0), jN = Math.min(C, H - 1 - j0);
        if (iN <= 0 || jN <= 0) continue;

        const wx = this.x0 + (i0 + iN * 0.5) * S;
        const wz = this.z0 - (j0 + jN * 0.5) * S;
        const d = this.sampleField(wx, wz, {}).dist;
        const stride = d < this.lod[0] ? 1 : d < this.lod[1] ? 2 : 4;

        const g = this._chunkGeometry(i0, j0, iN, jN, stride);
        if (!g) continue;
        const m = new THREE.Mesh(g, material);
        /* Named by chunk index. Unnamed, 576 of these were an anonymous
         * bucket in the solidity audit — the largest single unexplained group
         * in the scene, and the answer was "it is the ground". The audit could
         * not say that because nothing told it. */
        m.name = `terrain:chunk:${i0},${j0}`;
        /* Terrain casts as well as receives. Without it the ground has no
         * self-shadowing at all: banks do not darken their own lee side and
         * the trail does not sit in the shade of the slope beside it, which
         * is a large part of why untextured heightfields look inflated. */
        m.castShadow = true;
        m.receiveShadow = true;
        m.matrixAutoUpdate = false;
        m.updateMatrix();
        this.group.add(m);
        tris += g.index.count / 3;
      }
    }
    this.triangles = tris;
    return this.group;
  }

  _chunkGeometry(i0, j0, iN, jN, stride) {
    const S = this.step;
    const nx = Math.floor(iN / stride) + 1, nz = Math.floor(jN / stride) + 1;
    if (nx < 2 || nz < 2) return null;

    // One skirt ring around the chunk. Neighbouring chunks can be at different
    // strides, which leaves hairline gaps along the shared edge; dropping a
    // vertical apron behind each border vertex fills them with ground-coloured
    // geometry instead of sky. Cheaper and far more robust than stitching.
    const total = nx * nz + 2 * (nx + nz);
    const pos = new Float32Array(total * 3);
    const nrm = new Float32Array(total * 3);
    const uv = new Float32Array(total * 2);
    const splat = new Float32Array(total * 4);

    const put = (vi, x, z) => {
      const y = this.height(x, z);
      pos[vi * 3] = x; pos[vi * 3 + 1] = y; pos[vi * 3 + 2] = z;
      const e = S * stride;
      const hL = this.height(x - e, z), hR = this.height(x + e, z);
      const hD = this.height(x, z - e), hU = this.height(x, z + e);
      const nX = hL - hR, nY = 2 * e, nZ = hD - hU;
      const inv = 1 / Math.hypot(nX, nY, nZ);
      nrm[vi * 3] = nX * inv; nrm[vi * 3 + 1] = nY * inv; nrm[vi * 3 + 2] = nZ * inv;
      uv[vi * 2] = x; uv[vi * 2 + 1] = z;
      this.vertexSplat(x, z, splat, vi * 4);
    };

    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const x = this.x0 + (i0 + Math.min(i * stride, iN)) * S;
        const z = this.z0 - (j0 + Math.min(j * stride, jN)) * S;
        put(j * nx + i, x, z);
      }
    }

    const idx = [];
    for (let j = 0; j < nz - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
        /* Winding: i runs +x but j runs -z, so the grid is mirrored in world
         * space relative to the obvious index order. Emitting a,c,b here — the
         * order that looks right on paper — produces downward-facing triangles
         * and the entire ground is backface-culled from standing height. */
        const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1;
        idx.push(a, b, c, b, d, c);
      }
    }

    // Skirt: duplicate each border vertex lower down and bridge the two rings.
    let sv = nx * nz;
    const skirt = (getIdx, count, flip) => {
      const start = sv;
      for (let k = 0; k < count; k++) {
        const src = getIdx(k);
        pos[sv * 3] = pos[src * 3];
        pos[sv * 3 + 1] = pos[src * 3 + 1] - this.skirt;
        pos[sv * 3 + 2] = pos[src * 3 + 2];
        nrm[sv * 3] = nrm[src * 3]; nrm[sv * 3 + 1] = nrm[src * 3 + 1];
        nrm[sv * 3 + 2] = nrm[src * 3 + 2];
        uv[sv * 2] = uv[src * 2]; uv[sv * 2 + 1] = uv[src * 2 + 1];
        for (let c = 0; c < 4; c++) splat[sv * 4 + c] = splat[src * 4 + c];
        sv++;
      }
      for (let k = 0; k < count - 1; k++) {
        const a = getIdx(k), b = getIdx(k + 1), c = start + k, d = start + k + 1;
        if (flip) idx.push(a, c, b, b, c, d);
        else idx.push(a, b, c, b, d, c);
      }
    };
    skirt(k => k, nx, true);                                   // j = 0
    skirt(k => (nz - 1) * nx + k, nx, false);                  // j = max
    skirt(k => k * nx, nz, false);                             // i = 0
    skirt(k => k * nx + (nx - 1), nz, true);                   // i = max

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setAttribute('aSplat', new THREE.BufferAttribute(splat, 4));
    g.setIndex(idx);
    g.computeBoundingSphere();
    return g;
  }

  /** What the four splat channels mean per vertex. Overridable. */
  vertexSplat(x, z, out, o) {
    out[o] = this.chanAt(0, x, z);
    out[o + 1] = this.chanAt(1, x, z);
    out[o + 2] = this.chanAt(2, x, z);
    out[o + 3] = this.chanAt(3, x, z);
  }
}

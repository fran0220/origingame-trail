/* The ground of a glacial basin.
 *
 * The shapes here are the ones ice and meltwater actually leave, because the
 * alternative — noise with a lake cut into it — produces a valley that reads
 * as a river valley with the water level put up, which is a completely
 * different landform and looks it.
 *
 * Four things make a Mackenzie shore:
 *
 *   The trough is U-shaped, not V-shaped. A glacier is a plane of ice a
 *   kilometre thick; it cuts a flat floor and steep walls with a distinct
 *   break of slope where the ice surface used to be. A river cuts a notch.
 *   This is the single strongest cue that a basin was glaciated, and getting
 *   it wrong is not subtle.
 *
 *   Lateral moraine benches run along the walls at the old ice margins —
 *   long, level, unnaturally straight ridges of dumped till, well above the
 *   present water. The track starts on one.
 *
 *   Alluvial fans spread from every side stream where it leaves the wall and
 *   loses its gradient: shallow cones of shingle, convex in profile, pushing
 *   the shoreline out into the lake. They are why a lakeshore path is not a
 *   straight line.
 *
 *   The shore itself is *shingle*, wave-graded into a bank with a crest and a
 *   short steep face. Not sand, not mud — greywacke cobbles, sorted by size
 *   up the beach.
 *
 * Heights are metres above lake level, so 0 is the waterline and the lake bed
 * goes negative. Real Pukaki sits at 518 m and is ~70 m deep; those numbers
 * are used for the shape of the bed, not for the absolute elevation, because
 * nothing in the level cares what the datum is.
 */
import * as THREE from 'three';
import { Heightfield } from '../../world/heightfield.js';
import { Noise2D, clamp, smoothstep, lerp } from '../../world/noise.js';

export const BOUNDS = { x0: -280, x1: 190, z0: 70, z1: -660 };
export const STEP = 0.6;
const CHUNK = 48;

/** Lake surface. Everything in this level is measured from it. */
export const LAKE_Y = 0;

/* Where the water's edge sits, as a function of distance up the valley.
 *
 * Authored as a curve rather than derived from the heightfield, for the same
 * reason the brook's profile is authored in the jungle: several systems — the
 * water mesh, the shingle grading, the scatter's wet mask, the map — have to
 * agree on it to the centimetre, and a shoreline recovered by contouring a
 * noisy height field disagrees with itself between any two of them.
 */
export function shoreX(z) {
  const u = clamp((70 - z) / 730, 0, 1);
  /* The lake narrows toward its head and the delta pushes the water back, so
   * the shore swings east through the last fifth of the walk. */
  let x = -34 - 96 * smoothstep(0.05, 0.55, u) + 120 * smoothstep(0.72, 1.0, u);
  // Two fans, at the side streams. Each pushes a lobe of shingle out.
  x += 26 * Math.exp(-((((z + 300) / 46) ** 2)));
  x += 17 * Math.exp(-((((z + 486) / 38) ** 2)));
  // Small bays and spits, so the waterline is not a drawn curve.
  x += 5.5 * Math.sin(z * 0.019) + 2.4 * Math.sin(z * 0.047 + 1.7);
  return x;
}

export class Basin extends Heightfield {
  constructor(trail, seed = 20260901) {
    super(trail, BOUNDS, { step: STEP, chunk: CHUNK, lod: [46, 96], skirt: 2.0 });
    this.n = new Noise2D(seed);
    this.nb = new Noise2D(seed ^ 0x5bf03635);
    this._buildPathProfile();
    this.buildField();
    this.solve();
  }

  /* Elevation of the track itself.
   *
   * Very nearly flat, and deliberately: this walk gains about twelve metres
   * over six hundred, because a lake shore is a level line by definition and
   * the only relief on it is the moraine bench at the start and the fans it
   * has to climb over. Authored then smoothed, like the jungle's, so no grade
   * reads as a ramp.
   */
  _buildPathProfile() {
    const S = this.trail.samples;
    const y = new Float32Array(S.length);
    for (let i = 0; i < S.length; i++) {
      const s = S[i];
      // Down off the moraine bench in the first fifth, then hugging the shore.
      let h = lerp(15.5, 3.4, smoothstep(0.02, 0.22, s.t));
      // Up and over each fan.
      h += 5.2 * Math.exp(-((((s.z + 300) / 52) ** 2)));
      h += 3.4 * Math.exp(-((((s.z + 486) / 44) ** 2)));
      // The delta flat at the head is barely above the water.
      h = lerp(h, 1.9, smoothstep(0.88, 1.0, s.t));
      h += 0.55 * this.n.fbm(s.x * 0.021, s.z * 0.021, 3, 0.5);
      y[i] = h;
    }
    for (let pass = 0; pass < 20; pass++) {
      for (let i = 1; i < y.length - 1; i++) y[i] = (y[i - 1] + y[i] * 2 + y[i + 1]) * 0.25;
    }
    this.pathY = y;
  }

  _pathYAt(t) {
    const f = clamp(t, 0, 1) * (this.pathY.length - 1);
    const i = Math.min(this.pathY.length - 2, Math.floor(f));
    return lerp(this.pathY[i], this.pathY[i + 1], f - i);
  }

  /** Metres of water over this point, 0 on dry land. */
  depthAt(x, z) { return Math.max(0, LAKE_Y - this.height(x, z)); }

  evalHeight(x, z, q = {}) {
    this.sampleField(x, z, q);
    const t = q.t, d = q.dist;
    const n = this.n, nb = this.nb;

    const sx = shoreX(z);
    /* Signed distance from the waterline, positive on land. The whole profile
     * below is written in this coordinate, because every feature of a shore is
     * defined by where it sits relative to the water and not by where it sits
     * in the world. */
    const fromShore = x - sx;

    /* ── the lake bed ──────────────────────────────────────────────────────
     * A shallow shelf of wave-sorted gravel, then a break of slope, then the
     * flat floor of the trough. The shelf is what the water's colour is going
     * to be read through for the first thirty metres out, so its gradient
     * matters more than the depth beyond it does. */
    const shelf = -0.085 * Math.max(0, -fromShore);
    const deep = -22 - 46 * smoothstep(40, 210, -fromShore);
    let y = fromShore < 0 ? Math.max(deep, shelf) : 0;

    /* ── the land ─────────────────────────────────────────────────────────── */
    if (fromShore >= 0) {
      /* The shingle bank. Wave-built: a short steep face out of the water up
       * to a crest, then a gentle back-slope. The crest is where the biggest
       * storm waves stopped, and it is the sharpest line in the whole basin. */
      const face = smoothstep(0, 7.5, fromShore) * 1.5;
      const back = smoothstep(7.5, 30, fromShore) * 0.9;
      y = face + back;

      /* The valley side rising east of the track. U-shaped: the profile is a
       * quadratic near the floor rather than a linear V, and it steepens into
       * a break of slope at the old ice margin.
       *
       * This carries the terrace riser only, and tops out near sixty metres at
       * the level's east edge. The first cut of it reached three hundred, from
       * reading "U-shaped glacial trough" off the map and building the whole
       * trough inside the walkable field. A real trough that deep is kilometres
       * across; compressing its full relief into the three hundred metres of
       * ground the player can actually reach puts a cliff over the track and,
       * worse, hides the range behind it. The mountains are forty kilometres
       * away and belong to the distance pass, which is the only thing that can
       * draw them at that range anyway. */
      const wallStart = 96;
      const u = Math.max(0, fromShore - wallStart) / 224;
      y += 52 * (u * u) + 12 * smoothstep(0.6, 1.0, u);

      /* The lateral moraine bench, a level shelf cut into that wall. Its
       * flatness is the giveaway that it was dumped by ice and not eroded by
       * water, so it is flattened explicitly rather than left to noise. */
      const benchC = 74, benchW = 26;
      const onBench = Math.exp(-(((fromShore - benchC) / benchW) ** 2));
      y = lerp(y, 15.0 + 2.2 * n.fbm(x * 0.02, z * 0.02, 3, 0.5), onBench * 0.82);

      /* The two alluvial fans. Convex cones, spreading from the wall down to
       * the water, and the reason the track has to climb inland twice. */
      for (const [fz, fh, fr] of [[-300, 9.0, 120], [-486, 6.2, 96]]) {
        const r = Math.hypot((z - fz) * 1.5, Math.max(0, fromShore + 10)) / fr;
        if (r < 1) {
          const cone = (1 - r) ** 1.6 * fh;
          y = Math.max(y, cone + 0.9 * n.fbm(x * 0.06, z * 0.06, 3, 0.5) * (1 - r));
        }
      }

      /* Hummocky moraine everywhere between the bench and the wall — the
       * kettle-and-kame ground a retreating glacier leaves. Bumpy at 20-40 m,
       * which is the scale that makes a basin floor read as till rather than
       * as a graded surface. */
      const till = smoothstep(24, 60, fromShore) * (1 - onBench * 0.7);
      y += till * 3.6 * n.fbm(x * 0.031, z * 0.028, 4, 0.55);
      y += till * 1.5 * nb.ridged(x * 0.014, z * 0.013, 3, 0.5);
    }

    /* ── the track ─────────────────────────────────────────────────────────
     * Cut last, over whatever the landforms did, because a track is a thing
     * people made in a landscape rather than a feature of it. Flattened to the
     * authored profile within the tread and blended out over a few metres. */
    const py = this._pathYAt(t);
    const hw = this.trail.widthAt(t);
    const onPath = 1 - smoothstep(hw, hw + 4.5, d);
    if (onPath > 0.001) {
      const rut = -0.06 * (1 - smoothstep(0, hw, d));
      y = lerp(y, py + rut, onPath * 0.94);
    }

    // Fine grain everywhere on land, so no surface is perfectly smooth.
    if (fromShore >= 0) y += 0.12 * n.fbm(x * 0.35, z * 0.35, 2, 0.5);
    return y;
  }

  /**
   * Surface channels: shingle, wetness, hollow, submerged depth.
   *
   * The jungle's quad is mud/wet/hollow/sub and this one is deliberately the
   * same *shape* — the terrain shader is shared — but the first channel means
   * something else. Here it is how gravelly the ground is, which runs from
   * bare wave-washed cobble at the waterline to tussock-rooted silt loam up on
   * the bench.
   */
  evalChannels(x, z, y, q, out) {
    const fromShore = x - shoreX(z);
    const depth = Math.max(0, LAKE_Y - y);

    /* Shingle: everything within the wave-worked zone, plus the fan surfaces,
     * plus anywhere too steep to hold soil. */
    let shingle = 1 - smoothstep(3, 34, fromShore);
    for (const [fz, fr] of [[-300, 120], [-486, 96]]) {
      const r = Math.hypot((z - fz) * 1.5, Math.max(0, fromShore + 10)) / fr;
      shingle = Math.max(shingle, (1 - clamp(r, 0, 1)) * 0.85);
    }
    // The track is crushed gravel too, wherever it runs.
    shingle = Math.max(shingle, (1 - smoothstep(0, this.trail.widthAt(q.t) + 1.5, q.dist)) * 0.9);
    out[0] = clamp(shingle, 0, 1);

    /* Wet: the splash zone and the seepage line at the foot of each fan. A
     * band, not a fill — it peaks just above the water and dies within a few
     * metres, which is what a wave-washed shingle margin actually looks like. */
    out[1] = clamp(
      (1 - smoothstep(0, 4.5, Math.abs(fromShore - 1.5))) * 0.9
      + (depth > 0 ? 0.6 : 0), 0, 1);

    out[2] = this.hollowAt(x, z);
    out[3] = depth;
  }

  gravelAt(x, z) { return this.chanAt(0, x, z); }
  wetAt(x, z) { return this.chanAt(1, x, z); }
  subAt(x, z) { return this.chanLerp(3, x, z); }
}

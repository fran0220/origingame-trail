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

/* The basin, and it is now a valley rather than a bay.
 *
 * 470 x 730 m held 761 m of road, which is 27 seconds at open-road speed. That
 * is not a stage, it is a corner — the reported experience was "you drive for a
 * moment and it is gone", and the road also ran within 10 m of the world edge
 * at its start, so leaving the seal put you off the end of the terrain almost
 * immediately.
 *
 * The valley is extended along -Z, which is the axis it actually runs on, to
 * 2060 m. The grid step goes up with it: at 0.6 m a world this long is 3.5M
 * vertices to solve at boot and 20 MB of channel data, and the detail it buys
 * is below the scale of anything this level draws — the landform is 20-80 m,
 * the beach cusps are 15-30 m, and the fine grain at 2.9 m is already faded out
 * by the footprint term in the ground shader. 0.9 m costs 1.3M vertices, which
 * is 1.36x what the short basin cost, for 2.8x the road.
 *
 * The road surface itself does not depend on this at all: road.js builds its
 * own ribbon at 2 m stations, so the seal keeps its resolution whatever the
 * terrain does. */
export const BOUNDS = { x0: -300, x1: 210, z0: 70, z1: -1990 };
export const STEP = 0.9;
/** How far the valley runs, so shapes authored along it can be written in a
 *  fraction of its length rather than in absolute metres that go stale. */
export const VALLEY = BOUNDS.z0 - BOUNDS.z1;
const CHUNK = 48;

/** Lake surface. Everything in this level is measured from it. */
export const LAKE_Y = 0;

/* ── the road ───────────────────────────────────────────────────────────────
 *
 * State Highway 8 runs the eastern side of the Mackenzie lakes, and it is a
 * specific kind of road: a two-lane rural state highway, sealed with coarse
 * chipseal, no kerb, no barrier except at the fan crossings, and a gravel
 * shoulder that goes straight into tussock. These numbers are that road's, and
 * every other system in the level reads them from here rather than keeping its
 * own copy — the mesh, the terrain carve, the markings, the marker posts and
 * the car's off-road test all have to agree on where the seal ends or the
 * level develops a visible seam exactly where the player is looking.
 */

/** Half the sealed width. Two 3.5 m lanes plus a 0.6 m sealed edge strip. */
export const ROAD_HALF = 4.1;
/** Half-width of the graded formation: seal, then a gravel shoulder. */
export const ROAD_SHOULDER = 5.9;
/** How far past the formation the cut and fill blend back into the basin. */
export const ROAD_BATTER = 7.0;
/** Crown, as a fall per metre from the centreline. 3% is a rural NZ seal. */
export const ROAD_CROSSFALL = 0.030;
/** Steepest grade the alignment is allowed, as a rise per metre. */
export const ROAD_MAX_GRADE = 0.062;
/** Least height of the seal above the lake, metres. */
export const ROAD_FREEBOARD = 1.5;

/* Where the water's edge sits, as a function of distance up the valley.
 *
 * Authored as a curve rather than derived from the heightfield, for the same
 * reason the brook's profile is authored in the jungle: several systems — the
 * water mesh, the shingle grading, the scatter's wet mask, the map — have to
 * agree on it to the centimetre, and a shoreline recovered by contouring a
 * noisy height field disagrees with itself between any two of them.
 */
export function shoreX(z) {
  /* Written in a fraction of the valley's length rather than in the old
   * absolute 730 m, so the whole shoreline stretches with BOUNDS instead of
   * running out a third of the way up a longer lake. */
  const u = clamp((BOUNDS.z0 - z) / VALLEY, 0, 1);
  /* The lake narrows toward its head and the delta pushes the water back, so
   * the shore swings east through the last fifth of the drive. */
  let x = -34 - 96 * smoothstep(0.05, 0.55, u) + 120 * smoothstep(0.80, 1.0, u);
  /* Alluvial fans at the side streams, each pushing a lobe of shingle out into
   * the lake. Placed as fractions of the valley for the same reason as above;
   * a longer valley carries more of them, at the spacing the two original ones
   * had. */
  for (const [fu, amp, width] of FANS) {
    const fz = BOUNDS.z0 - fu * VALLEY;
    x += amp * Math.exp(-(((z - fz) / width) ** 2));
  }
  // Small bays and spits, so the waterline is not a drawn curve.
  x += 5.5 * Math.sin(z * 0.019) + 2.4 * Math.sin(z * 0.047 + 1.7);
  return x;
}

/* Where the side streams come in, as a fraction of the valley, with the lobe
 * each one pushes out and its along-shore width. The first two are the pair the
 * short basin had, at the same proportions of its length. */
export const FANS = [
  [0.16, 26, 46], [0.27, 17, 38], [0.41, 30, 58],
  [0.56, 21, 44], [0.71, 27, 52], [0.86, 15, 36],
];

/* Still-water depth profile, as a function of metres lakeward of the waterline.
 *
 * Factored out of evalHeight because the water surface needs it too: the lake
 * shader has to know how much water is over the bed at each of its vertices,
 * and beyond the heightfield's western edge there is no field to ask. Having
 * one function rather than two copies of the constants is the difference
 * between the bed the player wades into and the bed the water is tinted for
 * being the same bed.
 *
 * Steep close in, then flattening: coarse material stands at a steeper angle,
 * and greywacke cobble runs about 1:6 through the swash zone.
 */
export function bedProfile(off) {
  const shelf = 0.17 * Math.min(off, 5.5) + 0.072 * Math.max(0, off - 5.5);
  const deep = 22 + 46 * smoothstep(40, 210, off);
  return -Math.min(shelf, deep);
}

export class Basin extends Heightfield {
  constructor(trail, seed = 20260901) {
    /* Lake bed chunks remain visible through clear shallow water, including
     * well away from the walking route. Route-distance LOD made neighbouring
     * chunks interpolate the steep beach profile differently: without skirts
     * they opened bright cracks, while vertical skirts became rectangular
     * trenches and retaining walls. The complete basin is only ~1.15M tris at
     * its authored 0.6 m grid, so keep that truthful surface everywhere and
     * reserve coarse terrain for the kilometre-scale distance ranges. */
    super(trail, BOUNDS, { step: STEP, chunk: CHUNK, lod: [Infinity, Infinity], skirt: 0 });
    this.n = new Noise2D(seed);
    this.nb = new Noise2D(seed ^ 0x5bf03635);
    /* The field first, then the profile, then the surface. That order is new
     * and it is what turns an authored footpath into a surveyed road.
     *
     * The old profile was a hand-written curve of absolute elevations, and the
     * carve that applied it had to be clamped to +/-0.34 m or it built a
     * causeway wherever the authored numbers had drifted from the landform
     * underneath. A clamped carve is fine for a walking track — a walker does
     * not mind a 0.3 m step — and useless for a road, because the clamp is
     * exactly the residual terrain roughness that a car reads as a bump every
     * few metres.
     *
     * So the profile is now *measured*: sample the natural basin along the
     * alignment, then smooth that hard. What comes back is a grade line that
     * already sits on the land, which means the carve can flatten to it
     * completely instead of being held back, and the cut and fill either side
     * stay small because the line was never anywhere the ground was not. */
    this.buildField();
    this._buildPathProfile();
    this.solve();
  }

  /* The grade line of the road, surveyed rather than authored.
   *
   * A road is not a curve someone drew at an elevation; it is the cheapest
   * smooth line an engineer could get through the ground that was there. This
   * builds it the same way, in three steps, and each one is answering a
   * separate complaint a driver would make.
   *
   * *Measure.* Sample the natural basin along the alignment with the carve
   * switched off, which `pathY === null` does below. This is the ground the
   * road has to be built on, at 0.55 m intervals over about 1.3 km.
   *
   * *Smooth, hard.* The raw line carries every hummock and cusp the terrain
   * has, and at 30 m/s a 0.4 m bump with a 6 m wavelength is not scenery, it
   * is a launch ramp. Four hundred passes of a three-tap binomial is a very
   * wide Gaussian — a support of order sqrt(400) ~ 20 samples, so ~11 m of
   * road — which removes everything shorter than a car and leaves the basin's
   * real landform: the moraine bench, the two fan crossings, the delta.
   *
   * *Limit the grade.* Smoothing kills curvature but not slope, and the drop
   * off the moraine bench in the first fifth is genuinely steep. A second pass
   * walks the line from both ends clamping the rise between neighbours to
   * ROAD_MAX_GRADE, which is what a real alignment does by lengthening the
   * descent rather than by tilting the road. Running it in both directions
   * keeps it symmetric; running it only forwards drags the whole line down.
   */
  _buildPathProfile() {
    const S = this.trail.samples;
    const y = new Float32Array(S.length);
    /* pathY is undefined at this point, and evalHeight reads that as "no road
     * yet" and skips the carve. That is the whole trick: the profile is a
     * measurement of the untouched basin, so the carve below can never chase
     * its own output. */
    const q = {};
    for (let i = 0; i < S.length; i++) {
      const s = S[i];
      y[i] = this.evalHeight(s.x, s.z, q);
    }

    /* Never below the water plus a working freeboard. The alignment crosses
     * the delta flat at the head, which is within half a metre of lake level,
     * and a sealed road there would be under water in the first nor'wester. */
    for (let i = 0; i < y.length; i++) y[i] = Math.max(y[i], LAKE_Y + ROAD_FREEBOARD);

    for (let pass = 0; pass < 400; pass++) {
      for (let i = 1; i < y.length - 1; i++) y[i] = (y[i - 1] + y[i] * 2 + y[i + 1]) * 0.25;
    }

    /* Grade limiting, both directions. `ds` is the real spacing along the
     * alignment, so the clamp is a true gradient rather than a per-sample
     * step. */
    const ds = this.trail.length / Math.max(1, y.length - 1);
    const rise = ROAD_MAX_GRADE * ds;
    for (let pass = 0; pass < 4; pass++) {
      for (let i = 1; i < y.length; i++) y[i] = Math.min(y[i], y[i - 1] + rise);
      for (let i = y.length - 2; i >= 0; i--) y[i] = Math.min(y[i], y[i + 1] + rise);
      for (let i = 1; i < y.length; i++) y[i] = Math.max(y[i], y[i - 1] - rise);
      for (let i = y.length - 2; i >= 0; i--) y[i] = Math.max(y[i], y[i + 1] - rise);
    }
    /* The clamp introduces corners where it bit. Take them out again with a
     * short smooth that is far too narrow to reintroduce a grade violation. */
    for (let pass = 0; pass < 40; pass++) {
      for (let i = 1; i < y.length - 1; i++) y[i] = (y[i - 1] + y[i] * 2 + y[i + 1]) * 0.25;
    }
    this.pathY = y;
  }

  /**
   * The road surface at a point, in metres, including crossfall.
   *
   * This is the single source of truth for "where is the seal", and both the
   * terrain carve and the road mesh call it. Two copies of a camber formula
   * that disagree by a centimetre is a ribbon that z-fights along its whole
   * length, which is the most visible defect a road can have.
   *
   * `off` is metres from the centreline, unsigned. Real sealed roads are
   * crowned — a shallow roof so water runs to both shoulders — and it is worth
   * having because it is the thing that catches a highlight along the crown
   * and separates the two lanes without a line.
   */
  roadY(t, off) {
    const crown = ROAD_CROSSFALL * Math.min(Math.abs(off), ROAD_HALF);
    return this._pathYAt(t) - crown;
  }

  /* The grade line at a normalised arc length.
   *
   * pathY is stored per trail *sample*, so this has to go through the trail's
   * arc-length-to-index map rather than scaling `t` by the array length. The
   * two differ by up to 23 m on this alignment — see Trail.indexAt() — and
   * since both the carve and the road mesh read their elevation from here,
   * using the wrong one does not tilt the road, it detaches it. */
  _pathYAt(t) {
    const f = this.trail.indexAt(t);
    const i = Math.min(this.pathY.length - 2, Math.floor(f));
    return lerp(this.pathY[i], this.pathY[i + 1], f - i);
  }

  /** Metres of water over this point, 0 on dry land. */
  depthAt(x, z) { return Math.max(0, LAKE_Y - this.height(x, z)); }

  evalHeight(x, z, q = {}) {
    this.sampleField(x, z, q);
    /* `q` is one shared object refilled per sample, so anything this function
     * writes into it has to be cleared here or it leaks to the next vertex. */
    q.road = 0;
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
    /* The bed. Steep close in, then flattening — see bedProfile(). The previous
     * profile used a single 1:12 grade, which is a sand foreshore, and more to
     * the point it met the water at the same slope as the land side met it: near
     * zero. That is what made the margin unreadable. A vertical wobble on ground
     * that is flat at the contact moves the waterline tens of metres sideways,
     * so no relief could usefully be added to it; a finite slope on both sides
     * is the precondition for the shore having any texture at all. */
    let y = fromShore < 0 ? bedProfile(-fromShore) : 0;

    /* ── the land ─────────────────────────────────────────────────────────── */
    if (fromShore >= 0) {
      /* The shingle bank. Wave-built: a short steep face out of the water up
       * to a crest, then a gentle back-slope. The crest is where the biggest
       * storm waves stopped, and it is the sharpest line in the whole basin. */
      /* Exponential rather than a smoothstep, so the face has its full slope
       * at the waterline instead of easing in from flat. The berm height is
       * unchanged; only the first two metres differ, and they are the two
       * metres the whole shore is read from. */
      const face = 1.55 * (1 - Math.exp(-fromShore / 7.4));
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
      const wallStart = 108;
      const u = Math.max(0, fromShore - wallStart) / 224;
      /* Only the terrace riser belongs inside the playable field. A previous
       * 64 m profile was geologically plausible at kilometre scale but here it
       * occupied half the player's forward frame and hid the actual Southern
       * Alps. Twenty-nine metres keeps the U-shaped break of slope legible
       * while leaving the distant range as the basin's subject. */
      y += 25 * (u * u) + 4 * smoothstep(0.6, 1.0, u);

      /* The lateral moraine bench, a level shelf cut into that wall. Its
       * flatness is the giveaway that it was dumped by ice and not eroded by
       * water, so it is flattened explicitly rather than left to noise. */
      const benchC = 74, benchW = 26;
      const onBench = Math.exp(-(((fromShore - benchC) / benchW) ** 2));
      y = lerp(y, 15.0 + 2.2 * n.fbm(x * 0.02, z * 0.02, 3, 0.5), onBench * 0.82);

      /* The two alluvial fans. Convex cones, spreading from the wall down to
       * the water, and the reason the track has to climb inland twice. */
      /* Fan surfaces, from the same table shoreX() uses — see FANS. Two hardcoded
       * z values would have left the rest of a 2 km valley without any of the
       * landform that gives this road its only real gradients. */
      for (const [fu, famp, fw] of FANS) {
        const fz = BOUNDS.z0 - fu * VALLEY;
        const fh = 0.30 * famp, fr = 2.4 * fw;
        const r = Math.hypot((z - fz) * 1.5, Math.max(0, fromShore + 10)) / fr;
        if (r < 1) {
          const cone = (1 - r) ** 1.6 * fh;
          y = Math.max(y, cone + 0.9 * n.fbm(x * 0.06, z * 0.06, 3, 0.5) * (1 - r));
        }
      }

      /* Hummocky moraine everywhere between the bench and the wall. Most of
       * its relief is broad: the previous equal-amplitude 20–40 m fBm covered
       * the whole terrace in regular pillow-like wrinkles. Real spring sward
       * reveals long low rises, with only a restrained kettle-scale detail. */
      const till = smoothstep(24, 60, fromShore) * (1 - onBench * 0.7);
      y += till * 2.7 * n.fbm(x * 0.011, z * 0.010, 3, 0.54);
      y += till * 1.15 * n.fbm(x * 0.026, z * 0.023, 3, 0.52);
      y += till * 0.52 * nb.ridged(x * 0.014, z * 0.013, 3, 0.5);

      /* Keep the lakeward side of the track an overlook rather than a second
       * moraine wall.
       *
       * The fan and till terms above are intentionally allowed to raise broad
       * hummocks, but on the narrow strip between this east-shore route and
       * the water they could stack higher than the walker's eye. The lake was
       * then physically present fifty metres away yet hidden for the entire
       * walk by a four-metre berm — a glacial-lake level whose only view was
       * inland. On this side of the path, `q.dist + fromShore` is the local
       * path-to-water span, so their ratio gives a continuous grade from the
       * authored path elevation down to the wave-built shore. It caps only
       * accidental high ground; fans still project the shoreline through
       * shoreX(), and all terrain on the inland side keeps its full relief. */
      /* Only beyond the berm crest. Inside the wave-built face the overlook
       * term grades to zero at shoreX, which is correct as an *upper* target
       * for accidental till stacks — but applied inside the face it overwrites
       * the berm itself, so a modest negative cusp drops whole embayments below
       * LAKE_Y eight metres inland (z≈-170 failed lake-truth dry@+8 after R5
       * beach relief landed). Leave the first twelve metres to the face and
       * the cusp field; cap only the mid-strip hummocks that used to hide the
       * lake from the track. */
      if (q.side > 0 && q.dist > this.trail.widthAt(t) && fromShore > 12) {
        const span = Math.max(1, q.dist + fromShore);
        const overlook = this._pathYAt(t) * (fromShore / span)
          + 0.28 * n.fbm(x * 0.09, z * 0.09, 2, 0.5);
        y = Math.min(y, overlook);
      }

      /* Turf-scale landform. The 20–80 m moraine terms compose the hill, while
       * this one gives grazing light something to describe between individual
       * plants: low wind pillows and shallow drainage wrinkles, never repeated
       * blade geometry. It starts behind the storm berm so the water contour
       * remains owned by the dedicated beach field below. */
      const turfRelief = smoothstep(4.0, 17.0, fromShore);
      y += turfRelief * (
        0.15 * n.fbm(x * .115, z * .105, 3, .52)
        + 0.07 * nb.ridged(x * .19, z * .17, 2, .5)
      );
    }

    /* ── the beach, across the waterline ──────────────────────────────────
     * Applied to both sides, and that is the whole point of it. Every other
     * feature in this file is written in `fromShore` and therefore runs exactly
     * parallel to shoreX(z); the waterline was then the intersection of a flat
     * plane with a surface that had no relief in the one place it mattered, so
     * it came out as a mathematically smooth curve — read in a frame as a ruled
     * line, which is the single loudest tell that the lake is a plane and the
     * beach is a texture. shoreX() does carry bays and spits, but at 330 m and
     * 134 m wavelengths: over the forty metres of shore a walker can actually
     * see, a 330 m sine is a straight line.
     *
     * What a real shingle margin has, at the scales a standing person reads:
     *
     *   Cusps. Swash cuts rhythmic scallops into a shingle beach with horns
     *   fifteen to thirty metres apart, and this is the term that turns the
     *   waterline from a curve into a scalloped edge. Sampled along z only,
     *   because a cusp field is a shore-parallel rhythm and giving it x
     *   dependence would smear the horns.
     *
     *   Individual stones. At a metre and a half the swash has to run around
     *   cobbles, which frays the edge and is what makes it read as *shingle*
     *   rather than as a smooth berm of something finer.
     *
     * Both are vertical displacements, deliberately: the waterline should be
     * wherever the ground crosses the lake surface, not a second authored
     * curve. With the profile now finite-sloped on both sides, ±0.3 m of cusp
     * moves the contour about a metre and a half, which is the right order. */
    const band = 1 - smoothstep(2.0, 17.0, Math.abs(fromShore));
    if (band > 0.001) {
      const cusp = n.fbm(z * 0.055, 137.0, 2, 0.5) - 0.5;
      const cobble = n.fbm(x * 0.62, z * 0.62, 3, 0.5) - 0.5;
      y += band * (cusp * 0.60 + cobble * 0.11);
    }

    /* ── the track ─────────────────────────────────────────────────────────
     * Cut last, over whatever the landforms did, because a track is a thing
     * people made in a landscape rather than a feature of it. Flattened to the
     * authored profile within the tread and blended out over a few metres. */
    /* ── the road formation ────────────────────────────────────────────────
     * Cut last, over whatever the landforms did, because a highway is the most
     * emphatically man-made thing in this basin: it is the one surface here
     * that was levelled by a machine, and it should look like it won the
     * argument with the ground rather than compromised with it.
     *
     * Three bands, and they are the three bands a road cross-section actually
     * has. Skipped entirely while pathY is still being measured — see
     * _buildPathProfile().
     */
    if (this.pathY) {
      const seal = 1 - smoothstep(ROAD_HALF - 0.25, ROAD_HALF + 0.25, d);
      const form = 1 - smoothstep(ROAD_SHOULDER - 0.4, ROAD_SHOULDER + 0.4, d);
      const batter = 1 - smoothstep(ROAD_SHOULDER, ROAD_BATTER + 4.0, d);

      if (batter > 0.001) {
        /* The design surface: crowned seal, then the shoulder carrying the
         * same crossfall on out, so water keeps running off rather than
         * ponding at the seal edge. */
        const design = this.roadY(t, d)
          - Math.max(0, d - ROAD_HALF) * ROAD_CROSSFALL * 1.9;

        /* The formation is flattened to the design surface completely — no
         * clamp — and the batter is a smooth fillet from the formation edge
         * back into the natural ground. `batter` squared rather than linear
         * because a real batter meets the untouched ground tangentially and a
         * linear blend leaves a crease along both sides of every road ever
         * built this way. */
        const w = Math.max(form, batter * batter);
        y = lerp(y, design, w);

        /* Everything below is *on* the formation and must not be re-roughened
         * by the fine-grain term at the bottom of this function, so record how
         * much of this sample is road for that test. */
        q.road = Math.max(form, seal);

        /* A shallow table drain on the landward side, where a real road sheds
         * its water and where the cut meets the hill. Only on the uphill side,
         * only outside the shoulder, and only 0.22 m deep — it is a drainage
         * cue and a shadow line, not a ditch that can trap a car. */
        const drain = (1 - smoothstep(0.0, 2.4, Math.abs(d - (ROAD_SHOULDER + 1.6))))
          * (q.side > 0 ? 1 : 0.35) * (1 - form);
        y -= drain * 0.22;
      }
    }

    /* Fine grain everywhere on land, so no surface is perfectly smooth — and
     * for the first stretch of lake bed too, because in water this shallow the
     * bed is what the frame shows, and a perfectly smooth bed under clear water
     * looks like a plane with a tint over it. */
    /* Fine grain everywhere except on the road. A 0.12 m amplitude at a 2.9 m
     * period is the right texture for shingle and utterly wrong for a sealed
     * surface: it is below a walker's notice and it is precisely the frequency
     * a suspension resonates with at open-road speed. `q.road` was set by the
     * formation carve above. */
    if (fromShore >= -16) y += 0.12 * (1 - (q.road || 0)) * n.fbm(x * 0.35, z * 0.35, 2, 0.5);
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
    /* Wave zone only. Earlier the shingle channel stayed high out past 34 m
     * and the fans were almost fully gravel, so the basin floor looked like
     * bare pebble even where the flora is a continuous sward. Real terrace is
     * tussock mat with a narrow cobble foreshore; leave fans only partly open. */
    let shingle = 1 - smoothstep(2.0, 14.0, fromShore);
    for (const [fu, famp, fw] of FANS) {
      const fz = BOUNDS.z0 - fu * VALLEY, fr = 2.4 * fw;
      const r = Math.hypot((z - fz) * 1.5, Math.max(0, fromShore + 10)) / fr;
      shingle = Math.max(shingle, (1 - clamp(r, 0, 1)) * 0.42);
    }
    /* Crushed gravel, with a living edge. The old mask faded from the exact
     * centreline to one perfectly smooth width, so every route view exposed a
     * dark computer-drawn ribbon. Hold a readable tread through the centre and
     * move its transition by two irregular metre/sub-metre fields. Scanned
     * grass starts just outside this band in meadow.js and overlaps the blend,
     * which gives the route grass intrusion rather than a second border mesh. */
    const pathWidth = this.trail.widthAt(q.t);
    const pathEdge = this.n.fbm(x * .074 + 31, z * .074 - 17, 3, .52) * .34
      + this.nb.fbm(x * .23 - 9, z * .21 + 14, 2, .48) * .12;
    const pathGravel = 1 - smoothstep(
      pathWidth * .62 + pathEdge,
      pathWidth + .48 + pathEdge,
      q.dist,
    );
    shingle = Math.max(shingle, pathGravel * 0.64);
    out[0] = clamp(shingle, 0, 1);

    /* Wet: driven by height above the water, not by distance from shoreX.
     *
     * The distance form was a 4.5 m stripe centred 1.5 m inland, which runs
     * exactly parallel to the authored shoreline — so the dark wet band, the
     * foam and the waterline were three parallel curves at fixed offsets, and a
     * frame of the margin read as three ruled lines rather than as a shore.
     *
     * Elevation is also the actual physics: a cobble is dark because the swash
     * reached it recently or because capillary water has wicked up to it, and
     * both depend on how far above still water it sits, not on how far inland.
     * Run-up on a shingle face is around 0.4 m of head, with the bed staying
     * visibly damp for a while above that. Because the beach relief added to
     * evalHeight is vertical, this band now follows the same ragged contour as
     * the waterline itself, for free and by construction. */
    /* Capillary + recent run-up. Elevation alone is the physics, but the
     * station camera is 13 m inland on a 1:5 face, so above≈1.3 m there and a
     * pure 0.4–0.8 m head made the whole in-frame beach read dry. Keep the
     * primary head steep near the water and add a thin residual band that
     * follows distance-to-shore for the last run-up splash zone only — still
     * ragged because the height term rides the cusp field. */
    const above = y - LAKE_Y;
    const elevWet = (1 - smoothstep(0.01, 0.44, above)) * 0.92;
    const splash = (1 - smoothstep(0.3, 3.2, fromShore)) * (1 - smoothstep(0.38, 1.05, above)) * 0.42;
    out[1] = clamp(Math.max(elevWet, splash) + (depth > 0 ? 0.45 : 0), 0, 1);

    out[2] = this.hollowAt(x, z);
    out[3] = depth;
  }

  gravelAt(x, z) { return this.chanAt(0, x, z); }
  wetAt(x, z) { return this.chanAt(1, x, z); }
  subAt(x, z) { return this.chanLerp(3, x, z); }
}

/* The Tongariro Alpine Crossing, as a route.
 *
 * WHY THIS SCENE, AND WHY IT IS THE RIGHT THIRD ONE. Two measurements from the
 * existing levels decided it.
 *
 * The first is relief. Probing both for a place where the ground falls away on
 * BOTH sides of the path found 1.14 m on the lake and 0.23 m of notch on the
 * jungle walk — neither trail has a crossing, a gorge, a saddle or a drop, so
 * every set-piece that needs one is unbuildable there and two were abandoned
 * for exactly that reason. Terrain is authored, so a third level is the chance
 * to build the vertical the other two cannot have. The real Crossing climbs
 * 1120 m to 1886 m and drops off a knife-edge ridge on both sides at the top.
 *
 * The second is the frame-share audit: vegetation is 63.7% of a jungle frame,
 * and four separate attempts to fix its alpha-tested aliasing are recorded as
 * dead ends in world/vegetation.js. THIS PLACE HAS NO TREES. Above the saddle
 * it has no plants at all — it is ash, scoria, lava and steam — so the level
 * sidesteps the one problem in this project that is known to be unsolved.
 *
 * And the palette is the argument for a third scene at all: the lake is green
 * and turquoise, the bush is green and black, and this is RED. Oxidised scoria,
 * black lava, yellow sulphur, white steam and two emerald crater lakes. Nobody
 * will confuse a screenshot of it with either of the others.
 *
 * Route (looking down -Z, which is the direction of travel):
 *   0.00-0.18  Mangatepopo valley — old lava flows, a flat walk in
 *   0.18-0.26  Soda Springs — the last water, and the last green
 *   0.26-0.42  the Devil's Staircase — the climb, 200 m in 600
 *   0.42-0.58  South Crater — dead flat ash pan, no horizon but the rim
 *   0.58-0.72  Red Crater ridge — the high point, and a drop on BOTH sides
 *   0.72-0.82  the scree descent to the Emerald Lakes
 *   0.82-1.00  Blue Lake and the long traverse out
 */
import { smoothstep, clamp } from '../../world/noise.js';

/* Hand-placed for the same reason the jungle's are: a generated line wanders
 * without arriving. Each bend here hides the next stage of the climb, and the
 * ridge is not visible from the crater floor until you are on the last rise. */
const CONTROL = [
  [0, 30], [4, -10], [-6, -60], [2, -110], [14, -160],
  [6, -215], [-10, -265], [-4, -320], [8, -372], [16, -425],
  [4, -478], [-12, -530], [-6, -585], [6, -640], [2, -690],
  [-8, -742], [-2, -795], [4, -845],
];

/* Stage boundaries in normalised arc length. Named because every instrument,
 * every set-piece and the split timing all have to agree on where the South
 * Crater ends, and three files each holding their own copy of 0.58 is the bug
 * shape this project has hit four times. */
export const STAGES = {
  valley:    [0.00, 0.18],
  soda:      [0.18, 0.26],
  staircase: [0.26, 0.42],
  southCrater:[0.42, 0.58],
  redRidge:  [0.58, 0.72],
  scree:     [0.72, 0.82],
  blueLake:  [0.82, 1.00],
};

/* THE ELEVATION PROFILE, IN METRES, AND IT IS THE POINT OF THE LEVEL.
 *
 * Real crossing: Mangatepopo 1120, Soda Springs 1400, South Crater 1660,
 * Red Crater 1886, Emerald Lakes 1700, Blue Lake 1725, then down. Compressed
 * horizontally about 20x — the real walk is 19.4 km and this is under a
 * kilometre — so the gradients are steeper than the real track and that is a
 * deliberate trade: a faithful gradient over a compressed distance would make
 * the whole climb a ramp of two degrees and the Staircase would not exist.
 *
 * Held here as a table rather than as noise because the shape IS the content:
 * the flat crater floor between two climbs is what makes the ridge feel high,
 * and noise cannot be asked for that. */
const PROFILE = [
  [0.00, 1120], [0.10, 1150], [0.18, 1200], [0.26, 1245],
  [0.34, 1420], [0.42, 1655], [0.50, 1662], [0.58, 1668],
  [0.65, 1886], [0.72, 1840], [0.78, 1712], [0.82, 1700],
  [0.90, 1725], [1.00, 1560],
];

/** Height of the track surface, in metres above sea level, at arc length t. */
export function trackElevation(t) {
  const u = Math.max(0, Math.min(1, t));
  for (let i = 0; i < PROFILE.length - 1; i++) {
    const [t0, e0] = PROFILE[i], [t1, e1] = PROFILE[i + 1];
    if (u <= t1) {
      const f = (u - t0) / Math.max(1e-6, t1 - t0);
      /* Smoothstep between control points, so the profile has no corners for
       * the walker to trip over and no creases for the shading to catch. */
      return e0 + (e1 - e0) * smoothstep(0, 1, f);
    }
  }
  return PROFILE[PROFILE.length - 1][1];
}

/** Which named stage t falls in. */
export function stageAt(t) {
  for (const [name, [a, b]] of Object.entries(STAGES)) {
    if (t >= a && t < b) return name;
  }
  return 'blueLake';
}

export const ROUTE = {
  control: CONTROL,
  /* How wide the walked corridor is. The Staircase and the ridge are narrow
   * because they physically are — on Red Crater the poled route is a metre
   * wide with the crater on one side — and the crater floor is wide because
   * there is nothing there to constrain it. */
  widthAt(t) {
    if (t >= STAGES.redRidge[0] && t < STAGES.redRidge[1]) return 1.1;
    if (t >= STAGES.staircase[0] && t < STAGES.staircase[1]) return 1.5;
    if (t >= STAGES.southCrater[0] && t < STAGES.southCrater[1]) return 3.4;
    if (t >= STAGES.scree[0] && t < STAGES.scree[1]) return 2.2;
    return 2.0;
  },
};

/* THE CROSS-SECTION, AS A PURE FUNCTION OF THE ROUTE.
 *
 * Height above the datum at arc length `t`, on `side` (+1 crater / uphill,
 * -1 outer / downhill), `a` metres from the centreline. No noise, no world
 * coordinates, no terrain instance.
 *
 * It is separate for one reason: the entire argument for this level is its
 * topology, and tools/tprofile.mjs has to be able to measure that without
 * building a heightfield. Two copies of this maths — one in the tool and one
 * in the terrain — is the bug shape this project has hit four times, most
 * expensively when the gearbox lived in both the audio and the instruments.
 * One function, both callers.
 */
/* The start of the walk is 1120 m above the sea and the engine works in metres
 * from zero, so the whole field is offset down by this. Kept as a named
 * constant because every sign, altimeter and split in the level quotes real
 * heights and all of them have to add it back. */
export const DATUM = 1120;

export function crossSection(t, side, a) {
  const u = clamp(t, 0, 1);
  /* WEIGHTED BLEND OF STAGE PROFILES, NOT AN if/else CHAIN.
   *
   * The first version picked one stage's cross-section by a range test, and
   * that put a CLIFF ACROSS THE WHOLE MAP at every stage boundary: at 260 m
   * from the trail South Crater says +96 m and the Red Crater ridge says
   * -118, so the ground stepped 178 m over four tenths of a metre of walking.
   * Rendered, that is the vertical fluted wall standing in the middle of the
   * crater floor in the first three builds, and I spent two of them blaming
   * the slope limit and the LOD stitching.
   *
   * A mountain does not change shape at a line. Each stage now contributes a
   * weight that ramps over a band either side of its boundaries, so the crater
   * floor becomes the ridge over about thirty metres of walking, which is also
   * what it does on the ground. */
  const BAND = 0.045;
  let sum = 0, wsum = 0;
  for (const [name, [s, e]] of Object.entries(STAGES)) {
    const w = smoothstep(s - BAND, s + BAND, u) * (1 - smoothstep(e - BAND, e + BAND, u));
    if (w <= 0.0005) continue;
    sum += w * stageOffset(name, side, a);
    wsum += w;
  }
  const lateral = wsum > 1e-4 ? sum / wsum : stageOffset('valley', side, a);
  return trackElevation(u) - DATUM + lateral;
}

/* What the ground does either side of the track, per stage. Pure, so
 * tools/tprofile.mjs can measure the topology without a terrain or a trail. */
function stageOffset(name, side, a) {
  switch (name) {
    case 'valley':
    case 'soda':
      return smoothstep(22, 245, a) * 145 + smoothstep(8, 34, a) * 6;
    case 'staircase':
      return smoothstep(6, 150, a) * 70 * (side > 0 ? 1 : -0.35);
    case 'southCrater':
      /* Dead flat to 230 m, then the rim. Genuinely flat rather than gently
       * noisy: on a kilometre of ash with nothing else to look at, a
       * two-metre undulation is visible from the far side. */
      return smoothstep(230, 430, a) * 96;
    case 'redRidge':
      /* The knife edge: the crater on one side, the outer face on the other.
       * This is the drop the other two levels do not have. */
      return side > 0 ? -smoothstep(7, 190, a) * 118 : -smoothstep(9, 150, a) * 86;
    case 'scree':
      return side > 0 ? smoothstep(4, 130, a) * 60 : -smoothstep(4, 210, a) * 96;
    default:
      return smoothstep(30, 240, a) * 42 * side;
  }
}

export const BOUNDS = { x0: -260, x1: 260, z0: 60, z1: -880 };

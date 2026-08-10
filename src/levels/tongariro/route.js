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
import { smoothstep } from '../../world/noise.js';

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

export const BOUNDS = { x0: -260, x1: 260, z0: 60, z1: -880 };

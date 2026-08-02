/* Where this walk goes.
 *
 * Route (looking down -Z, which is the direction of travel):
 *   0.00-0.25  closed canopy, wide soft trail, deep shade
 *   0.25-0.62  the trail narrows and the walls close in
 *   0.62-0.80  ground rises, light starts breaking through
 *   0.80-1.00  clearing: ruins, plunge pool, cliff and falls at the end
 */
import { smoothstep } from '../../world/noise.js';

/* Hand-placed rather than generated. A random walk gives you a trail that
 * wanders without ever arriving; these are chosen so each bend hides what
 * comes next and the clearing is a reveal rather than something visible from
 * the start. */
const CONTROL = [
  [0, 24], [0, 0], [5, -30], [-9, -58], [-6, -90],
  [9, -118], [21, -148], [13, -180], [-4, -208], [-3, -240],
  [11, -270], [7, -300], [1, -330], [0, -358], [0, -378],
];

export const PATH_END_Z = -358;   // plunge pool centre
export const CLIFF_Z = -392;      // cliff face plane

export const ROUTE = {
  control: CONTROL,

  /**
   * The narrowing is the level's only real pacing device, so it is authored
   * rather than noised: wide and easy at the trailhead, pinched in the middle
   * where the walls close in, then opening out into the clearing.
   *
   * Half-widths, so these are metres either side of the centre line. A foot
   * trail in rainforest is roughly a metre across at the trailhead and less
   * than that once the understory starts closing in — anything wider stops
   * reading as a path worn by walking and starts reading as a road.
   */
  widthAt(t) {
    let w = 1.00;
    w -= smoothstep(0.18, 0.55, t) * 0.42;          // narrowing
    w += smoothstep(0.62, 0.80, t) * 0.45;          // opening toward the light
    w += smoothstep(0.80, 0.95, t) * 3.1;           // clearing floor
    return w;
  },

  clearing(t) { return smoothstep(0.78, 0.90, t); },
};

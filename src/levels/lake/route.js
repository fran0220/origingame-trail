/* A walk up the eastern shore of a glacial lake.
 *
 * The geography is Pukaki's, and the reason for choosing that end of the
 * Mackenzie rather than Tekapo's is the sightline: Pukaki is a long finger of
 * water pointing straight at Aoraki, so a path up its shore has the mountain
 * at the end of it the whole way. The level does not have to arrange a reveal;
 * the valley already is one.
 *
 * Route (looking down -Z, which is the direction of travel and, here, north
 * up the lake toward the divide):
 *   0.00-0.20  moraine terrace, the lake first seen below and to the left
 *   0.20-0.45  down onto the shingle, walking the waterline
 *   0.45-0.70  an alluvial fan pushes the path back up and inland
 *   0.70-0.88  back to the shore, the range now filling the head of the lake
 *   0.88-1.00  the delta flat at the head, where the water goes turquoise
 *
 * The lake lies to the west, which is -X. That is not arbitrary either: the
 * sun is in the north here, so a shore on this side puts the light across the
 * water rather than behind it, and the range keeps its modelling instead of
 * flattening into a silhouette.
 */
import { smoothstep } from '../../world/noise.js';

/* Hand-placed, and much straighter than the jungle's. A lakeshore path has
 * nowhere to hide: the whole basin is visible from everywhere in it, so bends
 * cannot be used to conceal what comes next and pretending otherwise produces
 * a path that wanders for no reason a walker can see. What these do instead is
 * follow the shape the water and the fans left — out onto each shingle spit,
 * back in behind each fan. */
const CONTROL = [
  [46, 60], [44, 20], [40, -30], [30, -84], [22, -140],
  [18, -196], [26, -248], [38, -300], [34, -352], [22, -404],
  [12, -452], [6, -500], [2, -548], [0, -590], [-2, -624],
];

/** Where the walk ends, at the head of the lake. */
export const HEAD_Z = -590;

export const ROUTE = {
  control: CONTROL,
  samples: 1100,

  /* Wider than a forest trail and for a different reason. Nothing here is
   * worn through undergrowth — this is a braided-gravel and tussock basin, and
   * the "path" is where feet and wheels have crushed a lane through matagouri
   * and shingle. It reads as a track, not a tread. */
  widthAt(t) {
    let w = 1.30;
    w += smoothstep(0.20, 0.45, t) * 0.9;           // out onto open shingle
    w -= smoothstep(0.50, 0.66, t) * 0.7;           // pinched crossing the fan
    w += smoothstep(0.88, 1.00, t) * 2.4;           // the delta flat, trackless
    return w;
  },

  /* Open from the first metre. This is the inversion the whole level runs on:
   * the jungle's `clearing` ramps 0 to 1 because a forest encloses you until
   * it lets go, and a high-country basin never encloses you at all. The value
   * still varies, because the moraine terrace at the start does put banks on
   * both sides of the track, but it starts high and stays there. */
  clearing(t) { return 0.55 + 0.45 * smoothstep(0.05, 0.30, t); },
};

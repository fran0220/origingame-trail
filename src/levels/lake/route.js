/* State Highway 8 up the eastern shore of a glacial lake — the racing line.

 * This route was authored as a walk and is now driven, and almost everything
 * about it survived that change, which is worth saying because it was not
 * obvious in advance. A lakeshore alignment is a lakeshore alignment: it goes
 * where the water and the alluvial fans let it go, and that constraint
 * produces long sighted straights joined by open sweepers, which is also what
 * a fast road is. The one thing that had to change was the width — see
 * widthAt() below — and the one thing that had to be added was a grade the
 * suspension can live with, which basin.js now surveys rather than authoring.
 *
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
import { ROAD_HALF } from './basin.js';

/* Hand-placed, and much straighter than the jungle's. A lakeshore path has
 * nowhere to hide: the whole basin is visible from everywhere in it, so bends
 * cannot be used to conceal what comes next and pretending otherwise produces
 * a path that wanders for no reason a walker can see. What these do instead is
 * follow the shape the water and the fans left — out onto each shingle spit,
 * back in behind each fan. */
const CONTROL = [
  /* Explicitly follow the authored shoreX() curve. The previous x values
   * drifted from 75 m inland at the start to 161 m around z=-352 despite the
   * route being described as a shore walk; the lake was consequently a thin
   * strip in every principal view. These controls hold 15–60 m of dry setback,
   * with the two fan crossings moving inland and the delta returning to the
   * water. Basin truth still owns the exact contour. */
  [29, 60], [29, 20], [11, -30], [-17, -84], [-41, -140],
  [-74, -196], [-81, -248], [-49, -300], [-72, -352], [-101, -404],
  [-103, -452], [-79, -500], [-51, -548], [-21, -590], [-3, -624],
];

/** Where the walk ends, at the head of the lake. */
export const HEAD_Z = -590;

export const ROUTE = {
  control: CONTROL,
  samples: 1100,

  /* Half-width of the *tread*, which for this level means the sealed lane
   * surface, and which is now a constant.
   *
   * It used to taper — narrower crossing the fan, wider on the delta — because
   * it described a footpath, and a footpath is as wide as the feet that made
   * it. A state highway is the opposite kind of object: it is a constant
   * cross-section held through everything the terrain does, and the places
   * where it would have been expensive to hold it are exactly where a real
   * road shows its engineering instead, in a cutting or on an embankment. The
   * carve in basin.js does that; this number stays put.
   *
   * Everything that consumes trail width — plant exclusion, prop scatter,
   * collision — therefore now gets the seal edge, and the shoulder and batter
   * come from the ROAD_* constants beside the carve. */
  widthAt() { return ROAD_HALF; },

  /* Open from the first metre. This is the inversion the whole level runs on:
   * the jungle's `clearing` ramps 0 to 1 because a forest encloses you until
   * it lets go, and a high-country basin never encloses you at all. The value
   * still varies, because the moraine terrace at the start does put banks on
   * both sides of the track, but it starts high and stays there. */
  clearing(t) { return 0.55 + 0.45 * smoothstep(0.05, 0.30, t); },
};

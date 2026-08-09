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
 * The geography is Tekapo's — the eastern lake of the Mackenzie three, the one
 * State Highway 8 actually runs beside, and the one with a road worth timing.
 *
 * This was authored as Pukaki, on a sightline argument: Pukaki is a long
 * finger of water pointing straight at Aoraki, so a walk up its shore has the
 * mountain at the end of it the whole way and never has to arrange a reveal.
 * That argument is correct and it is an argument about *walking*. It stops
 * deciding anything once the level is driven, because at 100 km/h the subject
 * at the end of the valley is no longer the thing being revealed — the next
 * corner is — and what the road wants instead is the shape Tekapo's eastern
 * shore has: long sighted straights along the terrace with the water below on
 * one side, joined by open sweepers around the alluvial fans.
 *
 * The alignment itself is unchanged, because both lakes are the same landform
 * — a moraine-dammed glacial trough with fans coming off the eastern wall —
 * and the control points below were following that, not a survey.
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
import { ROAD_HALF, BOUNDS, shoreX } from './basin.js';

/* Hand-placed, and much straighter than the jungle's. A lakeshore path has
 * nowhere to hide: the whole basin is visible from everywhere in it, so bends
 * cannot be used to conceal what comes next and pretending otherwise produces
 * a path that wanders for no reason a walker can see. What these do instead is
 * follow the shape the water and the fans left — out onto each shingle spit,
 * back in behind each fan. */
/* Generated from shoreX() rather than hand-placed, and that is a change of
 * method forced by the length.
 *
 * Fifteen hand-placed points described 760 m of shore. Two kilometres of it
 * would be forty, and hand-placing forty points against a curve that is itself
 * authored is not authorship, it is transcription — the previous set had
 * already drifted off the shoreline it was meant to follow and had to be
 * rewritten once for exactly that reason.
 *
 * So the alignment is the shoreline, offset inland by a setback that breathes.
 * Everything that makes this a good road to drive is already in shoreX(): the
 * bays and spits put in long open curves at a 330 m and a 134 m wavelength, and
 * the six alluvial fans push the water out into lobes that the road has to
 * swing around. Following that at a varying distance produces sighted straights
 * joined by sweepers, which is what a lakeshore highway is, and it cannot drift
 * away from the water because it is defined by it.
 *
 * The setback runs 16 to 46 m at two incommensurate wavelengths, so the road
 * closes on the water and opens away from it without ever repeating.
 */
const CONTROL = (() => {
  /* The road does not follow the shoreline. It follows the *trend* of it.
   *
   * The first version of this offset shoreX() directly, and shoreX() is not a
   * road alignment — it carries six alluvial fan lobes 15 to 30 m tall over
   * widths of 36 to 58 m, plus bays at 330 m and 134 m. Tracing that at a fixed
   * setback produced corners of 34 to 100 m radius, which is hairpin geometry:
   * the telemetry showed the car held its lane to 1-4 m over most of the stage
   * and then ran 36 m wide between t=0.25 and t=0.35, which is not a car
   * failing, it is a road no car could take at open-road speed.
   *
   * What a real highway does with an alluvial fan is cut across the back of it
   * and let the shingle run out to the water on its own. So the alignment is
   * built from a heavily smoothed shoreline — a ±170 m moving average, which is
   * wider than any fan and any bay — and the fans then bulge out toward the
   * road rather than dragging it around them. The long 1.4 km swing of the lake
   * survives the filter, because that is the only thing in shoreX() bigger than
   * the window, and it is exactly the part a road would follow.
   */
  const SMOOTH_M = 170, SAMPLE = 10;
  const trend = (z) => {
    let sum = 0, n = 0;
    for (let o = -SMOOTH_M; o <= SMOOTH_M; o += SAMPLE) { sum += shoreX(z + o); n++; }
    return sum / n;
  };

  const pts = [];
  const z0 = BOUNDS.z0 - 10, z1 = BOUNDS.z1 + 40;
  const STEP_Z = 60;
  for (let z = z0; z >= z1; z -= STEP_Z) {
    /* The corners, and they are authored as a radius rather than as an
     * amplitude that looked about right.
     *
     * A sinusoidal lateral offset of amplitude A and wavelength L has a minimum
     * radius of curvature R = L^2 / (4 pi^2 A), so picking the corner you want
     * fixes the amplitude. Smoothing the shoreline to kill the hairpins left a
     * 316 m minimum radius — a road that is flat out from end to end, 0.41
     * degrees of average steering, and 0.13 g of mean lateral, which is not a
     * stage either. It is the same mistake as the hairpins, in the other
     * direction.
     *
     * These two give about 180 m and about 145 m on their own and rather less
     * where they add. v = sqrt(a R) at 8.6 m/s^2 makes a 145 m corner a 115
     * km/h corner and a 110 m one about 100 km/h, so a car arriving at 160 has
     * to brake for them — which is the thing that was missing. */
    const setback = 36
      + 14 * Math.sin(z * (2 * Math.PI / 430) + 0.7)
      + 6 * Math.sin(z * (2 * Math.PI / 250) + 2.1);
    pts.push([trend(z) + setback, z]);
  }
  return pts;
})();

/** Where the walk ends, at the head of the lake. */
export const HEAD_Z = BOUNDS.z1 + 90;

export const ROUTE = {
  control: CONTROL,
  /* About 0.55 m between samples over a 2.2 km alignment. The polyline is what
   * every distance query and the road ribbon are built from, so its spacing is
   * the resolution of the road's geometry rather than a performance knob. */
  samples: 4000,

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

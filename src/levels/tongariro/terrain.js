/* The shape of the Crossing.
 *
 * One height function, written before any mesh, because the whole argument for
 * this level is its topology and that can be measured without drawing anything.
 *
 * What the ground does either side of the track is different in every stage,
 * and that — not the texture — is what makes a stage recognisable:
 *
 *   VALLEY: walls rise on both sides. You are in something.
 *   STAIRCASE: a slope you climb directly, ground rising ahead and to one side.
 *   SOUTH CRATER: dead flat in every direction to a distant rim. The only
 *     place in any of the three levels with no near geometry at all, and the
 *     emptiness is the content: it is a kilometre of grey ash with a horizon.
 *   RED CRATER RIDGE: THE GROUND FALLS AWAY ON BOTH SIDES. This is the thing
 *     the other two levels were measured for and do not have — 1.14 m on the
 *     lake, 0.23 m of notch on the jungle. Here it is a hundred metres into
 *     the crater on the left and a scree face on the right, and every
 *     set-piece that needs exposure becomes possible.
 *   SCREE: one wall, one long fall to the lakes.
 */
import { Noise2D, clamp, smoothstep, lerp } from '../../world/noise.js';
import { trackElevation, STAGES, BOUNDS } from './route.js';

const n1 = new Noise2D(0x7a11e0);
const n2 = new Noise2D(0x51d3a9);
const n3 = new Noise2D(0x2c8f41);

/* Ridged noise, because a volcano is made of creases and spurs the same way an
 * eroded valley is — fbm alone gives lumps, and lumps read as terrain that has
 * never had water or lava move across it. */
function ridged(x, z, f) {
  return 1 - Math.abs(n1.n(x * f, z * f));
}

/**
 * Ground height in metres at a world point, given how far it is from the
 * track (`lat`, signed, metres) and where along the track it is (`t`).
 */
export function elevation(x, z, t, lat) {
  const base = trackElevation(t);
  const a = Math.abs(lat);
  let h = base;

  const inStage = (s) => t >= STAGES[s][0] && t < STAGES[s][1];

  if (inStage('valley') || inStage('soda')) {
    /* A U-shaped glacial-then-lava valley: flat floor, walls that start about
     * 25 m out and climb hard. */
    h += smoothstep(22, 130, a) * 145 + smoothstep(8, 30, a) * 6;
  } else if (inStage('staircase')) {
    /* Climbing a face: the ground keeps rising to the left of the poled route
     * and drops away behind and to the right. */
    h += smoothstep(6, 90, a) * 70 * (lat > 0 ? 1 : -0.35);
  } else if (inStage('southCrater')) {
    /* DEAD FLAT, and it has to be genuinely flat rather than gently noisy: a
     * crater floor of ash is the one surface where a 2 m undulation would be
     * visible from a kilometre away because there is nothing else to look at.
     * The rim is 260 m out and that is the only relief. */
    h += smoothstep(230, 330, a) * 190;
    h += (n2.n(x * 0.010, z * 0.010)) * 0.5;
  } else if (inStage('redRidge')) {
    /* THE KNIFE EDGE. Left is the crater: a 110 m drop starting 7 m from the
     * poles. Right is the outer face: steep but not vertical. Nothing in this
     * project has had this before. */
    const crater = -smoothstep(7, 95, a) * 118;
    const outer = -smoothstep(9, 120, a) * 86;
    h += lat > 0 ? crater : outer;
    /* The ridge itself is rubble, not a smooth arete. */
    h += ridged(x, z, 0.055) * 3.2 * (1 - smoothstep(0, 26, a));
  } else if (inStage('scree')) {
    /* One wall above, one long unbroken fall below — a scree slope is defined
     * by being the same angle for hundreds of metres, which is the angle of
     * repose and not a shape anyone chooses. */
    h += lat > 0 ? smoothstep(4, 70, a) * 60 : -smoothstep(4, 150, a) * 96;
  } else {
    /* Blue Lake and the traverse out: broad, open, falling away slowly to the
     * north with old flows underfoot. */
    h += smoothstep(30, 200, a) * 42 * (lat > 0 ? 1 : -1);
  }

  /* Common relief on everything except the crater floor, which owns its own
   * flatness above. */
  if (!inStage('southCrater')) {
    h += ridged(x, z, 0.018) * 7.5;
    h += n3.n(x * 0.045, z * 0.045) * 1.9;
  }
  return h;
}

export { BOUNDS };

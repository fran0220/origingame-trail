/* The rally car, built out of arithmetic.
 *
 * Nothing here is loaded. A glTF would be the obvious way to get a car into a
 * scene and it is the wrong trade for this project: an authored mesh arrives
 * with its own baked maps in someone else's colour space, its own idea of
 * scale, and no relationship to the shared canopy-light patch that every other
 * material in the frame goes through. Everything below is primitives, one
 * loft, and one baked tyre surface, so the car is lit by exactly the same
 * machinery as the road it is standing on.
 *
 * Three ideas carry the whole file.
 *
 * The shell is a single lofted surface, not an assembly of boxes. A car in
 * silhouette at thirty metres is one continuous line from splitter to spoiler
 * with a break at the beltline; a stack of boxes is a stack of boxes at any
 * distance, because a box has a hard horizontal edge where a car has a rolled
 * shoulder that carries a highlight along the whole flank. The loft below is
 * fifteen control sections, each a superellipse whose exponent, width and
 * tumblehome are keyed to that station of the car, resampled through a
 * Catmull-Rom spline. The nose, the screen base and the tail come out smooth
 * for free, and the two places a real car has a crease rather than a curve —
 * the base of the windscreen, and the closing radius at each end — get a
 * doubled control station, because two stations 80 mm apart is what a spline
 * understands as a hard edge.
 *
 * The glass is sampled off that same loft surface rather than modelled. Every
 * pane is a rectangle in the loft's own (station, ring-angle) coordinates,
 * pushed 12 mm proud along the surface normal — which is roughly where bonded
 * automotive glazing actually sits, on a flange outboard of the aperture. The
 * consequence that matters is that glass cannot drift off the body: change a
 * roof height or the screen rake and the windscreen follows, because it is a
 * function of the same fifteen numbers.
 *
 * The wheels are the part that is worth real triangles. A wheel is the only
 * thing on a car that is close to the camera, moving fast, and known to
 * everyone in the audience by heart. A tyre is therefore a revolved carcass
 * with a genuine section — bead, sidewall bulge, shoulder radius, crowned
 * tread — and not a torus, because a torus has its widest point at the tread
 * and a real tyre has it at the sidewall, which is why torus wheels always
 * read as doughnuts. The tread pattern is a baked surface with real grooves in
 * its normal and roughness maps rather than a texture painted on the albedo,
 * so the blocks catch light along their leading edges as the wheel turns.
 *
 * Frame convention, and it is deliberately not the mesh's own centre: the
 * origin is the centre of the REAR AXLE, at ground level, +Z forward, +Y up.
 * A vehicle's rear axle is where a bicycle model puts its reference point and
 * where a trailer hitch, a handbrake slide and a reversing arc all pivot from,
 * so a simulation that owns this mesh can drive root.position directly with no
 * offset to remember and no offset to get wrong.
 */
import * as THREE from 'three';
import { LIVERY_PARS, LIVERY_BODY,
         DAMAGE_PARS, DAMAGE_VERT, DAMAGE_FRAG } from './livery.js';
import { buildCockpit, EYE as COCKPIT_EYE } from './cockpit.js';
import { setInstruments } from './instruments.js';

/* Paint the competition livery on. See livery.js — it is a two-plane
 * projection in object space, so it needs no UV map and survives the body
 * sections being retuned. */
function liveryPaint(material) {
  /* One uniform array shared by the material, so damage can be written from
   * outside without reaching into the compiled shader. */
  material.userData.dents = { value: [
    new THREE.Vector4(), new THREE.Vector4(),
    new THREE.Vector4(), new THREE.Vector4(),
  ] };
  material.onBeforeCompile = (sh) => {
    sh.uniforms.uDents = material.userData.dents;
    sh.vertexShader = 'varying vec3 vCarLocal;\nvarying vec3 vCarNrm;\n' +
      DAMAGE_PARS +
      sh.vertexShader.replace('#include <begin_vertex>',
        '#include <begin_vertex>\n  vCarLocal = position;\n  vCarNrm = normal;\n'
        + DAMAGE_VERT);
    sh.fragmentShader = LIVERY_PARS + DAMAGE_PARS + sh.fragmentShader.replace(
      '#include <color_fragment>',
      '#include <color_fragment>\n' + LIVERY_BODY + DAMAGE_FRAG);
  };
  material.customProgramCacheKey = () => 'car-livery-damage-v1';
  return material;
}
import { bakeSurface } from '../gfx/bake.js';

/** Front to rear axle, in metres. Group B homologation hatch territory. */
export const WHEELBASE = 2.62;

/** Left to right wheel centres, in metres.
 *
 * Widened from the 1.58 m of the road car it is based on. A rally homologation
 * car gains track before it gains anything else — wider track is the cheapest
 * roll-stiffness there is, and it is the reason the works cars need the box
 * arches in the first place. The number is set against the arch geometry
 * below: at 1.66 m the outer sidewall lands within about 10 mm of the arch
 * lip, which is what "the tyre fills the arch" means and is the difference
 * between a rally car and a hatchback with its wheels tucked under it.
 */
export const TRACK = 1.66;

/** Loaded rolling radius, in metres: a 205/65 R15 gravel tyre. */
export const WHEEL_R = 0.34;

const TAU = Math.PI * 2;

/* Where the shell pivots when weight transfers.
 *
 * A car does not tip about its contact patches, it rotates about its centre of
 * mass while the springs at each corner take up the difference, and the visual
 * difference between the two is the whole point of the animation. Pivoting at
 * the origin swings the nose through half a metre for two degrees of pitch and
 * reads as the vehicle falling over; pivoting here moves the nose down and the
 * tail up by the same small amount, which is what a dive under brakes looks
 * like. Mid-wheelbase and 0.45 m up is a fair guess for a transverse-engined
 * hatch with a roll cage in it — the mass is low, but not as low as the sports
 * cars whose centre of mass sits nearer 0.35.
 */
const COM_Y = 0.45;
const COM_Z = WHEELBASE * 0.5;

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => { const x = clamp(t, 0, 1); return x * x * (3 - 2 * x); };

/* Seeded, because a car that is subtly different every time the level loads is
 * a car that cannot be compared between two captures of the same frame. The
 * only thing that wants randomness here is the starting tread phase of each
 * wheel, so that four wheels stopped at a junction are not four copies of one
 * wheel at the same clock angle. */
function makeRng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

/* ── the shell's control sections ─────────────────────────────────────────
 *
 * One row per station, ordered nose-last so that increasing station index runs
 * backwards to forwards; `z` is metres ahead of the rear axle.
 *
 *   yB, yT   the bottom of the sill and the top of the roof at that station
 *   wB       half-width at the sill — always tucked in, because every car has
 *            a rocker that is narrower than its doors and that tuck is what
 *            puts a dark line along the bottom of the flank
 *   wMax     half-width at the beltline, the widest point of the section
 *   wTop     half-width at the roof or bonnet, i.e. the tumblehome
 *   vBelt    where up the section that widest point sits, 0 at the sill and
 *            1 at the roof
 *   n        superellipse exponent: 2 is an ellipse, large is a box. Sections
 *            through the cabin want ~3.4, which is a flank that is essentially
 *            flat with a 60 mm-ish rolled shoulder into the roof and the sill.
 *            The closing sections at each end drop toward 2.6 so the nose and
 *            tail round off instead of ending in a chamfered brick.
 *
 * The overall package is 4.18 m long, 1.72 m wide across the doors and 1.48 m
 * tall, which is a current-generation supermini on rally springs.
 *
 * The sill sits at 150 mm, down from the 190 mm this table was first authored
 * with. 190 mm is defensible for a car built to cross a ford, and it is the
 * wrong number for the only view that matters here: from a chase camera the
 * gap between the top of each tyre and the arch above it is the whole reading
 * of a car's stance, and at 190 mm this one read as a crossover on stilts.
 * What separates a rally car from a soft-roader is that it is a *low* car with
 * long-travel springs, not a tall one.
 */
/* ROOF HEIGHT AND BELT LINE, RESET TOGETHER — this is what made the car read
 * as a tall MPV wearing a rally livery rather than as a rally car.
 *
 * Two faults, and neither was the shape of any single panel.
 *
 * THE ROOF WAS 1.478 AND FLAT ACROSS THREE STATIONS, from z = 0.42 to 1.62.
 * That is 1.2 m of dead level roof on a 4.19 m car. A current WRC car is about
 * 1.36 m to the roof and its peak is a short crown over the B-pillar that
 * falls away both ways; a long flat top is the single most van-like thing a
 * body can have, and no amount of arch flare or rear wing argues with it.
 *
 * THE BELT LINE WAS AT 0.50, so exactly half the body side was glass. Road
 * cars are around there; a rally car is nowhere near it. The shell is caged,
 * the glass is thin polycarbonate and it is kept small, and the visual result
 * — deep painted flanks under a shallow band of window — is most of why one
 * looks purposeful standing still. At 0.50 this car had the glass-to-metal
 * ratio of a people mover.
 *
 * Roof down about 8% and the belt up to 0.635 through the cabin, tapering at
 * both ends so the crown still falls away rather than stepping. The arches,
 * track and wheels are untouched: they were already right, and they only
 * looked small because the body above them was too tall. */
const STATIONS = [
  /* WIDTHS FIRST, because the whole car used to be one width.
   *
   * Every station between the bumpers sat at 0.86 of half-width, so the doors,
   * the rear quarter and the tail were all exactly as wide as each other — and
   * as wide as the wheels, whose outer faces are at 0.93. A body the same width
   * as its own tyres has no arches: the blisters had nothing to stand proud of,
   * the wheels were swallowed, and the tail read as a pod because there was no
   * waist anywhere for it to be the end of.
   *
   * Real proportions put the greenhouse and the doors well inside the track and
   * flare the arches out over the wheels. The doors come in to 0.80; the tail
   * closes from 0.845 over the rear axle to 0.56 at the cap; only the two
   * stations across the axles keep a haunch, which is what a haunch is for. The
   * arch section is widened and buried less to match, so its lip now stands
   * about 90 mm out of a flank that has moved 60 mm in.
   *
   * Tail. Two separate lessons are baked into these five rows.
   *
   * The first is the exponent, and it was already right: a hatchback does not
   * end in a rounded nose-cone with the lamps stuck on its curve, it ends in a
   * stamped tailgate — a nearly flat panel, nearly full width, with a tight
   * rolled edge all round it — and a superellipse says exactly that with a
   * HIGH exponent, not a low one. So the width and the exponent are both held
   * up to 60 mm from the end and all of the closing happens in the cap.
   *
   * The second is the ROOFLINE, and it was badly wrong. The roof used to be
   * held at 1.40 m all the way back to the rear axle and then drop to 1.235 m
   * at the tail, which is a station wagon: 0.74 m of car behind the C-pillar
   * with almost no fall in it. Rendered from behind that is an egg, and no
   * amount of section exponent rescues it, because the shape the eye is
   * reading is the profile and the profile said van. Worse, it hid the rear
   * window — a backlight sampled onto a nearly horizontal roof is a skylight,
   * and the near-vertical surface it should have been on did not exist.
   *
   * The roof now falls 1.448 -> 1.330 -> 1.170 -> 1.030 over the same 0.68 m,
   * which is about 30 degrees and is a fast three-door hatch. Everything the
   * tail needed follows from that one change: there is now a raked surface for
   * the backlight to live on, the tailgate below it is short enough to be a
   * tailgate rather than a wall, and the spoiler has a roof edge to stand off
   * rather than a plateau to sit on.
   */
  { z: -0.790, yB: 0.420, yT: 0.950, wB: 0.495, wMax: 0.560, wTop: 0.480, vBelt: 0.55, n: 3.5 },
  { z: -0.730, yB: 0.360, yT: 1.030, wB: 0.740, wMax: 0.762, wTop: 0.612, vBelt: 0.55, n: 5.6 },
  { z: -0.590, yB: 0.265, yT: 1.170, wB: 0.752, wMax: 0.800, wTop: 0.668, vBelt: 0.55, n: 4.9 },
  /* rear quarter over the rear arch */
  { z: -0.340, yB: 0.175, yT: 1.258, wB: 0.760, wMax: 0.845, wTop: 0.715, vBelt: 0.58, n: 3.8 },
  { z: -0.050, yB: 0.155, yT: 1.338, wB: 0.780, wMax: 0.842, wTop: 0.672, vBelt: 0.61, n: 3.7 },
  /* roof: very slightly crowned, because a dead flat roof has no highlight on
   * it at all and reads as a lid.
   *
   * The cabin exponent is up from 3.4 to 3.7 for the same reason as the tail:
   * a door skin is a flat panel with a rolled shoulder, and a section that
   * rounds continuously from sill to roof is a bar of soap. 3.7 puts about
   * 50 mm of radius on the shoulder and leaves the rest of the flank straight,
   * which is what carries a long unbroken highlight down the side of a car. */
  { z: 0.420, yB: 0.15, yT: 1.362, wB: 0.78, wMax: 0.806, wTop: 0.640, vBelt: 0.635, n: 3.7 },
  { z: 1.000, yB: 0.15, yT: 1.352, wB: 0.78, wMax: 0.800, wTop: 0.632, vBelt: 0.635, n: 3.7 },
  { z: 1.620, yB: 0.155, yT: 1.296, wB: 0.78, wMax: 0.800, wTop: 0.616, vBelt: 0.62, n: 3.7 },
  /* windscreen: 0.435 m of rise over 0.68 m of run is 57 degrees from the
   * vertical, which is where modern screens sit — steep enough to be obviously
   * raked, shallow enough that the wipers still have somewhere to park */
  { z: 1.980, yB: 0.165, yT: 1.168, wB: 0.78, wMax: 0.806, wTop: 0.664, vBelt: 0.59, n: 3.6 },
  { z: 2.300, yB: 0.175, yT: 1.020, wB: 0.78, wMax: 0.826, wTop: 0.742, vBelt: 0.55, n: 3.7 },
  /* the doubled station: 80 mm apart with a 30 mm height step, which is how a
   * Catmull-Rom is told that the cowl is a crease and not a curve */
  { z: 2.380, yB: 0.175, yT: 0.990, wB: 0.78, wMax: 0.834, wTop: 0.762, vBelt: 0.55, n: 3.9 },
  /* Bonnet, falling away over the front axle at 2.62. The exponent is highest
   * here of anywhere on the car: a bonnet is the flattest panel on a vehicle
   * and the one whose highlight the eye uses to judge whether the whole shape
   * is straight. At 3.2 it was a pillow. */
  { z: 2.720, yB: 0.195, yT: 0.955, wB: 0.77, wMax: 0.855, wTop: 0.81, vBelt: 0.55, n: 4.0 },
  { z: 3.090, yB: 0.225, yT: 0.928, wB: 0.755, wMax: 0.852, wTop: 0.815, vBelt: 0.55, n: 4.1 },
  /* The nose is a FASCIA, not a cone, and this is the single biggest change
   * to the table.
   *
   * The previous numbers closed from 0.790 to 0.600 of half-width across
   * 120 mm at an exponent falling 3.0 -> 2.6. Read that as a shape rather than
   * as numbers: falling width plus falling exponent plus falling roof height
   * is a dome contracting in all three axes at once, and it is exactly what
   * the render showed — 0.7 m of blue nose-cone with the lamps and the grille
   * buried somewhere on its curve, none of them able to catch an edge because
   * there was no edge anywhere on it to catch.
   *
   * A modern hatchback front end is not that. It is a nearly upright fascia
   * standing across the end of the car, carrying the grille aperture and the
   * lamp units, with a tight radius rolling back into the wings and a distinct
   * crease where the bonnet drops onto it. That is a HIGH exponent held to the
   * last 76 mm — the same argument the tailgate makes at the other end of the
   * car, and the earlier note claiming the asymmetry was real had the physics
   * backwards. A fuller section is only a bigger dome if it is still allowed
   * to close over 340 mm; held out to 3.320 and then shut in one 76 mm step,
   * it is a flat face with a rolled corner.
   *
   * The height step does the same job vertically: yT falls 0.872 -> 0.782 over
   * that same 76 mm, which is a 50-degree chamfer and reads as the leading
   * edge of the bonnet. The end cap, which used to be a vestigial fan hidden
   * inside a curve, is now a real 1.26 x 0.41 m panel — and having a flat
   * panel there is what makes it possible for _addBodywork() to cut a grille
   * into it that actually looks recessed. */
  { z: 3.320, yB: 0.270, yT: 0.872, wB: 0.725, wMax: 0.822, wTop: 0.770, vBelt: 0.55, n: 4.2 },
  { z: 3.396, yB: 0.375, yT: 0.782, wB: 0.545, wMax: 0.630, wTop: 0.560, vBelt: 0.55, n: 3.6 },
];

/* Metres of car per unit of station index, at a given station.
 *
 * The stations are not evenly spaced in z — they are dense through the screen
 * base and the closing radii and sparse along the roof — so a shut line 14 mm
 * wide is a different number of station units at the cowl than it is at the
 * B-pillar. Panel gaps are the one feature on the car where a constant width
 * genuinely matters, because the eye reads a gap that tapers as a panel that
 * does not fit. */
const _dz = {};
function dzdu(u) {
  const last = STATIONS.length - 1;
  const a = stationAt(clamp(u - 0.05, 0, last), _dz).z;
  const b = stationAt(clamp(u + 0.05, 0, last), _dz).z;
  return Math.max(0.02, Math.abs(b - a) / 0.1);
}

/* Named handles into the table, so the glazing and the bolt-on parts can be
 * placed in the loft's own coordinates instead of in numbers copied out of it
 * that then go stale the first time the roofline is touched. */
const U = {
  tailCap: 0, tail: 1, rearFace: 2, rearQuarter: 3, cPillar: 4,
  roofRear: 5, roofFront: 6, header: 7, screenMid: 8, cowl: 9,
  cowlEdge: 10, bonnet: 11, bonnetFront: 12, nose: 13, noseCap: 14,
};

const KEYS = ['z', 'yB', 'yT', 'wB', 'wMax', 'wTop', 'vBelt', 'n'];

function catmull(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * (
    2 * p1
    + (p2 - p0) * t
    + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2
    + (-p0 + 3 * p1 - 3 * p2 + p3) * t3
  );
}

/** Every station parameter, interpolated at a fractional station index. */
function stationAt(u, out = {}) {
  const last = STATIONS.length - 1;
  const i = clamp(Math.floor(u), 0, last - 1);
  const t = clamp(u - i, 0, 1);
  const a = STATIONS[clamp(i - 1, 0, last)];
  const b = STATIONS[i];
  const c = STATIONS[clamp(i + 1, 0, last)];
  const d = STATIONS[clamp(i + 2, 0, last)];
  for (const k of KEYS) out[k] = catmull(a[k], b[k], c[k], d[k], t);
  return out;
}

/* Half-width as a function of height up the section. Two smoothsteps rather
 * than one curve because the shoulder above the beltline and the tuck below it
 * are different radii on every car ever made — the flank rolls gently into the
 * roof and turns sharply under into the sill. */
function halfWidth(s, v) {
  if (v < s.vBelt) return lerp(s.wB, s.wMax, smooth(v / Math.max(1e-4, s.vBelt)));
  return lerp(s.wMax, s.wTop, smooth((v - s.vBelt) / Math.max(1e-4, 1 - s.vBelt)));
}

/* ── surface development ──────────────────────────────────────────────────
 *
 * The station table describes a body that is smooth in every direction, and a
 * body that is smooth in every direction is a bar of soap. What separates the
 * flank of a real car from an extruded tube is that a pressed steel panel
 * cannot be developed into a compound curve without a *line* in it: the press
 * needs a change of section to stiffen the panel and to control springback,
 * and the stylist gets that structural necessity for free as the shoulder
 * line, the feature line and the rocker undercut. Every mass-produced car
 * since about 1955 has all three.
 *
 * They are added here as a fractional modulation of half-width rather than as
 * separate geometry, for the same reason the arches sample the loft: a crease
 * that is a function of the same fifteen numbers cannot come adrift from the
 * body when the roofline is retuned, and the finite-difference normal picks it
 * up for nothing.
 *
 *   SHOULDER_V  the hard one. It runs from the headlamp, over the front wing,
 *               along the doors under the DLO and into the tail lamp, and it
 *               is the highlight the eye tracks along the whole length of a
 *               car. A shoulder is asymmetric in section: the panel swells
 *               gradually up to the crest over ~200 mm and then falls away
 *               over ~70 mm into the tumblehome. That asymmetry is the crease.
 *   LOWER_V     the feature line down the doors, softer and shallower — on a
 *               modern hatch it is the line that catches the ground bounce and
 *               stops the lower door being a dead grey field.
 *   the tuck    below ~0.145 of section height the rocker pulls sharply in.
 *               Real cars do this so the sill hides in its own shadow, which
 *               is what makes a car look planted rather than inflated.
 */
const SHOULDER_V = 0.560;
const LOWER_V = 0.262;

/* One crease: full amplitude at `at`, ramping in over `below` and falling off
 * sharply over `above`. Two smoothsteps, C1 at the crest, zero outside. */
function crease(v, at, below, above, amp) {
  if (v <= at) return amp * smooth((v - at + below) / below);
  return amp * (1 - smooth((v - at) / above));
}

function relief(z, v) {
  /* The lines die into the lamp units at both ends rather than fading out in
   * the middle of a panel, which is what a real one does: the shoulder line on
   * every hatchback made runs from the outboard corner of the headlamp,
   * straight down the flank, into the outboard corner of the tail lamp,
   * because those are the two hard points the panel is stretched between. An
   * earlier version faded it out 400 mm short of the nose to cure a modelling
   * problem in the wheel arches, and it left the front wing with a swelling
   * that went nowhere — a crease that stops in open steel is a dent. The arch
   * problem is fixed where it belongs, in _archGeometries(). */
  const run = smooth((z + 0.70) / 0.30) * (1 - smooth((z - 3.02) / 0.34));
  let r = crease(v, SHOULDER_V, 0.135, 0.042, 0.048);
  r += crease(v, LOWER_V, 0.095, 0.062, 0.024);
  r -= 0.070 * (1 - smooth(v / 0.150));
  return r * run;
}

/* Where to spend ring vertices.
 *
 * The ring used to be sampled uniformly in its own angle, and uniform angle is
 * the worst possible distribution on a superellipse: the exponent makes the
 * section nearly flat for most of its angular sweep and then turns the whole
 * corner in a few hundredths of a radian, so a uniform ring puts most of its
 * vertices along the roof and the floor and almost none down the flank — which
 * is precisely where every feature on the car lives. A 40-vertex uniform ring
 * lands about four vertices across the entire height of a door, and a 25 mm
 * crease between two of them simply does not exist in the mesh.
 *
 * So the ring is laid out in height fraction instead, with the sample density
 * clustered where the creases are. The mapping v -> angle is angleForV(), the
 * same inversion the glazing already uses to keep a level beltline. Built by
 * numerically integrating a density and inverting it, once per distinct ring
 * count, because writing the knots by hand is how the crease ends up half a
 * sample off the crest.
 */
const _ringCache = new Map();
function ringV(half) {
  const hit = _ringCache.get(half);
  if (hit) return hit;
  const N = 768;
  const bump = (v, at, w, k) => k * Math.exp(-(((v - at) / w) ** 2));
  const density = (v) => 1
    + bump(v, SHOULDER_V, 0.048, 3.0)     // the shoulder crest and its fall
    + bump(v, SHOULDER_V + 0.055, 0.030, 1.6)
    + bump(v, LOWER_V, 0.060, 1.5)        // the feature line
    + bump(v, 0.130, 0.055, 1.8)          // the rocker tuck
    + bump(v, 0.985, 0.030, 1.2);         // the roof/tumblehome transition
  const cdf = [0];
  for (let i = 0; i < N; i++) cdf.push(cdf[i] + density((i + 0.5) / N));
  const total = cdf[N];
  const out = [];
  let k = 0;
  for (let i = 0; i <= half; i++) {
    const target = (i / half) * total;
    while (k < N - 1 && cdf[k + 1] < target) k++;
    const span = cdf[k + 1] - cdf[k];
    out.push(clamp((k + (span > 0 ? (target - cdf[k]) / span : 0)) / N, 0, 1));
  }
  out[0] = 0; out[half] = 1;
  _ringCache.set(half, out);
  return out;
}

/* A point on the shell, in the car's own frame.
 *
 * `a` is the ring angle, measured from the bottom centreline: -PI/2 is the
 * underside, 0 is the right flank at the beltline, +PI/2 is the roof centre.
 * The superellipse is evaluated on the signed cosine and sine so that the
 * exponent rounds the four corners of the section without ever folding the
 * ring back on itself.
 */
function shellPoint(u, a, out = new THREE.Vector3(), scratch = {}) {
  const s = stationAt(u, scratch);
  const e = 2 / s.n;
  const c = Math.cos(a), sn = Math.sin(a);
  const sx = Math.sign(c) * Math.pow(Math.abs(c), e);
  const sy = Math.sign(sn) * Math.pow(Math.abs(sn), e);
  const v = (sy + 1) * 0.5;
  out.set(halfWidth(s, v) * (1 + relief(s.z, v)) * sx, lerp(s.yB, s.yT, v), s.z);
  return out;
}

/* The outward normal, by finite difference on the surface itself.
 *
 * Analytic normals for this surface exist but involve the derivative of the
 * spline, of the superellipse and of the two-piece width profile all at once,
 * and every one of those is a place to get a sign wrong and end up with a car
 * lit from inside. The difference below costs four extra surface evaluations
 * per vertex at build time and cannot disagree with the geometry it belongs
 * to. Epsilons: 0.02 of a station (~5 mm along the body) and 0.02 rad around
 * the ring, both comfortably above float noise and below any feature.
 */
const _n1 = new THREE.Vector3(), _n2 = new THREE.Vector3();
const _du = new THREE.Vector3(), _da = new THREE.Vector3();
function shellNormal(u, a, out = new THREE.Vector3()) {
  const last = STATIONS.length - 1;
  const u0 = clamp(u - 0.02, 0, last), u1 = clamp(u + 0.02, 0, last);
  _du.subVectors(shellPoint(u1, a, _n1), shellPoint(u0, a, _n2));
  _da.subVectors(shellPoint(u, a + 0.02, _n1), shellPoint(u, a - 0.02, _n2));
  /* du runs towards the nose (+z) and da runs anticlockwise around the ring
   * seen from +x, so da x du points out of the body. */
  return out.crossVectors(_da, _du).normalize();
}

/* ── primitives ───────────────────────────────────────────────────────────
 *
 * Two shape helpers do the work for every bolt-on part. Both exist for the
 * same reason: a car has no sharp edges on it anywhere. Even a pressed steel
 * bumper has a 3 mm radius on every corner, and that radius is not a detail —
 * it is the thin bright line that separates a bumper from the shadow under it
 * in every photograph ever taken of a car.
 */

/** A box with rounded corners, from a sphere pushed out into its octants.
 *
 * The trick is the classic one: take a sphere whose segment counts land
 * vertices exactly on the octant boundaries, then translate each vertex out by
 * the half-extents minus the radius. Every vertex that started on an axis
 * plane stays there, so the six faces come out flat and the eight corners and
 * twelve edges come out as true quarter-rounds. Normals are recomputed rather
 * than inherited, because the sphere's normals would bow the flat faces and
 * turn a spoiler blade into a pillow.
 */
function roundedBox(w, h, d, r, seg = 3) {
  const rad = Math.min(r, w / 2, h / 2, d / 2);
  const g = new THREE.SphereGeometry(rad, seg * 4, seg * 2);
  const p = g.attributes.position;
  const ex = w / 2 - rad, ey = h / 2 - rad, ez = d / 2 - rad;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    p.setXYZ(
      i,
      x + Math.sign(Math.abs(x) < 1e-6 ? 0 : x) * ex,
      y + Math.sign(Math.abs(y) < 1e-6 ? 0 : y) * ey,
      z + Math.sign(Math.abs(z) < 1e-6 ? 0 : z) * ez,
    );
  }
  g.computeVertexNormals();
  return g;
}

/** A closed surface of revolution about the X axis.
 *
 * `profile` is a list of [x, radius] in metres, running along the axle. Used
 * for the tyre carcass, the rim barrel and the brake disc; a LatheGeometry
 * would do the same job but revolves about Y, and rotating four wheels' worth
 * of geometry into place after the fact is a standing invitation to get one
 * side's winding inverted.
 *
 * uv.x runs around the circumference and uv.y along the profile by arc length,
 * so a tread pattern authored in the unit square lands on the carcass at
 * constant scale rather than bunching at the shoulders.
 *
 * Winding follows the profile: the outward face normal comes out as (-dr, dx)
 * in the (axis, radius) plane, so a profile traversed in the +x direction at
 * constant radius faces outward, and a disc is described by going out in
 * radius on its -x face, along the rim, and back in on its +x face.
 */
function revolveX(profile, segments) {
  const pos = [], uv = [], idx = [];
  const arc = [0];
  for (let i = 1; i < profile.length; i++) {
    const dx = profile[i][0] - profile[i - 1][0];
    const dr = profile[i][1] - profile[i - 1][1];
    arc.push(arc[i - 1] + Math.hypot(dx, dr));
  }
  const total = arc[arc.length - 1] || 1;
  for (let i = 0; i < profile.length; i++) {
    const [x, r] = profile[i];
    for (let j = 0; j <= segments; j++) {
      const t = j / segments, a = t * TAU;
      pos.push(x, Math.cos(a) * r, Math.sin(a) * r);
      uv.push(t, arc[i] / total);
    }
  }
  const row = segments + 1;
  for (let i = 0; i < profile.length - 1; i++) {
    for (let j = 0; j < segments; j++) {
      const A = i * row + j, B = A + 1, C = A + row, D = C + 1;
      idx.push(A, B, C, B, D, C);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function place(geometry, x, y, z, rx = 0, ry = 0, rz = 0, scale = null) {
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')),
    scale || new THREE.Vector3(1, 1, 1),
  );
  geometry.applyMatrix4(m);
  return geometry;
}

/** A straight tube between two points, for cage bars and exhaust tips. */
function tube(from, to, r, seg = 8) {
  const dir = new THREE.Vector3().subVectors(to, from);
  const len = dir.length();
  const g = new THREE.CylinderGeometry(r, r, len, seg, 1, false);
  const q = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0), dir.normalize(),
  );
  g.applyMatrix4(new THREE.Matrix4().compose(
    new THREE.Vector3().addVectors(from, to).multiplyScalar(0.5),
    q,
    new THREE.Vector3(1, 1, 1),
  ));
  return g;
}

/** The ring angle at which the section reaches a given fraction of its height.
 *
 * The inverse of the superellipse's vertical term, used to lay glazing out
 * along a constant beltline instead of along a constant angle. A car's window
 * line is horizontal in side view and a constant ring angle is not, so
 * skipping this inversion is what leaves side glass that sags towards the
 * rear.
 */
function angleForV(v, n) {
  const sy = clamp(v, 0, 1) * 2 - 1;
  const s = Math.sign(sy) * Math.pow(Math.abs(sy), n / 2);
  return Math.asin(clamp(s, -1, 1));
}

/* ── the tyre surface ─────────────────────────────────────────────────────
 *
 * Baked rather than painted, and baked as height first, because the whole
 * visual signature of a gravel tyre is relief: a 12 mm-deep block pattern that
 * catches the sun on its leading edges and holds a hard shadow in its grooves.
 * An albedo-only tread is a decal — it stays flat as the wheel turns, which is
 * the exact moment the eye is looking hardest at it.
 *
 * uv.y is arc length across the revolved carcass, so 0 and 1 are the two beads
 * and 0.5 is the crown. The shoulders of the profile land at 0.311 and 0.689,
 * which is where the tread pattern has to stop and the moulded sidewall has to
 * start; those two numbers come straight out of the profile table below and
 * are the only coupling between this shader and that geometry.
 *
 * Rubber is not black. Carbon-black-loaded tread sits around 0.05 in linear
 * light and a weathered sidewall is lighter still, because antiozonant waxes
 * bloom to the surface and go grey-brown. Painting a tyre at 0.0 gives a hole
 * in the frame that no exposure setting recovers.
 */
const TYRE_SURFACE = /* glsl */ `
void surf(vec2 uv, out vec3 albedo, out float height, out float rough, out float ao){
  float lat = uv.y - 0.5;              // signed position across the carcass
  float band = abs(lat) * 2.0;         // 0 at the crown, 1 at the bead
  float tread = 1.0 - sstep(0.34, 0.40, band);
  float wall  = sstep(0.44, 0.58, band);

  /* Two circumferential grooves either side of a centre rib. Rally gravel
   * patterns are open — the grooves are there to clear stones, not water — so
   * they are wide and there are few of them. */
  float gr = min(abs(abs(lat) - 0.062), abs(abs(lat) - 0.140));
  float circ = (1.0 - sstep(0.010, 0.022, gr)) * tread;

  /* Lateral block edges, with the outboard row offset half a pitch against
   * the inboard one. A tread whose blocks line up across the tyre pumps out
   * one loud tone as it rolls, which is why no manufacturer builds one, and
   * the stagger is visible as well as audible. */
  float phase = uv.x * 16.0 + mix(0.0, 0.5, step(0.100, abs(lat)));
  float d = abs(fract(phase) - 0.5);
  float lateral = sstep(0.395, 0.455, d) * tread;

  /* Sipes: hairline cuts across each block. They are only ~0.6 mm wide, so
   * they contribute almost nothing to the height field and almost everything
   * to how a tread block reads at two metres. */
  float sipe = sstep(0.47, 0.492, abs(fract(uv.x * 48.0 + lat * 3.0) - 0.5)) * tread;

  float groove = clamp(max(circ, lateral), 0.0, 1.0);

  /* Moulded sidewall furniture: the rim protector rib, and a band of raised
   * lettering standing off a slightly hollow ground. */
  float rib = (1.0 - sstep(0.010, 0.030, abs(band - 0.86))) * wall;
  vec2 w = pworley(vec2(uv.x * 34.0, band * 6.0), vec2(34.0, 6.0));
  float text = sstep(0.16, 0.07, w.x)
             * (1.0 - sstep(0.030, 0.075, abs(band - 0.70)));

  float grain = pfbm(uv * vec2(180.0, 90.0), vec2(180.0, 90.0), 3) * 0.5 + 0.5;

  /* Gravel scrubs the shoulders pale and packs dust into the grooves; the
   * crown stays darkest because it is the part that is continuously polished
   * against the road. */
  float dust = sstep(0.30, 0.85, band) * 0.55 + groove * 0.30;
  vec3 rubber = vec3(0.052, 0.049, 0.047);
  vec3 bloom  = vec3(0.086, 0.081, 0.074);
  albedo = mix(rubber, bloom, wall * 0.55 + dust * 0.45);
  albedo *= 0.92 + grain * 0.14;
  albedo *= 1.0 - groove * 0.22;
  albedo += vec3(0.020, 0.017, 0.012) * dust;

  /* 12 mm of tread depth over a 0.42 m profile is 0.029 of the height field's
   * own unit, but heightToNormal wants slope, not depth, and the normal is the
   * only place this relief is ever seen. The numbers below are tuned so the
   * groove walls read at the ~55 degrees they are actually moulded at. */
  height = 0.60
         - groove * 0.30
         - sipe * 0.06
         + rib * 0.10
         + text * 0.07
         - wall * 0.05
         + (grain - 0.5) * 0.03;

  /* A groove floor never gets polished, a sidewall is mould-smooth, and the
   * crown of a used tyre is the shiniest part of it — which is why a tyre
   * rendered at one uniform roughness looks like a rubber tube. */
  rough = 0.95 - wall * 0.09 - (1.0 - band) * 0.05 + groove * 0.04;
  ao = 1.0 - groove * 0.42 - sipe * 0.10;
}
`;

/* The tyre section, as [distance along the axle, radius] in metres.
 *
 * A 205/55 R17 on a 456 mm rim, up from the 15 inch this table was first
 * authored with. The overall radius is unchanged — it has to be, the whole
 * simulation is keyed to WHEEL_R — so the extra 80 mm of rim diameter comes
 * straight out of the sidewall, and that is the entire point. The old wheel
 * had 146 mm of black rubber between the rim flange and the tread and it made
 * the car look like it was riding on doughnuts with small hubcaps on them;
 * this one has 115 mm, which is what a current homologation car on a sealed
 * stage actually runs and leaves room inside the barrel for a brake package
 * the eye can see. A gravel car would run the tall sidewall and be right to,
 * but a tall sidewall photographs as a soft wheel and this car is judged from
 * four metres away on a turntable.
 *
 * The order matters as much as the numbers. It is traversed from the inboard
 * bead outwards, which by revolveSided's convention puts every face normal on
 * the outside of the carcass.
 */
const TYRE_PROFILE = [
  [-0.078, 0.228],   // inboard bead, on the rim flange
  [-0.096, 0.254],
  [-0.1025, 0.286],  // widest point: the sidewall, not the tread
  [-0.099, 0.313],
  [-0.085, 0.331],   // shoulder radius begins
  [-0.048, 0.3405],
  [0.000, 0.3425],   // crown, 2.5 mm proud of the stated rolling radius
  [0.048, 0.3405],
  [0.085, 0.331],
  [0.099, 0.313],
  [0.1025, 0.286],
  [0.096, 0.254],
  [0.078, 0.228],
];

/* A revolved profile, mirrored for the right-hand side of the car.
 *
 * Negating x alone would mirror the surface and leave its winding inverted;
 * reversing the profile order at the same time flips it back, because the
 * outward normal of a revolved profile is (-dr, dx) and the two operations
 * each negate one of those terms. This is the same trap the wheel arches hit
 * from the other direction, and it is worth solving once here rather than
 * discovering it as a car with two black wheels and two glowing ones.
 */
function revolveSided(profile, segments, ob) {
  const p = ob >= 0
    ? profile
    : profile.map(([x, r]) => [-x, r]).reverse();
  return revolveX(p, segments);
}

/* A per-material accumulator.
 *
 * The car is about forty separate pieces of geometry and it wants to be about
 * ten draw calls, because it is a single object that is always entirely on
 * screen or entirely off it — there is nothing for a per-piece frustum test to
 * win. Merging by material also means the shadow pass walks ten meshes rather
 * than forty, and the shadow pass is where a vehicle's draw-call cost actually
 * lands: it is rendered again, in full, every frame the sun moves.
 */
class Batch {
  constructor(material) {
    this.material = material;
    this.pos = [];
    this.nor = [];
    this.uv = [];
    this.idx = [];
  }

  add(geometry) {
    if (!geometry.attributes.normal) geometry.computeVertexNormals();
    const p = geometry.attributes.position;
    const n = geometry.attributes.normal;
    const t = geometry.attributes.uv;
    const base = this.pos.length / 3;
    for (let i = 0; i < p.count; i++) {
      this.pos.push(p.getX(i), p.getY(i), p.getZ(i));
      this.nor.push(n.getX(i), n.getY(i), n.getZ(i));
      this.uv.push(t ? t.getX(i) : 0, t ? t.getY(i) : 0);
    }
    if (geometry.index) {
      for (let i = 0; i < geometry.index.count; i++) this.idx.push(base + geometry.index.getX(i));
    } else {
      for (let i = 0; i < p.count; i++) this.idx.push(base + i);
    }
    geometry.dispose();
    return this;
  }

  get empty() { return this.idx.length === 0; }
  get triangles() { return this.idx.length / 3; }

  build(name) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    const mesh = new THREE.Mesh(g, this.material);
    mesh.name = name;
    return mesh;
  }
}

/* ── the wheel arch section ───────────────────────────────────────────────
 *
 * The blister over each wheel used to be an ellipse swept along an arc, and an
 * ellipse has no edges on it anywhere, so the arches read as four smooth
 * bulges pushed out of the doors — a bodykit made of Plasticine. A real flared
 * arch, whether it is a stamped steel wing or a bolted-on homologation
 * extension, has exactly two hard lines on it and they do all the work:
 *
 *   the LIP at the arch opening. The panel turns through nearly 180 degrees
 *   and returns inboard to a flange, so there is a knife edge running round
 *   the whole opening with the tyre right behind it. That edge is what puts a
 *   bright rim of light along the top of every wheel in every photograph of
 *   every car, and its absence is why an unlipped arch looks soft.
 *
 *   the RUN-OUT where the flare meets the bodyside. On a works car this is a
 *   welded or riveted seam and it is a visible step, not a fade.
 *
 * Entries are [outboard offset, radial offset] in metres, relative to the
 * point on the sweep arc, traversed outboard -> radially outward -> inboard ->
 * radially inward so the winding matches the old parametrisation. Duplicated
 * entries are deliberate: two coincident vertex rows give the quad on each
 * side of them its own normal, which is the only way to get a hard crease out
 * of computeVertexNormals() on a shared-vertex strip.
 */
const ARCH_SECTION = [
  [0.128, -0.016],   // widest point of the flare, just above the opening
  [0.120, 0.022],
  [0.088, 0.056],
  [0.046, 0.074],
  [0.046, 0.074],    // run-out crease: the seam onto the bodyside
  [-0.014, 0.066],   // and inboard from here it is buried in the shell
  [-0.080, 0.024],
  [-0.080, -0.046],
  [-0.020, -0.080],
  [0.038, -0.094],   // the lip flange, turned back inboard under the opening
  [0.082, -0.100],
  [0.082, -0.100],   // lip underside crease
  [0.122, -0.084],
  [0.122, -0.084],   // LIP CREST: the knife edge round the arch opening
  [0.136, -0.050],
];
const ARCH_REVERSED = ARCH_SECTION.slice().reverse();

/* ── the car ──────────────────────────────────────────────────────────── */

export { COCKPIT_EYE };

export class CarMesh {
  /**
   * @param {THREE.WebGLRenderer} renderer  used only to bake the tyre surface
   * @param {{tier?: string}} [opts]
   */
  constructor(renderer, { tier = 'high' } = {}) {
    this.tier = tier;
    const low = tier === 'low';

    /* Topology is chosen once, here, and never revisited. An adaptive tier
     * change mid-session would have to rebuild every buffer on the car while
     * it is on screen and moving, which costs more in one hitch than the lower
     * tier saves in a minute of frames. */
    this._detail = {
      ring: low ? 28 : 64,        // vertices around one shell section (even)
      sub: low ? 2 : 4,           // slices per control station interval
      wheel: low ? 20 : 26,       // segments around a tyre
      hub: low ? 12 : 16,
      panel: low ? 3 : 4,         // grid resolution of one pane of glass
      spoke: low ? 1 : 2,         // roundedBox subdivision of a spoke
      box: low ? 2 : 3,
    };

    this._root = new THREE.Group();
    this._root.name = 'rallyCar';

    /* The sprung mass and the unsprung mass are genuinely different objects on
     * a car, and separating them here is what makes setBodyAttitude a
     * suspension movement rather than a rigid-body one: everything in _sprung
     * leans, and the four wheels — which stay on the ground — do not. */
    this._sprung = new THREE.Group();
    this._sprung.name = 'sprungMass';
    this._sprung.position.set(0, COM_Y, COM_Z);
    this._sprung.rotation.order = 'ZXY';
    this._root.add(this._sprung);

    this._shell = new THREE.Group();
    this._shell.name = 'shell';
    this._shell.position.set(0, -COM_Y, -COM_Z);
    this._sprung.add(this._shell);

    this._materials = [];
    this._meshes = [];
    this._wheels = [];
    this._steered = [];
    this._triangles = 0;

    this._buildMaterials(renderer, tier);
    this._buildShell();
    this._buildWheels();
  }

  /** THREE.Group. Origin at the centre of the rear axle, on the ground. */
  get root() { return this._root; }

  /** Every material on the car, for the engine's shared canopy-light patch. */
  get materials() { return this._materials; }

  /* ── materials ─────────────────────────────────────────────────────────
   *
   * Every value below is a measurable property of a real surface rather than
   * a number that looked right in one lighting setup. That matters more here
   * than on scenery, because a car is the one object in the frame that the
   * audience has stood next to: a paint roughness that is 0.1 too high reads
   * instantly as plastic, and metalness on paint reads as bare aluminium.
   */
  _buildMaterials(renderer, tier) {
    const keep = (m) => { this._materials.push(m); return m; };

    /* Automotive paint is a clearcoat over a pigmented base, and the coat is
     * a dielectric: metalness stays at 0 even for a "metallic" finish, whose
     * flake lives in the base coat and shows up as a roughness and colour
     * variation, not as conductivity. Painting a car with metalness 1 is the
     * single most common way to get a car that looks like a chromed toy.
     *
     * Roughness 0.25 is a well-kept but not concours clearcoat: sharp enough
     * to throw a recognisable reflection of the sky, rough enough that the
     * highlight has a width to it. A show-car 0.05 would mirror the scene and
     * expose the fact that there is no cube map of the actual surroundings.
     *
     * The colour is a saturated rally blue, deliberately strong. A vehicle is
     * the subject of any frame it appears in, and the basin it drives through
     * is grey shingle, straw tussock and pale sky — every one of which is a
     * desaturated warm neutral, so a blue at this saturation is the only thing
     * in the scene with a chroma above about 0.2.
     */
    this.mat = {
      paint: keep(liveryPaint(new THREE.MeshStandardMaterial({
        name: 'car-paint',
        color: new THREE.Color(0x1d47c8),
        roughness: 0.25,
        metalness: 0.0,
        envMapIntensity: 1.15,
        dithering: true,
      }))),

      /* Everything moulded rather than pressed: bumper skins, grille, splitter,
       * arch liners. Unpainted textured polypropylene is very rough and never
       * black — it weathers to a dark warm grey, and on a car that has been on
       * gravel it is greyer still. */
      trim: keep(new THREE.MeshStandardMaterial({
        name: 'car-trim',
        color: new THREE.Color(0x14161a),
        roughness: 0.86,
        metalness: 0.0,
        envMapIntensity: 0.6,
      })),

      /* Glazing. Real automotive glass is a transmissive dielectric, and the
       * honest material for it is MeshPhysicalMaterial with transmission — but
       * transmission costs a scene render into a transmission buffer, which is
       * a whole extra pass for four panes of glass on one object. What a
       * daylight windscreen actually shows is almost entirely its Fresnel
       * reflection of the sky, so a dark, smooth, lightly transparent standard
       * material with the environment turned up gets the same read for the
       * price of an alpha blend. Green-tinted because laminated glass is: the
       * iron in it absorbs red, which is why every windscreen seen edge-on is
       * bottle green.
       */
      glass: keep(new THREE.MeshStandardMaterial({
        name: 'car-glass',
        color: new THREE.Color(0x0a1512),
        roughness: 0.05,
        metalness: 0.0,
        envMapIntensity: 2.2,
        transparent: true,
        opacity: 0.62,
        depthWrite: false,
      })),

      /* Tyre. Roughness near 1 and an albedo that is dark but never zero; see
       * TYRE_SURFACE for why. Rubber is also completely non-metallic and has
       * almost no environment response, which is what separates it visually
       * from black paint standing right next to it on the arch.
       */
      rubber: keep(new THREE.MeshStandardMaterial({
        name: 'car-rubber',
        color: new THREE.Color(0xffffff),
        roughness: 0.95,
        metalness: 0.0,
        envMapIntensity: 0.35,
      })),

      /* Rim. A machined or polished alloy is a real conductor: metalness 1,
       * and all of its appearance comes from roughness. 0.22 is a cast wheel
       * with a machined face — bright, but with the slight diffusion that
       * separates an alloy from chrome.
       */
      rim: keep(new THREE.MeshStandardMaterial({
        name: 'car-rim',
        color: new THREE.Color(0xc9ccd2),
        roughness: 0.22,
        metalness: 1.0,
        envMapIntensity: 1.5,
      })),

      /* Cast iron disc: metallic, but oxidised the moment it leaves the box,
       * so it is dark and much rougher than the wheel in front of it. The
       * contrast between a dull disc and a bright rim is most of what makes a
       * wheel read as having depth rather than being a printed disc.
       */
      brake: keep(new THREE.MeshStandardMaterial({
        name: 'car-brake',
        color: new THREE.Color(0x4a423d),
        roughness: 0.62,
        metalness: 0.9,
        envMapIntensity: 0.8,
      })),

      caliper: keep(new THREE.MeshStandardMaterial({
        name: 'car-caliper',
        color: new THREE.Color(0x9d2417),
        roughness: 0.45,
        metalness: 0.25,
        envMapIntensity: 0.9,
      })),

      /* Lamp lenses. The emissive is deliberately tiny: in daylight a
       * headlight is a lens with a reflector behind it, and it is *darker*
       * than the paint around it, not brighter. What the small emissive buys
       * is that the lens never goes fully black in shadow, which is the one
       * thing that makes a headlight read as glass rather than as a hole.
       */
      lampClear: keep(new THREE.MeshStandardMaterial({
        name: 'car-lamp-clear',
        /* Paler and lifted, because the housings that were added to give the
         * lamps structure also put them in their own shadow: correct, and at
         * four metres it left two dark rectangles with pale dots in them. A
         * real headlamp lens is a mirror pointing at the sky — most of what
         * you see in it is a reflection, not its own colour — so the answer is
         * envMap and a paler base rather than a brighter emissive, which would
         * make it glow in daylight. */
        color: new THREE.Color(0xc3ccd4),
        roughness: 0.07,
        metalness: 0.1,
        emissive: new THREE.Color(0xfff2d8),
        emissiveIntensity: 0.22,
        envMapIntensity: 2.8,
      })),

      lampRed: keep(new THREE.MeshStandardMaterial({
        name: 'car-lamp-red',
        color: new THREE.Color(0x4a0703),
        roughness: 0.12,
        metalness: 0.0,
        emissive: new THREE.Color(0xff1c07),
        emissiveIntensity: 0.34,
        envMapIntensity: 1.4,
      })),

      /* Cabin. Seen only through tinted glass and only ever as a silhouette,
       * so it is one dark cloth grey — but it has to exist, because a cabin
       * with nothing in it lets the sky through both windows at once and the
       * car turns into a hollow shell the instant it is side-on to the camera.
       */
      cabin: keep(new THREE.MeshStandardMaterial({
        name: 'car-cabin',
        color: new THREE.Color(0x191b1e),
        roughness: 0.92,
        metalness: 0.0,
        envMapIntensity: 0.3,
      })),

      /* Roll cage. Powder-coated tube, pale on purpose: it is the one thing
       * inside the car that is lighter than the glass in front of it, so it is
       * the only interior detail that survives being seen through the tint —
       * and a cage seen through a windscreen is worth more than any amount of
       * dashboard modelling.
       */
      cage: keep(new THREE.MeshStandardMaterial({
        name: 'car-cage',
        /* Darkened from 0xb9bdc2. That was chosen when there was no windscreen
         * in front of it — see _addGlazing() — so the A-pillar bars were being
         * read directly against the sky and were the brightest thing on the
         * car, a pair of white sticks across the front of the cabin. Seen
         * through tinted glass, as they now are, a cage wants to be darker
         * than the paint or it is the only thing in the frame. */
        color: new THREE.Color(0x6e737a),
        roughness: 0.55,
        metalness: 0.15,
        envMapIntensity: 0.7,
      })),
    };

    /* The tyre is the only baked surface on the car. Everything else is a flat
     * colour with honest roughness, which is what a clean painted panel
     * genuinely is; the tyre is the one part whose entire identity is a
     * pattern in its normal map.
     *
     * The bake needs a live renderer. Guarding for its absence is not
     * defensiveness for its own sake — the geometry in this file is useful to
     * headless tools that measure silhouettes and triangle counts and never
     * open a GL context, and losing the tread there costs nothing.
     */
    if (renderer && renderer.capabilities) {
      this.tread = bakeSurface(renderer, TYRE_SURFACE, {
        size: tier === 'low' ? 256 : 512,
        normalStrength: 2.6,
      });
      /* Around the tyre the pattern repeats 16 times per revolution — a
       * 2.15 m circumference over 16 pitches is a 134 mm block pitch, which is
       * gravel-tyre coarse. Across the carcass it must not repeat at all: the
       * profile is mapped once from bead to bead, and a second copy would put
       * a tread band on the sidewall. */
      for (const t of [this.tread.map, this.tread.normalMap, this.tread.ormMap]) {
        t.wrapS = THREE.RepeatWrapping;
        t.wrapT = THREE.ClampToEdgeWrapping;
        t.repeat.set(1, 1);
      }
      this.mat.rubber.map = this.tread.map;
      this.mat.rubber.normalMap = this.tread.normalMap;
      this.mat.rubber.roughnessMap = this.tread.ormMap;
      this.mat.rubber.aoMap = this.tread.ormMap;
      this.mat.rubber.aoMapIntensity = 0.55;
      this.mat.rubber.roughness = 1.0;
      this.mat.rubber.normalScale = new THREE.Vector2(1.25, 1.25);
    }
  }

  /* ── the shell ─────────────────────────────────────────────────────────
   *
   * One loft, one set of glazing sampled off it, and the bolt-on parts. All of
   * it goes into per-material batches so the whole body is five meshes.
   */
  _buildShell() {
    const paint = new Batch(this.mat.paint);
    const trim = new Batch(this.mat.trim);
    const glass = new Batch(this.mat.glass);
    const lampC = new Batch(this.mat.lampClear);
    const lampR = new Batch(this.mat.lampRed);
    const cabin = new Batch(this.mat.cabin);
    const cage = new Batch(this.mat.cage);

    paint.add(this._loftGeometry());
    for (const g of this._archGeometries()) paint.add(g);
    this._addBodywork(paint, trim, lampC, lampR);
    this._addRallyKit(paint, trim, lampC);
    this._addShutLines(trim);
    this._addGlazing(glass);
    this._addCabin(cabin, cage);

    /* The interior, built once and hidden until the cockpit camera asks for
     * it. It is invisible from outside — the panels face inward — so there is
     * no reason to pay for it on the other two camera modes. */
    const inside = buildCockpit(this._detail.spoke > 1 ? 1 : 0);
    this.cockpit = inside.root;
    this.cockpitWheel = inside.wheel;
    this.instruments = inside.instruments;
    this.cockpit.visible = false;
    this.root.add(this.cockpit);

    for (const b of [paint, trim, glass, lampC, lampR, cabin, cage]) {
      if (b.empty) continue;
      this._triangles += b.triangles;
      const mesh = b.build(`car-${b.material.name}`);
      /* The shell casts and receives. Receiving matters as much as casting on
       * a car and is usually forgotten: the shadow of the roof falls across
       * the bonnet under a low sun, the mirror shadows the door, and without
       * self-shadowing the body is uniformly lit and reads as a decal.
       *
       * Glass and the cabin are excluded from the shadow map for opposite
       * reasons: a transparent surface would cast a fully opaque shadow, and
       * the cabin is entirely enclosed by geometry that already casts. */
      const solid = b.material !== this.mat.glass && b.material !== this.mat.cabin;
      mesh.castShadow = solid;
      mesh.receiveShadow = true;
      /* Glass is blended and depth-write-free, so it has to be drawn after
       * the cabin behind it or the interior disappears. */
      if (b.material === this.mat.glass) mesh.renderOrder = 2;
      this._shell.add(mesh);
      this._meshes.push(mesh);
    }
  }

  /* The lofted body surface, resampled from the control stations.
   *
   * Slice spacing is uniform in station index rather than in metres, which
   * puts the mesh density where the control points are — closely spaced
   * through the screen base and the closing radii, sparse along the roof.
   * That is the right distribution: a flat roof needs three slices and a nose
   * radius needs ten, and spacing by arc length would give both the same.
   */
  _loftGeometry() {
    const d = this._detail;
    const slices = (STATIONS.length - 1) * d.sub;
    const ring = d.ring;
    const row = ring + 1;                 // the seam vertex is duplicated so
    const pos = [], nor = [], uv = [], idx = [];   // uv.x can reach 1
    const P = new THREE.Vector3(), N = new THREE.Vector3();

    const half = ring >> 1;
    const vs = ringV(half);
    const scratch = {};
    for (let i = 0; i <= slices; i++) {
      const u = (i / slices) * (STATIONS.length - 1);
      /* The section exponent varies station to station, so the angle that
       * reaches a given height does too. Resolving it per slice is what keeps
       * a crease level along the car instead of sagging towards the tail. */
      const sn = stationAt(u, scratch).n;
      for (let j = 0; j <= ring; j++) {
        /* Half the ring climbs the right flank from the underside centreline
         * to the roof centreline; the other half comes back down the left.
         * The seam — the one place where a duplicated vertex row can show as a
         * shading break — therefore still lives under the car, where nothing
         * ever sees it. */
        const up = j <= half;
        const a0 = angleForV(up ? vs[j] : vs[ring - j], sn);
        const a = up ? a0 : Math.PI - a0;
        shellPoint(u, a, P);
        shellNormal(u, a, N);
        pos.push(P.x, P.y, P.z);
        nor.push(N.x, N.y, N.z);
        uv.push(j / ring, i / slices);
      }
    }
    for (let i = 0; i < slices; i++) {
      for (let j = 0; j < ring; j++) {
        const A = i * row + j, B = A + 1, C = A + row, D = C + 1;
        idx.push(A, B, C, B, D, C);
      }
    }

    /* Caps. The closing stations are already pulled in to about half width, so
     * these two fans are small and nearly edge-on to any camera; they exist to
     * stop the tail and the nose being open tubes, which is visible from
     * exactly one angle and unmistakable when it is. */
    const cap = (i, forward) => {
      const s = stationAt(i === 0 ? 0 : STATIONS.length - 1);
      const c = pos.length / 3;
      pos.push(0, (s.yB + s.yT) * 0.5, s.z);
      nor.push(0, 0, forward ? 1 : -1);
      uv.push(0.5, i === 0 ? 0 : 1);
      const base = i * row;
      for (let j = 0; j < ring; j++) {
        if (forward) idx.push(c, base + j, base + j + 1);
        else idx.push(c, base + j + 1, base + j);
      }
    };
    cap(0, false);
    cap(slices, true);

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    return g;
  }

  /* ── wheel arches ──────────────────────────────────────────────────────
   *
   * A blister swept over each wheel: an elliptical cross-section pushed along
   * a 0.50 m arc centred on the axle, half buried in the flank so it emerges
   * out of the door skin instead of being stuck on it. 0.50 m is 160 mm of
   * clearance over a 0.34 m tyre, which is what a car needs if the suspension
   * is going to travel far enough to be worth animating.
   *
   * The arch is the single most identifying feature of the rally version of
   * any road car, because it is the visible consequence of a wider track: the
   * tyre sits 90 mm outboard of the flank and the arch has to cover it or the
   * car is illegal on any stage in the world.
   *
   * The sweep parameter is mirrored along with the geometry for the right-hand
   * side. That is not a nicety — negating x alone mirrors the surface without
   * mirroring its parametrisation, which inverts the winding and leaves one
   * side of the car with four arches lit from inside. Mirroring the ring angle
   * too flips it back.
   */
  _archGeometries() {
    const out = [];
    const R = 0.50;
    const na = this._detail.ring >= 40 ? 26 : 14;
    const np = ARCH_SECTION.length - 1;

    /* Where the bodyside actually is, at a given height and station.
     *
     * This is what makes the blister an arch rather than a hoop. The first two
     * versions placed the swept tube at a *constant* x — 0.885, then 0.80 —
     * and a constant offset cannot follow a body that is not a constant width.
     * The flank has a superellipse section, so it tucks in toward the sill;
     * it narrows toward the nose over the front axle; and it falls away round
     * the rear quarter. Anywhere the body had receded from the number, the
     * tube stood clear of it with daylight behind, and because the tube is a
     * closed section you saw its inner face — four croquet hoops.
     *
     * So ask the loft. The shell is already a parametric surface and this
     * samples it: convert the arch point's z to a station coordinate, walk the
     * ring at that station, and take the outermost vertex within a small band
     * of the target height. Half the tube is then buried at every point around
     * the sweep rather than only at the one place the constant happened to be
     * right.
     */
    const flankXAt = (z, y) => {
      /* z to station index. STATIONS is monotonic in z, so this is a walk. */
      let u = 0;
      for (let k = 0; k < STATIONS.length - 1; k++) {
        if (z >= STATIONS[k].z && z <= STATIONS[k + 1].z) {
          u = k + (z - STATIONS[k].z) / (STATIONS[k + 1].z - STATIONS[k].z);
          break;
        }
        if (z > STATIONS[STATIONS.length - 1].z) u = STATIONS.length - 1;
      }
      const P = new THREE.Vector3();
      let best = 0, bestDy = Infinity;
      /* Only the +x half of the ring: the arch is mirrored by the caller, and
       * sampling the far side would return the width at the wrong flank on an
       * asymmetric section. */
      for (let s = 0; s <= 48; s++) {
        const a = -Math.PI / 2 + (s / 48) * Math.PI;
        shellPoint(u, a, P);
        if (P.x <= 0) continue;
        const dy = Math.abs(P.y - y);
        /* Outermost within the band, nearest in height outside it. Taking the
         * strictly nearest vertex picks a point on the tuck under the sill and
         * pulls the blister inboard right where it should be widest. */
        if (dy < 0.045) { if (P.x > best) { best = P.x; bestDy = 0; } }
        else if (bestDy > 0 && dy < bestDy) { bestDy = dy; best = P.x; }
      }
      return best;
    };

    for (const axle of [0, WHEELBASE]) {
      for (const side of [1, -1]) {
        /* The flank at the arch, plus enough to leave the blister standing
         * proud of it. Beyond about a metre out the arch would be wider than
         * the mirrors, which is where a wide-arch car stops looking purposeful
         * and starts looking like a caricature. */
        const pos = [], uv = [], idx = [];
        /* A little past horizontal at each end so the blister runs out into
         * the sill and the bumper rather than stopping in mid-air. Only a
         * little: swept far past horizontal the flare becomes a rubbing strip
         * running most of the length of the door, which in side view is a
         * teardrop rather than an arch. */
        const t0 = -0.16, t1 = Math.PI + 0.16;

        /* The sweep's spine, sampled off the loft first and then SMOOTHED.
         *
         * The smoothing is not cosmetic. flankXAt() answers "how far out is
         * the widest part of the bodyside near this height", and once the
         * flank has a shoulder crease in it that answer is discontinuous: as
         * the sweep climbs past the crest the sampled width steps out by the
         * full 25 mm of the crease in a single station, and the arch above the
         * wheel folded into a crumpled mess of self-intersecting quads on both
         * front wings. A crease is a feature of the DOOR SKIN; the arch is a
         * separate pressing laid over it and its own line is smooth. Three
         * passes of a 1-2-1 kernel is exactly the statement that the arch does
         * not have to follow every wiggle of the panel it is welded to.
         */
        const spine = [];
        for (let i = 0; i <= na; i++) {
          const th = lerp(t0, t1, i / na);
          const ly = WHEEL_R + Math.sin(th) * R;
          const lz = axle + Math.cos(th) * R;
          /* Buried by 55 mm. Enough that the inboard half of the section is
           * inside the shell all the way round the sweep even where the
           * sampled width is a little optimistic, and not so much that the
           * blister stops standing proud. */
          spine.push(Math.max(0.42, flankXAt(lz, ly) - 0.055));
        }
        for (let pass = 0; pass < 3; pass++) {
          const src = spine.slice();
          for (let i = 1; i < na; i++) spine[i] = (src[i - 1] + 2 * src[i] + src[i + 1]) * 0.25;
        }

        for (let i = 0; i <= na; i++) {
          const th = lerp(t0, t1, i / na);
          const sy = Math.sin(th), sz = Math.cos(th);
          const cx = side * spine[i];
          /* The flare stands furthest proud over the crown of the arch and
           * runs out towards the sill and the bumper at either end, because a
           * box arch is a blister over the tyre and not a rubbing strip down
           * the whole car. */
          const swell = 0.30 + 0.70 * Math.sin(clamp(i / na, 0, 1) * Math.PI) ** 0.5;
          const prof = side > 0 ? ARCH_SECTION : ARCH_REVERSED;
          for (let j = 0; j <= np; j++) {
            const [dx, dr] = prof[j];
            const rr = R + dr;
            pos.push(
              cx + dx * swell * side,
              WHEEL_R + sy * rr,
              axle + sz * rr,
            );
            uv.push(i / na, j / np);
          }
        }

        const row = np + 1;
        for (let i = 0; i < na; i++) {
          for (let j = 0; j < np; j++) {
            const A = i * row + j, B = A + row, C = A + 1, D = B + 1;
            idx.push(A, B, C, C, B, D);
          }
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
        g.setIndex(idx);
        g.computeVertexNormals();
        out.push(g);
      }
    }
    return out;
  }

  /* ── bolt-on bodywork ──────────────────────────────────────────────────
   *
   * Everything a lofted shell cannot be: the parts that are a different
   * material, stand proud of the surface, or have a hard edge. They are placed
   * in car coordinates against the station table above, so they follow the
   * body if the roofline is ever retuned.
   */
  /* ── rally hardware ────────────────────────────────────────────────────
   *
   * A liveried shell with a wing is a touring car. Three things are what make
   * a rally car recognisable at a glance from the side of a stage, and none of
   * them is aerodynamic:
   *
   *   THE LIGHT POD. Four spotlamps on a bar across the nose is the single
   *   most identifying object on a rally car, because it exists for a reason
   *   no circuit car has — the stage is a public road at night, in a forest,
   *   with no lighting of any kind.
   *
   *   MUD FLAPS. Big, square, hanging almost to the ground behind every wheel.
   *   They are there because the surface is loose and the car behind is
   *   fifteen seconds back, and they are the detail that says "this car
   *   expects to be on gravel" more clearly than any amount of ride height.
   *
   *   THE SUMP GUARD, visible under the nose. A circuit car has a splitter
   *   scraping the tarmac; a rally car has a steel plate protecting the engine
   *   from the rock it is about to land on.
   */
  _addRallyKit(paint, trim, lampC) {
    const box = (batch, w, h, d, r, seg, x, y, z, rx = 0, ry = 0) =>
      batch.add(place(roundedBox(w, h, d, r, seg), x, y, z, rx, ry, 0));

    /* ── light pod ────────────────────────────────────────────────────────
     * Mounted on the bonnet leading edge, not the bumper: a bumper-mounted bar
     * is a road-car accessory, and every works car puts them high so the beam
     * clears the crest the car is about to go over. */
    const podZ = 3.16, podY = 1.02;
    /* The bar itself, and two stays down to the bonnet. */
    box(trim, 1.06, 0.048, 0.055, 0.018, 1, 0, podY - 0.115, podZ);
    for (const s of [-1, 1]) {
      box(trim, 0.05, 0.16, 0.05, 0.015, 1, s * 0.40, podY - 0.20, podZ - 0.02);
    }
    /* Four lamps: the outer pair spread wider and canted out, which is how
     * they are actually aimed — the inners light the road, the outers light
     * the ditch you are trying not to be in. */
    /* FOUR LAMPS HAVE TO READ AS FOUR. The first spacing put 0.25 m lenses
     * 0.25 m apart, so they touched edge to edge and the pod rendered as a
     * single pale slab across the bonnet — which is exactly what a light pod
     * must not look like, since the whole visual signature is the repetition.
     * Smaller lenses, wider spacing, and a gap you can see daylight through. */
    const lamps = [[-0.435, 0.105], [-0.145, 0.118], [0.145, 0.118], [0.435, 0.105]];
    for (const [lx, lr] of lamps) {
      /* Housing, then the lens standing proud of it. The housing is a little
       * deeper than it is wide, because a spotlamp is a can. */
      box(trim, lr * 2.10, lr * 2.10, 0.135, lr * 0.92, 3, lx, podY, podZ - 0.03);
      box(lampC, lr * 1.80, lr * 1.80, 0.040, lr * 0.85, 3, lx, podY, podZ + 0.052);
    }

    /* ── mud flaps ────────────────────────────────────────────────────────
     * Behind each wheel, hanging to within 90 mm of the ground. They are
     * mounted with a slight rearward rake because that is what air does to a
     * sheet of rubber at speed, and a flap standing exactly vertical is the
     * tell of one that has never moved. */
    const flapAt = (z, s) => {
      box(trim, 0.030, 0.30, 0.245, 0.012, 1, s * 0.86, 0.255, z, -0.16, 0);
    };
    flapAt(2.04, -1); flapAt(2.04, 1);          // behind the front wheels
    flapAt(-0.40, -1); flapAt(-0.40, 1);        // behind the rears

    /* ── sump guard ───────────────────────────────────────────────────────
     * A plate under the nose, canted up at its leading edge so it rides over
     * what it hits instead of digging in. Aluminium rather than moulded trim:
     * this is the one part of the car that is meant to be scraped. */
    paint.add(place(roundedBox(1.02, 0.035, 0.86, 0.02, 1), 0, 0.225, 2.72, -0.10, 0));

    /* ── roof vent ────────────────────────────────────────────────────────
     * A forward-facing scoop over the cabin. With the windows taped shut and a
     * cage inside, it is the only ventilation the crew has. */
    box(trim, 0.30, 0.085, 0.34, 0.03, 1, 0, 1.47, 1.62, 0.14, 0);
  }

  _addBodywork(paint, trim, lampC, lampR) {
    const b = this._detail.box;
    const box = (batch, w, h, d, r, seg, x, y, z, rx = 0, ry = 0) =>
      batch.add(place(roundedBox(w, h, d, r, seg), x, y, z, rx, ry, 0));

    /* ── the front end ──────────────────────────────────────────────────
     *
     * With the last three stations rebuilt (see STATIONS) the car now ends in
     * a flat fascia at z 3.396 spanning roughly 1.26 m by 0.41 m, instead of
     * in a dome. That panel is what everything below hangs off, and it changes
     * how the front has to be built: a grille is no longer a black rectangle
     * laid on a curve hoping to be read as a hole, it is a dark plate set back
     * behind a surround that stands proud of the surface. Those two elements
     * together are the entire trick. A recess reads as a recess because its
     * edge casts a shadow onto its floor, and to cast a shadow the edge has to
     * physically stand in front of the floor — 55 mm of it here, which is
     * about what a real grille surround gives you.
     */

    /* Front bumper skin: the lower moulding only. The old one was 1.68 m wide
     * and 0.42 m deep at a station where the body is 1.26 m across, so it
     * projected past the wings in plan and read as a plank bolted to a nose.
     * A real bumper is inboard of the front wings and wraps back into them at
     * the corners, which is what the two corner mouldings below do. */
    box(paint, 1.42, 0.27, 0.30, 0.075, b, 0, 0.335, 3.300);
    for (const s of [1, -1]) box(paint, 0.22, 0.21, 0.30, 0.080, b, s * 0.672, 0.362, 3.130);

    /* Splitter. On a rally car this is a genuine aerodynamic device, but the
     * reason it earns its triangles is that it is a thin horizontal line right
     * at the bottom of the nose: it reads the ride height for the eye, which
     * is how a raised car looks raised. */
    box(trim, 1.50, 0.040, 0.40, 0.018, 2, 0, 0.200, 3.276);

    /* Grille aperture.
     *
     * First attempt at this put the aperture floor 55 mm BEHIND the fascia
     * plane and the surround flush with it, which is how a real one is built
     * and is unbuildable here: the loft's end cap is a solid panel across the
     * whole front of the car, so a plate behind it is simply inside the body
     * and invisible. Cutting a hole in the cap would mean special-casing the
     * loft, which is a lot of machinery for one feature.
     *
     * So the whole assembly is pushed forward instead and the step is built
     * out rather than in: a floor standing 26 mm proud of the fascia, and a
     * surround standing 60 mm proud of it. The eye has no way to tell a 34 mm
     * recess measured from the fascia from a 34 mm recess measured from a
     * surround that is itself proud — what it reads is the shadow the surround
     * edge throws onto the floor, and that shadow is identical either way.
     */
    box(trim, 0.68, 0.205, 0.06, 0.012, 2, 0, 0.668, 3.392);
    box(paint, 0.78, 0.042, 0.075, 0.016, 2, 0, 0.788, 3.418);
    box(paint, 0.78, 0.040, 0.075, 0.016, 2, 0, 0.550, 3.416);
    for (const s of [1, -1]) box(paint, 0.044, 0.274, 0.075, 0.016, 2, s * 0.368, 0.668, 3.417);
    /* Vanes, and the first set of them was invisible.
     *
     * Four 32 mm uprights across a 680 mm aperture is a 160 mm pitch, and at
     * the distance this car is ever seen from — six metres in the chase view,
     * four in the turntable — a 32 mm bar is around two pixels. Two pixels of
     * dark trim between two pixels of dark shadow is not a grille, it is a
     * uniformly black slot, which is exactly what the aperture read as.
     *
     * So: two horizontal bars instead of four thin uprights. Horizontal is
     * what most manufacturers actually use, a 62 mm bar survives being three
     * or four pixels, and because they run across the aperture they catch the
     * sun along their whole length rather than on an edge that is one pixel
     * wide. The badge plinth on the centreline gives the eye the third thing
     * it needs to read the shape as a grille rather than a hole. */
    /* Body colour, not trim, and that is the whole fix. Making the bars bigger
     * did nothing while they stayed the same near-black as the recess floor
     * they stand on: dark on dark has no edge at any size, and the aperture
     * went on reading as one flat slot. A painted bar against a shadowed
     * opening is a hard light-to-dark boundary, it is what half the industry
     * actually does with a grille, and it ties the front end back to the rest
     * of the car instead of leaving a black hole in the middle of it. */
    for (const y of [0.606, 0.730]) {
      box(paint, 0.652, 0.058, 0.056, 0.014, 2, 0, y, 3.408);
    }
    box(paint, 0.092, 0.092, 0.066, 0.022, 2, 0, 0.668, 3.414);

    /* Lower intake, built into the bumper skin by the same trick: a floor a
     * little proud of the bumper face and a lip proud of that. This is the
     * opening that actually feeds the radiator on a modern car — the upper
     * grille is mostly styling on anything with a bonnet line this low — so it
     * is the bigger of the two and it gets a horizontal bar across it, which
     * is where the number plate would be bolted. */
    box(trim, 1.04, 0.190, 0.06, 0.012, 2, 0, 0.336, 3.416);
    box(trim, 1.14, 0.032, 0.07, 0.012, 2, 0, 0.448, 3.442);
    box(trim, 1.12, 0.030, 0.07, 0.012, 2, 0, 0.228, 3.440);
    box(trim, 1.00, 0.026, 0.05, 0.010, 1, 0, 0.336, 3.432);

    /* Bonnet extractor vents: two slots over where the exhaust manifold is,
     * which is where every rally car has them, because the alternative is a
     * bonnet that discolours. */
    for (const s of [1, -1]) box(trim, 0.34, 0.030, 0.20, 0.014, 2, s * 0.38, 0.948, 2.74);

    for (const s of [1, -1]) {
      /* Headlamps, and this is where the fascia pays for itself.
       *
       * A lamp unit on a real car is not a lens stuck on the wing, it is a
       * moulded housing bonded into an aperture, with the lens set back inside
       * a painted eyebrow that follows the bonnet shut line above it. Three
       * pieces, in this order: a dark housing recessed into the fascia, the
       * lens sitting inside it, and a proud paint bezel around the top and
       * outboard edges. The bezel is what makes the lamp look inset — without
       * it the lens is simply a bright patch, and a bright patch on a curve is
       * the exact failure the old front end had.
       *
       * Yawed 0.22 rad outboard because the fascia's corner is already rolling
       * back into the wing at this station, and a lamp left square to the axis
       * is the classic tell of a bolted-on light: the body is curving away and
       * the lamp is not. */
      box(trim, 0.235, 0.185, 0.115, 0.030, b, s * 0.532, 0.700, 3.392, 0, s * 0.26);
      box(lampC, 0.205, 0.150, 0.090, 0.026, b, s * 0.534, 0.700, 3.390, 0, s * 0.26);
      /* Projector bowls: two 66 mm discs of relief inside the lens, because a
       * headlamp read at 4 m is mostly the two bright rings of its projectors
       * and not the outline of its glass. Dark surrounds, bright centres — the
       * same contrast a real reflector bowl has against its bezel. */
      box(trim, 0.020, 0.150, 0.045, 0.008, 1, s * 0.534, 0.700, 3.432, 0, s * 0.26);
      for (const k of [-1, 1]) {
        box(lampC, 0.070, 0.070, 0.05, 0.033, 2,
          s * (0.534 + k * 0.046), 0.700, 3.436, 0, s * 0.26);
      }
      /* The eyebrow: a paint bezel over the top of the aperture, carrying the
       * bonnet shut line outboard and down the corner of the fascia. Without
       * it the lens is a bright patch, and a bright patch on a body panel is
       * exactly the failure the old domed nose had. */
      box(paint, 0.265, 0.032, 0.085, 0.014, 2, s * 0.532, 0.804, 3.386, 0, s * 0.26);
      box(paint, 0.032, 0.205, 0.085, 0.014, 2, s * 0.645, 0.700, 3.362, 0, s * 0.26);

      /* Auxiliary driving lamps, outboard and low, where a works car carries
       * them so they clear the sump guard. Two extra 150 mm discs is a
       * disproportionate amount of "rally car" for the triangles. */
      box(trim, 0.170, 0.170, 0.10, 0.078, 2, s * 0.360, 0.478, 3.408);
      box(lampC, 0.146, 0.146, 0.07, 0.069, 2, s * 0.360, 0.478, 3.436);

      /* Tail lamps: a housing, a lens set inside it and a paint bezel over the
       * top, built exactly like the headlamps and for the same reason — a lens
       * laid flat on a panel is a red sticker. They wrap around the corner of
       * the tail with 0.30 rad of yaw, which is what turns a rear light into
       * something that is also visible from the side, as the regulations in
       * every market require it to be. */
      box(trim, 0.420, 0.215, 0.10, 0.030, b, s * 0.415, 0.700, -0.792, 0, -s * 0.34);
      box(lampR, 0.385, 0.182, 0.085, 0.026, b, s * 0.415, 0.700, -0.806, 0, -s * 0.34);
      /* A clear section at the inboard end: reverse lamp on one side, fog on
       * the other, and on a real car they are the two pale rectangles that
       * stop a tail light being a solid slab of red. */
      box(lampC, 0.080, 0.070, 0.06, 0.020, 1, s * 0.312, 0.664, -0.826, 0, -s * 0.34);
      box(paint, 0.440, 0.030, 0.09, 0.012, 2, s * 0.415, 0.818, -0.774, 0, -s * 0.34);

      /* Mirrors. Almost pure silhouette value: they are the two things that
       * break the otherwise unbroken line of the greenhouse, and their shadow
       * on the door is one of the few small shadows the car casts on itself. */
      box(paint, 0.09, 0.085, 0.19, 0.040, b, s * 0.955, 1.015, 1.900, 0, s * 0.06);
      box(paint, 0.10, 0.050, 0.08, 0.020, 2, s * 0.905, 0.990, 1.845);

      /* Door handles, nearly flush, because that is how they are on any car
       * built since about 1995 — and a proud handle is a surprisingly loud
       * period signal. */
      box(paint, 0.12, 0.032, 0.038, 0.014, 2, s * 0.868, 0.900, 0.720);
      box(paint, 0.12, 0.032, 0.038, 0.014, 2, s * 0.868, 0.900, 1.580);

      /* Side skirt, spanning the two arches. A rally car has one because the
       * bodyshell needs a jacking rail and the sill needs protecting from
       * stones, and it earns its place here for a compositional reason: it is
       * a hard horizontal line at the very bottom of the flank, so the whole
       * side of the car now reads as three parallel lines — the shoulder, the
       * feature line and the skirt — instead of one continuous curve. Three
       * lines is what makes a bodyside look designed. */
      box(trim, 0.055, 0.105, 2.02, 0.022, 2, s * 0.822, 0.190, 1.310);

      /* Mud flaps behind all four wheels: legally required on gravel, and they
       * put a soft dark shape where the tyre throws its spray.
       *
       * Hung 55 mm further in and tucked 60 mm closer to the tyre than they
       * were. At 0.795 they were outboard of a flank that has since come in to
       * 0.80 through the doors, so from behind they read as two black
       * triangles floating in space beside the car — a flap is bolted to the
       * inside of an arch lip and is always *narrower* than the wheel it
       * trails. */
      for (const axle of [0, WHEELBASE]) {
        box(trim, 0.215, 0.215, 0.020, 0.010, 1, s * 0.740, 0.150, axle - 0.445);
      }

      /* Spoiler stanchions and end plates. The plates are deep and the blade
       * is set well clear of the roof: what a roof extension does aerodynamically
       * is fix the wake by keeping the flow attached across a gap, so a blade
       * lying on the roof is decoration and a blade standing off it on stalks
       * is a component. The end plates are also the only vertical surfaces at
       * the top of the car and they are what stops the tail reading as a
       * rounded lump from three-quarter rear. */
      box(paint, 0.070, 0.200, 0.130, 0.025, 2, s * 0.44, 1.298, -0.400);
      box(paint, 0.024, 0.190, 0.400, 0.012, 2, s * 0.660, 1.392, -0.435);
    }

    /* The blade. Eight degrees of incidence: enough to be visible in profile,
     * and about what a hatchback's roof extension actually runs, since it is
     * working in air that has already separated off the roof and is there to
     * fix the wake rather than to make downforce. */
    box(paint, 1.36, 0.052, 0.360, 0.020, b, 0, 1.404, -0.430, 0.15);
    /* Gurney flap: a 22 mm lip turned up at the trailing edge. On a real wing
     * it is worth a surprising amount of downforce for its size; here it is
     * worth a hard bright line along the top of the car's highest edge. */
    box(paint, 1.34, 0.028, 0.030, 0.008, 1, 0, 1.448, -0.596);

    /* No roof scoop. It was here to break up the largest unbroken painted area
     * on the car, which is a real problem and this was the wrong answer to it:
     * from the chase camera — the one view that is on screen for the whole
     * stage — a box on the roof and a second smaller box behind it read as a
     * light bar and a luggage rack, which is a service vehicle rather than a
     * rally car. The roof now carries the backlight instead, which breaks it
     * up with something the car is supposed to have. */

    /* Rear furniture, all of it hung on the tailgate.
     *
     * A number plate recess, a high-level brake light under the spoiler and a
     * single rear wiper. None of these is a shape anyone would design; all
     * three are legally mandated, and that is exactly why they read. The eye
     * has never seen a road car without them, so their absence is felt as
     * "model" long before their presence is noticed as detail. */
    box(trim, 0.40, 0.125, 0.05, 0.012, 2, -0.02, 0.540, -0.814);
    box(paint, 0.46, 0.024, 0.06, 0.010, 1, -0.02, 0.610, -0.826);
    box(paint, 0.46, 0.024, 0.06, 0.010, 1, -0.02, 0.470, -0.824);
    box(lampR, 0.44, 0.034, 0.05, 0.014, 2, 0, 1.276, -0.348);
    trim.add(place(roundedBox(0.020, 0.016, 0.30, 0.008, 1),
      0.07, 0.930, -0.706, 0.62, 0.14));

    /* Wipers, parked at the base of the screen. Two 26 mm cylinders' worth of
     * geometry for a detail the eye specifically looks for on glass. */
    for (const s of [1, -1]) {
      trim.add(place(roundedBox(0.026, 0.020, 0.52, 0.010, 1),
        s * 0.30, 1.025, 2.180, -0.55, s * 0.10));
    }

    /* A crease across the tailgate.
     *
     * The tail is a nearly flat stamped panel a metre and a half across with
     * only the lamps and the plate recess on it, and from directly behind that
     * is the weakest view the car has — a large empty field of paint. Every
     * hatchback breaks it the same way, with a horizontal step where the
     * tailgate skin is folded above the plate: it catches one hard highlight
     * along its top edge and puts everything below it in shadow, which is two
     * tones for the price of one 40 mm shelf.
     *
     * Body colour rather than trim, because it is a fold in the panel and not
     * a separate moulding — the shadow under it is what reads, not a dark
     * stripe. */
    box(paint, 1.02, 0.045, 0.075, 0.018, b, 0, 0.735, -0.762, 0.20);

    /* Exhaust tip, offset to the near side as a transverse-engined hatchback's
     * always is — a centred tailpipe on a front-wheel-drive car is a detail
     * that is wrong more often than it is right. */
    /* Twin exhaust tips, both on the near side as a transverse-engined
     * hatchback's are — a centred tailpipe on a front-wheel-drive car is a
     * detail that is wrong more often than it is right. Twin rather than
     * single because a single 72 mm pipe under a five-strake diffuser is a
     * mismatch the eye notices without being able to say why: the diffuser
     * promises a car that was developed, and one pipe says it was not. The
     * recessed surround is what keeps them from looking like two drainpipes
     * poking out of the paint. */
    box(trim, 0.290, 0.130, 0.10, 0.030, 2, 0.335, 0.300, -0.795);
    for (const x of [0.265, 0.405]) {
      trim.add(tube(new THREE.Vector3(x, 0.302, -0.990),
        new THREE.Vector3(x, 0.300, -0.700), 0.040, 10));
    }
  }

  /* ── panel gaps ────────────────────────────────────────────────────────
   *
   * The most valuable geometry on the whole car per triangle spent, and the
   * thing whose absence was making a well-shaped body still read as extruded
   * rather than manufactured.
   *
   * A car is not a shape, it is an assembly: six or seven pressings hung on a
   * welded shell to a build tolerance of about 4 mm, and every one of those
   * joints is a 3-5 mm gap that sits in its own shadow and is therefore darker
   * than any painted surface next to it under any lighting. The eye has been
   * trained on that pattern of dark lines since childhood and uses it, before
   * anything else, to decide whether it is looking at a vehicle or at a
   * sculpture of one. A body with no shut lines anywhere is a bar of soap no
   * matter how well its surfaces are developed.
   *
   * Each line is a strip sampled off the loft in exactly the way the glazing
   * is — same (station, height) coordinates, same surface, 5 mm proud instead
   * of 12 — in the dark matte trim material. Proud rather than recessed is a
   * deliberate cheat: a genuinely modelled 4 mm slot would need the shell cut
   * and would z-fight along its whole length, whereas a 14 mm dark ribbon
   * standing 5 mm off the paint is indistinguishable from a gap at any range
   * past about a metre and costs sixteen triangles.
   *
   * 14 mm rather than a true 4 mm is the standard game-art exaggeration: at a
   * 4 m turntable distance and this render resolution a true-scale gap is one
   * pixel wide and aliases into a dotted line, which reads as a scratch.
   */
  _addShutLines(trim) {
    /* A gap at constant station: the vertical cuts, up the flank. */
    const cut = (u, v0, v1, side) => {
      const du = 0.014 / dzdu(u);
      trim.add(this._panel(u - du * 0.5, u + du * 0.5, v0, v1, true, side,
        0.005, [1, 12]));
    };
    /* A gap at constant height: the long shuts along the bonnet and the sills. */
    const run = (u0, u1, v, side) => {
      trim.add(this._panel(u0, u1, v - 0.0055, v + 0.0055, true, side,
        0.005, [14, 1]));
    };
    /* A gap that crosses the centreline over the top of the car: the bonnet
     * trailing edge and the tailgate's roof cut. Specified in ring angle
     * because there is no meaningful "height" for a band over the roof. */
    const over = (u, a0, a1) => {
      const du = 0.014 / dzdu(u);
      trim.add(this._panel(u - du * 0.5, u + du * 0.5, a0, a1, false, 1,
        0.005, [1, 16]));
    };

    /* The bonnet. Two longitudinal shuts where it meets the front wings, one
     * across its trailing edge at the cowl, and nothing across its front,
     * because on a car with a full-width bonnet the front cut is hidden by the
     * lamp units and the grille surround. v 0.905 is where the top surface has
     * turned enough to be a wing rather than a bonnet. */
    for (const side of [1, -1]) run(U.cowlEdge + 0.10, U.nose - 0.15, 0.905, side);
    over(U.cowlEdge - 0.10, 1.02, Math.PI - 1.02);

    /* The doors. Three vertical cuts a side: the A-pillar shut at the leading
     * edge of the front door, the B-pillar, and the trailing edge of the rear
     * door. They stop at the beltline because everything above it is either
     * glass or a black pillar and a shut line there would be a black line on
     * black. They stop at the rocker tuck at the bottom for the same reason —
     * the sill is already in shadow. */
    for (const side of [1, -1]) {
      cut(7.92, 0.150, 0.600, side);   // A-pillar / front door leading edge
      cut(6.55, 0.150, 0.620, side);   // B-pillar
      cut(4.72, 0.150, 0.610, side);   // rear door trailing edge
      /* The rocker shut, where the sill panel is welded to the floor. Low and
       * horizontal, and it is what gives the bottom of the flank a second line
       * to sit above rather than fading into the shadow under the car. */
      run(U.rearQuarter + 0.30, U.screenMid - 0.10, 0.128, side);
    }

    /* The tailgate. A hatchback's cut runs across the roof ahead of the
     * backlight and then down each C-pillar outboard of the glass, which is
     * the outline of the single largest panel on the car. The two vertical
     * cuts are at the rear face rather than at the rear quarter: the tailgate
     * on a three-door is the whole back of the car, and putting its shut where
     * the C-pillar is at its widest is what gives the tail a vertical line to
     * be read against. */
    over(U.cPillar + 0.30, 1.02, Math.PI - 1.02);
    for (const side of [1, -1]) cut(U.rearFace + 0.55, 0.300, 0.720, side);

    /* Fuel filler flap, on the left rear quarter — a 160 mm disc that is the
     * one asymmetric detail on the whole vehicle, and asymmetry is worth
     * having because a perfectly mirrored car is a rendering, not a machine. */
    trim.add(this._panel(3.90, 4.24, 0.400, 0.560, true, 1, 0.004, [4, 4]));
  }

  /* ── glazing ───────────────────────────────────────────────────────────
   *
   * Every pane is a rectangle in the loft's own (station, ring-angle) space,
   * pushed 12 mm out along the surface normal. That offset is not arbitrary:
   * bonded glazing genuinely sits about that far outboard of the aperture
   * flange, which is why modern cars have flush glass with a shallow step at
   * the pillar rather than a deep rebate.
   *
   * Windscreen and backlight are specified by angle, because they wrap over
   * the top of the section and there is no meaningful "height" for them. The
   * side glass is specified by height instead, so its lower edge follows a
   * level beltline down the whole flank the way a real DLO does.
   */
  _addGlazing(glass) {
    /* The windscreen and the backlight span the roof, so they run between two
     * ring angles either side of the roof centreline.
     *
     * They were authored as -0.80 to +0.80, which looks like a symmetric band
     * about the centre and is not one: ring angle 0 is the *right flank at the
     * beltline*, not the top of the car — the parametrisation starts at the
     * underside centreline so that its seam hides under the floor. A band from
     * -0.80 to +0.80 therefore traces the right-hand flank from below the sill
     * up to the shoulder, at constant station, and never crosses the
     * centreline at all. The result was a tall dark slab pasted on the right
     * front wing, and no rear window whatsoever: from directly behind, the car
     * was a blank painted dome.
     *
     * The roof centre is at +PI/2. Sampling the loft, 0.95 and PI - 0.95 land
     * on the header rail at (+-0.485, 1.363) and on the screen base at the
     * cowl, which is the pair of A-pillars — so that is the band, and the
     * pillar width is now a number that means what it says. */
    /* Windscreen: bounded at the base of each A-pillar. 0.90 of section height
     * at the header, opening out to 0.76 at the cowl, which is the taper that
     * makes an A-pillar an A-pillar rather than a parallel strip. */
    glass.add(this._panel(U.header - 0.05, U.cowl + 0.40, 0.90, 0.755, 'wrap', 1));
    /* The backlight. A hatchback's is nearly as raked as its screen and it is
     * the single most important aperture on the back of the car: without it
     * the tail is 1.3 square metres of unbroken paint, which is what made this
     * one read as an egg from directly behind. It has to start almost on the
     * end cap — station 0.25, not station 1.5 — and that is not a stylistic
     * choice: the tail rolls closed over the last 60 mm, and a pane placed
     * ahead of that roll is simply behind the car's own trailing edge and
     * invisible from directly astern, which is exactly where a rear window is
     * looked at from. Its lower edge runs at 0.70 of section height at the
     * tailgate, opening up to 0.93 where the C-pillars close in at the roof. */
    glass.add(this._panel(U.tailCap + 0.25, U.cPillar + 0.15, 0.700, 0.930, 'wrap', 1));
    for (const side of [1, -1]) {
      /* Front door glass, from the B-pillar forward to the mirror. */
      glass.add(this._panel(U.roofRear + 0.45, U.header - 0.20, 0.628, 0.895, true, side));
      /* Rear door glass, stopping short of the C-pillar. */
      glass.add(this._panel(U.rearQuarter + 0.18, U.roofRear + 0.28, 0.628, 0.875, true, side));
      /* Mirror faces, which are glass for the same reason the windows are:
       * they are the only two surfaces on the car angled to catch the sky from
       * a camera that is behind it. */
      glass.add(place(roundedBox(0.020, 0.062, 0.150, 0.008, 1),
        side * 0.918, 1.015, 1.900, 0, side * 0.06));
    }
  }

  /**
   * One pane, sampled off the shell.
   *
   * @param {number} u0    station index of the rear edge
   * @param {number} u1    station index of the front edge
   * @param {number} lo    lower bound, in ring angle or in height fraction
   * @param {number} hi    upper bound, same units
   * @param {boolean|string} byV  true: lo/hi are height fractions on one
   *                    flank. 'wrap': lo/hi are the height of the pane's lower
   *                    edge at its two ends, and it spans over the roof.
   * @param {number} side  +1 for the car's left, -1 for its right
   * @param {number} [off]  outward offset along the surface normal, in metres
   * @param {number[]} [res] [along-station, across-section] subdivision
   */
  _panel(u0, u1, lo, hi, byV, side, off = 0.012, res = null) {
    const n = this._detail.panel;
    const nu = res ? res[0] : n + 2, nv = res ? res[1] : n;
    const pos = [], nor = [], uv = [], idx = [];
    const P = new THREE.Vector3(), N = new THREE.Vector3();
    const s = {};

    for (let i = 0; i <= nu; i++) {
      const u = lerp(u0, u1, i / nu);
      let a0 = lo, a1 = hi;
      if (byV === 'wrap') {
        /* A pane that crosses the centreline: the windscreen and the
         * backlight. Both are bounded at the SIDES by a height — the base of
         * the A-pillar, the C-pillar shut — and unbounded over the top, where
         * they simply meet the roof panel. Specifying them by a fixed pair of
         * ring angles, as this did originally, only works if the section
         * exponent is constant along the pane, and it is not: at the tail the
         * exponent is 4.6, where ring angle 0.95 rad is 0.95 of section
         * HEIGHT, so the backlight was a 100 mm ribbon lying along the roof
         * and the car had no rear window at all. Hence the inversion: lo and
         * hi are the height of the lower edge at the two ends of the pane, and
         * the band is symmetric about the roof centreline at +PI/2. */
        stationAt(u, s);
        a0 = angleForV(lerp(lo, hi, i / nu), s.n);
        a1 = Math.PI - a0;
      } else if (byV) {
        /* Height fractions become angles at this station's own exponent, and
         * on the right of the car they become the reflected angles. Ordering
         * them ascending afterwards is what keeps the winding of a mirrored
         * pane the same as an unmirrored one; reflecting the geometry and
         * leaving the parametrisation alone is the classic way to end up with
         * one door's glass invisible. */
        stationAt(u, s);
        a0 = angleForV(lo, s.n);
        a1 = angleForV(hi, s.n);
        if (side < 0) { a0 = Math.PI - a0; a1 = Math.PI - a1; }
        if (a0 > a1) { const t = a0; a0 = a1; a1 = t; }
      }
      for (let j = 0; j <= nv; j++) {
        const a = lerp(a0, a1, j / nv);
        shellPoint(u, a, P);
        shellNormal(u, a, N);
        pos.push(P.x + N.x * off, P.y + N.y * off, P.z + N.z * off);
        nor.push(N.x, N.y, N.z);
        uv.push(i / nu, j / nv);
      }
    }
    const row = nv + 1;
    for (let i = 0; i < nu; i++) {
      for (let j = 0; j < nv; j++) {
        const A = i * row + j, B = A + 1, C = A + row, D = C + 1;
        idx.push(A, B, C, B, D, C);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    return g;
  }

  /* ── what is behind the glass ──────────────────────────────────────────
   *
   * Barely a cabin: a dash, two seats, a parcel shelf and a cage. It exists
   * because a car with clear apertures and nothing inside them is transparent
   * from any three-quarter angle — the sky comes in the far window and out the
   * near one, and the whole body reads as an empty shell. Two dark boxes at
   * the right height fix that completely, and every extra piece past that is
   * paying for detail nobody can resolve through a 38 percent tint.
   */
  _addCabin(cabin, cage) {
    const b = 2;
    const box = (batch, w, h, d, r, x, y, z, rx = 0) =>
      batch.add(place(roundedBox(w, h, d, r, b), x, y, z, rx));

    box(cabin, 1.52, 0.16, 0.44, 0.06, 0, 0.985, 2.130, -0.12);
    box(cabin, 1.46, 0.05, 1.60, 0.02, 0, 0.615, 1.500);
    box(cabin, 1.30, 0.05, 0.44, 0.02, 0, 0.985, -0.150);
    for (const s of [1, -1]) {
      /* Bucket seats: back and base. The backs are what actually show, and
       * they show as two dark verticals through the side glass, which is the
       * single strongest cue that the car is occupied rather than a prop. */
      box(cabin, 0.44, 0.66, 0.15, 0.06, s * 0.34, 1.030, 1.020, 0.16);
      box(cabin, 0.44, 0.14, 0.46, 0.06, s * 0.34, 0.720, 1.300);
    }

    /* The cage. A main hoop behind the front seats, A-pillar bars down the
     * windscreen, a door bar each side and two backstays into the boot floor —
     * which is the minimum an actual homologated cage has, and it happens to
     * be exactly the set of bars that are visible from outside the car.
     * 38 mm tube, which is the common CDS size for a car this light.
     */
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    const R = 0.019, seg = this._detail.spoke > 1 ? 8 : 6;
    for (const s of [1, -1]) {
      cage.add(tube(V(s * 0.72, 0.62, 0.980), V(s * 0.70, 1.380, 0.980), R, seg));
      cage.add(tube(V(s * 0.70, 1.380, 0.980), V(s * 0.66, 1.390, 1.640), R, seg));
      cage.add(tube(V(s * 0.66, 1.390, 1.640), V(s * 0.74, 0.960, 2.320), R, seg));
      cage.add(tube(V(s * 0.72, 0.640, 1.700), V(s * 0.74, 1.020, 1.060), R, seg));
      /* Backstay, and its lower end is pulled inboard to x 0.52 from 0.68.
       * 0.68 at z -0.180 is 0.35 m from the rear axle centre and well inside
       * the rear wheel well, so with the arch lip now following the real
       * bodyside the bar was leaving the cabin and spearing out through the
       * top of the wheel arch. A backstay lands on the inner wheel housing on
       * a real car, which is inboard of the arch by exactly this kind of
       * margin. */
      cage.add(tube(V(s * 0.70, 1.360, 0.980), V(s * 0.52, 0.640, -0.180), R, seg));
    }
    cage.add(tube(V(-0.70, 1.380, 0.980), V(0.70, 1.380, 0.980), R, seg));
    cage.add(tube(V(-0.66, 1.390, 1.640), V(0.66, 1.390, 1.640), R, seg));
  }

  /* ── wheels ────────────────────────────────────────────────────────────
   *
   * Hierarchy per corner, and each level exists for a physical reason:
   *
   *   pivot   at the wheel centre, yawed by the steering. Only the front pair
   *           ever moves, and it moves about a vertical axis through the wheel
   *           centre, which is close enough to a real steering axis for a
   *           camera outside the car — a real one is raked and offset, but the
   *           whole visible consequence of that is scrub radius.
   *   caliper hangs off the pivot, NOT the spinning group. A brake caliper is
   *           mounted to the upright: it steers with the wheel and stays put
   *           while the disc turns inside it. A caliper going round with the
   *           wheel is one of those errors nobody can name and everybody sees.
   *   spin    the tyre, rim and disc, rotating about the axle.
   *
   * Mirroring is done by signing offsets rather than by a negative scale.
   * A scale of -1 on the pivot would flip the handedness of everything under
   * it, which reverses the apparent direction of rotation.x — so the left
   * wheels would roll backwards while the car drove forwards.
   */
  _buildWheels() {
    const rng = makeRng(0x5ca4b1e);
    for (const axle of [WHEELBASE, 0]) {
      for (const side of [1, -1]) {
        const pivot = new THREE.Group();
        pivot.name = `wheel-${axle > 0 ? 'front' : 'rear'}-${side > 0 ? 'L' : 'R'}`;
        pivot.position.set(side * TRACK * 0.5, WHEEL_R, axle);
        this._root.add(pivot);

        const spin = new THREE.Group();
        spin.name = 'spin';
        /* A different starting clock angle per wheel. Four identical wheels
         * stopped at the same tread phase is a subtle but real tell, and this
         * is the only randomness in the file — seeded, so two captures of the
         * same frame are the same image. */
        spin.rotation.x = rng() * TAU;
        pivot.add(spin);

        this._buildWheelMeshes(spin, pivot, side);
        this._wheels.push({ pivot, spin, side, phase: spin.rotation.x });
        if (axle > 0) this._steered.push({ pivot, side });
      }
    }
  }

  _buildWheelMeshes(spin, pivot, side) {
    const d = this._detail;
    const ob = side;              // +x is outboard on the car's left

    const rubber = new Batch(this.mat.rubber);
    const rim = new Batch(this.mat.rim);
    const brake = new Batch(this.mat.brake);
    const caliper = new Batch(this.mat.caliper);

    /* The carcass. A 205/65 R15 gravel tyre, drawn as it actually sections:
     * widest at the sidewall bulge and not at the tread, with a crowned
     * contact face and a real shoulder radius between them. The free radius is
     * 342.5 mm against a stated rolling radius of 340 — the 2.5 mm difference
     * is the sidewall deflection under the car's weight, and letting the mesh
     * sink into the road by that much is what stops the tyre looking like a
     * rigid disc balanced on the ground. */
    rubber.add(revolveSided(TYRE_PROFILE, d.wheel, ob));

    /* Rim barrel, well and outer flange.
     *
     * The profile matters more now that the rim is 17 inch: with a short
     * sidewall the flange is a genuinely visible band of bright machined
     * aluminium right at the edge of the tyre, and the well behind it is a
     * deep dark hole. Those two together — bright ring, black void, bright
     * spoke face set well inside them — are what "deep dish" means and are
     * most of why an alloy wheel reads as a machined object rather than as a
     * disc with lines painted on it.
     */
    rim.add(revolveSided([
      [-0.088, 0.228], [-0.078, 0.214], [0.030, 0.212], [0.058, 0.220],
      [0.076, 0.232], [0.084, 0.230], [0.080, 0.216],
    ], d.wheel, ob));

    /* Centre boss and its cap. */
    rim.add(revolveSided([
      [0.012, 0.000], [0.044, 0.028], [0.050, 0.052], [0.042, 0.076],
      [0.014, 0.086], [0.002, 0.068],
    ], d.hub, ob));

    /* Spokes: five PAIRS, not five singles.
     *
     * An odd count of spoke groups never lines up with itself across the hub,
     * so the wheel never reads as a two-bladed propeller when it stops — that
     * argument is unchanged. What changes is that a single wide blade at this
     * rim diameter is a slab: the gap between two adjacent blades gets wider
     * as the rim grows and a five-spoke on a 17 inch rim has a great deal of
     * nothing in it. Splitting each blade into a narrow pair keeps the same
     * five-fold rhythm, doubles the number of lit edges catching the sun, and
     * costs ten small boxes. It is also simply what a rally wheel looks like.
     *
     * Each blade is tapered from the hub outward, because the load in a spoke
     * is a bending moment that is largest at the root: a real cast wheel is
     * thick there and thin at the rim, and a parallel-sided spoke looks like a
     * spanner.
     */
    const SPOKES = 5;
    const inner = 0.072, outer = 0.212;
    /* The spoke face sits 54 mm inboard of the flange lip. That gap IS the
     * dish, and it is the single measurement that separates a modern wheel
     * from a 1990s one. */
    const faceX = ob * 0.030;
    for (let k = 0; k < SPOKES; k++) {
      for (const twin of [-1, 1]) {
        const g = roundedBox(0.052, 0.036, outer - inner, 0.012, d.spoke);
        const p = g.attributes.position;
        const half = (outer - inner) * 0.5;
        for (let i = 0; i < p.count; i++) {
          /* Taper in the geometry rather than by scaling the mesh, so the
           * rounded corners keep their radius instead of being squashed into
           * ellipses at the thin end. */
          const t = clamp((p.getZ(i) + half) / (2 * half), 0, 1);
          const f = lerp(1.0, 0.58, t);
          p.setXYZ(i, p.getX(i) * f, p.getY(i) * f, p.getZ(i));
        }
        g.computeVertexNormals();
        /* Built lying along +z, translated out to the mid-spoke radius, then
         * rolled about the axle. The two steps have to be separate: baking the
         * offset in before the rotation is what makes it a radius rather than
         * a translation of the whole star. The twin's splay is applied as a
         * small extra roll, so the pair opens outward towards the rim the way
         * a cast twin-spoke does. */
        place(g, 0, 0, 0, Math.PI / 2, 0, 0);
        place(g, 0, (inner + outer) * 0.5, 0);
        place(g, faceX, 0, 0, (k / SPOKES) * TAU + 0.31 + twin * 0.115);
        rim.add(g);
      }
      /* A short web joining each pair at the rim, which is where a cast wheel
       * carries the load into the barrel and where the light catches. */
      const web = roundedBox(0.030, 0.058, 0.046, 0.012, 1);
      place(web, 0, outer - 0.020, 0);
      place(web, faceX + ob * 0.012, 0, 0, (k / SPOKES) * TAU + 0.31);
      rim.add(web);
    }

    /* Wheel nuts, on the same 5-stud pattern the spoke pairs sit between. */
    for (let k = 0; k < SPOKES; k++) {
      const a = ((k + 0.5) / SPOKES) * TAU + 0.31;
      rim.add(place(roundedBox(0.030, 0.030, 0.026, 0.006, 1),
        ob * 0.042, Math.cos(a) * 0.056, Math.sin(a) * 0.056));
    }

    /* The disc: 336 mm across and 26 mm thick, which is a vented front rotor
     * for a car this light and is only possible at all because the rim grew.
     * It spins with the wheel — discs do — and it is the reason the space
     * behind the spokes is not simply a hole through the car. The bell is
     * stepped down to the hub, as a two-piece rotor's is. */
    brake.add(revolveSided([
      [-0.013, 0.092], [-0.013, 0.168], [0.013, 0.168], [0.013, 0.104],
      [0.038, 0.092], [0.038, 0.062],
    ], d.hub + 4, ob));

    /* Caliper, at the trailing edge of the disc where a strut car puts it, and
     * mounted to the upright rather than to the wheel. */
    caliper.add(place(roundedBox(0.070, 0.115, 0.150, 0.020, 2),
      ob * 0.004, 0.078, -0.158));

    for (const b of [rubber, rim, brake]) {
      if (b.empty) continue;
      this._triangles += b.triangles;
      const mesh = b.build(`${b.material.name}-${side > 0 ? 'L' : 'R'}`);
      /* Wheels cast. They do not need to receive: every surface on a wheel
       * that faces the sun is either the tread, which is its own shadow, or
       * the face of the rim, which is already inside the arch shadow. Leaving
       * receive off keeps four extra meshes out of the shadow lookup. */
      mesh.castShadow = true;
      mesh.receiveShadow = false;
      spin.add(mesh);
      this._meshes.push(mesh);
    }
    if (!caliper.empty) {
      this._triangles += caliper.triangles;
      const mesh = caliper.build('car-caliper-part');
      mesh.castShadow = true;
      pivot.add(mesh);
      this._meshes.push(mesh);
    }
  }

  /* ── animation ─────────────────────────────────────────────────────────── */

  /**
   * Turn the front wheels.
   *
   * The frame is right-handed with +Z forward and +Y up, which puts +X on the
   * car's LEFT; a positive rotation about +Y therefore swings the nose towards
   * +X and is a left turn. Positive angles here steer left.
   *
   * The two wheels do not turn by the same amount. In a turn every wheel has
   * to be tangent to its own circle about a single centre, and the inner wheel
   * is on a smaller circle, so it must turn further — that is Ackermann
   * geometry, and it is computed exactly here from the wheelbase and track
   * rather than approximated, because it costs two arctangents once per frame.
   * At full lock on this geometry the difference is about six degrees, which
   * is plainly visible from any camera ahead of the car and is one of the
   * details that separates a vehicle from a prop with rotating discs.
   *
   * @param {number} angleRad steering angle of the equivalent single wheel
   */
  /**
   * Write the damage record onto the bodywork.
   *
   * @param {Array<{x,y,z,amt}>} dents  mesh-space, from driver.js
   */
  setDamage(dents) {
    const u = this.mat.paint.userData.dents;
    if (!u || !dents) return;
    for (let i = 0; i < u.value.length; i++) {
      const d = dents[i];
      if (d) u.value[i].set(d.x, d.y, d.z, d.amt);
      else u.value[i].set(0, 0, 0, 0);
    }
  }

  /** Point the tacho and light the shift lamps. Called from main's car step. */
  setInstruments(rpm, limit) {
    if (this.instruments) setInstruments(this.instruments, rpm, limit);
  }

  setSteer(angleRad) {
    const a = clamp(angleRad, -0.72, 0.72);
    this._steer = a;
    /* Turn the steering wheel too.
     *
     * The road wheels move about 0.72 rad lock to lock; the rim moves far
     * more, because a car has a steering RATIO. Roughly 2.2 turns lock to
     * lock is a quick rack, which is what a rally car runs, and it is the
     * difference between a wheel that answers the input and a wheel that
     * twitches: at 1:1 the rim barely moves and the whole object reads as
     * decoration rather than as the thing the player is holding. */
    if (this.cockpitWheel) this.cockpitWheel.rotation.z = -a * 9.6;
    const mag = Math.abs(a);
    let inner = mag, outer = mag;
    if (mag > 1e-4) {
      /* Turn radius to the centreline at the rear axle. */
      const R = WHEELBASE / Math.tan(mag);
      inner = Math.atan(WHEELBASE / Math.max(0.05, R - TRACK * 0.5));
      outer = Math.atan(WHEELBASE / (R + TRACK * 0.5));
    }
    const sign = Math.sign(a) || 0;
    for (const w of this._steered) {
      /* Turning left, the left wheel (side +1) is the inner one. */
      const inside = sign > 0 ? w.side > 0 : w.side < 0;
      w.pivot.rotation.y = sign * (inside ? inner : outer);
    }
  }

  /**
   * Roll all four wheels.
   *
   * One angle for all four is correct for anything short of a differential
   * model: at the speeds and radii this car drives, the difference across an
   * axle in a corner is a few percent, and no camera can integrate wheel
   * rotation well enough to see it. What a camera can see instantly is the
   * wrong direction, so: positive is forward, because a positive rotation
   * about +X carries the top of the wheel towards +Z, which is forward.
   *
   * @param {number} angleRad cumulative wheel rotation, in radians
   */
  setWheelSpin(angleRad) {
    this._spin = angleRad;
    for (const w of this._wheels) w.spin.rotation.x = w.phase + angleRad;
  }

  /**
   * Lean the sprung mass on its springs.
   *
   * The signs are the ones three's own rotations give, stated here because
   * they are the only part of this class a caller can get backwards without
   * anything throwing. A positive rotation about +X carries a point at +Z
   * downwards, so positive pitch is nose-DOWN: dive under braking, and squat
   * under power is negative. A positive rotation about +Z lifts a point at +X,
   * and +X is the car's left, so positive roll drops the right-hand side —
   * which is the way a car leans in a left-hand corner, outwards.
   *
   * Both rotate about the centre of mass, and only the shell moves: the wheels
   * are unsprung and stay where the road put them, which is the entire
   * difference between suspension movement and a car tipping over.
   *
   * The angles are small by construction: a road car with 40 mm of travel and
   * a 2.62 m wheelbase can only dive about 1.7 degrees under maximum braking,
   * and a rally car on soft springs perhaps four. Anything past the clamp is a
   * bug in the caller, and letting it through would push the sills through the
   * road surface.
   *
   * @param {number} pitchRad
   * @param {number} rollRad
   */
  setBodyAttitude(pitchRad, rollRad) {
    const p = clamp(pitchRad, -0.14, 0.14);
    const r = clamp(rollRad, -0.14, 0.14);
    this._pitch = p;
    this._roll = r;
    this._sprung.rotation.set(p, 0, r);
  }

  stats() {
    return {
      triangles: this._triangles,
      meshes: this._meshes.length,
      materials: this._materials.length,
      textures: this.tread ? 3 : 0,
      tier: this.tier,
    };
  }

  dispose() {
    for (const mesh of this._meshes) mesh.geometry.dispose();
    for (const material of this._materials) material.dispose();
    if (this.tread) this.tread.dispose();
    this._root.removeFromParent();
  }
}

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
const STATIONS = [
  /* Tail, and the exponent is the whole story back here.
   *
   * These three used to close from 0.855 to 0.58 of half-width over 180 mm at
   * an exponent falling 3.2 -> 2.6, which is a dome in plan and in section at
   * the same time: the car ended in a rounded blue nose-cone with the tail
   * lamps stuck on its curve. A hatchback does not end like that. It ends in a
   * stamped tailgate — a nearly flat panel, nearly full width, with a tight
   * rolled edge all round it — and a superellipse says exactly that with a
   * HIGH exponent, not a low one. So the width and the exponent are both held
   * up to 45 mm from the end and all of the closing happens in the cap. */
  { z: -0.780, yB: 0.415, yT: 0.96, wB: 0.40, wMax: 0.52, wTop: 0.40, vBelt: 0.55, n: 2.8 },
  { z: -0.735, yB: 0.355, yT: 1.22, wB: 0.70, wMax: 0.845, wTop: 0.755, vBelt: 0.55, n: 4.4 },
  { z: -0.600, yB: 0.255, yT: 1.32, wB: 0.74, wMax: 0.862, wTop: 0.760, vBelt: 0.55, n: 3.9 },
  /* rear quarter over the rear arch */
  { z: -0.340, yB: 0.175, yT: 1.40, wB: 0.76, wMax: 0.865, wTop: 0.73, vBelt: 0.52, n: 3.7 },
  { z: -0.050, yB: 0.155, yT: 1.455, wB: 0.78, wMax: 0.865, wTop: 0.69, vBelt: 0.50, n: 3.7 },
  /* roof: very slightly crowned, because a dead flat roof has no highlight on
   * it at all and reads as a lid.
   *
   * The cabin exponent is up from 3.4 to 3.7 for the same reason as the tail:
   * a door skin is a flat panel with a rolled shoulder, and a section that
   * rounds continuously from sill to roof is a bar of soap. 3.7 puts about
   * 50 mm of radius on the shoulder and leaves the rest of the flank straight,
   * which is what carries a long unbroken highlight down the side of a car. */
  { z: 0.420, yB: 0.15, yT: 1.478, wB: 0.78, wMax: 0.865, wTop: 0.67, vBelt: 0.50, n: 3.7 },
  { z: 1.000, yB: 0.15, yT: 1.478, wB: 0.78, wMax: 0.860, wTop: 0.66, vBelt: 0.50, n: 3.7 },
  { z: 1.620, yB: 0.155, yT: 1.452, wB: 0.78, wMax: 0.860, wTop: 0.64, vBelt: 0.50, n: 3.7 },
  /* windscreen: 0.435 m of rise over 0.68 m of run is 57 degrees from the
   * vertical, which is where modern screens sit — steep enough to be obviously
   * raked, shallow enough that the wipers still have somewhere to park */
  { z: 1.980, yB: 0.165, yT: 1.260, wB: 0.78, wMax: 0.860, wTop: 0.69, vBelt: 0.52, n: 3.6 },
  { z: 2.300, yB: 0.175, yT: 1.020, wB: 0.78, wMax: 0.860, wTop: 0.77, vBelt: 0.55, n: 3.7 },
  /* the doubled station: 80 mm apart with a 30 mm height step, which is how a
   * Catmull-Rom is told that the cowl is a crease and not a curve */
  { z: 2.380, yB: 0.175, yT: 0.990, wB: 0.78, wMax: 0.860, wTop: 0.79, vBelt: 0.55, n: 3.9 },
  /* Bonnet, falling away over the front axle at 2.62. The exponent is highest
   * here of anywhere on the car: a bonnet is the flattest panel on a vehicle
   * and the one whose highlight the eye uses to judge whether the whole shape
   * is straight. At 3.2 it was a pillow. */
  { z: 2.720, yB: 0.195, yT: 0.955, wB: 0.77, wMax: 0.855, wTop: 0.81, vBelt: 0.55, n: 4.0 },
  { z: 3.060, yB: 0.215, yT: 0.925, wB: 0.75, wMax: 0.845, wTop: 0.80, vBelt: 0.55, n: 3.9 },
  /* The nose keeps a LOW exponent, and this is the one place the tail's
   * correction does not transfer.
   *
   * Holding the width and raising the exponent turns the tail into a flat
   * stamped panel because all of its closing then happens in the 45 mm cap.
   * Applied to the nose the same numbers made it worse, not better: a higher
   * exponent is a *fuller* section, and a fuller section on a front end that
   * still has to close over 70 mm of overhang is a bigger dome, not a flatter
   * face. The front came back as a featureless blue pod with the lamps buried
   * inside it.
   *
   * The asymmetry is real rather than a tuning accident. A tailgate is a panel
   * standing across the end of the car; a nose is a surface that has to fall
   * from the bonnet to the bumper while narrowing, and that is a rounded form
   * on every hatchback ever made. What gives a front end its structure is not
   * the section exponent, it is the grille aperture, the lamp units and the
   * lower intake — all of which are bolt-ons in _addBodywork() and all of
   * which were being swallowed by the fuller section. */
  { z: 3.280, yB: 0.255, yT: 0.850, wB: 0.70, wMax: 0.790, wTop: 0.70, vBelt: 0.55, n: 3.0 },
  { z: 3.400, yB: 0.335, yT: 0.740, wB: 0.50, wMax: 0.600, wTop: 0.50, vBelt: 0.55, n: 2.6 },
];

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
  out.set(halfWidth(s, v) * sx, lerp(s.yB, s.yT, v), s.z);
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
 * A 205/65 R15: 205 mm section width, a sidewall 65 percent of that, on a
 * 15 inch rim — the size a gravel car runs, because a tall sidewall is the
 * only suspension component that works at the frequency a rock does.
 *
 * The order matters as much as the numbers. It is traversed from the inboard
 * bead outwards, which by revolveSided's convention puts every face normal on
 * the outside of the carcass.
 */
const TYRE_PROFILE = [
  [-0.078, 0.196],   // inboard bead, on the rim flange
  [-0.098, 0.225],
  [-0.1025, 0.268],  // widest point: the sidewall, not the tread
  [-0.099, 0.305],
  [-0.085, 0.328],   // shoulder radius begins
  [-0.048, 0.340],
  [0.000, 0.3425],   // crown, 2.5 mm proud of the stated rolling radius
  [0.048, 0.340],
  [0.085, 0.328],
  [0.099, 0.305],
  [0.1025, 0.268],
  [0.098, 0.225],
  [0.078, 0.196],
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

/* ── the car ──────────────────────────────────────────────────────────── */

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
      ring: low ? 26 : 40,        // vertices around one shell section
      sub: low ? 2 : 3,           // slices per control station interval
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
      paint: keep(new THREE.MeshStandardMaterial({
        name: 'car-paint',
        color: new THREE.Color(0x1d47c8),
        roughness: 0.25,
        metalness: 0.0,
        envMapIntensity: 1.15,
        dithering: true,
      })),

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
        color: new THREE.Color(0x9aa4ad),
        roughness: 0.10,
        metalness: 0.1,
        emissive: new THREE.Color(0xfff2d8),
        emissiveIntensity: 0.16,
        envMapIntensity: 1.8,
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
    this._addGlazing(glass);
    this._addCabin(cabin, cage);

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

    for (let i = 0; i <= slices; i++) {
      const u = (i / slices) * (STATIONS.length - 1);
      for (let j = 0; j <= ring; j++) {
        /* The ring angle starts at the underside centreline, so the seam — the
         * one place where a duplicated vertex row can show as a shading break
         * — lives under the car where nothing ever sees it. */
        const a = -Math.PI / 2 + (j / ring) * TAU;
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
    const R = 0.50, rx = 0.095, ry = 0.064;
    const na = this._detail.ring >= 40 ? 20 : 14;
    const np = this._detail.ring >= 40 ? 10 : 8;

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
         * the sill and the bumper rather than stopping in mid-air. */
        const t0 = -0.30, t1 = Math.PI + 0.30;
        for (let i = 0; i <= na; i++) {
          const th = lerp(t0, t1, i / na);
          const sy = Math.sin(th), sz = Math.cos(th);
          /* The lip's own centre height and station, used to ask the loft
           * where the flank is *here* rather than assuming it. */
          const ly = WHEEL_R + sy * R;
          const lz = axle + sz * R;
          /* Buried by 55 mm. Enough that the inboard half of the tube is
           * inside the shell all the way round the sweep even where the
           * sampled width is a little optimistic, and not so much that the
           * blister stops standing proud. */
          const cx = side * Math.max(0.42, flankXAt(lz, ly) - 0.055);
          for (let j = 0; j <= np; j++) {
            const q = side * (j / np) * TAU;
            pos.push(
              cx + Math.cos(q) * rx * side,
              WHEEL_R + sy * (R + Math.sin(q) * ry),
              axle + sz * (R + Math.sin(q) * ry),
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
  _addBodywork(paint, trim, lampC, lampR) {
    const b = this._detail.box;
    const box = (batch, w, h, d, r, seg, x, y, z, rx = 0, ry = 0) =>
      batch.add(place(roundedBox(w, h, d, r, seg), x, y, z, rx, ry, 0));

    /* Bumper skins. Both are separate mouldings on a real car and both are the
     * parts that get scuffed, so they are trim rather than paint — which also
     * does the useful compositional job of darkening the two ends of the car
     * and letting the painted middle carry the silhouette. */
    box(trim, 1.68, 0.34, 0.42, 0.10, b, 0, 0.42, 3.19);
    box(trim, 1.56, 0.32, 0.34, 0.10, b, 0, 0.44, -0.72);

    /* Splitter and diffuser. On a rally car the splitter is a genuine
     * aerodynamic device, but the reason it earns its triangles here is that
     * it is a thin horizontal line right at the bottom of the nose: it reads
     * the ride height for the eye, which is how a raised car looks raised. */
    box(trim, 1.74, 0.040, 0.46, 0.020, 2, 0, 0.235, 3.24);
    box(trim, 1.24, 0.060, 0.30, 0.030, 2, 0, 0.280, -0.72);

    /* Grille and lower intake. Both matte black, both recessed 20 mm into the
     * nose so they read as holes rather than as painted rectangles. */
    box(trim, 1.00, 0.14, 0.06, 0.030, 2, 0, 0.680, 3.325);
    box(trim, 1.20, 0.20, 0.10, 0.050, 2, 0, 0.440, 3.255);
    for (const x of [-0.30, 0, 0.30]) box(trim, 0.05, 0.16, 0.09, 0.02, 1, x, 0.680, 3.315);

    /* Bonnet extractor vents: two slots over where the exhaust manifold is,
     * which is where every rally car has them, because the alternative is a
     * bonnet that discolours. */
    for (const s of [1, -1]) box(trim, 0.34, 0.030, 0.20, 0.014, 2, s * 0.38, 0.948, 2.74);

    for (const s of [1, -1]) {
      /* Headlamps, angled back at the outboard end to follow the nose. A lamp
       * left square to the axis is the classic tell of a bolted-on light: the
       * body is curving away and the lamp is not. */
      box(lampC, 0.42, 0.16, 0.12, 0.055, b, s * 0.54, 0.755, 3.225, 0, s * 0.20);
      box(trim, 0.46, 0.20, 0.09, 0.045, 2, s * 0.54, 0.755, 3.190, 0, s * 0.20);
      /* Auxiliary driving lamps on the bumper. Two extra 74 mm discs is a
       * disproportionate amount of "rally car" for the triangles. */
      box(lampC, 0.15, 0.15, 0.09, 0.070, 2, s * 0.46, 0.470, 3.310);

      /* Tail lamps, wrapping the same way around the rear quarter. */
      box(lampR, 0.34, 0.20, 0.09, 0.040, b, s * 0.60, 1.055, -0.730, 0, -s * 0.15);

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

      /* Mud flaps behind all four wheels: legally required on gravel, and they
       * put a soft dark shape where the tyre throws its spray. */
      for (const axle of [0, WHEELBASE]) {
        box(trim, 0.30, 0.26, 0.020, 0.010, 1, s * 0.86, 0.150, axle - 0.47);
      }

      /* Spoiler stanchions and end plates. */
      box(paint, 0.06, 0.11, 0.12, 0.025, 2, s * 0.40, 1.450, -0.400);
      box(paint, 0.022, 0.13, 0.30, 0.010, 2, s * 0.62, 1.480, -0.420);
    }

    /* The blade. Eight degrees of incidence: enough to be visible in profile,
     * and about what a hatchback's roof extension actually runs, since it is
     * working in air that has already separated off the roof and is there to
     * fix the wake rather than to make downforce. */
    box(paint, 1.30, 0.050, 0.28, 0.022, b, 0, 1.505, -0.420, 0.14);

    /* No roof scoop. It was here to break up the largest unbroken painted area
     * on the car, which is a real problem and this was the wrong answer to it:
     * from the chase camera — the one view that is on screen for the whole
     * stage — a box on the roof and a second smaller box behind it read as a
     * light bar and a luggage rack, which is a service vehicle rather than a
     * rally car. The roof now carries the backlight instead, which breaks it
     * up with something the car is supposed to have. */

    /* Wipers, parked at the base of the screen. Two 26 mm cylinders' worth of
     * geometry for a detail the eye specifically looks for on glass. */
    for (const s of [1, -1]) {
      trim.add(place(roundedBox(0.026, 0.020, 0.52, 0.010, 1),
        s * 0.30, 1.025, 2.180, -0.55, s * 0.10));
    }

    /* Exhaust tip, offset to the near side as a transverse-engined hatchback's
     * always is — a centred tailpipe on a front-wheel-drive car is a detail
     * that is wrong more often than it is right. */
    trim.add(tube(new THREE.Vector3(0.34, 0.305, -0.94),
      new THREE.Vector3(0.34, 0.300, -0.66), 0.036, 8));
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
    const ROOF_L = 0.95, ROOF_R = Math.PI - 0.95;
    glass.add(this._panel(U.header - 0.05, U.cowl + 0.35, ROOF_L, ROOF_R, false, 1));
    /* The backlight, which is the same band across the C-pillars. A hatchback's
     * is nearly as raked as its screen, so it spans a similar station range. */
    glass.add(this._panel(U.rearFace + 0.15, U.cPillar + 0.05, ROOF_L, ROOF_R, false, 1));
    for (const side of [1, -1]) {
      /* Front door glass, from the B-pillar forward to the mirror. */
      glass.add(this._panel(U.roofRear + 0.45, U.header - 0.20, 0.605, 0.895, true, side));
      /* Rear door glass, stopping short of the C-pillar. */
      glass.add(this._panel(U.rearQuarter + 0.18, U.roofRear + 0.28, 0.605, 0.875, true, side));
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
   * @param {boolean} byV  interpret lo/hi as height fractions
   * @param {number} side  +1 for the car's left, -1 for its right
   */
  _panel(u0, u1, lo, hi, byV, side) {
    const n = this._detail.panel;
    const nu = n + 2, nv = n;
    const pos = [], nor = [], uv = [], idx = [];
    const P = new THREE.Vector3(), N = new THREE.Vector3();
    const s = {};

    for (let i = 0; i <= nu; i++) {
      const u = lerp(u0, u1, i / nu);
      let a0 = lo, a1 = hi;
      if (byV) {
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
        pos.push(P.x + N.x * 0.012, P.y + N.y * 0.012, P.z + N.z * 0.012);
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

    /* Rim barrel and outer flange. Almost all of it is hidden by the tyre; the
     * part that shows is the flange edge and the well behind the spokes, and
     * that dark well is what gives the wheel depth. */
    rim.add(revolveSided([
      [-0.086, 0.196], [-0.076, 0.184], [0.058, 0.184], [0.076, 0.198], [0.082, 0.196],
    ], d.wheel, ob));

    /* Centre boss and its cap. */
    rim.add(revolveSided([
      [0.030, 0.000], [0.062, 0.026], [0.068, 0.048], [0.060, 0.070], [0.030, 0.078],
      [0.020, 0.062],
    ], d.hub, ob));

    /* Spokes. Five, because an odd count never lines up with itself across the
     * hub and so never reads as a two-bladed propeller when it stops. Each is
     * tapered from the hub outward — the load in a spoke is a bending moment
     * that is largest at the root, so a real cast wheel is thick there and
     * thin at the rim, and a parallel-sided spoke looks like a spanner. */
    const SPOKES = 5;
    const inner = 0.070, outer = 0.186, faceX = ob * 0.056;
    for (let k = 0; k < SPOKES; k++) {
      const g = roundedBox(0.098, 0.040, outer - inner, 0.016, d.spoke);
      const p = g.attributes.position;
      const half = (outer - inner) * 0.5;
      for (let i = 0; i < p.count; i++) {
        /* Taper in the geometry rather than by scaling the mesh, so the
         * rounded corners keep their radius instead of being squashed into
         * ellipses at the thin end. */
        const t = clamp((p.getZ(i) + half) / (2 * half), 0, 1);
        const f = lerp(1.0, 0.60, t);
        p.setXYZ(i, p.getX(i) * f, p.getY(i) * f, p.getZ(i));
      }
      g.computeVertexNormals();
      /* Built lying along +z, translated out to the mid-spoke radius, then
       * rolled about the axle. The two steps have to be separate: baking the
       * offset in before the rotation is what makes it a radius rather than a
       * translation of the whole star. */
      place(g, 0, 0, 0, Math.PI / 2, 0, 0);
      place(g, 0, (inner + outer) * 0.5, 0);
      place(g, faceX, 0, 0, (k / SPOKES) * TAU + 0.31);
      rim.add(g);
    }

    /* Wheel nuts, on the same 5-stud pattern the spokes sit between. */
    for (let k = 0; k < SPOKES; k++) {
      const a = ((k + 0.5) / SPOKES) * TAU + 0.31;
      rim.add(place(roundedBox(0.030, 0.030, 0.026, 0.006, 1),
        ob * 0.066, Math.cos(a) * 0.050, Math.sin(a) * 0.050));
    }

    /* The disc, inboard of the spoke face and 24 mm thick, which is a vented
     * front disc. It spins with the wheel — discs do — and it is the reason
     * the space behind the spokes is not simply a hole through the car. */
    brake.add(revolveSided([
      [-0.012, 0.076], [-0.012, 0.152], [0.012, 0.152], [0.012, 0.076],
    ], d.hub + 4, ob));

    /* Caliper, at the trailing edge of the disc where a strut car puts it, and
     * mounted to the upright rather than to the wheel. */
    caliper.add(place(roundedBox(0.062, 0.150, 0.098, 0.018, 2),
      ob * -0.006, 0.052, -0.140));

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
  setSteer(angleRad) {
    const a = clamp(angleRad, -0.72, 0.72);
    this._steer = a;
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
